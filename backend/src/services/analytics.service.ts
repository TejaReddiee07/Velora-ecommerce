import { Order, REVENUE_PAYMENT_STATUSES } from '../models/Order.js';
import { Payment } from '../models/Payment.js';
import { Product } from '../models/Product.js';
import { User } from '../models/User.js';
import { getSettings } from './settings.service.js';

/**
 * Accounting rules (documented in docs/ANALYTICS.md):
 *  - Only orders with a verified Stripe payment count (paymentStatus paid,
 *    partially_refunded or refunded). Pending, failed, expired and unpaid
 *    cancelled checkouts are excluded. Revenue is recognised at `paidAt`.
 *  - Every amount is converted to the base currency with the exchange rate
 *    snapshotted on the order at checkout (never today's rate).
 *  - Gross sales  = Σ item subtotals (selling price × qty, before order discounts)
 *  - Discounts    = Σ coupon / promotion discounts
 *  - Delivery     = Σ delivery charges collected
 *  - Tax          = Σ tax collected (a liability, not revenue)
 *  - Collected    = Σ order totals charged
 *  - Refunds      = Σ refunds issued, recognised on the refund date
 *  - Net revenue  = Collected − Tax − Refunds
 *  - Profit is only reported when every sold line has a unit cost configured.
 */

export const TIMEZONE = 'Europe/London';
const PAID = { paymentStatus: { $in: REVENUE_PAYMENT_STATUSES } };
const toBase = (field: string) => ({ $divide: [`$${field}`, '$fxRate'] });

export interface Range {
  from: Date;
  to: Date;
}

function startOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

export function presetRanges(now = new Date()) {
  const today = startOfDay(now);
  const week = new Date(today);
  week.setDate(week.getDate() - ((week.getDay() + 6) % 7)); // Monday
  const month = new Date(today.getFullYear(), today.getMonth(), 1);
  const year = new Date(today.getFullYear(), 0, 1);
  const end = new Date(now.getTime() + 1);
  return {
    today: { from: today, to: end },
    week: { from: week, to: end },
    month: { from: month, to: end },
    year: { from: year, to: end },
    all: { from: new Date(0), to: end },
  };
}

type Financials = Awaited<ReturnType<typeof buildFinancials>>;

/** Computes several date windows with one order aggregation and one refund aggregation. */
export async function financialsMany<K extends string>(ranges: Record<K, Range>): Promise<Record<K, Financials>> {
  const keys = Object.keys(ranges) as K[];
  const minFrom = new Date(Math.min(...keys.map((k) => ranges[k].from.getTime())));
  const maxTo = new Date(Math.max(...keys.map((k) => ranges[k].to.getTime())));
  const orderFacets: Record<string, unknown[]> = {};
  const refundFacets: Record<string, unknown[]> = {};
  keys.forEach((k, i) => {
    const r = ranges[k];
    const inRange = { $match: { paidAt: { $gte: r.from, $lt: r.to } } };
    orderFacets[`t${i}`] = [
      inRange,
      {
        $group: {
          _id: null,
          orders: { $sum: 1 },
          gross: { $sum: toBase('subtotal') },
          discounts: { $sum: toBase('discountTotal') },
          delivery: { $sum: toBase('shippingTotal') },
          tax: { $sum: toBase('taxTotal') },
          collected: { $sum: toBase('total') },
        },
      },
    ];
    orderFacets[`c${i}`] = [
      inRange,
      { $group: { _id: '$currency', orders: { $sum: 1 }, collected: { $sum: '$total' }, refunded: { $sum: '$refundedTotal' } } },
      { $sort: { _id: 1 } },
    ];
    orderFacets[`i${i}`] = [
      inRange,
      { $unwind: '$items' },
      {
        $group: {
          _id: null,
          units: { $sum: '$items.quantity' },
          cogs: { $sum: { $cond: [{ $ne: ['$items.unitCost', null] }, { $multiply: ['$items.unitCost', '$items.quantity'] }, 0] } },
          linesWithCost: { $sum: { $cond: [{ $ne: ['$items.unitCost', null] }, 1, 0] } },
          lines: { $sum: 1 },
        },
      },
    ];
    refundFacets[`r${i}`] = [
      { $match: { 'refunds.createdAt': { $gte: r.from, $lt: r.to } } },
      { $group: { _id: null, amount: { $sum: { $divide: ['$refunds.amount', '$fxRate'] } }, count: { $sum: 1 } } },
    ];
  });
  const [[orderAgg], [refundAgg]] = await Promise.all([
    Order.aggregate([{ $match: { ...PAID, paidAt: { $gte: minFrom, $lt: maxTo } } }, { $facet: orderFacets as never }]),
    Payment.aggregate([
      { $match: { 'refunds.0': { $exists: true } } },
      { $unwind: '$refunds' },
      { $match: { 'refunds.status': { $nin: ['failed', 'canceled'] }, 'refunds.createdAt': { $gte: minFrom, $lt: maxTo } } },
      { $facet: refundFacets as never },
    ]),
  ]);
  const out = {} as Record<K, Financials>;
  keys.forEach((k, i) => {
    const r = refundAgg?.[`r${i}`]?.[0];
    out[k] = buildFinancials(orderAgg?.[`t${i}`]?.[0], orderAgg?.[`i${i}`]?.[0], orderAgg?.[`c${i}`] ?? [], { amount: Math.round(r?.amount ?? 0), count: r?.count ?? 0 });
  });
  return out;
}

export async function financials(range: Range) {
  return (await financialsMany({ range })).range;
}

function buildFinancials(
  totals: { orders: number; gross: number; discounts: number; delivery: number; tax: number; collected: number } | undefined,
  itemTotals: { units: number; cogs: number; linesWithCost: number; lines: number } | undefined,
  byCurrency: { _id: string; orders: number; collected: number; refunded: number }[],
  refunds: { amount: number; count: number },
) {
  const t = totals ?? { orders: 0, gross: 0, discounts: 0, delivery: 0, tax: 0, collected: 0 };
  const items = itemTotals ?? { units: 0, cogs: 0, linesWithCost: 0, lines: 0 };
  const agg = { byCurrency };
  const round = (n: number) => Math.round(n);
  const netRevenue = round(t.collected - t.tax - refunds.amount);
  const costCoverage = items.lines ? items.linesWithCost / items.lines : 1;
  return {
    orders: t.orders,
    unitsSold: items.units,
    grossSales: round(t.gross),
    discounts: round(t.discounts),
    deliveryCharges: round(t.delivery),
    taxes: round(t.tax),
    totalCollected: round(t.collected),
    refunds: refunds.amount,
    refundCount: refunds.count,
    netRevenue,
    averageOrderValue: t.orders ? round(t.collected / t.orders) : 0,
    costOfGoods: costCoverage === 1 ? round(items.cogs) : null,
    grossProfit: costCoverage === 1 && items.lines ? netRevenue - round(items.cogs) : null,
    costCoverage,
    byCurrency: (agg?.byCurrency ?? []).map((c: { _id: string; orders: number; collected: number; refunded: number }) => ({
      currency: c._id,
      orders: c.orders,
      collected: c.collected,
      refunded: c.refunded,
    })),
  };
}

export async function overview(range?: Range) {
  const settings = await getSettings();
  const presets = presetRanges();
  const windows = await financialsMany({ ...presets, period: range ?? presets.month });
  const { today, week, month, year, all } = windows;
  const period = range ? windows.period : null;

  const [statusCounts, customers, newCustomers, productStats, lowStockVariants, recent] = await Promise.all([
    Order.aggregate<{ _id: string; count: number }>([{ $group: { _id: '$status', count: { $sum: 1 } } }]),
    User.countDocuments(),
    User.countDocuments({ createdAt: { $gte: presets.month.from } }),
    Product.aggregate([
      {
        $group: {
          _id: null,
          total: { $sum: 1 },
          active: { $sum: { $cond: [{ $eq: ['$status', 'published'] }, 1, 0] } },
          outOfStock: { $sum: { $cond: [{ $and: [{ $eq: ['$status', 'published'] }, { $lte: ['$totalAvailable', 0] }] }, 1, 0] } },
        },
      },
    ]),
    Product.aggregate([
      { $match: { status: 'published' } },
      { $unwind: '$variants' },
      {
        $group: {
          _id: null,
          low: { $sum: { $cond: [{ $and: [{ $gt: ['$variants.available', 0] }, { $lte: ['$variants.available', '$lowStockThreshold'] }] }, 1, 0] } },
          out: { $sum: { $cond: [{ $lte: ['$variants.available', 0] }, 1, 0] } },
          lowProducts: { $addToSet: { $cond: [{ $and: [{ $gt: ['$variants.available', 0] }, { $lte: ['$variants.available', '$lowStockThreshold'] }] }, '$_id', '$$REMOVE'] } },
        },
      },
    ]),
    Payment.find({}).sort({ createdAt: -1 }).limit(10).populate('order', 'orderNumber customerName status').lean(),
  ]);

  const status = Object.fromEntries(statusCounts.map((s) => [s._id, s.count]));
  const p = productStats[0] ?? { total: 0, active: 0, outOfStock: 0 };
  const v = lowStockVariants[0] ?? { low: 0, out: 0, lowProducts: [] };

  return {
    baseCurrency: settings.currency.base,
    revenue: { today: today.netRevenue, week: week.netRevenue, month: month.netRevenue, year: year.netRevenue, allTime: all.netRevenue },
    windows: { today, week, month, year, allTime: all },
    period,
    orders: {
      total: all.orders,
      pendingPayment: status.pending_payment ?? 0,
      awaitingFulfilment: (status.paid ?? 0) + (status.processing ?? 0) + (status.packed ?? 0),
      inTransit: (status.shipped ?? 0) + (status.out_for_delivery ?? 0),
      completed: status.delivered ?? 0,
      cancelled: status.cancelled ?? 0,
      refunded: status.refunded ?? 0,
      byStatus: status,
    },
    customers: { total: customers, newThisMonth: newCustomers },
    products: {
      total: p.total,
      active: p.active,
      outOfStock: p.outOfStock,
      lowStockProducts: v.lowProducts.length,
      lowStockVariants: v.low,
      outOfStockVariants: v.out,
    },
    recentTransactions: recent.map((r) => ({
      _id: String(r._id),
      orderId: r.order ? String((r.order as unknown as { _id: unknown })._id) : null,
      orderNumber: (r.order as unknown as { orderNumber?: string })?.orderNumber ?? null,
      customerName: (r.order as unknown as { customerName?: string })?.customerName ?? null,
      status: r.status,
      amount: r.amount,
      amountRefunded: r.amountRefunded,
      currency: r.currency,
      method: r.wallet ?? r.cardBrand ?? r.paymentMethodType ?? null,
      last4: r.cardLast4 ?? null,
      reference: r.paymentIntentId ?? r.checkoutSessionId ?? null,
      createdAt: r.createdAt,
    })),
  };
}

export type Granularity = 'day' | 'week' | 'month' | 'year';

function periodKey(d: Date, g: Granularity) {
  // Mirror $dateTrunc in Europe/London using Intl.
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: TIMEZONE, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(d);
  const y = parts.find((p) => p.type === 'year')!.value;
  const m = parts.find((p) => p.type === 'month')!.value;
  const day = parts.find((p) => p.type === 'day')!.value;
  if (g === 'year') return `${y}`;
  if (g === 'month') return `${y}-${m}`;
  if (g === 'day') return `${y}-${m}-${day}`;
  const local = new Date(Date.UTC(+y, +m - 1, +day));
  local.setUTCDate(local.getUTCDate() - ((local.getUTCDay() + 6) % 7));
  return local.toISOString().slice(0, 10);
}

export async function revenueSeries(range: Range, granularity: Granularity) {
  const unit = granularity;
  const truncOrders = { $dateTrunc: { date: '$paidAt', unit, timezone: TIMEZONE, ...(unit === 'week' ? { startOfWeek: 'monday' } : {}) } };
  const truncRefunds = { $dateTrunc: { date: '$refunds.createdAt', unit, timezone: TIMEZONE, ...(unit === 'week' ? { startOfWeek: 'monday' } : {}) } };
  const [orders, refunds] = await Promise.all([
    Order.aggregate<{ _id: Date; orders: number; collected: number; tax: number; gross: number; discounts: number; delivery: number }>([
      { $match: { ...PAID, paidAt: { $gte: range.from, $lt: range.to } } },
      {
        $group: {
          _id: truncOrders,
          orders: { $sum: 1 },
          collected: { $sum: toBase('total') },
          tax: { $sum: toBase('taxTotal') },
          gross: { $sum: toBase('subtotal') },
          discounts: { $sum: toBase('discountTotal') },
          delivery: { $sum: toBase('shippingTotal') },
        },
      },
    ]),
    Payment.aggregate<{ _id: Date; amount: number }>([
      { $unwind: '$refunds' },
      { $match: { 'refunds.createdAt': { $gte: range.from, $lt: range.to }, 'refunds.status': { $nin: ['failed', 'canceled'] } } },
      { $group: { _id: truncRefunds, amount: { $sum: { $divide: ['$refunds.amount', '$fxRate'] } } } },
    ]),
  ]);

  const map = new Map<string, { period: string; orders: number; grossSales: number; discounts: number; delivery: number; taxes: number; refunds: number; netRevenue: number }>();
  const ensure = (key: string) => {
    if (!map.has(key)) map.set(key, { period: key, orders: 0, grossSales: 0, discounts: 0, delivery: 0, taxes: 0, refunds: 0, netRevenue: 0 });
    return map.get(key)!;
  };
  // Fill empty periods so charts have a continuous axis.
  const cursor = new Date(range.from);
  const limit = 400;
  for (let i = 0; i < limit && cursor < range.to; i++) {
    ensure(periodKey(cursor, granularity));
    if (granularity === 'day') cursor.setDate(cursor.getDate() + 1);
    else if (granularity === 'week') cursor.setDate(cursor.getDate() + 7);
    else if (granularity === 'month') cursor.setMonth(cursor.getMonth() + 1);
    else cursor.setFullYear(cursor.getFullYear() + 1);
  }
  for (const o of orders) {
    const row = ensure(periodKey(new Date(o._id), granularity));
    row.orders += o.orders;
    row.grossSales += Math.round(o.gross);
    row.discounts += Math.round(o.discounts);
    row.delivery += Math.round(o.delivery);
    row.taxes += Math.round(o.tax);
    row.netRevenue += Math.round(o.collected - o.tax);
  }
  for (const r of refunds) {
    const row = ensure(periodKey(new Date(r._id), granularity));
    row.refunds += Math.round(r.amount);
    row.netRevenue -= Math.round(r.amount);
  }
  return [...map.values()].sort((a, b) => a.period.localeCompare(b.period));
}

export async function productAnalytics(range: Range, limit = 10) {
  const match = { ...PAID, paidAt: { $gte: range.from, $lt: range.to } };
  const [bestSellers, byCategory, byDepartment, topCustomers] = await Promise.all([
    Order.aggregate([
      { $match: match },
      { $unwind: '$items' },
      {
        $group: {
          _id: '$items.product',
          name: { $last: '$items.name' },
          slug: { $last: '$items.slug' },
          image: { $last: '$items.image' },
          units: { $sum: '$items.quantity' },
          revenue: { $sum: { $divide: ['$items.lineTotal', '$fxRate'] } },
        },
      },
      { $sort: { units: -1, revenue: -1 } },
      { $limit: limit },
    ]),
    Order.aggregate([
      { $match: match },
      { $unwind: '$items' },
      { $group: { _id: '$items.categoryName', units: { $sum: '$items.quantity' }, revenue: { $sum: { $divide: ['$items.lineTotal', '$fxRate'] } } } },
      { $sort: { revenue: -1 } },
    ]),
    Order.aggregate([
      { $match: match },
      { $unwind: '$items' },
      { $group: { _id: '$items.department', units: { $sum: '$items.quantity' }, revenue: { $sum: { $divide: ['$items.lineTotal', '$fxRate'] } } } },
      { $sort: { revenue: -1 } },
    ]),
    Order.aggregate([
      { $match: match },
      { $group: { _id: '$user', name: { $last: '$customerName' }, email: { $last: '$email' }, orders: { $sum: 1 }, spent: { $sum: { $divide: [{ $subtract: ['$total', '$refundedTotal'] }, '$fxRate'] } } } },
      { $sort: { spent: -1 } },
      { $limit: limit },
    ]),
  ]);
  return {
    bestSellers: bestSellers.map((b) => ({ productId: String(b._id), name: b.name, slug: b.slug, image: b.image ? String(b.image) : null, units: b.units, revenue: Math.round(b.revenue) })),
    byCategory: byCategory.map((c) => ({ category: c._id, units: c.units, revenue: Math.round(c.revenue) })),
    byDepartment: byDepartment.map((d) => ({ department: d._id, units: d.units, revenue: Math.round(d.revenue) })),
    topCustomers: topCustomers.map((c) => ({ userId: String(c._id), name: c.name, email: c.email, orders: c.orders, spent: Math.round(c.spent) })),
  };
}

export async function ordersCsv(range: Range) {
  const orders = await Order.find({ createdAt: { $gte: range.from, $lt: range.to } }).sort({ createdAt: 1 }).lean();
  const esc = (v: unknown) => {
    const s = v == null ? '' : String(v);
    // Neutralise spreadsheet formula injection.
    const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
    return /[",\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
  };
  const header = [
    'order_number', 'created_at', 'paid_at', 'customer', 'email', 'status', 'payment_status', 'currency',
    'subtotal', 'discount', 'delivery', 'tax', 'total', 'refunded', 'fx_rate', 'total_base', 'items',
  ];
  const rows = orders.map((o) => [
    o.orderNumber, o.createdAt.toISOString(), o.paidAt ? new Date(o.paidAt).toISOString() : '', o.customerName, o.email, o.status, o.paymentStatus, o.currency,
    (o.subtotal / 100).toFixed(2), (o.discountTotal / 100).toFixed(2), (o.shippingTotal / 100).toFixed(2), (o.taxTotal / 100).toFixed(2),
    (o.total / 100).toFixed(2), (o.refundedTotal / 100).toFixed(2), o.fxRate, (o.total / o.fxRate / 100).toFixed(2),
    o.items.map((i) => `${i.sku} x${i.quantity}`).join('; '),
  ]);
  return [header, ...rows].map((r) => r.map(esc).join(',')).join('\n');
}

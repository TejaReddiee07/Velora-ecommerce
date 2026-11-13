import { Types } from 'mongoose';
import { env } from '../config/env.js';
import { Cart } from '../models/Cart.js';
import { Order, type IOrder, type OrderDoc } from '../models/Order.js';
import { Payment } from '../models/Payment.js';
import { Coupon } from '../models/Coupon.js';
import { Address } from '../models/Address.js';
import type { Actor, AddressSnapshot, OrderStatus } from '../models/common.js';
import { runInTransaction } from '../db/transaction.js';
import { supportsTransactions } from '../db/connection.js';
import { priceCart } from './cart.service.js';
import { getSettings } from './settings.service.js';
import {
  adjustStock,
  commitLines,
  releaseLines,
  reserveLines,
  sellWithoutReservation,
  type StockLine,
} from './inventory.service.js';
import { getStripe, paymentIntentId, type CheckoutSessionLike, type RefundLike } from './stripe.service.js';
import { broadcastInventory, broadcastOrder, newOrderAlerts, stockAlerts } from './broadcast.service.js';
import { notifyAdmins, notifyUser } from './notification.service.js';
import { queueEmail } from '../jobs/queue.js';
import { orderConfirmationMessage, orderStatusMessage } from './email.service.js';
import type { AuthUser } from './session.service.js';
import { AppError, badRequest, conflict, notFound, serviceUnavailable } from '../utils/errors.js';
import { orderNumber as newOrderNumber } from '../utils/crypto.js';
import { deliveryProblem, normalizeUkPostcode } from '../utils/address.js';
import { logger } from '../utils/logger.js';

const SYSTEM: Actor = { type: 'system', name: 'System' };
const STRIPE: Actor = { type: 'stripe', name: 'Stripe' };

function stockLines(order: Pick<IOrder, 'items'>): StockLine[] {
  return order.items.map((i) => ({ product: i.product, variant: i.variant, quantity: i.quantity, sku: i.sku }));
}

function productIdsOf(order: Pick<IOrder, 'items'>) {
  return order.items.map((i) => i.product);
}

// ── Checkout ────────────────────────────────────────────────────────────────

export interface CheckoutInput {
  currency?: string;
  deliveryMethodId?: string;
  couponCode?: string | null;
  addressId?: string;
  address?: AddressSnapshot;
  saveAddress?: boolean;
  phone?: string;
  notes?: string;
}

export async function createCheckout(user: AuthUser, input: CheckoutInput) {
  const stripe = getStripe();
  if (!stripe) {
    throw serviceUnavailable(
      'Online payment is not configured yet. Add STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET to the API environment.',
    );
  }

  const cart = await Cart.findOne({ user: user._id });
  if (!cart || cart.items.length === 0) throw badRequest('Your bag is empty.');
  if (input.couponCode !== undefined) cart.couponCode = input.couponCode ? input.couponCode.toUpperCase() : null;

  const priced = await priceCart(cart, input.currency, user._id, input.deliveryMethodId);
  if (priced.hasIssues) {
    throw new AppError(409, 'CART_CHANGED', 'Some items in your bag are no longer available in the quantity requested.', {
      lines: priced.lines.filter((l) => l.issue).map((l) => ({ itemId: l.itemId, sku: l.sku, available: l.available, issue: l.issue })),
    });
  }
  if (input.couponCode && priced.couponError) throw badRequest(priced.couponError);
  const lines = priced.lines;
  if (!lines.length) throw badRequest('Your bag is empty.');

  // Resolve the delivery address (never trust ownership from the client).
  let shippingAddress: AddressSnapshot;
  if (input.addressId) {
    const saved = await Address.findOne({ _id: input.addressId, user: user._id }).lean();
    if (!saved) throw badRequest('Please choose a delivery address.');
    shippingAddress = {
      fullName: saved.fullName,
      phone: saved.phone,
      line1: saved.line1,
      line2: saved.line2,
      city: saved.city,
      state: saved.state,
      postalCode: saved.postalCode,
      country: saved.country,
    };
  } else if (input.address) {
    shippingAddress = input.address;
    if (input.saveAddress) {
      const count = await Address.countDocuments({ user: user._id });
      await Address.create({ ...input.address, user: user._id, isDefault: count === 0 });
    }
  } else {
    throw badRequest('Please provide a delivery address.');
  }
  // UK delivery only — this also re-checks addresses saved before the rule existed.
  const problem = deliveryProblem(shippingAddress);
  if (problem) {
    throw new AppError(
      400,
      'ADDRESS_NOT_DELIVERABLE',
      input.addressId ? `${problem.message} Please choose or add a UK delivery address.` : problem.message,
      { field: problem.field },
    );
  }
  shippingAddress = { ...shippingAddress, country: 'GB', postalCode: normalizeUkPostcode(shippingAddress.postalCode)! };

  const settings = await getSettings();
  const orderId = new Types.ObjectId();
  const now = Date.now();
  const stripeExpiry = now + (env.RESERVATION_MINUTES + 1) * 60_000;
  const reservationExpiry = new Date(stripeExpiry + 2 * 60_000); // outlives the Stripe session
  const customer: Actor = { type: 'customer', id: user._id, name: user.name };
  const sLines: StockLine[] = lines.map((l) => ({
    product: new Types.ObjectId(l.productId),
    variant: new Types.ObjectId(l.variantId),
    quantity: l.quantity,
    sku: l.sku,
  }));

  const orderDoc = {
    _id: orderId,
    orderNumber: newOrderNumber(),
    user: user._id,
    email: user.email,
    customerName: shippingAddress.fullName || user.name,
    phone: input.phone ?? shippingAddress.phone,
    items: lines.map((l) => ({
      product: new Types.ObjectId(l.productId),
      variant: new Types.ObjectId(l.variantId),
      sku: l.sku,
      name: l.name,
      slug: l.slug,
      image: l.image ? new Types.ObjectId(l.image) : null,
      size: l.size,
      color: l.color,
      department: l.department,
      categorySlug: l.categorySlug,
      categoryName: l.categoryName,
      brandName: l.brandName,
      unitPrice: l.unitPrice,
      originalUnitPrice: l.originalUnitPrice,
      quantity: l.quantity,
      lineTotal: l.lineTotal,
      unitCost: l.unitCost,
    })),
    currency: priced.currency,
    fxRate: priced.fxRate,
    baseCurrency: settings.currency.base,
    subtotal: priced.subtotal,
    discountTotal: priced.discount.amount,
    shippingTotal: priced.delivery.price,
    taxTotal: priced.tax.amount,
    taxInclusive: priced.tax.inclusive,
    total: priced.total,
    coupon: priced.discount.couponId
      ? {
          code: priced.discount.code!,
          type: priced.discount.type!,
          value: priced.discount.value!,
          coupon: new Types.ObjectId(priced.discount.couponId),
        }
      : null,
    shippingAddress,
    delivery: {
      methodId: priced.delivery.methodId,
      name: priced.delivery.name,
      etaDays: priced.delivery.etaDays,
      price: priced.delivery.price,
    },
    status: 'pending_payment' as const,
    paymentStatus: 'pending' as const,
    reservation: { status: 'active' as const, expiresAt: reservationExpiry },
    notes: input.notes,
    history: [{ status: 'pending_payment' as const, message: 'Checkout started; stock reserved.', actor: customer, at: new Date() }],
  };

  // 1) Reserve stock and create the order atomically.
  let order: OrderDoc;
  try {
    order = await runInTransaction(async (session) => {
      await reserveLines(sLines, orderId, customer, session);
      const [created] = await Order.create([orderDoc], { session });
      return created;
    });
  } catch (err) {
    // Without transactions, a failure after reservation must be compensated.
    if (!supportsTransactions() && !(err instanceof AppError && err.code === 'OUT_OF_STOCK')) {
      await releaseLines(sLines, orderId, SYSTEM, 'Order creation failed').catch(() => undefined);
    }
    throw err;
  }
  await cart.save(); // persist coupon choice
  void broadcastInventory(sLines.map((l) => l.product));

  // 2) Create the Stripe Checkout Session (outside the transaction — network call).
  try {
    const cur = priced.currency.toLowerCase();
    const publicImages = env.API_PUBLIC_URL.startsWith('https://');
    const lineItems: Record<string, unknown>[] = lines.map((l) => ({
      quantity: l.quantity,
      price_data: {
        currency: cur,
        unit_amount: l.unitPrice,
        product_data: {
          name: l.name,
          description: `${l.color} · Size ${l.size} · ${l.sku}`,
          ...(publicImages && l.image ? { images: [`${env.API_PUBLIC_URL}/api/images/${l.image}`] } : {}),
          metadata: { sku: l.sku, variantId: l.variantId },
        },
      },
    }));
    if (priced.tax.enabled && !priced.tax.inclusive && priced.tax.amount > 0) {
      lineItems.push({
        quantity: 1,
        price_data: { currency: cur, unit_amount: priced.tax.amount, product_data: { name: `${priced.tax.label} (${priced.tax.rate}%)` } },
      });
    }
    let discounts: { coupon: string }[] | undefined;
    if (priced.discount.amount > 0) {
      const coupon = await stripe.createCoupon(
        { amount_off: priced.discount.amount, currency: cur, name: priced.discount.code ?? 'Discount' },
        `coupon_${orderId}`,
      );
      discounts = [{ coupon: coupon.id }];
    }

    const session = await stripe.createCheckoutSession(
      {
        mode: 'payment',
        client_reference_id: String(orderId),
        customer_email: user.email,
        line_items: lineItems,
        ...(discounts ? { discounts } : {}),
        shipping_options: [
          {
            shipping_rate_data: {
              type: 'fixed_amount',
              display_name: priced.delivery.name,
              fixed_amount: { amount: priced.delivery.price, currency: cur },
            },
          },
        ],
        metadata: { orderId: String(orderId), orderNumber: orderDoc.orderNumber },
        payment_intent_data: { metadata: { orderId: String(orderId), orderNumber: orderDoc.orderNumber } },
        success_url: `${env.CLIENT_URL}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${env.CLIENT_URL}/checkout/cancelled?order=${orderDoc.orderNumber}`,
        expires_at: Math.floor(stripeExpiry / 1000),
      },
      `checkout_${orderId}`,
    );

    order.stripe = { checkoutSessionId: session.id };
    await order.save();
    await Payment.create({
      order: order._id,
      user: user._id,
      status: 'pending',
      amount: order.total,
      currency: order.currency,
      fxRate: order.fxRate,
      checkoutSessionId: session.id,
    });
    return { url: session.url, orderId: String(order._id), orderNumber: order.orderNumber };
  } catch (err) {
    logger.error(`Stripe session creation failed for ${orderDoc.orderNumber}`, err);
    await releaseOrder(orderId, 'Payment session could not be created', SYSTEM, 'failed');
    throw serviceUnavailable('We could not connect to the payment provider. Please try again in a moment.');
  }
}

// ── Payment confirmation (only ever called from verified webhooks / Stripe API reads) ──

export async function finalizePaidOrder(orderId: string, session: CheckoutSessionLike) {
  if (!Types.ObjectId.isValid(orderId)) return null;
  const pi = paymentIntentId(session.payment_intent);

  const result = await runInTransaction(async (s) => {
    const order = await Order.findOne({ _id: orderId, paymentStatus: { $in: ['pending', 'expired', 'cancelled', 'failed'] } }).session(s ?? null);
    if (!order) return null; // already finalised — idempotent

    const amountOk =
      session.amount_total === order.total && (session.currency ?? '').toUpperCase() === order.currency;
    let unfulfilled: StockLine[] = [];
    if (order.reservation.status === 'active') {
      await commitLines(stockLines(order), order._id, s);
    } else {
      unfulfilled = await sellWithoutReservation(stockLines(order), order._id, s);
    }

    order.status = 'paid';
    order.paymentStatus = 'paid';
    order.paidAt = new Date();
    order.reservation.status = 'committed';
    order.stripe.paymentIntentId = pi;
    order.stockConflict = unfulfilled.length > 0;
    order.history.push({ status: 'paid', message: 'Payment verified by Stripe webhook.', actor: STRIPE, at: new Date() });
    if (!amountOk) {
      order.history.push({
        status: 'note',
        message: `Amount check: Stripe charged ${session.amount_total} ${session.currency}, order total ${order.total} ${order.currency}. Review required.`,
        actor: SYSTEM,
        at: new Date(),
      });
    }
    if (unfulfilled.length) {
      order.history.push({
        status: 'note',
        message: `Stock conflict: ${unfulfilled.map((l) => l.sku).join(', ')} sold out after the reservation expired. Refund or restock required.`,
        actor: SYSTEM,
        at: new Date(),
      });
    }
    await order.save({ session: s });

    if (order.coupon?.coupon) await Coupon.updateOne({ _id: order.coupon.coupon }, { $inc: { usageCount: 1 } }, { session: s });
    await Payment.updateOne(
      { order: order._id },
      {
        $set: { status: 'succeeded', paymentIntentId: pi, paidAt: new Date(), amount: session.amount_total ?? order.total },
        $setOnInsert: { user: order.user, currency: order.currency, fxRate: order.fxRate, checkoutSessionId: session.id },
      },
      { upsert: true, session: s },
    );
    // Remove purchased lines from the customer's bag.
    await Cart.updateOne(
      { user: order.user },
      { $pull: { items: { variant: { $in: order.items.map((i) => i.variant) } } }, $set: { couponCode: null } },
      { session: s },
    );
    return { order, unfulfilled, amountOk };
  });

  if (!result) return null;
  const { order, unfulfilled, amountOk } = result;

  // Side effects after commit.
  void (async () => {
    try {
      await broadcastInventory(productIdsOf(order));
      const deltas = new Map<string, number>();
      for (const i of order.items) deltas.set(String(i.variant), (deltas.get(String(i.variant)) ?? 0) + i.quantity);
      await stockAlerts(deltas);
      broadcastOrder(order, 'order:created');
      await newOrderAlerts(order);
      await notifyUser(order.user, {
        type: 'order.paid',
        title: 'Order confirmed',
        message: `Your order ${order.orderNumber} is confirmed and being prepared.`,
        link: `/account/orders/${order.orderNumber}`,
      });
      await queueEmail(orderConfirmationMessage(order));
      if (unfulfilled.length || !amountOk) {
        await notifyAdmins({
          type: 'order.review',
          title: `Review order ${order.orderNumber}`,
          message: unfulfilled.length ? 'Paid after its reservation expired and some items sold out.' : 'Charged amount differs from the order total.',
          link: `/admin/orders/${order._id}`,
        });
      }
      if (pi) {
        const stripe = getStripe();
        const details = stripe ? await stripe.paymentDetails(pi).catch(() => null) : null;
        if (details) await Payment.updateOne({ order: order._id }, { $set: details });
      }
    } catch (err) {
      logger.error(`Post-payment tasks failed for ${order.orderNumber}`, err);
    }
  })();

  return order;
}

/** Releases an unpaid order's reservation. Idempotent. */
export async function releaseOrder(
  orderId: Types.ObjectId | string,
  reason: string,
  actor: Actor,
  paymentStatus: 'expired' | 'cancelled' | 'failed',
) {
  const order = await runInTransaction(async (s) => {
    const o = await Order.findOneAndUpdate(
      { _id: orderId, 'reservation.status': 'active', paymentStatus: 'pending' },
      {
        $set: { 'reservation.status': 'released', status: 'cancelled', paymentStatus, cancelledAt: new Date() },
        $push: { history: { status: 'cancelled', message: reason, actor, at: new Date() } },
      },
      { returnDocument: 'after', session: s },
    );
    if (!o) return null;
    await releaseLines(stockLines(o), o._id, actor, reason, s);
    await Payment.updateOne({ order: o._id, status: 'pending' }, { $set: { status: paymentStatus === 'failed' ? 'failed' : paymentStatus } }, { session: s });
    return o;
  });
  if (order) {
    void broadcastInventory(productIdsOf(order));
    broadcastOrder(order, 'order:updated');
  }
  return order;
}

/** Customer returned from Stripe without paying. */
export async function cancelPendingCheckout(user: AuthUser, orderNumberValue: string) {
  const order = await Order.findOne({ orderNumber: orderNumberValue, user: user._id });
  if (!order) throw notFound('Order not found.');
  if (order.paymentStatus !== 'pending') return { status: order.status, paymentStatus: order.paymentStatus };
  const stripe = getStripe();
  if (stripe && order.stripe.checkoutSessionId) {
    try {
      const s = await stripe.retrieveCheckoutSession(order.stripe.checkoutSessionId);
      if (s.status === 'complete') {
        if (s.payment_status === 'paid') await finalizePaidOrder(String(order._id), s);
        const fresh = await Order.findById(order._id).lean();
        return { status: fresh?.status, paymentStatus: fresh?.paymentStatus };
      }
      if (s.status === 'open') await stripe.expireCheckoutSession(order.stripe.checkoutSessionId);
    } catch (err) {
      logger.warn(`Could not expire Stripe session for ${order.orderNumber}`, err);
    }
  }
  const released = await releaseOrder(order._id, 'Checkout cancelled by customer.', { type: 'customer', id: user._id, name: user.name }, 'cancelled');
  return { status: released?.status ?? order.status, paymentStatus: released?.paymentStatus ?? order.paymentStatus };
}

/**
 * Server-side reconciliation for the checkout success page: reads the session
 * directly from Stripe's API (authoritative, server-to-server) instead of
 * trusting the browser redirect. Webhooks remain the primary path; this covers
 * delayed or undeliverable webhooks (e.g. local development without the Stripe CLI).
 */
export async function reconcileCheckoutSession(sessionId: string, userId: Types.ObjectId) {
  const order = await Order.findOne({ 'stripe.checkoutSessionId': sessionId, user: userId });
  if (!order) throw notFound('Order not found.');
  if (order.paymentStatus !== 'pending') return order;
  const stripe = getStripe();
  if (!stripe) return order;
  try {
    const s = await stripe.retrieveCheckoutSession(sessionId);
    if (String(s.metadata?.orderId ?? s.client_reference_id) !== String(order._id)) return order;
    if (s.status === 'complete' && (s.payment_status === 'paid' || s.payment_status === 'no_payment_required')) {
      await finalizePaidOrder(String(order._id), s);
    } else if (s.status === 'expired') {
      await releaseOrder(order._id, 'Stripe Checkout session expired; reserved stock returned.', STRIPE, 'expired');
    }
  } catch (err) {
    logger.warn(`Could not reconcile Stripe session ${sessionId}`, err);
  }
  return (await Order.findById(order._id))!;
}

/** Scheduled: releases reservations whose checkout window has passed. */
export async function expireStaleReservations() {
  const stale = await Order.find({
    'reservation.status': 'active',
    paymentStatus: 'pending',
    'reservation.expiresAt': { $lte: new Date() },
  })
    .limit(100)
    .lean();
  const stripe = getStripe();
  let released = 0;
  for (const order of stale) {
    if (stripe && order.stripe?.checkoutSessionId) {
      try {
        const s = await stripe.retrieveCheckoutSession(order.stripe.checkoutSessionId);
        if (s.status === 'complete' && s.payment_status === 'paid') {
          await finalizePaidOrder(String(order._id), s);
          continue;
        }
        if (s.status === 'open') await stripe.expireCheckoutSession(order.stripe.checkoutSessionId);
      } catch (err) {
        const code = (err as { code?: string })?.code;
        if (code !== 'resource_missing') {
          logger.warn(`Stripe unreachable while expiring ${order.orderNumber}; will retry`, err);
          continue; // do not release while the payment state is unknown
        }
      }
    }
    if (await releaseOrder(order._id, 'Checkout expired; reserved stock returned.', SYSTEM, 'expired')) released += 1;
  }
  if (released) logger.info(`Released ${released} expired reservation(s)`);
  return released;
}

// ── Webhook handlers ────────────────────────────────────────────────────────

export async function handleCheckoutCompleted(session: CheckoutSessionLike) {
  const orderId = session.metadata?.orderId ?? session.client_reference_id;
  if (!orderId) return;
  if (session.payment_status === 'paid' || session.payment_status === 'no_payment_required') {
    await finalizePaidOrder(orderId, session);
  } else {
    // Delayed payment methods: wait for async_payment_succeeded / failed.
    await Order.updateOne(
      { _id: orderId, paymentStatus: 'pending' },
      { $push: { history: { status: 'payment', message: 'Checkout completed; awaiting payment confirmation.', actor: STRIPE, at: new Date() } } },
    );
  }
}

export async function handleCheckoutExpired(session: CheckoutSessionLike) {
  const orderId = session.metadata?.orderId ?? session.client_reference_id;
  if (!orderId || !Types.ObjectId.isValid(orderId)) return;
  await releaseOrder(orderId, 'Stripe Checkout session expired; reserved stock returned.', STRIPE, 'expired');
}

export async function handleAsyncPaymentFailed(session: CheckoutSessionLike) {
  const orderId = session.metadata?.orderId ?? session.client_reference_id;
  if (!orderId || !Types.ObjectId.isValid(orderId)) return;
  await releaseOrder(orderId, 'Payment failed; reserved stock returned.', STRIPE, 'failed');
}

export async function handlePaymentFailed(intent: { id: string; metadata?: Record<string, string>; last_payment_error?: { message?: string } }) {
  const orderId = intent.metadata?.orderId;
  if (!orderId || !Types.ObjectId.isValid(orderId)) return;
  const message = intent.last_payment_error?.message ?? 'Payment attempt failed.';
  await Payment.updateOne({ order: orderId }, { $set: { failureMessage: message, paymentIntentId: intent.id } });
  await Order.updateOne(
    { _id: orderId, paymentStatus: 'pending' },
    { $push: { history: { status: 'payment', message: `Payment attempt declined: ${message}`, actor: STRIPE, at: new Date() } } },
  );
}

/** Keeps refund totals in sync when refunds are made in the Stripe Dashboard. */
export async function handleChargeRefunded(charge: { payment_intent?: string | { id: string } | null; amount_refunded: number }) {
  const pi = paymentIntentId(charge.payment_intent ?? null);
  if (!pi) return;
  const order = await Order.findOne({ 'stripe.paymentIntentId': pi });
  if (!order || charge.amount_refunded <= order.refundedTotal) return;
  const fully = charge.amount_refunded >= order.total;
  const delta = charge.amount_refunded - order.refundedTotal;
  await Payment.updateOne(
    { order: order._id },
    { $push: { refunds: { stripeRefundId: `dashboard_${Date.now()}`, amount: delta, reason: 'Refunded in Stripe Dashboard', status: 'succeeded', restocked: false, createdBy: STRIPE, createdAt: new Date() } } },
  );
  order.refundedTotal = charge.amount_refunded;
  order.paymentStatus = fully ? 'refunded' : 'partially_refunded';
  if (fully) order.status = 'refunded';
  order.history.push({ status: 'refund', message: `Refund recorded from Stripe (total refunded ${charge.amount_refunded}).`, actor: STRIPE, at: new Date() });
  await order.save();
  await Payment.updateOne({ order: order._id }, { $set: { amountRefunded: charge.amount_refunded, status: fully ? 'refunded' : 'partially_refunded' } });
  broadcastOrder(order, 'order:updated');
}

export async function handleRefundUpdated(refund: RefundLike) {
  await Payment.updateOne({ 'refunds.stripeRefundId': refund.id }, { $set: { 'refunds.$.status': refund.status ?? 'pending' } });
}

// ── Admin operations ────────────────────────────────────────────────────────

const TRANSITIONS: Partial<Record<OrderStatus, OrderStatus[]>> = {
  paid: ['processing', 'packed', 'shipped'],
  processing: ['packed', 'shipped'],
  packed: ['shipped'],
  shipped: ['out_for_delivery', 'delivered'],
  out_for_delivery: ['delivered'],
};

export function allowedNextStatuses(status: OrderStatus) {
  return TRANSITIONS[status] ?? [];
}

export async function updateOrderStatus(orderId: string, next: OrderStatus, actor: Actor, note?: string) {
  const order = await Order.findById(orderId);
  if (!order) throw notFound('Order not found.');
  if (!allowedNextStatuses(order.status).includes(next)) {
    throw conflict(`Cannot change status from ${order.status} to ${next}.`);
  }
  const updated = await Order.findOneAndUpdate(
    { _id: order._id, status: order.status },
    {
      $set: {
        status: next,
        ...(next === 'shipped' ? { shippedAt: new Date() } : {}),
        ...(next === 'delivered' ? { deliveredAt: new Date() } : {}),
      },
      $push: { history: { status: next, message: note || `Status changed to ${next.replace(/_/g, ' ')}.`, actor, at: new Date() } },
    },
    { returnDocument: 'after' },
  );
  if (!updated) throw conflict('The order changed while updating. Please refresh.');
  broadcastOrder(updated, 'order:updated');
  const msg = orderStatusMessage(updated, next);
  if (msg) await queueEmail(msg);
  if (['shipped', 'out_for_delivery', 'delivered'].includes(next)) {
    await notifyUser(updated.user, {
      type: `order.${next}`,
      title: next === 'delivered' ? 'Delivered' : next === 'shipped' ? 'Your order has shipped' : 'Out for delivery',
      message: `Order ${updated.orderNumber} is ${next.replace(/_/g, ' ')}.`,
      link: `/account/orders/${updated.orderNumber}`,
    });
  }
  return updated;
}

export async function refundOrder(
  orderId: string,
  input: { amount?: number; reason?: string; restock: boolean },
  actor: Actor,
  opts: { cancel?: boolean } = {},
) {
  const order = await Order.findById(orderId);
  if (!order) throw notFound('Order not found.');
  if (!['paid', 'partially_refunded'].includes(order.paymentStatus)) throw conflict('Only paid orders can be refunded.');
  const pi = order.stripe.paymentIntentId;
  if (!pi) throw conflict('This order has no Stripe payment reference.');
  const stripe = getStripe();
  if (!stripe) throw serviceUnavailable('Stripe is not configured.');

  const remaining = order.total - order.refundedTotal;
  const amount = input.amount ?? remaining;
  if (!Number.isInteger(amount) || amount <= 0 || amount > remaining) {
    throw badRequest(`Refund amount must be between 1 and ${remaining} (minor units).`);
  }

  const refund = await stripe.createRefund(
    { payment_intent: pi, amount, reason: 'requested_by_customer', metadata: { orderId: String(order._id), orderNumber: order.orderNumber } },
    `refund_${order._id}_${order.refundedTotal}_${amount}`,
  );
  if (refund.status === 'failed' || refund.status === 'canceled') throw serviceUnavailable('Stripe declined the refund.');

  const fully = order.refundedTotal + amount >= order.total;
  const restockLines: { variant: Types.ObjectId; qty: number }[] = [];
  if (input.restock && fully) {
    for (const item of order.items) {
      const qty = item.quantity - (item.restocked ?? 0);
      if (qty > 0) {
        restockLines.push({ variant: item.variant, qty });
        item.restocked = item.quantity;
      }
    }
  }
  order.refundedTotal += amount;
  order.paymentStatus = fully ? 'refunded' : 'partially_refunded';
  if (fully) order.status = opts.cancel ? 'cancelled' : 'refunded';
  if (opts.cancel) order.cancelledAt = new Date();
  order.history.push({
    status: 'refund',
    message: `Refunded ${amount} ${order.currency}${input.reason ? ` — ${input.reason}` : ''}${restockLines.length ? '; items restocked' : ''}.`,
    actor,
    at: new Date(),
  });
  if (opts.cancel) order.history.push({ status: 'cancelled', message: 'Order cancelled.', actor, at: new Date() });
  await order.save();

  await Payment.updateOne(
    { order: order._id },
    {
      $inc: { amountRefunded: amount },
      $set: { status: fully ? 'refunded' : 'partially_refunded' },
      $push: { refunds: { stripeRefundId: refund.id, amount, reason: input.reason, status: refund.status ?? 'pending', restocked: restockLines.length > 0, createdBy: actor, createdAt: new Date() } },
    },
  );

  for (const line of restockLines) {
    await adjustStock(line.variant, line.qty, actor, 'refund_restock', `Refund ${order.orderNumber}`, order._id).catch((err) =>
      logger.warn(`Restock failed for ${line.variant}`, err),
    );
  }
  if (restockLines.length) void broadcastInventory(productIdsOf(order));

  broadcastOrder(order, 'order:updated');
  const msg = orderStatusMessage(order, opts.cancel ? 'cancelled' : 'refunded');
  if (msg) await queueEmail(msg);
  await notifyUser(order.user, {
    type: opts.cancel ? 'order.cancelled' : 'order.refunded',
    title: opts.cancel ? 'Order cancelled' : 'Refund issued',
    message: `${opts.cancel ? 'Order cancelled and refunded' : 'A refund was issued'} for ${order.orderNumber}.`,
    link: `/account/orders/${order.orderNumber}`,
  });
  return order;
}

export async function cancelOrder(orderId: string, actor: Actor, reason?: string) {
  const order = await Order.findById(orderId);
  if (!order) throw notFound('Order not found.');
  if (order.paymentStatus === 'pending') {
    const stripe = getStripe();
    if (stripe && order.stripe.checkoutSessionId) {
      await stripe.expireCheckoutSession(order.stripe.checkoutSessionId).catch(() => undefined);
    }
    const released = await releaseOrder(order._id, reason || 'Cancelled by staff.', actor, 'cancelled');
    if (!released) throw conflict('The order changed while cancelling. Please refresh.');
    return released;
  }
  if (!['paid', 'processing', 'packed'].includes(order.status)) {
    throw conflict('Orders that have shipped cannot be cancelled — issue a refund instead.');
  }
  return refundOrder(orderId, { reason: reason || 'Order cancelled', restock: true }, actor, { cancel: true });
}

import { Router } from 'express';
import { z } from 'zod';
import { Types } from 'mongoose';
import { Product } from '../../models/Product.js';
import { Order } from '../../models/Order.js';
import { Payment } from '../../models/Payment.js';
import { User } from '../../models/User.js';
import { Address } from '../../models/Address.js';
import { StockMovement } from '../../models/Misc.js';
import { ORDER_STATUSES, PAYMENT_STATUSES, type Actor } from '../../models/common.js';
import { validate } from '../../middleware/validate.js';
import { requirePermission } from '../../middleware/auth.js';
import { adjustStock, findVariant, setStock } from '../../services/inventory.service.js';
import { broadcastInventory, broadcastOrder, stockAlerts } from '../../services/broadcast.service.js';
import { allowedNextStatuses, cancelOrder, refundOrder, updateOrderStatus } from '../../services/order.service.js';
import { revokeAllSessions } from '../../services/session.service.js';
import { logActivity } from '../../services/activity.service.js';
import { queueEmail } from '../../jobs/queue.js';
import { orderStatusMessage } from '../../services/email.service.js';
import { objectId, pagination } from '../../utils/schemas.js';
import { notFound } from '../../utils/errors.js';
import { escapeRegex } from '../../utils/money.js';

const router = Router();
const actorOf = (req: Express.Request): Actor => ({ type: 'admin', id: String(req.admin!._id), name: req.admin!.name });

// ── Inventory ──────────────────────────────────────────────────────────────
router.get(
  '/inventory',
  requirePermission('products:read'),
  validate({
    query: z.object({
      q: z.string().trim().max(80).optional(),
      filter: z.enum(['all', 'low', 'out', 'reserved']).default('all'),
      ...pagination,
      limit: z.coerce.number().int().min(1).max(200).default(50),
    }),
  }),
  async (req, res) => {
    const { q, filter, page, limit } = req.valid.query;
    const match: Record<string, unknown> = { status: { $ne: 'archived' } };
    const variantMatch: Record<string, unknown> = {};
    if (q) {
      const rx = new RegExp(escapeRegex(q), 'i');
      variantMatch.$or = [{ name: rx }, { 'variants.sku': rx }, { brandName: rx }];
    }
    if (filter === 'out') variantMatch['variants.available'] = { $lte: 0 };
    if (filter === 'reserved') variantMatch['variants.reserved'] = { $gt: 0 };
    if (filter === 'low') variantMatch.$expr = { $and: [{ $gt: ['$variants.available', 0] }, { $lte: ['$variants.available', '$lowStockThreshold'] }] };
    const pipeline = [
      { $match: match },
      { $unwind: '$variants' },
      { $match: variantMatch },
      {
        $project: {
          productId: '$_id',
          name: 1,
          slug: 1,
          status: 1,
          brandName: 1,
          lowStockThreshold: 1,
          image: { $arrayElemAt: ['$images.files.sm', 0] },
          variantId: '$variants._id',
          sku: '$variants.sku',
          size: '$variants.size',
          color: '$variants.color',
          colorHex: '$variants.colorHex',
          stock: '$variants.stock',
          reserved: '$variants.reserved',
          available: '$variants.available',
          isActive: '$variants.isActive',
        },
      },
      { $sort: { available: 1 as const, name: 1 as const } },
      { $facet: { items: [{ $skip: (page - 1) * limit }, { $limit: limit }], total: [{ $count: 'n' }] } },
    ];
    const [result] = await Product.aggregate(pipeline as never);
    const total = result?.total?.[0]?.n ?? 0;
    res.json({
      items: (result?.items ?? []).map((i: Record<string, unknown>) => ({ ...i, _id: String(i.variantId), productId: String(i.productId), variantId: String(i.variantId), image: i.image ? String(i.image) : null })),
      total,
      page,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    });
  },
);

router.put(
  '/inventory/:variantId',
  requirePermission('inventory:write'),
  validate({ params: z.object({ variantId: objectId }), body: z.object({ stock: z.number().int().min(0).max(1_000_000), note: z.string().trim().max(300).optional() }) }),
  async (req, res) => {
    const variantId = new Types.ObjectId(req.valid.params.variantId);
    const before = await findVariant(variantId);
    const prevAvailable = before.variant.available;
    const result = await setStock(variantId, req.body.stock, actorOf(req), req.body.note);
    await logActivity(req, 'inventory.set', 'variant', String(variantId), `Set ${result.variant.sku} stock ${before.variant.stock} → ${req.body.stock}`);
    void broadcastInventory([result.productId]);
    if (result.variant.available < prevAvailable) void stockAlerts(new Map([[String(variantId), prevAvailable - result.variant.available]]));
    res.json({ variant: { ...result.variant, _id: String(result.variant._id) }, productId: String(result.productId) });
  },
);

router.post(
  '/inventory/restock',
  requirePermission('inventory:write'),
  validate({ body: z.object({ variantId: objectId, quantity: z.number().int().min(1).max(1_000_000), note: z.string().trim().max(300).optional() }) }),
  async (req, res) => {
    const variantId = new Types.ObjectId(req.body.variantId);
    const result = await adjustStock(variantId, req.body.quantity, actorOf(req), 'restock', req.body.note ?? 'Restock');
    await logActivity(req, 'inventory.restock', 'variant', String(variantId), `Restocked ${result.variant.sku} +${req.body.quantity}`);
    void broadcastInventory([result.productId]);
    res.json({ variant: { ...result.variant, _id: String(result.variant._id) }, productId: String(result.productId) });
  },
);

router.post(
  '/inventory/adjust',
  requirePermission('inventory:write'),
  validate({ body: z.object({ variantId: objectId, delta: z.number().int().min(-1_000_000).max(1_000_000).refine((d) => d !== 0), note: z.string().trim().min(2).max(300) }) }),
  async (req, res) => {
    const variantId = new Types.ObjectId(req.body.variantId);
    const result = await adjustStock(variantId, req.body.delta, actorOf(req), req.body.delta > 0 ? 'restock' : 'adjustment', req.body.note);
    await logActivity(req, 'inventory.adjust', 'variant', String(variantId), `Adjusted ${result.variant.sku} ${req.body.delta > 0 ? '+' : ''}${req.body.delta}: ${req.body.note}`);
    void broadcastInventory([result.productId]);
    if (req.body.delta < 0) void stockAlerts(new Map([[String(variantId), -req.body.delta]]));
    res.json({ variant: { ...result.variant, _id: String(result.variant._id) }, productId: String(result.productId) });
  },
);

router.get(
  '/inventory/movements',
  requirePermission('products:read'),
  validate({ query: z.object({ variantId: objectId.optional(), productId: objectId.optional(), ...pagination, limit: z.coerce.number().int().min(1).max(200).default(50) }) }),
  async (req, res) => {
    const { variantId, productId, page, limit } = req.valid.query;
    const filter: Record<string, unknown> = {};
    if (variantId) filter.variant = variantId;
    if (productId) filter.product = productId;
    const [items, total] = await Promise.all([
      StockMovement.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
      StockMovement.countDocuments(filter),
    ]);
    res.json({ items, total, page, totalPages: Math.max(1, Math.ceil(total / limit)) });
  },
);

// ── Orders ─────────────────────────────────────────────────────────────────
router.get(
  '/orders',
  requirePermission('orders:read'),
  validate({
    query: z.object({
      q: z.string().trim().max(80).optional(),
      status: z.enum(ORDER_STATUSES).optional(),
      paymentStatus: z.enum(PAYMENT_STATUSES).optional(),
      from: z.coerce.date().optional(),
      to: z.coerce.date().optional(),
      includePending: z.enum(['true', 'false']).optional(),
      ...pagination,
      limit: z.coerce.number().int().min(1).max(100).default(20),
    }),
  }),
  async (req, res) => {
    const q = req.valid.query;
    const filter: Record<string, unknown> = {};
    if (q.status) filter.status = q.status;
    else if (q.includePending !== 'true') filter.paymentStatus = { $ne: 'pending' };
    if (q.paymentStatus) filter.paymentStatus = q.paymentStatus;
    if (q.from || q.to) filter.createdAt = { ...(q.from ? { $gte: q.from } : {}), ...(q.to ? { $lte: q.to } : {}) };
    if (q.q) {
      const rx = new RegExp(escapeRegex(q.q), 'i');
      filter.$or = [{ orderNumber: rx }, { email: rx }, { customerName: rx }, { 'items.sku': rx }, { 'tracking.number': rx }];
    }
    const [orders, total] = await Promise.all([
      Order.find(filter).sort({ createdAt: -1 }).skip((q.page - 1) * q.limit).limit(q.limit).lean(),
      Order.countDocuments(filter),
    ]);
    res.json({
      items: orders.map((o) => ({
        _id: String(o._id),
        orderNumber: o.orderNumber,
        customerName: o.customerName,
        email: o.email,
        status: o.status,
        paymentStatus: o.paymentStatus,
        total: o.total,
        refundedTotal: o.refundedTotal,
        currency: o.currency,
        itemCount: o.items.reduce((s, i) => s + i.quantity, 0),
        stockConflict: o.stockConflict,
        createdAt: o.createdAt,
        paidAt: o.paidAt,
      })),
      total,
      page: q.page,
      totalPages: Math.max(1, Math.ceil(total / q.limit)),
    });
  },
);

router.get('/orders/:id', requirePermission('orders:read'), validate({ params: z.object({ id: objectId }) }), async (req, res) => {
  const order = await Order.findById(req.valid.params.id).lean();
  if (!order) throw notFound('Order not found.');
  const [payment, customer, previousOrders] = await Promise.all([
    Payment.findOne({ order: order._id }).lean(),
    User.findById(order.user).select('name email createdAt status').lean(),
    Order.countDocuments({ user: order.user, paymentStatus: { $in: ['paid', 'partially_refunded', 'refunded'] } }),
  ]);
  res.json({
    order: { ...order, _id: String(order._id), items: order.items.map((i) => ({ ...i, image: i.image ? String(i.image) : null })) },
    payment,
    customer: customer ? { ...customer, _id: String(customer._id), paidOrders: previousOrders } : null,
    allowedStatuses: allowedNextStatuses(order.status),
  });
});

router.put(
  '/orders/:id/status',
  requirePermission('orders:write'),
  validate({ params: z.object({ id: objectId }), body: z.object({ status: z.enum(['processing', 'packed', 'shipped', 'out_for_delivery', 'delivered']), note: z.string().trim().max(300).optional() }) }),
  async (req, res) => {
    const order = await updateOrderStatus(req.valid.params.id, req.body.status, actorOf(req), req.body.note);
    await logActivity(req, 'order.status', 'order', String(order._id), `${order.orderNumber} → ${req.body.status}`);
    res.json({ order, allowedStatuses: allowedNextStatuses(order.status) });
  },
);

router.put(
  '/orders/:id/tracking',
  requirePermission('orders:write'),
  validate({ params: z.object({ id: objectId }), body: z.object({ carrier: z.string().trim().max(60), number: z.string().trim().min(3).max(80), url: z.string().trim().url().max(500).optional().or(z.literal('')) }) }),
  async (req, res) => {
    const order = await Order.findByIdAndUpdate(
      req.valid.params.id,
      {
        $set: { tracking: { carrier: req.body.carrier, number: req.body.number, url: req.body.url || undefined } },
        $push: { history: { status: 'tracking', message: `Tracking added: ${req.body.carrier} ${req.body.number}`, actor: actorOf(req), at: new Date() } },
      },
      { returnDocument: 'after' },
    );
    if (!order) throw notFound('Order not found.');
    await logActivity(req, 'order.tracking', 'order', String(order._id), `${order.orderNumber} tracking ${req.body.carrier} ${req.body.number}`);
    broadcastOrder(order, 'order:updated');
    if (['shipped', 'out_for_delivery'].includes(order.status)) {
      const msg = orderStatusMessage(order, order.status);
      if (msg) await queueEmail(msg);
    }
    res.json({ order });
  },
);

router.post(
  '/orders/:id/notes',
  requirePermission('orders:write'),
  validate({ params: z.object({ id: objectId }), body: z.object({ message: z.string().trim().min(2).max(500) }) }),
  async (req, res) => {
    const order = await Order.findByIdAndUpdate(
      req.valid.params.id,
      { $push: { history: { status: 'note', message: req.body.message, actor: actorOf(req), at: new Date() } } },
      { returnDocument: 'after' },
    );
    if (!order) throw notFound('Order not found.');
    res.json({ order });
  },
);

router.post(
  '/orders/:id/cancel',
  requirePermission('orders:refund'),
  validate({ params: z.object({ id: objectId }), body: z.object({ reason: z.string().trim().max(300).optional() }) }),
  async (req, res) => {
    const order = await cancelOrder(req.valid.params.id, actorOf(req), req.body.reason);
    await logActivity(req, 'order.cancel', 'order', String(order._id), `Cancelled ${order.orderNumber}`);
    res.json({ order });
  },
);

router.post(
  '/orders/:id/refund',
  requirePermission('orders:refund'),
  validate({
    params: z.object({ id: objectId }),
    body: z.object({ amount: z.number().int().min(1).optional(), reason: z.string().trim().max(300).optional(), restock: z.boolean().default(false) }),
  }),
  async (req, res) => {
    const order = await refundOrder(req.valid.params.id, req.body, actorOf(req));
    await logActivity(req, 'order.refund', 'order', String(order._id), `Refunded ${order.orderNumber} (${req.body.amount ?? 'full'})`, { amount: req.body.amount, restock: req.body.restock });
    res.json({ order });
  },
);

// ── Customers ──────────────────────────────────────────────────────────────
router.get(
  '/customers',
  requirePermission('customers:read'),
  validate({ query: z.object({ q: z.string().trim().max(80).optional(), sort: z.enum(['newest', 'spent', 'orders']).default('newest'), ...pagination, limit: z.coerce.number().int().min(1).max(100).default(20) }) }),
  async (req, res) => {
    const { q, sort, page, limit } = req.valid.query;
    const match: Record<string, unknown> = {};
    if (q) {
      const rx = new RegExp(escapeRegex(q), 'i');
      match.$or = [{ name: rx }, { email: rx }];
    }
    const sortStage: Record<string, 1 | -1> = sort === 'spent' ? { totalSpent: -1, _id: 1 } : sort === 'orders' ? { orderCount: -1, _id: 1 } : { createdAt: -1 };
    const [result] = await User.aggregate([
      { $match: match },
      {
        $lookup: {
          from: 'orders',
          let: { uid: '$_id' },
          pipeline: [
            { $match: { $expr: { $eq: ['$user', '$$uid'] }, paymentStatus: { $in: ['paid', 'partially_refunded', 'refunded'] } } },
            { $group: { _id: null, count: { $sum: 1 }, spent: { $sum: { $divide: [{ $subtract: ['$total', '$refundedTotal'] }, '$fxRate'] } }, last: { $max: '$paidAt' } } },
          ],
          as: 'stats',
        },
      },
      {
        $project: {
          name: 1,
          email: 1,
          status: 1,
          emailVerified: 1,
          createdAt: 1,
          lastLoginAt: 1,
          orderCount: { $ifNull: [{ $arrayElemAt: ['$stats.count', 0] }, 0] },
          totalSpent: { $round: [{ $ifNull: [{ $arrayElemAt: ['$stats.spent', 0] }, 0] }, 0] },
          lastOrderAt: { $arrayElemAt: ['$stats.last', 0] },
        },
      },
      { $sort: sortStage },
      { $facet: { items: [{ $skip: (page - 1) * limit }, { $limit: limit }], total: [{ $count: 'n' }] } },
    ]);
    const total = result?.total?.[0]?.n ?? 0;
    res.json({ items: result?.items ?? [], total, page, totalPages: Math.max(1, Math.ceil(total / limit)) });
  },
);

router.get('/customers/:id', requirePermission('customers:read'), validate({ params: z.object({ id: objectId }) }), async (req, res) => {
  const user = await User.findById(req.valid.params.id).lean();
  if (!user) throw notFound('Customer not found.');
  const [orders, addresses] = await Promise.all([
    Order.find({ user: user._id }).sort({ createdAt: -1 }).limit(50).lean(),
    Address.find({ user: user._id }).lean(),
  ]);
  const paid = orders.filter((o) => ['paid', 'partially_refunded', 'refunded'].includes(o.paymentStatus));
  res.json({
    customer: { _id: String(user._id), name: user.name, email: user.email, phone: user.phone, status: user.status, emailVerified: user.emailVerified, marketingOptIn: user.marketingOptIn, createdAt: user.createdAt, lastLoginAt: user.lastLoginAt },
    stats: { orders: paid.length, totalSpent: Math.round(paid.reduce((s, o) => s + (o.total - o.refundedTotal) / o.fxRate, 0)) },
    orders: orders.map((o) => ({ _id: String(o._id), orderNumber: o.orderNumber, status: o.status, paymentStatus: o.paymentStatus, total: o.total, currency: o.currency, createdAt: o.createdAt })),
    addresses,
  });
});

router.patch(
  '/customers/:id/status',
  requirePermission('customers:write'),
  validate({ params: z.object({ id: objectId }), body: z.object({ status: z.enum(['active', 'suspended']) }) }),
  async (req, res) => {
    const user = await User.findByIdAndUpdate(req.valid.params.id, { $set: { status: req.body.status } }, { returnDocument: 'after' });
    if (!user) throw notFound('Customer not found.');
    if (req.body.status === 'suspended') await revokeAllSessions('user', user._id);
    await logActivity(req, 'customer.status', 'user', String(user._id), `${user.email} → ${req.body.status}`);
    res.json({ ok: true, status: user.status });
  },
);

export default router;

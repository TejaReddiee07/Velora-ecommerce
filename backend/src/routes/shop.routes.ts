import { Router, type Request } from 'express';
import { z } from 'zod';
import { Types } from 'mongoose';
import { Wishlist } from '../models/Cart.js';
import { Product, type IProduct } from '../models/Product.js';
import { Order, type IOrder } from '../models/Order.js';
import { Payment } from '../models/Payment.js';
import { Notification, Review } from '../models/Misc.js';
import { validate } from '../middleware/validate.js';
import { loadUser, requireUser } from '../middleware/auth.js';
import { checkoutLimiter, publicWriteLimiter } from '../middleware/security.js';
import {
  addToCart,
  cartIdentity,
  getCart,
  getOrCreateCart,
  priceCart,
  removeCartItem,
  updateCartItem,
  type PricedCart,
} from '../services/cart.service.js';
import { cancelPendingCheckout, createCheckout, reconcileCheckoutSession } from '../services/order.service.js';
import { getSettings, resolveCurrency } from '../services/settings.service.js';
import { productCard } from '../services/serializers.js';
import { validateCouponCode } from '../services/coupon.service.js';
import { addressInput, objectId, pagination } from '../utils/schemas.js';
import { badRequest, notFound } from '../utils/errors.js';

const router = Router();
type ProductLean = IProduct & { _id: Types.ObjectId };

function cartView(priced: PricedCart, couponCode: string | null | undefined) {
  return { ...priced, couponCode: couponCode ?? null, lines: priced.lines.map(({ unitPriceBase: _b, unitCost: _c, ...l }) => l) };
}

const currencyQuery = z.object({ currency: z.string().max(3).optional(), delivery: z.string().max(40).optional() });

// ── Cart (guests and customers) ────────────────────────────────────────────
router.get('/cart', loadUser, validate({ query: currencyQuery }), async (req, res) => {
  const { currency, delivery } = req.valid.query;
  const cart = await getCart(cartIdentity(req, res, false));
  const priced = await priceCart(cart, currency, req.user?._id, delivery);
  res.json({ cart: cartView(priced, cart?.couponCode) });
});

router.post(
  '/cart/items',
  loadUser,
  validate({ body: z.object({ productId: objectId, variantId: objectId, quantity: z.number().int().min(1).max(10).default(1), currency: z.string().max(3).optional() }) }),
  async (req, res) => {
    const identity = cartIdentity(req, res, true)!;
    const cart = await addToCart(identity, new Types.ObjectId(req.body.productId), new Types.ObjectId(req.body.variantId), req.body.quantity);
    const priced = await priceCart(cart, req.body.currency, req.user?._id);
    res.status(201).json({ cart: cartView(priced, cart.couponCode) });
  },
);

router.patch(
  '/cart/items/:itemId',
  loadUser,
  validate({ params: z.object({ itemId: objectId }), body: z.object({ quantity: z.number().int().min(0).max(10), currency: z.string().max(3).optional() }) }),
  async (req, res) => {
    const identity = cartIdentity(req, res, true)!;
    const cart = await updateCartItem(identity, new Types.ObjectId(req.valid.params.itemId), req.body.quantity);
    const priced = await priceCart(cart, req.body.currency, req.user?._id);
    res.json({ cart: cartView(priced, cart.couponCode) });
  },
);

router.delete('/cart/items/:itemId', loadUser, validate({ params: z.object({ itemId: objectId }), query: currencyQuery }), async (req, res) => {
  const identity = cartIdentity(req, res, true)!;
  const cart = await removeCartItem(identity, new Types.ObjectId(req.valid.params.itemId));
  const priced = await priceCart(cart, req.valid.query.currency, req.user?._id);
  res.json({ cart: cartView(priced, cart.couponCode) });
});

router.post(
  '/cart/coupon',
  loadUser,
  publicWriteLimiter,
  validate({ body: z.object({ code: z.string().trim().min(2).max(40), currency: z.string().max(3).optional() }) }),
  async (req, res) => {
    const identity = cartIdentity(req, res, true)!;
    const cart = await getOrCreateCart(identity);
    const pricedBefore = await priceCart(cart, req.body.currency, req.user?._id);
    const subtotalBase = pricedBefore.lines.filter((l) => !l.issue).reduce((s, l) => s + l.unitPriceBase * l.quantity, 0);
    await validateCouponCode(req.body.code, subtotalBase, req.user?._id); // throws a friendly error
    cart.couponCode = req.body.code.toUpperCase();
    await cart.save();
    const priced = await priceCart(cart, req.body.currency, req.user?._id);
    res.json({ cart: cartView(priced, cart.couponCode) });
  },
);

router.delete('/cart/coupon', loadUser, validate({ query: currencyQuery }), async (req, res) => {
  const identity = cartIdentity(req, res, true)!;
  const cart = await getOrCreateCart(identity);
  cart.couponCode = null;
  await cart.save();
  const priced = await priceCart(cart, req.valid.query.currency, req.user?._id);
  res.json({ cart: cartView(priced, cart.couponCode) });
});

// ── Wishlist ───────────────────────────────────────────────────────────────
async function wishlistView(req: Request) {
  const settings = await getSettings();
  const currency = resolveCurrency(settings, (req.query.currency as string) ?? null);
  const wl = await Wishlist.findOne({ user: req.user!._id }).lean();
  const ids = wl?.products ?? [];
  const products = await Product.find({ _id: { $in: ids }, status: { $ne: 'archived' } }).lean<ProductLean[]>();
  const byId = new Map(products.map((p) => [String(p._id), p]));
  return {
    productIds: ids.map(String),
    items: ids
      .map((id) => byId.get(String(id)))
      .filter((p): p is ProductLean => Boolean(p))
      .map((p) => ({
        ...productCard(p, settings, currency),
        purchasable: p.status === 'published' && p.totalAvailable > 0,
        variants: p.variants.map((v) => ({ _id: String(v._id), size: v.size, color: v.color, colorHex: v.colorHex, available: v.isActive ? v.available : 0 })),
      })),
  };
}

router.get('/wishlist', requireUser, async (req, res) => {
  res.json({ wishlist: await wishlistView(req) });
});

router.post('/wishlist/:productId', requireUser, validate({ params: z.object({ productId: objectId }) }), async (req, res) => {
  const { productId } = req.valid.params;
  if (!(await Product.exists({ _id: productId, status: 'published' }))) throw notFound('Product not found.');
  await Wishlist.updateOne({ user: req.user!._id }, { $addToSet: { products: new Types.ObjectId(productId) } }, { upsert: true });
  res.status(201).json({ wishlist: await wishlistView(req) });
});

router.delete('/wishlist/:productId', requireUser, validate({ params: z.object({ productId: objectId }) }), async (req, res) => {
  await Wishlist.updateOne({ user: req.user!._id }, { $pull: { products: new Types.ObjectId(req.valid.params.productId) } });
  res.json({ wishlist: await wishlistView(req) });
});

router.post(
  '/wishlist/:productId/move-to-cart',
  requireUser,
  validate({ params: z.object({ productId: objectId }), body: z.object({ variantId: objectId, quantity: z.number().int().min(1).max(10).default(1) }) }),
  async (req, res) => {
    const { productId } = req.valid.params;
    await addToCart({ userId: req.user!._id }, new Types.ObjectId(productId), new Types.ObjectId(req.body.variantId), req.body.quantity);
    await Wishlist.updateOne({ user: req.user!._id }, { $pull: { products: new Types.ObjectId(productId) } });
    res.json({ wishlist: await wishlistView(req) });
  },
);

// ── Checkout ───────────────────────────────────────────────────────────────
router.post(
  '/checkout/create-session',
  checkoutLimiter,
  requireUser,
  validate({
    body: z
      .object({
        currency: z.string().length(3).optional(),
        deliveryMethodId: z.string().max(40).optional(),
        couponCode: z.string().trim().max(40).nullable().optional(),
        addressId: objectId.optional(),
        address: addressInput.optional(),
        saveAddress: z.boolean().optional(),
        phone: z.string().trim().max(30).optional(),
        notes: z.string().trim().max(500).optional(),
      })
      .refine((b) => b.addressId || b.address, { message: 'A delivery address is required', path: ['address'] }),
  }),
  async (req, res) => {
    const result = await createCheckout(req.user!, req.body);
    res.status(201).json(result);
  },
);

router.post('/checkout/:orderNumber/cancel', requireUser, validate({ params: z.object({ orderNumber: z.string().regex(/^VEL-[A-Z0-9]{8}$/) }) }), async (req, res) => {
  res.json(await cancelPendingCheckout(req.user!, req.valid.params.orderNumber));
});

// ── Customer orders ────────────────────────────────────────────────────────
function customerOrder(o: IOrder & { _id: unknown }, payment?: { cardBrand?: string; cardLast4?: string; wallet?: string; paymentMethodType?: string } | null) {
  return {
    _id: String(o._id),
    orderNumber: o.orderNumber,
    status: o.status,
    paymentStatus: o.paymentStatus,
    currency: o.currency,
    items: o.items.map((i) => ({
      _id: String(i._id),
      productId: String(i.product),
      name: i.name,
      slug: i.slug,
      image: i.image ? String(i.image) : null,
      size: i.size,
      color: i.color,
      sku: i.sku,
      unitPrice: i.unitPrice,
      quantity: i.quantity,
      lineTotal: i.lineTotal,
    })),
    subtotal: o.subtotal,
    discountTotal: o.discountTotal,
    shippingTotal: o.shippingTotal,
    taxTotal: o.taxTotal,
    taxInclusive: o.taxInclusive,
    total: o.total,
    refundedTotal: o.refundedTotal,
    coupon: o.coupon ? { code: o.coupon.code } : null,
    shippingAddress: o.shippingAddress,
    delivery: o.delivery,
    tracking: o.tracking,
    // Internal notes are never shown to customers.
    history: o.history.filter((h) => h.status !== 'note').map((h) => ({ status: h.status, message: h.message, at: h.at })),
    payment: payment
      ? { method: payment.wallet ?? payment.paymentMethodType ?? null, brand: payment.cardBrand ?? null, last4: payment.cardLast4 ?? null }
      : null,
    createdAt: o.createdAt,
    paidAt: o.paidAt,
    shippedAt: o.shippedAt,
    deliveredAt: o.deliveredAt,
  };
}

router.get('/orders', requireUser, validate({ query: z.object(pagination) }), async (req, res) => {
  const { page, limit } = req.valid.query;
  const filter = { user: req.user!._id, paymentStatus: { $ne: 'pending' as const } };
  const [orders, total] = await Promise.all([
    Order.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
    Order.countDocuments(filter),
  ]);
  res.json({ orders: orders.map((o) => customerOrder(o)), total, page, totalPages: Math.max(1, Math.ceil(total / limit)) });
});

router.get('/orders/by-session/:sessionId', requireUser, validate({ params: z.object({ sessionId: z.string().regex(/^cs_[A-Za-z0-9_]+$/).max(200) }) }), async (req, res) => {
  const order = await reconcileCheckoutSession(req.valid.params.sessionId, req.user!._id);
  const payment = await Payment.findOne({ order: order._id }).lean();
  res.json({ order: customerOrder(order.toObject(), payment) });
});

router.get('/orders/:orderNumber', requireUser, validate({ params: z.object({ orderNumber: z.string().regex(/^VEL-[A-Z0-9]{8}$/) }) }), async (req, res) => {
  const order = await Order.findOne({ orderNumber: req.valid.params.orderNumber, user: req.user!._id }).lean();
  if (!order) throw notFound('Order not found.');
  const payment = await Payment.findOne({ order: order._id }).lean();
  res.json({ order: customerOrder(order, payment) });
});

// ── Notifications ──────────────────────────────────────────────────────────
router.get('/notifications', requireUser, async (req, res) => {
  const items = await Notification.find({ audience: 'user', user: req.user!._id }).sort({ createdAt: -1 }).limit(30).lean();
  const unread = await Notification.countDocuments({ audience: 'user', user: req.user!._id, readAt: null });
  res.json({ notifications: items, unread });
});

router.post('/notifications/read', requireUser, validate({ body: z.object({ ids: z.array(objectId).max(100).optional() }) }), async (req, res) => {
  const filter: Record<string, unknown> = { audience: 'user', user: req.user!._id, readAt: null };
  if (req.body.ids?.length) filter._id = { $in: req.body.ids };
  await Notification.updateMany(filter, { $set: { readAt: new Date() } });
  res.json({ ok: true });
});

// ── Reviews ────────────────────────────────────────────────────────────────
router.post(
  '/products/:id/reviews',
  requireUser,
  publicWriteLimiter,
  validate({
    params: z.object({ id: objectId }),
    body: z.object({ rating: z.number().int().min(1).max(5), title: z.string().trim().min(2).max(120), body: z.string().trim().min(10).max(2000) }),
  }),
  async (req, res) => {
    const productId = new Types.ObjectId(req.valid.params.id);
    if (!(await Product.exists({ _id: productId, status: 'published' }))) throw notFound('Product not found.');
    const purchased = await Order.exists({ user: req.user!._id, 'items.product': productId, paymentStatus: { $in: ['paid', 'partially_refunded'] } });
    if (!purchased) throw badRequest('Reviews are open to customers who have purchased this item.');
    const review = await Review.findOneAndUpdate(
      { product: productId, user: req.user!._id },
      { $set: { ...req.body, authorName: req.user!.name.split(' ')[0], verifiedPurchase: true, status: 'published' } },
      { upsert: true, returnDocument: 'after' },
    );
    const [agg] = await Review.aggregate([
      { $match: { product: productId, status: 'published' } },
      { $group: { _id: null, avg: { $avg: '$rating' }, count: { $sum: 1 } } },
    ]);
    await Product.updateOne({ _id: productId }, { $set: { ratingAvg: Math.round((agg?.avg ?? 0) * 10) / 10, ratingCount: agg?.count ?? 0 } });
    res.status(201).json({ review });
  },
);

export default router;

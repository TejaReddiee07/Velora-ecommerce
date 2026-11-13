import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { startTestApp, stopTestApp, adminAgent, customerAgent, createProduct, sendWebhook, variantLevels, ADDRESS, type TestContext } from './helpers.js';
import { Order } from '../src/models/Order.js';
import { Payment, WebhookEvent } from '../src/models/Payment.js';
import { Product } from '../src/models/Product.js';
import { Cart } from '../src/models/Cart.js';
import { Coupon } from '../src/models/Coupon.js';
import { StockMovement } from '../src/models/Misc.js';
import { expireStaleReservations } from '../src/services/order.service.js';
import { setTransactionsSupported, supportsTransactions } from '../src/db/connection.js';

let ctx: TestContext;
let admin: request.Agent;
beforeAll(async () => {
  ctx = await startTestApp();
  admin = await adminAgent(ctx.app);
  expect(supportsTransactions()).toBe(true);
});
afterAll(async () => stopTestApp(ctx));

async function addAndCheckout(agent: request.Agent, productId: string, variantId: string, quantity = 1, extra: Record<string, unknown> = {}) {
  const add = await agent.post('/api/cart/items').send({ productId, variantId, quantity });
  if (add.status !== 201) return { add, checkout: null as unknown as request.Response };
  const checkout = await agent.post('/api/checkout/create-session').send({ address: ADDRESS, ...extra });
  return { add, checkout };
}

function completedEvent(sessionId: string, ctxStripe: TestContext['stripe']) {
  const s = ctxStripe.markPaid(sessionId);
  return { id: `evt_${sessionId}`, type: 'checkout.session.completed', data: { object: { ...s, params: undefined } } };
}

describe('stock reservation and verified payment', () => {
  it('reserves on checkout, deducts only after a signed webhook (20 → 19)', async () => {
    const p = await createProduct({ stock: [20], price: 15000 });
    const v = String(p.variants[0]._id);
    const { agent } = await customerAgent(ctx.app);
    const { checkout } = await addAndCheckout(agent, String(p._id), v);
    expect(checkout.status).toBe(201);
    expect(checkout.body.url).toMatch(/^https:\/\/checkout\.stripe\.test\//);

    // Reserved, not yet sold.
    expect(await variantLevels(p._id)).toMatchObject({ stock: 20, reserved: 1, available: 19 });
    const order = await Order.findOne({ orderNumber: checkout.body.orderNumber }).lean();
    expect(order!.status).toBe('pending_payment');
    expect(order!.total).toBe(15000); // free delivery over £150, VAT inclusive
    const session = ctx.stripe.sessions.get(order!.stripe.checkoutSessionId!)!;
    expect(session.params.line_items[0].price_data.unit_amount).toBe(15000);
    expect(session.params.metadata.orderId).toBe(String(order!._id));

    // A browser redirect alone never marks the order paid.
    const premature = await agent.get(`/api/orders/${order!.orderNumber}`);
    expect(premature.body.order.paymentStatus).toBe('pending');

    const hook = await sendWebhook(ctx.app, completedEvent(session.id, ctx.stripe));
    expect(hook.status).toBe(200);

    expect(await variantLevels(p._id)).toMatchObject({ stock: 19, reserved: 0, available: 19 });
    const paid = await Order.findById(order!._id).lean();
    expect(paid!.status).toBe('paid');
    expect(paid!.paymentStatus).toBe('paid');
    expect(paid!.reservation.status).toBe('committed');
    const payment = await Payment.findOne({ order: order!._id }).lean();
    expect(payment!.status).toBe('succeeded');
    expect(payment!.paymentIntentId).toBe(`pi_test_${session.id}`);
    expect((await Cart.findOne({ user: order!.user }).lean())!.items).toHaveLength(0);
    expect(await StockMovement.countDocuments({ order: order!._id, type: 'sale' })).toBe(1);

    // Customer sees it in order history.
    const history = await agent.get('/api/orders');
    expect(history.body.orders.map((o: { orderNumber: string }) => o.orderNumber)).toContain(order!.orderNumber);
  });

  it('processes duplicate webhook deliveries exactly once', async () => {
    const p = await createProduct({ stock: [10] });
    const { agent } = await customerAgent(ctx.app);
    const { checkout } = await addAndCheckout(agent, String(p._id), String(p.variants[0]._id), 2);
    const order = await Order.findOne({ orderNumber: checkout.body.orderNumber }).lean();
    const event = completedEvent(order!.stripe.checkoutSessionId!, ctx.stripe);
    const first = await sendWebhook(ctx.app, event);
    const second = await sendWebhook(ctx.app, event);
    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(second.body.duplicate).toBe(true);
    // Same event content with a new id (Stripe retry semantics) is also idempotent at the order level.
    await sendWebhook(ctx.app, { ...event, id: `${event.id}_retry` });
    expect(await variantLevels(p._id)).toMatchObject({ stock: 8, reserved: 0, available: 8 });
    expect(await WebhookEvent.countDocuments({ eventId: event.id })).toBe(1);
  });

  it('rejects webhooks with an invalid signature', async () => {
    const res = await sendWebhook(ctx.app, { id: 'evt_forged', type: 'checkout.session.completed', data: { object: {} } }, 'whsec_wrong_secret');
    expect(res.status).toBe(400);
    const unsigned = await request(ctx.app).post('/api/webhooks/stripe').set('content-type', 'application/json').send('{}');
    expect(unsigned.status).toBe(400);
  });

  it('makes the last unit unavailable, blocks further purchases, and restocking re-enables it', async () => {
    const p = await createProduct({ stock: [1] });
    const v = String(p.variants[0]._id);
    const buyer = await customerAgent(ctx.app);
    const { checkout } = await addAndCheckout(buyer.agent, String(p._id), v);
    const order = await Order.findOne({ orderNumber: checkout.body.orderNumber }).lean();
    await sendWebhook(ctx.app, completedEvent(order!.stripe.checkoutSessionId!, ctx.stripe));
    expect(await variantLevels(p._id)).toMatchObject({ stock: 0, available: 0, total: 0 });

    const page = await request(ctx.app).get(`/api/products/${p.slug}`);
    expect(page.body.product.inStock).toBe(false);
    expect(page.body.product.variants[0].available).toBe(0);

    const late = await customerAgent(ctx.app);
    const add = await late.agent.post('/api/cart/items').send({ productId: String(p._id), variantId: v, quantity: 1 });
    expect(add.status).toBe(409);
    expect(add.body.error.code).toBe('OUT_OF_STOCK');

    const restock = await admin.post('/api/admin/inventory/restock').send({ variantId: v, quantity: 5 });
    expect(restock.status).toBe(200);
    expect(await variantLevels(p._id)).toMatchObject({ stock: 5, available: 5 });
    expect((await late.agent.post('/api/cart/items').send({ productId: String(p._id), variantId: v, quantity: 1 })).status).toBe(201);
  });

  it('never oversells under simultaneous checkouts', async () => {
    const p = await createProduct({ stock: [3] });
    const v = String(p.variants[0]._id);
    const buyers = await Promise.all(Array.from({ length: 6 }, () => customerAgent(ctx.app)));
    for (const b of buyers) expect((await b.agent.post('/api/cart/items').send({ productId: String(p._id), variantId: v, quantity: 1 })).status).toBe(201);
    const results = await Promise.all(buyers.map((b) => b.agent.post('/api/checkout/create-session').send({ address: ADDRESS })));
    const ok = results.filter((r) => r.status === 201);
    const rejected = results.filter((r) => r.status === 409);
    expect(ok).toHaveLength(3);
    expect(rejected).toHaveLength(3);
    expect(await variantLevels(p._id)).toMatchObject({ stock: 3, reserved: 3, available: 0 });
  });

  it('never oversells without transactions either (atomic updates + compensation)', async () => {
    setTransactionsSupported(false);
    try {
      const a = await createProduct({ stock: [5] });
      const b = await createProduct({ stock: [1] });
      const buyers = await Promise.all(Array.from({ length: 3 }, () => customerAgent(ctx.app)));
      for (const buyer of buyers) {
        await buyer.agent.post('/api/cart/items').send({ productId: String(a._id), variantId: String(a.variants[0]._id), quantity: 1 });
        await buyer.agent.post('/api/cart/items').send({ productId: String(b._id), variantId: String(b.variants[0]._id), quantity: 1 });
      }
      const results = await Promise.all(buyers.map((x) => x.agent.post('/api/checkout/create-session').send({ address: ADDRESS })));
      expect(results.filter((r) => r.status === 201)).toHaveLength(1);
      // Losers' holds on product A were rolled back.
      expect(await variantLevels(a._id)).toMatchObject({ stock: 5, reserved: 1, available: 4 });
      expect(await variantLevels(b._id)).toMatchObject({ stock: 1, reserved: 1, available: 0 });
    } finally {
      setTransactionsSupported(true);
    }
  });

  it('refuses a variant that is not available and re-validates stock at checkout', async () => {
    const p = await createProduct({ stock: [2] });
    const v = String(p.variants[0]._id);
    const { agent } = await customerAgent(ctx.app);
    expect((await agent.post('/api/cart/items').send({ productId: String(p._id), variantId: v, quantity: 3 })).status).toBe(409);
    expect((await agent.post('/api/cart/items').send({ productId: String(p._id), variantId: v, quantity: 2 })).status).toBe(201);
    // Stock drops after the item is in the bag.
    await admin.put(`/api/admin/inventory/${v}`).send({ stock: 1 });
    const checkout = await agent.post('/api/checkout/create-session').send({ address: ADDRESS });
    expect(checkout.status).toBe(409);
    expect(checkout.body.error.code).toBe('CART_CHANGED');
    expect(await variantLevels(p._id)).toMatchObject({ stock: 1, reserved: 0, available: 1 });
  });

  it('prices from the database, not the client', async () => {
    const p = await createProduct({ stock: [5], price: 10000 });
    const { agent } = await customerAgent(ctx.app);
    await agent.post('/api/cart/items').send({ productId: String(p._id), variantId: String(p.variants[0]._id), quantity: 1, price: 1 });
    await Product.updateOne({ _id: p._id }, { $set: { price: 11000, effectivePrice: 11000 } });
    const checkout = await agent.post('/api/checkout/create-session').send({ address: ADDRESS, total: 1, price: 1 });
    expect(checkout.status).toBe(201);
    const order = await Order.findOne({ orderNumber: checkout.body.orderNumber }).lean();
    expect(order!.items[0].unitPrice).toBe(11000);
  });
});

describe('releasing reservations', () => {
  it('releases stock when the checkout expires (scheduled job)', async () => {
    const p = await createProduct({ stock: [4] });
    const { agent } = await customerAgent(ctx.app);
    const { checkout } = await addAndCheckout(agent, String(p._id), String(p.variants[0]._id), 2);
    expect(await variantLevels(p._id)).toMatchObject({ reserved: 2, available: 2 });
    await Order.updateOne({ orderNumber: checkout.body.orderNumber }, { $set: { 'reservation.expiresAt': new Date(Date.now() - 1000) } });
    expect(await expireStaleReservations()).toBeGreaterThanOrEqual(1);
    expect(await variantLevels(p._id)).toMatchObject({ stock: 4, reserved: 0, available: 4 });
    const o = await Order.findOne({ orderNumber: checkout.body.orderNumber }).lean();
    expect(o!.paymentStatus).toBe('expired');
    expect(ctx.stripe.sessions.get(o!.stripe.checkoutSessionId!)!.status).toBe('expired');
  });

  it('releases stock on checkout.session.expired and on failed async payment', async () => {
    const p = await createProduct({ stock: [6] });
    const v = String(p.variants[0]._id);
    const a = await customerAgent(ctx.app);
    const { checkout: c1 } = await addAndCheckout(a.agent, String(p._id), v, 1);
    const o1 = await Order.findOne({ orderNumber: c1.body.orderNumber }).lean();
    const s1 = ctx.stripe.sessions.get(o1!.stripe.checkoutSessionId!)!;
    s1.status = 'expired';
    expect((await sendWebhook(ctx.app, { id: 'evt_exp_1', type: 'checkout.session.expired', data: { object: { ...s1, params: undefined } } })).status).toBe(200);

    const b = await customerAgent(ctx.app);
    const { checkout: c2 } = await addAndCheckout(b.agent, String(p._id), v, 1);
    const o2 = await Order.findOne({ orderNumber: c2.body.orderNumber }).lean();
    const s2 = ctx.stripe.sessions.get(o2!.stripe.checkoutSessionId!)!;
    expect((await sendWebhook(ctx.app, { id: 'evt_fail_1', type: 'checkout.session.async_payment_failed', data: { object: { ...s2, params: undefined } } })).status).toBe(200);

    expect(await variantLevels(p._id)).toMatchObject({ stock: 6, reserved: 0, available: 6 });
    expect((await Order.findById(o1!._id).lean())!.paymentStatus).toBe('expired');
    expect((await Order.findById(o2!._id).lean())!.paymentStatus).toBe('failed');
  });

  it('releases stock when the customer cancels on Stripe', async () => {
    const p = await createProduct({ stock: [3] });
    const { agent } = await customerAgent(ctx.app);
    const { checkout } = await addAndCheckout(agent, String(p._id), String(p.variants[0]._id), 1);
    const res = await agent.post(`/api/checkout/${checkout.body.orderNumber}/cancel`);
    expect(res.status).toBe(200);
    expect(res.body.paymentStatus).toBe('cancelled');
    expect(await variantLevels(p._id)).toMatchObject({ stock: 3, reserved: 0, available: 3 });
    // The bag is kept so the customer can try again.
    expect((await agent.get('/api/cart')).body.cart.lines).toHaveLength(1);
  });

  it('records a declined payment attempt without releasing (customer may retry)', async () => {
    const p = await createProduct({ stock: [3] });
    const { agent } = await customerAgent(ctx.app);
    const { checkout } = await addAndCheckout(agent, String(p._id), String(p.variants[0]._id), 1);
    const o = await Order.findOne({ orderNumber: checkout.body.orderNumber }).lean();
    await sendWebhook(ctx.app, { id: 'evt_pi_fail', type: 'payment_intent.payment_failed', data: { object: { id: 'pi_declined', metadata: { orderId: String(o!._id) }, last_payment_error: { message: 'Your card was declined.' } } } });
    expect((await Payment.findOne({ order: o!._id }).lean())!.failureMessage).toBe('Your card was declined.');
    expect(await variantLevels(p._id)).toMatchObject({ reserved: 1 });
  });

  it('releases the reservation if Stripe is unreachable when creating the session', async () => {
    const p = await createProduct({ stock: [2] });
    const { agent } = await customerAgent(ctx.app);
    await agent.post('/api/cart/items').send({ productId: String(p._id), variantId: String(p.variants[0]._id), quantity: 1 });
    ctx.stripe.failCreate = true;
    try {
      const res = await agent.post('/api/checkout/create-session').send({ address: ADDRESS });
      expect(res.status).toBe(503);
    } finally {
      ctx.stripe.failCreate = false;
    }
    expect(await variantLevels(p._id)).toMatchObject({ stock: 2, reserved: 0, available: 2 });
  });
});

describe('discounts, currency and refunds', () => {
  it('applies coupons server-side and passes the discount to Stripe', async () => {
    await Coupon.create({ code: 'TEST20', type: 'percentage', value: 20, minOrderValue: 5000, kind: 'code' });
    const p = await createProduct({ stock: [5], price: 10000 });
    const { agent } = await customerAgent(ctx.app);
    await agent.post('/api/cart/items').send({ productId: String(p._id), variantId: String(p.variants[0]._id), quantity: 1 });
    const bad = await agent.post('/api/cart/coupon').send({ code: 'NOPE' });
    expect(bad.status).toBe(400);
    const good = await agent.post('/api/cart/coupon').send({ code: 'test20' });
    expect(good.body.cart.discount.amount).toBe(2000);
    const checkout = await agent.post('/api/checkout/create-session').send({ address: ADDRESS });
    const order = await Order.findOne({ orderNumber: checkout.body.orderNumber }).lean();
    expect(order!.discountTotal).toBe(2000);
    expect(order!.shippingTotal).toBe(495); // below the £150 free-delivery threshold after discount
    expect(order!.total).toBe(10000 - 2000 + 495);
    expect(ctx.stripe.coupons.at(-1)!.amount_off).toBe(2000);
    await sendWebhook(ctx.app, completedEvent(order!.stripe.checkoutSessionId!, ctx.stripe));
    expect((await Coupon.findOne({ code: 'TEST20' }).lean())!.usageCount).toBe(1);
  });

  it('charges in USD with the exchange rate snapshotted on the order', async () => {
    const p = await createProduct({ stock: [5], price: 10000 });
    const { agent } = await customerAgent(ctx.app);
    await agent.post('/api/cart/items').send({ productId: String(p._id), variantId: String(p.variants[0]._id), quantity: 1 });
    const checkout = await agent.post('/api/checkout/create-session').send({ address: ADDRESS, currency: 'USD' });
    const order = await Order.findOne({ orderNumber: checkout.body.orderNumber }).lean();
    expect(order!.currency).toBe('USD');
    expect(order!.fxRate).toBe(1.27);
    expect(order!.items[0].unitPrice).toBe(12700);
    expect(ctx.stripe.sessions.get(order!.stripe.checkoutSessionId!)!.params.line_items[0].price_data.currency).toBe('usd');
  });

  it('refunds through Stripe, restocks, and keeps order/payment records consistent', async () => {
    const p = await createProduct({ stock: [10], price: 16000 });
    const { agent } = await customerAgent(ctx.app);
    const { checkout } = await addAndCheckout(agent, String(p._id), String(p.variants[0]._id), 2);
    const order = await Order.findOne({ orderNumber: checkout.body.orderNumber }).lean();
    await sendWebhook(ctx.app, completedEvent(order!.stripe.checkoutSessionId!, ctx.stripe));
    expect(await variantLevels(p._id)).toMatchObject({ stock: 8 });

    const partial = await admin.post(`/api/admin/orders/${order!._id}/refund`).send({ amount: 5000, reason: 'Goodwill' });
    expect(partial.status).toBe(200);
    expect(partial.body.order.paymentStatus).toBe('partially_refunded');
    const tooMuch = await admin.post(`/api/admin/orders/${order!._id}/refund`).send({ amount: 999999 });
    expect(tooMuch.status).toBe(400);

    const full = await admin.post(`/api/admin/orders/${order!._id}/refund`).send({ restock: true, reason: 'Returned' });
    expect(full.status).toBe(200);
    expect(full.body.order.status).toBe('refunded');
    expect(full.body.order.refundedTotal).toBe(order!.total);
    expect(await variantLevels(p._id)).toMatchObject({ stock: 10, available: 10 });
    const payment = await Payment.findOne({ order: order!._id }).lean();
    expect(payment!.status).toBe('refunded');
    expect(payment!.amountRefunded).toBe(order!.total);
    expect(payment!.refunds).toHaveLength(2);
    expect(ctx.stripe.refunds.reduce((s, r) => s + r.amount, 0)).toBeGreaterThanOrEqual(order!.total);
  });

  it('advances fulfilment status only along allowed transitions', async () => {
    const p = await createProduct({ stock: [3] });
    const { agent } = await customerAgent(ctx.app);
    const { checkout } = await addAndCheckout(agent, String(p._id), String(p.variants[0]._id), 1);
    const order = await Order.findOne({ orderNumber: checkout.body.orderNumber }).lean();
    expect((await admin.put(`/api/admin/orders/${order!._id}/status`).send({ status: 'shipped' })).status).toBe(409); // still unpaid
    await sendWebhook(ctx.app, completedEvent(order!.stripe.checkoutSessionId!, ctx.stripe));
    for (const s of ['processing', 'packed', 'shipped', 'out_for_delivery', 'delivered']) {
      expect((await admin.put(`/api/admin/orders/${order!._id}/status`).send({ status: s })).status).toBe(200);
    }
    expect((await admin.put(`/api/admin/orders/${order!._id}/status`).send({ status: 'processing' })).status).toBe(409);
    const tracked = await admin.put(`/api/admin/orders/${order!._id}/tracking`).send({ carrier: 'DHL', number: 'JD0001' });
    expect(tracked.status).toBe(200);
    const mine = await agent.get(`/api/orders/${order!.orderNumber}`);
    expect(mine.body.order.status).toBe('delivered');
    expect(mine.body.order.tracking.number).toBe('JD0001');
  });
});

describe('revenue analytics', () => {
  it('counts only verified payments, converts currencies and subtracts refunds', async () => {
    const res = await admin.get('/api/admin/analytics/overview');
    expect(res.status).toBe(200);
    const all = res.body.windows.allTime;
    const paidOrders = await Order.find({ paymentStatus: { $in: ['paid', 'partially_refunded', 'refunded'] } }).lean();
    const expectedCollected = Math.round(paidOrders.reduce((s, o) => s + o.total / o.fxRate, 0));
    const expectedTax = Math.round(paidOrders.reduce((s, o) => s + o.taxTotal / o.fxRate, 0));
    const refunds = await Payment.aggregate([{ $unwind: '$refunds' }, { $group: { _id: null, a: { $sum: { $divide: ['$refunds.amount', '$fxRate'] } } } }]);
    expect(all.orders).toBe(paidOrders.length);
    expect(Math.abs(all.totalCollected - expectedCollected)).toBeLessThanOrEqual(1);
    expect(Math.abs(all.netRevenue - (expectedCollected - expectedTax - Math.round(refunds[0]?.a ?? 0)))).toBeLessThanOrEqual(2);
    // Pending / expired / cancelled checkouts are excluded.
    expect(await Order.countDocuments({ paymentStatus: { $in: ['pending', 'expired', 'cancelled', 'failed'] } })).toBeGreaterThan(0);
    expect(all.grossProfit).not.toBeNull(); // every test product has a cost price

    const series = await admin.get('/api/admin/analytics/revenue?granularity=day');
    expect(series.status).toBe(200);
    expect(series.body.series.length).toBeGreaterThan(20);

    const csv = await admin.get('/api/admin/analytics/export.csv');
    expect(csv.status).toBe(200);
    expect(csv.headers['content-type']).toContain('text/csv');
    expect(csv.text.split('\n')[0]).toContain('order_number');
  });
});

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { io as connect, type Socket } from 'socket.io-client';
import { startTestApp, stopTestApp, adminAgent, customerAgent, createProduct, sendWebhook, ADDRESS, type TestContext } from './helpers.js';
import { env } from '../src/config/env.js';
import { Order } from '../src/models/Order.js';
import { Notification } from '../src/models/Misc.js';

let ctx: TestContext;
let admin: request.Agent;
const sockets: Socket[] = [];

beforeAll(async () => {
  ctx = await startTestApp();
  admin = await adminAgent(ctx.app);
});
afterAll(async () => {
  sockets.forEach((s) => s.close());
  await stopTestApp(ctx);
});

function cookieHeader(agent: request.Agent) {
  const jar = (agent as unknown as { jar: { getCookies: (o: object) => { name: string; value: string }[] } }).jar;
  return jar
    .getCookies({ domain: '127.0.0.1', path: '/', secure: false, script: false })
    .map((c) => `${c.name}=${c.value}`)
    .join('; ');
}

async function socketFor(cookie?: string) {
  const s = connect(ctx.baseUrl, { transports: ['websocket'], extraHeaders: cookie ? { cookie } : undefined, forceNew: true });
  sockets.push(s);
  const session = await new Promise<{ user: boolean; admin: boolean }>((resolve, reject) => {
    s.on('session', resolve);
    s.on('connect_error', reject);
  });
  return { s, session };
}

function next<T = unknown>(s: Socket, event: string, timeout = 5000) {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`timeout waiting for ${event}`)), timeout);
    s.once(event, (p: T) => {
      clearTimeout(t);
      resolve(p);
    });
  });
}

describe('real-time sync (Socket.IO)', () => {
  it('pushes product, price and stock changes to shoppers without refresh', async () => {
    const shopper = await socketFor();
    expect(shopper.session).toEqual({ user: false, admin: false });
    const p = await createProduct({ stock: [7], price: 9000 });
    const detail = (await admin.get(`/api/admin/products/${p._id}`)).body.product;

    const changed = next<{ productId: string; slug: string }>(shopper.s, 'product:changed');
    const body = {
      name: detail.name,
      description: detail.description,
      department: detail.department,
      gender: detail.gender,
      categoryId: detail.category,
      brandId: detail.brand,
      price: 9900,
      status: 'published',
      variants: detail.variants.map((v: { _id: string; sku: string; size: string; color: string; colorHex: string }) => ({ _id: v._id, sku: v.sku, size: v.size, color: v.color, colorHex: v.colorHex })),
    };
    expect((await admin.put(`/api/admin/products/${p._id}`).send(body)).status).toBe(200);
    expect((await changed).slug).toBe(p.slug);
    expect((await request(ctx.app).get(`/api/products/${p.slug}`)).body.product.price).toBe(9900);

    const inventory = next<{ productId: string; variants: { _id: string; available: number }[] }>(shopper.s, 'inventory:changed');
    await admin.put(`/api/admin/inventory/${String(p.variants[0]._id)}`).send({ stock: 25 });
    const inv = await inventory;
    expect(inv.productId).toBe(String(p._id));
    expect(inv.variants[0].available).toBe(25);
    // No private fields are broadcast to the public room.
    expect(JSON.stringify(inv)).not.toMatch(/reserved|costPrice|email/);
  });

  it('isolates customer and admin rooms', async () => {
    const a = await customerAgent(ctx.app);
    const b = await customerAgent(ctx.app);
    const sa = await socketFor(cookieHeader(a.agent));
    const sb = await socketFor(cookieHeader(b.agent));
    const sAdmin = await socketFor(cookieHeader(admin));
    expect(sa.session.user).toBe(true);
    expect(sAdmin.session.admin).toBe(true);

    const leakedToB: unknown[] = [];
    sb.s.on('order:updated', (x) => leakedToB.push(x));
    const shopperAdminEvents: unknown[] = [];
    const anonymous = await socketFor();
    anonymous.s.on('order:created', (x) => shopperAdminEvents.push(x));

    const p = await createProduct({ stock: [5] });
    await a.agent.post('/api/cart/items').send({ productId: String(p._id), variantId: String(p.variants[0]._id), quantity: 1 });
    const checkout = await a.agent.post('/api/checkout/create-session').send({ address: ADDRESS });
    const order = await Order.findOne({ orderNumber: checkout.body.orderNumber }).lean();

    const forA = next(sa.s, 'order:updated');
    const forAdmin = next<{ orderNumber: string }>(sAdmin.s, 'order:created');
    const session = ctx.stripe.markPaid(order!.stripe.checkoutSessionId!);
    await sendWebhook(ctx.app, { id: 'evt_rt_1', type: 'checkout.session.completed', data: { object: { ...session, params: undefined } } });
    await forA;
    expect((await forAdmin).orderNumber).toBe(order!.orderNumber);
    await new Promise((r) => setTimeout(r, 300));
    expect(leakedToB).toHaveLength(0);
    expect(shopperAdminEvents).toHaveLength(0);
    // Notifications are persisted so they survive disconnects.
    expect(await Notification.countDocuments({ audience: 'admin', type: 'order.new' })).toBeGreaterThan(0);
  });
});

describe('rate limiting', () => {
  it('throttles repeated admin sign-in attempts', async () => {
    env.RATE_LIMIT_DISABLED = false;
    try {
      let last = 0;
      for (let i = 0; i < 12; i++) {
        last = (await request(ctx.app).post('/api/admin/auth/login').send({ email: 'nobody@velora.test', password: 'x' })).status;
      }
      expect(last).toBe(429);
    } finally {
      env.RATE_LIMIT_DISABLED = true;
    }
  });
});

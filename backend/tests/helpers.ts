import http from 'node:http';
import type { AddressInfo } from 'node:net';
import mongoose, { Types } from 'mongoose';
import sharp from 'sharp';
import Stripe from 'stripe';
import request from 'supertest';
import { env } from '../src/config/env.js';
import { connectDatabase } from '../src/db/connection.js';
import { syncIndexes } from '../src/db/indexes.js';
import { createApp } from '../src/app.js';
import { initSocket, closeSocket } from '../src/realtime/socket.js';
import { setStripeGateway, type CheckoutSessionLike, type StripeGateway } from '../src/services/stripe.service.js';
import { ensureOwnerAdmin } from '../src/seed/seed.js';
import { Category, Brand } from '../src/models/Catalog.js';
import { Product } from '../src/models/Product.js';
import { Admin } from '../src/models/Admin.js';
import { storeImage } from '../src/services/image.service.js';
import { getSettings } from '../src/services/settings.service.js';
import { hashPassword } from '../src/utils/crypto.js';

export const WEBHOOK_SECRET = env.STRIPE_WEBHOOK_SECRET!;
const stripeLib = new Stripe('sk_test_for_signatures_only');

/** In-memory Stripe stand-in for API calls. Webhook signatures still use Stripe's real verifier. */
export class FakeStripe implements StripeGateway {
  sessions = new Map<string, CheckoutSessionLike & { params: Record<string, any> }>();
  coupons: { id: string; amount_off: number; currency: string }[] = [];
  refunds: { id: string; amount: number; payment_intent: string }[] = [];
  failCreate = false;
  private n = 0;

  async createCheckoutSession(params: Record<string, any>, idempotencyKey: string) {
    if (this.failCreate) throw new Error('Stripe unavailable');
    const existing = [...this.sessions.values()].find((s) => s.params.__key === idempotencyKey);
    if (existing) return existing;
    const id = `cs_test_${++this.n}_${Date.now()}`;
    const lineTotal = (params.line_items as any[]).reduce((s, l) => s + l.price_data.unit_amount * l.quantity, 0);
    const discount = params.discounts ? this.coupons.find((c) => c.id === params.discounts[0].coupon)?.amount_off ?? 0 : 0;
    const shipping = params.shipping_options?.[0]?.shipping_rate_data?.fixed_amount?.amount ?? 0;
    const session = {
      id,
      url: `https://checkout.stripe.test/${id}`,
      status: 'open' as const,
      payment_status: 'unpaid' as const,
      amount_total: lineTotal - discount + shipping,
      currency: params.line_items[0].price_data.currency,
      metadata: params.metadata,
      client_reference_id: params.client_reference_id,
      payment_intent: null,
      params: { ...params, __key: idempotencyKey },
    };
    this.sessions.set(id, session);
    return session;
  }
  async retrieveCheckoutSession(id: string) {
    const s = this.sessions.get(id);
    if (!s) throw Object.assign(new Error('No such session'), { code: 'resource_missing' });
    return s;
  }
  async expireCheckoutSession(id: string) {
    const s = await this.retrieveCheckoutSession(id);
    if (s.status === 'complete') throw new Error('Session already complete');
    s.status = 'expired';
    return s;
  }
  async createCoupon(params: { amount_off: number; currency: string; name: string }) {
    const c = { id: `co_${++this.n}`, amount_off: params.amount_off, currency: params.currency };
    this.coupons.push(c);
    return { id: c.id };
  }
  async createRefund(params: { payment_intent: string; amount: number }) {
    const r = { id: `re_${++this.n}`, amount: params.amount, payment_intent: params.payment_intent };
    this.refunds.push(r);
    return { id: r.id, status: 'succeeded', amount: r.amount, payment_intent: r.payment_intent };
  }
  async paymentDetails() {
    return { chargeId: 'ch_test', paymentMethodType: 'card', cardBrand: 'visa', cardLast4: '4242' };
  }
  constructEvent(rawBody: Buffer, signature: string, secret: string) {
    return stripeLib.webhooks.constructEvent(rawBody, signature, secret) as any;
  }
  /** Simulates the customer paying on Stripe's hosted page. */
  markPaid(id: string) {
    const s = this.sessions.get(id)!;
    s.status = 'complete';
    s.payment_status = 'paid';
    s.payment_intent = `pi_test_${id}`;
    return s;
  }
}

export function signedWebhook(event: { id: string; type: string; data: { object: unknown } }, secret = WEBHOOK_SECRET) {
  const payload = JSON.stringify({ object: 'event', api_version: '2025-01-01', created: Math.floor(Date.now() / 1000), ...event });
  const header = stripeLib.webhooks.generateTestHeaderString({ payload, secret });
  return { payload, header };
}

export async function sendWebhook(app: any, event: { id: string; type: string; data: { object: unknown } }, secret?: string) {
  const { payload, header } = signedWebhook(event, secret);
  return request(app).post('/api/webhooks/stripe').set('stripe-signature', header).set('content-type', 'application/json').send(payload);
}

export async function testImage(width = 900, height = 1100, color = { r: 180, g: 150, b: 110 }) {
  return sharp({ create: { width, height, channels: 3, background: color } })
    .composite([{ input: Buffer.from(`<svg width="${width}" height="${height}"><rect x="100" y="100" width="${width - 200}" height="${height - 200}" fill="#222"/></svg>`), top: 0, left: 0 }])
    .jpeg({ quality: 85 })
    .toBuffer();
}

export interface TestContext {
  app: ReturnType<typeof createApp>;
  stripe: FakeStripe;
  server: http.Server;
  baseUrl: string;
}

export async function startTestApp(): Promise<TestContext> {
  if (mongoose.connection.readyState !== 1) await connectDatabase(env.MONGODB_URI);
  await syncIndexes();
  await getSettings();
  await ensureOwnerAdmin();
  const stripe = new FakeStripe();
  setStripeGateway(stripe);
  const app = createApp();
  const server = http.createServer(app);
  initSocket(server);
  await new Promise<void>((r) => server.listen(0, r));
  const port = (server.address() as AddressInfo).port;
  return { app, stripe, server, baseUrl: `http://127.0.0.1:${port}` };
}

export async function stopTestApp(ctx: TestContext) {
  await closeSocket();
  await new Promise((r) => ctx.server.close(r));
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
}

export async function adminAgent(app: any, email = env.ADMIN_EMAIL!, password = env.ADMIN_PASSWORD!) {
  const agent = request.agent(app);
  const res = await agent.post('/api/admin/auth/login').send({ email, password });
  if (res.status !== 200) throw new Error(`Admin login failed: ${res.status} ${JSON.stringify(res.body)}`);
  return agent;
}

let userCounter = 0;
export async function customerAgent(app: any, name = 'Test Customer') {
  const agent = request.agent(app);
  const email = `customer${++userCounter}_${Date.now()}@example.test`;
  const res = await agent.post('/api/auth/register').send({ name, email, password: 'Password123' });
  if (res.status !== 201) throw new Error(`Register failed: ${res.status} ${JSON.stringify(res.body)}`);
  return { agent, email, user: res.body.user };
}

export async function createStaff(role: 'manager' | 'staff', email: string, password = 'StaffPass123') {
  await Admin.create({ name: `${role} user`, email, passwordHash: await hashPassword(password), role });
  return { email, password };
}

/** Creates a published product with one real GridFS image and the given variant stock. */
export async function createProduct(opts: { name?: string; price?: number; salePrice?: number | null; stock?: number[]; department?: 'clothing' | 'footwear' } = {}) {
  const department = opts.department ?? 'footwear';
  const slug = `${department}-test-${new Types.ObjectId().toHexString().slice(-6)}`;
  const category =
    (await Category.findOne({ slug: `${department}-cat` })) ??
    (await Category.create({ name: department === 'footwear' ? 'Sneakers' : 'T-Shirts', slug: `${department}-cat`, department }));
  const brand = (await Brand.findOne({ slug: 'test-brand' })) ?? (await Brand.create({ name: 'Test Brand', slug: 'test-brand' }));
  const productId = new Types.ObjectId();
  const img = await storeImage(await testImage(), { kind: 'product', productId: String(productId) });
  const stock = opts.stock ?? [20, 5];
  const sizes = department === 'footwear' ? ['UK 8', 'UK 9', 'UK 10', 'UK 11'] : ['S', 'M', 'L', 'XL'];
  const product = await Product.create({
    _id: productId,
    name: opts.name ?? 'Test Sneaker',
    slug,
    description: 'A product used by automated tests.',
    department,
    gender: 'unisex',
    category: category._id,
    categorySlug: category.slug,
    categoryName: category.name,
    brand: brand._id,
    brandName: brand.name,
    styles: ['casual'],
    price: opts.price ?? 10000,
    salePrice: opts.salePrice ?? null,
    costPrice: 4000,
    images: [{ ...img, alt: 'test', color: 'Black', sortOrder: 0 }],
    variants: stock.map((s, i) => ({ sku: `${slug.toUpperCase().slice(-10)}-${i}`, size: sizes[i % sizes.length], color: 'Black', colorHex: '#111111', stock: s, reserved: 0, available: s })),
    status: 'published',
  });
  return product;
}

export async function variantLevels(productId: Types.ObjectId | string, index = 0) {
  const p = await Product.findById(productId).lean();
  const v = p!.variants[index];
  return { stock: v.stock, reserved: v.reserved, available: v.available, total: p!.totalAvailable };
}

export const ADDRESS = { fullName: 'Ada Lovelace', line1: '1 Test Street', city: 'London', postalCode: 'N1 1AA', country: 'GB' };

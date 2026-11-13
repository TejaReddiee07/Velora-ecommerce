import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startTestApp, stopTestApp, customerAgent, createProduct, variantLevels, ADDRESS, type TestContext } from './helpers.js';
import { Address } from '../src/models/Address.js';
import { Order } from '../src/models/Order.js';
import { User } from '../src/models/User.js';
import { normalizeUkPostcode, deliveryProblem } from '../src/utils/address.js';

let ctx: TestContext;
beforeAll(async () => {
  ctx = await startTestApp();
});
afterAll(async () => stopTestApp(ctx));

describe('UK postcode rules', () => {
  it('accepts and normalises real UK postcode formats', () => {
    expect(normalizeUkPostcode('sw1a1aa')).toBe('SW1A 1AA');
    expect(normalizeUkPostcode(' EC1A  1BB ')).toBe('EC1A 1BB');
    for (const pc of ['W1A 0AX', 'M1 1AE', 'B33 8TH', 'CR2 6XH', 'DN55 1PT', 'BT1 1AA', 'EH1 1YZ', 'CF10 1AA', 'GIR 0AA']) {
      expect(normalizeUkPostcode(pc), pc).not.toBeNull();
    }
  });

  it('rejects non-UK postcodes and places outside the UK', () => {
    for (const pc of ['506342', '10001', '75008', 'D02 X285', 'K1A 0B1', '2000', 'SW1A', 'QQ1 1AA', '']) {
      expect(normalizeUkPostcode(pc), pc).toBeNull();
    }
    expect(deliveryProblem({ country: 'IN', postalCode: 'SW1A 1AA' })?.field).toBe('country');
    expect(deliveryProblem({ country: 'GB', postalCode: '506342' })?.field).toBe('postalCode');
    expect(deliveryProblem({ country: 'GB', postalCode: 'JE2 3AB' })?.field).toBe('postalCode');
    expect(deliveryProblem({ country: 'gb', postalCode: 'n11aa' })).toBeNull();
  });
});

describe('checkout only takes orders for UK delivery addresses', () => {
  async function shopper() {
    const p = await createProduct({ stock: [10] });
    const { agent } = await customerAgent(ctx.app);
    expect((await agent.post('/api/cart/items').send({ productId: String(p._id), variantId: String(p.variants[0]._id), quantity: 1 })).status).toBe(201);
    return { agent, product: p };
  }

  it('refuses a non-UK country without creating an order or reserving stock', async () => {
    const { agent, product } = await shopper();
    const res = await agent.post('/api/checkout/create-session').send({ address: { ...ADDRESS, country: 'IN', postalCode: '506342' } });
    expect(res.status).toBe(400);
    expect(res.body.error.fields.map((f: { path: string }) => f.path)).toEqual(expect.arrayContaining(['address.country', 'address.postalCode']));
    expect(await Order.countDocuments({ 'items.product': product._id })).toBe(0);
    expect((await variantLevels(product._id)).reserved).toBe(0);
  });

  it('refuses a GB address whose postcode is not a UK postcode', async () => {
    const { agent } = await shopper();
    const res = await agent.post('/api/checkout/create-session').send({ address: { ...ADDRESS, city: 'Warangal', postalCode: '506342' } });
    expect(res.status).toBe(400);
    expect(res.body.error.fields).toEqual([expect.objectContaining({ path: 'address.postalCode', message: expect.stringMatching(/UK postcode/) })]);
  });

  it('re-checks saved addresses created before the rule (e.g. an Indian PIN saved as GB)', async () => {
    const { agent, product } = await shopper();
    const me = (await agent.get('/api/auth/me')).body.user;
    const old = await Address.collection.insertOne({
      user: (await User.findById(me._id))!._id, fullName: 'Old Address', line1: 'Reddy colony', city: 'Warangal', postalCode: '506342', country: 'GB', isDefault: true, createdAt: new Date(), updatedAt: new Date(),
    });
    const list = (await agent.get('/api/account/addresses')).body.addresses;
    expect(list[0]).toMatchObject({ deliverable: false, deliveryIssue: expect.stringMatching(/UK postcode/) });
    const res = await agent.post('/api/checkout/create-session').send({ addressId: String(old.insertedId) });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('ADDRESS_NOT_DELIVERABLE');
    expect(await Order.countDocuments({ 'items.product': product._id })).toBe(0);
  });

  it('accepts a UK address and stores the postcode in standard form', async () => {
    const { agent } = await shopper();
    const res = await agent.post('/api/checkout/create-session').send({ address: { ...ADDRESS, postalCode: 'sw1a1aa', country: 'gb' }, saveAddress: true });
    expect(res.status).toBe(201);
    const order = await Order.findOne({ orderNumber: res.body.orderNumber }).lean();
    expect(order!.shippingAddress).toMatchObject({ country: 'GB', postalCode: 'SW1A 1AA' });
    const saved = (await agent.get('/api/account/addresses')).body.addresses;
    expect(saved[0]).toMatchObject({ postalCode: 'SW1A 1AA', deliverable: true });
  });

  it('the address book also only saves UK addresses', async () => {
    const { agent } = await customerAgent(ctx.app);
    const bad = await agent.post('/api/account/addresses').send({ ...ADDRESS, country: 'US', postalCode: '10001' });
    expect(bad.status).toBe(400);
    const good = await agent.post('/api/account/addresses').send({ ...ADDRESS, postalCode: 'm11ae' });
    expect(good.status).toBe(201);
    expect(good.body.address.postalCode).toBe('M1 1AE');
  });
});

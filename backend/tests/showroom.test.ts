import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { startTestApp, stopTestApp, adminAgent, createProduct, type TestContext } from './helpers.js';
import { Product } from '../src/models/Product.js';

let ctx: TestContext;
let admin: request.Agent;
beforeAll(async () => {
  ctx = await startTestApp();
  admin = await adminAgent(ctx.app);
});
afterAll(async () => stopTestApp(ctx));

function editBody(p: Record<string, any>, extra: Record<string, unknown> = {}) {
  return {
    name: p.name,
    description: p.description,
    department: p.department,
    gender: p.gender,
    categoryId: p.category,
    brandId: p.brand,
    price: p.price,
    status: p.status,
    variants: p.variants.map((v: Record<string, unknown>) => ({ _id: v._id, sku: v.sku, size: v.size, color: v.color, colorHex: v.colorHex })),
    ...extra,
  };
}

describe('3D showroom flag', () => {
  it('lists only showroom products and exposes the flag on cards', async () => {
    const shirt = await createProduct({ name: 'Showroom Shirt', department: 'clothing' });
    await createProduct({ name: 'Regular Sneaker' });
    await Product.updateOne({ _id: shirt._id }, { $set: { showroom: true } });

    const res = await request(ctx.app).get('/api/products?showroom=true');
    expect(res.status).toBe(200);
    expect(res.body.items.map((p: { name: string }) => p.name)).toEqual(['Showroom Shirt']);
    expect(res.body.items[0].showroom).toBe(true);

    const detail = await request(ctx.app).get(`/api/products/${shirt.slug}`);
    expect(detail.body.product.showroom).toBe(true);
  });

  it('defaults to off and is only changed when the admin sends it', async () => {
    const p = await createProduct({ name: 'Toggle Jacket', department: 'clothing' });
    expect((await Product.findById(p._id).lean())!.showroom).toBe(false);
    const full = (await admin.get(`/api/admin/products/${p._id}`)).body.product;

    const on = await admin.put(`/api/admin/products/${p._id}`).send(editBody(full, { showroom: true }));
    expect(on.status).toBe(200);
    expect((await Product.findById(p._id).lean())!.showroom).toBe(true);

    // A client that doesn't know about the field must not switch it off.
    const untouched = await admin.put(`/api/admin/products/${p._id}`).send(editBody(full, { price: 12345 }));
    expect(untouched.status).toBe(200);
    expect((await Product.findById(p._id).lean())!.showroom).toBe(true);

    const off = await admin.put(`/api/admin/products/${p._id}`).send(editBody(full, { showroom: false }));
    expect(off.status).toBe(200);
    expect((await Product.findById(p._id).lean())!.showroom).toBe(false);
  });
});

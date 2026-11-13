import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import mongoose from 'mongoose';
import { startTestApp, stopTestApp, adminAgent, createProduct, testImage, type TestContext } from './helpers.js';
import { Category, Brand } from '../src/models/Catalog.js';
import { Product } from '../src/models/Product.js';
import { connectDatabase } from '../src/db/connection.js';
import { env } from '../src/config/env.js';

let ctx: TestContext;
let admin: request.Agent;
beforeAll(async () => {
  ctx = await startTestApp();
  admin = await adminAgent(ctx.app);
});
afterAll(async () => stopTestApp(ctx));

const gridfsCount = () => mongoose.connection.db!.collection('fs.files').countDocuments();
const fileExists = async (id: string) => Boolean(await mongoose.connection.db!.collection('fs.files').findOne({ _id: new mongoose.Types.ObjectId(id) }));

describe('catalogue API', () => {
  it('lists, filters, sorts, searches and suggests', async () => {
    await createProduct({ name: 'Alpha Runner', price: 9000, department: 'footwear' });
    await createProduct({ name: 'Bravo Tee', price: 3000, department: 'clothing' });
    await createProduct({ name: 'Charlie Boot', price: 20000, salePrice: 15000, department: 'footwear', stock: [0, 0] });

    const all = await request(ctx.app).get('/api/products?facets=true');
    expect(all.status).toBe(200);
    expect(all.body.total).toBe(3);
    expect(all.body.facets.sizes.length).toBeGreaterThan(0);

    const footwear = await request(ctx.app).get('/api/products?department=footwear&sort=price_asc');
    expect(footwear.body.items.map((p: { name: string }) => p.name)).toEqual(['Alpha Runner', 'Charlie Boot']);

    const inStock = await request(ctx.app).get('/api/products?department=footwear&inStock=true');
    expect(inStock.body.items.map((p: { name: string }) => p.name)).toEqual(['Alpha Runner']);

    const priced = await request(ctx.app).get('/api/products?minPrice=10000&maxPrice=16000');
    expect(priced.body.items.map((p: { name: string }) => p.name)).toEqual(['Charlie Boot']); // sale price 150.00

    const usd = await request(ctx.app).get('/api/products?department=clothing&currency=USD');
    expect(usd.body.currency).toBe('USD');
    expect(usd.body.items[0].price).toBe(Math.round(3000 * 1.27));

    const search = await request(ctx.app).get('/api/products?q=runn');
    expect(search.body.items.map((p: { name: string }) => p.name)).toEqual(['Alpha Runner']);

    const suggest = await request(ctx.app).get('/api/products/suggest?q=char');
    expect(suggest.body.products[0].name).toBe('Charlie Boot');
  });

  it('hides unpublished products and never exposes cost or reserved counts', async () => {
    const p = await createProduct({ name: 'Hidden Draft' });
    await Product.updateOne({ _id: p._id }, { status: 'draft' });
    expect((await request(ctx.app).get(`/api/products/${p.slug}`)).status).toBe(404);
    await Product.updateOne({ _id: p._id }, { status: 'published' });
    const res = await request(ctx.app).get(`/api/products/${p.slug}`);
    expect(res.status).toBe(200);
    expect(res.body.product).not.toHaveProperty('costPrice');
    expect(res.body.product.variants[0]).not.toHaveProperty('reserved');
    expect(res.body.product.variants[0]).not.toHaveProperty('stock');
  });

  it('rejects invalid query input', async () => {
    expect((await request(ctx.app).get('/api/products?sort=evil')).status).toBe(400);
    expect((await request(ctx.app).get('/api/products?limit=100000')).status).toBe(400);
  });
});

describe('GridFS image storage', () => {
  it('serves stored image bytes with immutable caching', async () => {
    const p = await createProduct();
    const id = String(p.images[0].files.md);
    const res = await request(ctx.app).get(`/api/images/${id}`).buffer(true).parse((r, cb) => {
      const chunks: Buffer[] = [];
      r.on('data', (c: Buffer) => chunks.push(c));
      r.on('end', () => cb(null, Buffer.concat(chunks)));
    });
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toBe('image/webp');
    expect(res.headers['cache-control']).toContain('immutable');
    expect((res.body as Buffer).subarray(8, 12).toString()).toBe('WEBP');
    const etag = res.headers.etag;
    expect((await request(ctx.app).get(`/api/images/${id}`).set('If-None-Match', etag)).status).toBe(304);
    expect((await request(ctx.app).get('/api/images/not-an-id')).status).toBe(404);
  });

  it('admin creates a product, uploads, replaces, reorders and deletes images in GridFS', async () => {
    const category = await Category.create({ name: 'Boots', slug: 'boots-test', department: 'footwear' });
    const brand = await Brand.findOne() ?? (await Brand.create({ name: 'B', slug: 'b' }));
    const create = await admin.post('/api/admin/products').send({
      name: 'Admin Sneaker',
      description: 'Created through the admin API in a test.',
      department: 'footwear',
      gender: 'unisex',
      categoryId: String(category._id),
      brandId: String(brand._id),
      price: 12000,
      variants: [{ sku: 'ADM-SNK-8', size: 'UK 8', color: 'White', colorHex: '#FFFFFF', stock: 25 }],
    });
    expect(create.status).toBe(201);
    const id = create.body.product._id;

    // Publishing without an image is refused.
    expect((await admin.patch(`/api/admin/products/${id}/status`).send({ status: 'published' })).status).toBe(400);

    const before = await gridfsCount();
    const upload = await admin.post(`/api/admin/products/${id}/images`).attach('images', await testImage(), { filename: 'a.jpg', contentType: 'image/jpeg' }).attach('images', await testImage(1000, 1000, { r: 20, g: 20, b: 20 }), { filename: 'b.jpg', contentType: 'image/jpeg' });
    expect(upload.status).toBe(201);
    expect(upload.body.product.images).toHaveLength(2);
    expect(await gridfsCount()).toBe(before + 6); // 2 images × 3 renditions

    const first = upload.body.product.images[0];
    const replace = await admin.put(`/api/admin/products/${id}/images/${first.id}`).attach('image', await testImage(1200, 1500, { r: 200, g: 30, b: 30 }), { filename: 'c.jpg', contentType: 'image/jpeg' });
    expect(replace.status).toBe(200);
    const replaced = replace.body.product.images.find((i: { id: string }) => i.id === first.id);
    expect(replaced.lg).not.toBe(first.lg);
    expect(await fileExists(first.lg)).toBe(false); // old files removed — no orphans
    expect(await fileExists(replaced.lg)).toBe(true);

    const order = upload.body.product.images.map((i: { id: string }) => i.id).reverse();
    const reorder = await admin.patch(`/api/admin/products/${id}/images-order`).send({ order });
    expect(reorder.body.product.images.map((i: { id: string }) => i.id)).toEqual(order);

    expect((await admin.patch(`/api/admin/products/${id}/status`).send({ status: 'published' })).status).toBe(200);
    const storefront = await request(ctx.app).get(`/api/products/${create.body.product.slug}`);
    expect(storefront.status).toBe(200);
    expect(storefront.body.product.totalAvailable).toBe(25);

    const del = await admin.delete(`/api/admin/products/${id}/images/${order[0]}`);
    expect(del.status).toBe(200);
    expect(del.body.product.images).toHaveLength(1);
    // The last image of a published product cannot be removed.
    expect((await admin.delete(`/api/admin/products/${id}/images/${del.body.product.images[0].id}`)).status).toBe(409);

    const countBeforeDelete = await gridfsCount();
    expect((await admin.delete(`/api/admin/products/${id}`)).status).toBe(200);
    expect(await gridfsCount()).toBe(countBeforeDelete - 3);
    expect((await request(ctx.app).get(`/api/products/${create.body.product.slug}`)).status).toBe(404);
  });

  it('validates uploads by content, type and size', async () => {
    const p = await createProduct();
    const fake = await admin.post(`/api/admin/products/${p._id}/images`).attach('images', Buffer.from('<?php echo 1; ?>'), { filename: 'evil.jpg', contentType: 'image/jpeg' });
    expect(fake.status).toBe(400);
    const pdf = await admin.post(`/api/admin/products/${p._id}/images`).attach('images', Buffer.from('%PDF-1.4'), { filename: 'doc.pdf', contentType: 'application/pdf' });
    expect(pdf.status).toBe(400);
    const tiny = await admin.post(`/api/admin/products/${p._id}/images`).attach('images', await testImage(50, 50), { filename: 'tiny.jpg', contentType: 'image/jpeg' });
    expect(tiny.status).toBe(400);
    const huge = Buffer.alloc(env.maxUploadBytes + 10, 1);
    const big = await admin.post(`/api/admin/products/${p._id}/images`).attach('images', huge, { filename: 'big.jpg', contentType: 'image/jpeg' });
    expect(big.status).toBe(400);
  });

  it('keeps images available after a database reconnect (server restart)', async () => {
    const p = await createProduct();
    const id = String(p.images[0].files.lg);
    const before = await request(ctx.app).get(`/api/images/${id}`);
    await mongoose.disconnect();
    await connectDatabase(env.MONGODB_URI);
    const after = await request(ctx.app).get(`/api/images/${id}`);
    expect(after.status).toBe(200);
    expect(after.headers['content-length']).toBe(before.headers['content-length']);
  });
});

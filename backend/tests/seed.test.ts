import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import mongoose from 'mongoose';
import { startTestApp, stopTestApp, type TestContext } from './helpers.js';
import { seedIfEmpty } from '../src/seed/seed.js';
import { Product } from '../src/models/Product.js';
import { SEED_PRODUCTS } from '../src/seed/catalog.js';
import { getSettings } from '../src/services/settings.service.js';

let ctx: TestContext;
beforeAll(async () => {
  ctx = await startTestApp();
});
afterAll(async () => stopTestApp(ctx));

describe('first-start seeding', () => {
  it('seeds the catalogue with real image files stored in GridFS', { timeout: 600_000 }, async () => {
    const result = await seedIfEmpty();
    expect(result.seeded).toBe(true);
    const products = await Product.find().lean();
    expect(products.length).toBe(SEED_PRODUCTS.length);

    const files = mongoose.connection.db!.collection('fs.files');
    for (const p of products) {
      expect(p.images.length, `${p.slug} has images`).toBeGreaterThan(0);
      // Every variant colour is backed by a photo of that colour.
      for (const c of p.colors) expect(p.images.some((i) => i.color === c.name), `${p.slug} ${c.name}`).toBe(true);
      for (const img of p.images) {
        for (const id of [img.files.sm, img.files.md, img.files.lg]) {
          const f = await files.findOne({ _id: id });
          expect(f, `${p.slug} file ${id}`).toBeTruthy();
          expect(f!.length).toBeGreaterThan(1000);
          expect(f!.metadata.productId).toBe(String(p._id));
        }
      }
      expect(p.images.every((i) => typeof i.files === 'object')).toBe(true);
    }
    // Product documents hold GridFS references, not image data.
    const raw = await mongoose.connection.db!.collection('products').findOne();
    expect(JSON.stringify(raw).length).toBeLessThan(20_000);

    const settings = await getSettings();
    expect(settings.banners.length).toBeGreaterThanOrEqual(8);

    // Served through the API.
    const any = products[0].images[0].files.md;
    const res = await request(ctx.app).get(`/api/images/${any}`);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toBe('image/webp');

    // Idempotent: a second boot does not seed again.
    expect((await seedIfEmpty()).seeded).toBe(false);
  });
});

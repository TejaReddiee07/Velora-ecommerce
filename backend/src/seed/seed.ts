import path from 'node:path';
import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import mongoose, { Types } from 'mongoose';
import { env } from '../config/env.js';
import { Admin } from '../models/Admin.js';
import { Product } from '../models/Product.js';
import { Category, Brand } from '../models/Catalog.js';
import { Coupon } from '../models/Coupon.js';
import { StoreSettings } from '../models/StoreSettings.js';
import { StockMovement } from '../models/Misc.js';
import { getSettings, invalidateSettingsCache } from '../services/settings.service.js';
import { storeImage } from '../services/image.service.js';
import { hashPassword } from '../utils/crypto.js';
import { logger } from '../utils/logger.js';
import { SEED_BRANDS, SEED_CATEGORIES, SEED_PRODUCTS, SHOWROOM_SLUGS } from './catalog.js';

const here = path.dirname(fileURLToPath(import.meta.url));
// Works from src/seed (tsx) and dist/seed (compiled) — assets live in src.
const ASSET_DIRS = [path.join(here, 'assets'), path.join(here, '..', '..', 'src', 'seed', 'assets')];

interface ManifestImage {
  file: string;
  color: string;
  colorHex: string;
  description: string;
}
interface Manifest {
  products: Record<string, ManifestImage[]>;
  editorial: Record<string, { file: string; description: string }>;
}

async function assetDir() {
  for (const dir of ASSET_DIRS) {
    try {
      await fs.access(path.join(dir, 'manifest.json'));
      return dir;
    } catch {
      /* try next */
    }
  }
  throw new Error('Seed assets not found (expected src/seed/assets/manifest.json)');
}

function stockFor(sku: string) {
  // Deterministic, varied demo stock: a few sold-out and low-stock variants.
  const n = crypto.createHash('sha1').update(sku).digest()[0];
  if (n % 13 === 0) return 0;
  if (n % 7 === 0) return 1 + (n % 3);
  return 6 + (n % 20);
}

const code = (s: string) =>
  s
    .toUpperCase()
    .replace(/^UK /, '')
    .replace(/[^A-Z0-9]+/g, '')
    .slice(0, 4) || 'X';

export async function ensureOwnerAdmin() {
  if (!env.ADMIN_EMAIL || !env.ADMIN_PASSWORD) return;
  const existing = await Admin.findOne({ email: env.ADMIN_EMAIL.toLowerCase() });
  if (existing) return;
  await Admin.create({
    name: env.ADMIN_NAME,
    email: env.ADMIN_EMAIL.toLowerCase(),
    passwordHash: await hashPassword(env.ADMIN_PASSWORD),
    role: 'owner',
  });
  logger.info(`Owner admin created: ${env.ADMIN_EMAIL}`);
}

async function seedBanners(dir: string, manifest: Manifest) {
  const settings = await StoreSettings.findOne({ key: 'store' });
  if (!settings || settings.banners.length) return;
  const upload = async (slot: string) => {
    const entry = manifest.editorial[slot];
    if (!entry) return null;
    const buf = await fs.readFile(path.join(dir, entry.file));
    const img = await storeImage(buf, { kind: 'banner', originalName: entry.file });
    return img.files;
  };
  const banners = [
    { placement: 'hero', eyebrow: 'Autumn / Winter Collection', title: 'Quiet luxury, in motion', subtitle: 'Considered tailoring, supple leathers and knitwear made to last.', ctaLabel: 'Shop the collection', ctaHref: '/clothing', slot: 'hero-1' },
    { placement: 'hero', eyebrow: 'The Tailoring Edit', title: 'Sharp lines. Soft power.', subtitle: 'Blazers, suits and trousers cut in our London atelier.', ctaLabel: 'Discover tailoring', ctaHref: '/clothing?style=formal', slot: 'hero-2' },
    { placement: 'promo', eyebrow: 'Members get more', title: '10% off your first order', subtitle: 'Use code WELCOME10 at checkout on orders over £50.', ctaLabel: 'Start shopping', ctaHref: '/new-arrivals', slot: 'campaign' },
    { placement: 'collection', title: 'Menswear', subtitle: 'Tailoring to streetwear', ctaLabel: 'Shop men', ctaHref: '/clothing?gender=men', slot: 'category-men' },
    { placement: 'collection', title: 'Womenswear', subtitle: 'Dresses, coats and knits', ctaLabel: 'Shop women', ctaHref: '/clothing?gender=women', slot: 'category-women' },
    { placement: 'collection', title: 'Footwear', subtitle: 'Sneakers, boots and formal', ctaLabel: 'Shop footwear', ctaHref: '/footwear', slot: 'category-footwear' },
    { placement: 'collection', title: 'Accessories', subtitle: 'Leather goods and finishing touches', ctaLabel: 'Shop accessories', ctaHref: '/accessories', slot: 'category-accessories' },
    { placement: 'collection', title: 'The Boutique', subtitle: 'Visit our London flagship', ctaLabel: 'Our story', ctaHref: '/about', slot: 'boutique' },
  ] as const;
  let order = 0;
  for (const b of banners) {
    const image = await upload(b.slot);
    settings.banners.push({
      placement: b.placement,
      eyebrow: 'eyebrow' in b ? b.eyebrow : undefined,
      title: b.title,
      subtitle: b.subtitle,
      ctaLabel: b.ctaLabel,
      ctaHref: b.ctaHref,
      image,
      isActive: true,
      sortOrder: order++,
    } as never);
  }
  await settings.save();
  invalidateSettingsCache();
  logger.info(`Seeded ${banners.length} banners (images in GridFS)`);
}

/** Seeds the catalogue once. Safe to call on every boot. */
export async function seedIfEmpty() {
  await getSettings(); // creates default settings
  await ensureOwnerAdmin();

  const db = mongoose.connection.db!;
  const meta = db.collection<{ _id: string; status: string; at: Date }>('meta');
  const productCount = await Product.estimatedDocumentCount();
  if (productCount > 0) return { seeded: false };

  // Single-flight lock so parallel instances don't double-seed.
  try {
    await meta.insertOne({ _id: 'seed', status: 'running', at: new Date() });
  } catch {
    const lock = await meta.findOne({ _id: 'seed' });
    if (lock && lock.status === 'running' && Date.now() - lock.at.getTime() < 10 * 60_000) return { seeded: false };
    await meta.updateOne({ _id: 'seed' }, { $set: { status: 'running', at: new Date() } });
  }

  try {
    const dir = await assetDir();
    const manifest = JSON.parse(await fs.readFile(path.join(dir, 'manifest.json'), 'utf8')) as Manifest;
    logger.info('Seeding demo catalogue — storing product images in GridFS…');

    await seedBanners(dir, manifest);

    const brands = new Map<string, { _id: Types.ObjectId; name: string }>();
    for (const b of SEED_BRANDS) {
      const doc = await Brand.findOneAndUpdate({ slug: b.slug }, { $setOnInsert: b }, { upsert: true, returnDocument: 'after' });
      brands.set(b.name, { _id: doc!._id, name: doc!.name });
    }
    const categories = new Map<string, { _id: Types.ObjectId; name: string; slug: string }>();
    let sort = 0;
    for (const c of SEED_CATEGORIES) {
      const doc = await Category.findOneAndUpdate({ slug: c.slug }, { $setOnInsert: { ...c, sortOrder: sort++ } }, { upsert: true, returnDocument: 'after' });
      categories.set(c.slug, { _id: doc!._id, name: doc!.name, slug: doc!.slug });
    }

    let imageCount = 0;
    let index = 0;
    for (const p of SEED_PRODUCTS) {
      index += 1;
      const imgs = manifest.products[p.key];
      if (!imgs?.length) {
        logger.warn(`Skipping ${p.slug}: no verified image`);
        continue;
      }
      const productId = new Types.ObjectId();
      const images = [];
      let order = 0;
      for (const img of imgs) {
        const buf = await fs.readFile(path.join(dir, img.file));
        const stored = await storeImage(buf, { kind: 'product', productId: String(productId), originalName: path.basename(img.file) });
        images.push({ ...stored, alt: `${p.name} — ${img.color}`, color: img.color, sortOrder: order++ });
        imageCount += 1;
      }
      const colors: { name: string; hex: string }[] = [];
      for (const img of imgs) if (!colors.some((c) => c.name === img.color)) colors.push({ name: img.color, hex: img.colorHex });

      const prefix = `VL${String(index).padStart(3, '0')}`;
      const variants = [];
      for (const c of colors) {
        for (const size of p.sizes) {
          const sku = `${prefix}-${code(c.name)}-${code(size)}`;
          const stock = stockFor(sku);
          variants.push({ sku, size, color: c.name, colorHex: c.hex, stock, reserved: 0, available: stock, isActive: true });
        }
      }
      const cat = categories.get(p.category)!;
      const brand = brands.get(p.brand)!;
      const created = await Product.create({
        _id: productId,
        name: p.name,
        slug: p.slug,
        description: p.description,
        shortDescription: p.short,
        department: p.department,
        gender: p.gender,
        category: cat._id,
        categorySlug: cat.slug,
        categoryName: cat.name,
        brand: brand._id,
        brandName: brand.name,
        styles: p.styles,
        tags: p.tags,
        price: p.price,
        salePrice: p.sale ?? null,
        costPrice: p.cost,
        images,
        variants,
        specifications: p.specs.map(([label, value]) => ({ label, value })),
        sizeGuide: p.sizeGuide,
        status: 'published',
        isFeatured: Boolean(p.featured),
        isNewArrival: Boolean(p.newArrival),
        isBestSeller: Boolean(p.bestSeller),
        showroom: SHOWROOM_SLUGS.includes(p.slug),
        lowStockThreshold: 3,
        publishedAt: new Date(Date.now() - (SEED_PRODUCTS.length - index) * 3_600_000),
      });
      await StockMovement.insertMany(
        created.variants.map((v) => ({
          product: created._id,
          variant: v._id,
          sku: v.sku,
          type: 'initial',
          stockDelta: v.stock,
          reservedDelta: 0,
          stockAfter: v.stock,
          availableAfter: v.available,
          actor: { type: 'system', name: 'Seed' },
          note: 'Initial demo stock',
        })),
      );
    }

    await Coupon.updateOne(
      { code: 'WELCOME10' },
      { $setOnInsert: { code: 'WELCOME10', description: '10% off your first order over £50', kind: 'code', type: 'percentage', value: 10, minOrderValue: 5000, perUserLimit: 1, isActive: true } },
      { upsert: true },
    );
    await Coupon.updateOne(
      { code: 'VELORA15' },
      { $setOnInsert: { code: 'VELORA15', description: '15% off orders over £150', kind: 'code', type: 'percentage', value: 15, minOrderValue: 15000, isActive: true } },
      { upsert: true },
    );

    await meta.updateOne({ _id: 'seed' }, { $set: { status: 'done', at: new Date() } });
    const total = await Product.countDocuments();
    logger.info(`Seed complete: ${total} products, ${imageCount} product images (×3 renditions) stored in GridFS`);
    return { seeded: true, products: total, images: imageCount };
  } catch (err) {
    await meta.updateOne({ _id: 'seed' }, { $set: { status: 'failed', at: new Date() } });
    throw err;
  }
}

/** Danger: wipes every collection in the configured database. */
export async function resetDatabase() {
  const db = mongoose.connection.db!;
  const collections = await db.listCollections().toArray();
  for (const c of collections) {
    if (c.name.startsWith('system.')) continue;
    await db.collection(c.name).drop().catch(() => undefined);
  }
  invalidateSettingsCache();
  logger.warn(`Database ${db.databaseName} reset`);
}

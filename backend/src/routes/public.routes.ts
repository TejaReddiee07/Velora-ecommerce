import { Router, type Request } from 'express';
import { z } from 'zod';
import { Types } from 'mongoose';
import { Product, type IProduct } from '../models/Product.js';
import { Category, Brand } from '../models/Catalog.js';
import { Review, NewsletterSubscriber } from '../models/Misc.js';
import { DEPARTMENTS, GENDERS, STYLES } from '../models/common.js';
import { validate } from '../middleware/validate.js';
import { publicWriteLimiter } from '../middleware/security.js';
import { getSettings, resolveCurrency, toBase } from '../services/settings.service.js';
import { productCard, productDetail } from '../services/serializers.js';
import { findFile, openDownloadStream, toObjectId } from '../db/gridfs.js';
import { boolish, csv, email, objectId, pagination } from '../utils/schemas.js';
import { notFound } from '../utils/errors.js';
import { escapeRegex } from '../utils/money.js';
import { env } from '../config/env.js';

const router = Router();
type ProductLean = IProduct & { _id: Types.ObjectId };

// ── Store settings (public subset) ─────────────────────────────────────────
router.get('/settings/public', async (_req, res) => {
  const s = await getSettings();
  res.set('Cache-Control', 'public, max-age=30');
  res.json({
    storeName: s.storeName,
    tagline: s.tagline,
    logo: s.logo ? { sm: String(s.logo.sm), md: String(s.logo.md), lg: String(s.logo.lg) } : null,
    contact: s.contact,
    currency: { base: s.currency.base, enabled: s.currency.enabled },
    tax: { enabled: s.tax.enabled, inclusive: s.tax.inclusive, rate: s.tax.rate, label: s.tax.label },
    delivery: s.delivery.filter((d) => d.isActive).map((d) => ({ id: d.id, name: d.name, description: d.description, etaDays: d.etaDays, price: d.price, freeOver: d.freeOver })),
    returnPolicy: s.returnPolicy,
    announcement: s.announcement,
    banners: [...s.banners]
      .filter((b) => b.isActive)
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((b) => ({
        _id: String(b._id),
        placement: b.placement,
        eyebrow: b.eyebrow,
        title: b.title,
        subtitle: b.subtitle,
        ctaLabel: b.ctaLabel,
        ctaHref: b.ctaHref,
        image: b.image ? { sm: String(b.image.sm), md: String(b.image.md), lg: String(b.image.lg) } : null,
      })),
    social: s.social,
    stripeEnabled: env.stripeEnabled,
  });
});

// ── Catalogue taxonomy ─────────────────────────────────────────────────────
router.get('/catalog/categories', async (_req, res) => {
  const [categories, counts] = await Promise.all([
    Category.find({ isActive: true }).sort({ department: 1, sortOrder: 1, name: 1 }).lean(),
    Product.aggregate<{ _id: string; count: number }>([
      { $match: { status: 'published' } },
      { $group: { _id: '$categorySlug', count: { $sum: 1 } } },
    ]),
  ]);
  const byslug = new Map(counts.map((c) => [c._id, c.count]));
  res.json({
    categories: categories.map((c) => ({
      _id: String(c._id),
      name: c.name,
      slug: c.slug,
      department: c.department,
      description: c.description,
      productCount: byslug.get(c.slug) ?? 0,
    })),
  });
});

router.get('/catalog/brands', async (_req, res) => {
  const brands = await Brand.find({ isActive: true }).sort({ name: 1 }).lean();
  res.json({ brands: brands.map((b) => ({ _id: String(b._id), name: b.name, slug: b.slug })) });
});

// ── Product listing ────────────────────────────────────────────────────────
const SORTS = ['featured', 'newest', 'price_asc', 'price_desc', 'best_selling', 'popular', 'rating', 'relevance'] as const;

const listQuery = z.object({
  department: z.enum(DEPARTMENTS).optional(),
  gender: csv(3),
  category: csv(),
  style: csv(),
  size: csv(),
  color: csv(),
  brand: csv(),
  minPrice: z.coerce.number().int().min(0).optional(),
  maxPrice: z.coerce.number().int().min(0).optional(),
  rating: z.coerce.number().min(0).max(5).optional(),
  inStock: boolish,
  onSale: boolish,
  featured: boolish,
  newArrival: boolish,
  bestSeller: boolish,
  showroom: boolish,
  ids: csv(50),
  q: z.string().trim().max(80).optional(),
  sort: z.enum(SORTS).default('featured'),
  currency: z.string().max(3).optional(),
  facets: boolish,
  ...pagination,
});

const sortSpec: Record<(typeof SORTS)[number], Record<string, 1 | -1>> = {
  featured: { isFeatured: -1, publishedAt: -1, _id: -1 },
  newest: { publishedAt: -1, createdAt: -1, _id: -1 },
  price_asc: { effectivePrice: 1, _id: 1 },
  price_desc: { effectivePrice: -1, _id: -1 },
  best_selling: { soldCount: -1, isBestSeller: -1, _id: -1 },
  popular: { ratingCount: -1, soldCount: -1, ratingAvg: -1, _id: -1 },
  rating: { ratingAvg: -1, ratingCount: -1, _id: -1 },
  relevance: { isFeatured: -1, _id: -1 },
};

function baseFilter(q: z.infer<typeof listQuery>) {
  const f: Record<string, unknown> = { status: 'published' };
  if (q.department) f.department = q.department;
  if (q.gender?.length) f.gender = { $in: q.gender.filter((g) => (GENDERS as readonly string[]).includes(g)) };
  return f;
}

router.get('/products', validate({ query: listQuery }), async (req, res) => {
  const q = req.valid.query as z.infer<typeof listQuery>;
  const settings = await getSettings();
  const currency = resolveCurrency(settings, q.currency);
  const filter: Record<string, unknown> = baseFilter(q);
  if (q.category?.length) filter.categorySlug = { $in: q.category };
  if (q.style?.length) filter.styles = { $in: q.style.filter((s) => (STYLES as readonly string[]).includes(s)) };
  if (q.size?.length) filter.sizes = { $in: q.size };
  if (q.color?.length) filter['colors.name'] = { $in: q.color };
  if (q.brand?.length) filter.brandName = { $in: q.brand };
  if (q.minPrice != null || q.maxPrice != null) {
    const range: Record<string, number> = {};
    if (q.minPrice != null) range.$gte = toBase(settings, q.minPrice, currency);
    if (q.maxPrice != null) range.$lte = toBase(settings, q.maxPrice, currency);
    filter.effectivePrice = range;
  }
  if (q.rating) filter.ratingAvg = { $gte: q.rating };
  if (q.inStock) filter.totalAvailable = { $gt: 0 };
  if (q.onSale) filter.salePrice = { $ne: null };
  if (q.featured) filter.isFeatured = true;
  if (q.newArrival) filter.isNewArrival = true;
  if (q.bestSeller) filter.isBestSeller = true;
  if (q.showroom) filter.showroom = true;
  if (q.ids?.length) filter._id = { $in: q.ids.filter((id) => /^[a-f0-9]{24}$/i.test(id)) };

  let sort = sortSpec[q.sort];
  let projection: Record<string, unknown> | undefined;
  if (q.q && q.q.length >= 2) {
    // Full-text search first; partial-word fallback keeps "snea" → sneakers working.
    const textCount = await Product.countDocuments({ ...filter, $text: { $search: q.q } });
    if (textCount > 0) {
      filter.$text = { $search: q.q };
      if (q.sort === 'relevance' || q.sort === 'featured') {
        projection = { score: { $meta: 'textScore' } };
        sort = { score: { $meta: 'textScore' } } as never;
      }
    } else {
      const rx = new RegExp(escapeRegex(q.q), 'i');
      filter.$or = [{ name: rx }, { brandName: rx }, { categoryName: rx }, { tags: rx }];
    }
  }

  const skip = (q.page - 1) * q.limit;
  const [items, total] = await Promise.all([
    Product.find(filter, projection).sort(sort).skip(skip).limit(q.limit).lean<ProductLean[]>(),
    Product.countDocuments(filter),
  ]);

  let facets: unknown = undefined;
  if (q.facets) {
    const [agg] = await Product.aggregate([
      { $match: baseFilter(q) },
      {
        $facet: {
          categories: [{ $group: { _id: { slug: '$categorySlug', name: '$categoryName' }, count: { $sum: 1 } } }, { $sort: { '_id.name': 1 } }],
          sizes: [{ $unwind: '$sizes' }, { $group: { _id: '$sizes', count: { $sum: 1 } } }],
          colors: [{ $unwind: '$colors' }, { $group: { _id: { name: '$colors.name', hex: '$colors.hex' }, count: { $sum: 1 } } }, { $sort: { '_id.name': 1 } }],
          brands: [{ $group: { _id: '$brandName', count: { $sum: 1 } } }, { $sort: { _id: 1 } }],
          styles: [{ $unwind: '$styles' }, { $group: { _id: '$styles', count: { $sum: 1 } } }],
          price: [{ $group: { _id: null, min: { $min: '$effectivePrice' }, max: { $max: '$effectivePrice' } } }],
        },
      },
    ]);
    const sizeOrder = ['XXS', 'XS', 'S', 'M', 'L', 'XL', 'XXL', 'ONE SIZE'];
    const sizeKey = (s: string) => {
      const i = sizeOrder.indexOf(s.toUpperCase());
      if (i >= 0) return i;
      const n = parseFloat(s.replace(/[^0-9.]/g, ''));
      return Number.isFinite(n) ? 100 + n : 1000;
    };
    const p = agg?.price?.[0];
    facets = {
      categories: agg.categories.map((c: any) => ({ slug: c._id.slug, name: c._id.name, count: c.count })),
      sizes: agg.sizes.map((s: any) => ({ value: s._id, count: s.count })).sort((a: any, b: any) => sizeKey(a.value) - sizeKey(b.value)),
      colors: agg.colors.map((c: any) => ({ name: c._id.name, hex: c._id.hex, count: c.count })),
      brands: agg.brands.map((b: any) => ({ name: b._id, count: b.count })),
      styles: agg.styles.map((s: any) => ({ value: s._id, count: s.count })),
      price: p ? { min: Math.floor((p.min * (currency === settings.currency.base ? 1 : settings.currency.rates[currency])) / 100) * 100, max: Math.ceil((p.max * (currency === settings.currency.base ? 1 : settings.currency.rates[currency])) / 100) * 100 } : { min: 0, max: 0 },
    };
  }

  res.json({
    items: items.map((p) => productCard(p, settings, currency)),
    page: q.page,
    limit: q.limit,
    total,
    totalPages: Math.max(1, Math.ceil(total / q.limit)),
    currency,
    facets,
  });
});

// ── Search suggestions ─────────────────────────────────────────────────────
router.get('/products/suggest', validate({ query: z.object({ q: z.string().trim().min(1).max(60), currency: z.string().max(3).optional() }) }), async (req, res) => {
  const { q, currency: cur } = req.valid.query as { q: string; currency?: string };
  const settings = await getSettings();
  const currency = resolveCurrency(settings, cur);
  const rx = new RegExp(escapeRegex(q), 'i');
  const prefix = new RegExp(`^${escapeRegex(q)}`, 'i');
  const [products, categories, brands] = await Promise.all([
    Product.find({ status: 'published', $or: [{ name: rx }, { brandName: rx }, { categoryName: rx }, { tags: rx }] })
      .sort({ soldCount: -1, isFeatured: -1 })
      .limit(6)
      .lean<ProductLean[]>(),
    Category.find({ isActive: true, name: rx }).limit(4).lean(),
    Brand.find({ isActive: true, name: prefix }).limit(3).lean(),
  ]);
  res.json({
    products: products.map((p) => {
      const c = productCard(p, settings, currency);
      return { _id: c._id, name: c.name, slug: c.slug, brandName: c.brandName, price: c.price, currency: c.currency, image: c.images[0]?.sm ?? null, department: c.department };
    }),
    categories: categories.map((c) => ({ name: c.name, slug: c.slug, department: c.department })),
    brands: brands.map((b) => ({ name: b.name, slug: b.slug })),
  });
});

// ── Product detail ─────────────────────────────────────────────────────────
router.get('/products/:idOrSlug', validate({ params: z.object({ idOrSlug: z.string().min(1).max(120) }), query: z.object({ currency: z.string().max(3).optional() }) }), async (req, res) => {
  const { idOrSlug } = req.valid.params as { idOrSlug: string };
  const settings = await getSettings();
  const currency = resolveCurrency(settings, (req.valid.query as { currency?: string }).currency);
  const filter = /^[a-f0-9]{24}$/i.test(idOrSlug) ? { _id: idOrSlug } : { slug: idOrSlug.toLowerCase() };
  const product = await Product.findOne({ ...filter, status: 'published' }).lean<ProductLean>();
  if (!product) throw notFound('This product is not available.');

  let related = await Product.find({ status: 'published', categorySlug: product.categorySlug, _id: { $ne: product._id } })
    .sort({ soldCount: -1, isFeatured: -1 })
    .limit(8)
    .lean<ProductLean[]>();
  if (related.length < 4) {
    const more = await Product.find({ status: 'published', department: product.department, _id: { $nin: [product._id, ...related.map((r) => r._id)] } })
      .sort({ isFeatured: -1, soldCount: -1 })
      .limit(8 - related.length)
      .lean<ProductLean[]>();
    related = related.concat(more);
  }
  res.json({ product: productDetail(product, settings, currency), related: related.map((p) => productCard(p, settings, currency)) });
});

router.get('/products/:id/reviews', validate({ params: z.object({ id: objectId }), query: z.object(pagination) }), async (req, res) => {
  const { id } = req.valid.params as { id: string };
  const { page, limit } = req.valid.query as { page: number; limit: number };
  const filter = { product: id, status: 'published' as const };
  const [reviews, total, dist] = await Promise.all([
    Review.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
    Review.countDocuments(filter),
    Review.aggregate([{ $match: { product: new Types.ObjectId(id), status: 'published' } }, { $group: { _id: '$rating', count: { $sum: 1 } } }]),
  ]);
  res.json({
    reviews: reviews.map((r) => ({ _id: String(r._id), authorName: r.authorName, rating: r.rating, title: r.title, body: r.body, verifiedPurchase: r.verifiedPurchase, createdAt: r.createdAt })),
    total,
    distribution: Object.fromEntries([1, 2, 3, 4, 5].map((n) => [n, dist.find((d) => d._id === n)?.count ?? 0])),
  });
});

// ── Images from GridFS ─────────────────────────────────────────────────────
router.get('/images/:fileId', async (req: Request, res, next) => {
  const id = toObjectId(String(req.params.fileId));
  if (!id) return next(notFound('Image not found.'));
  const file = await findFile(id);
  if (!file) return next(notFound('Image not found.'));
  const etag = `"${String(file._id)}"`;
  res.set({
    'Content-Type': (file.metadata?.contentType as string) || 'image/webp',
    'Content-Length': String(file.length),
    // GridFS ids are immutable: a replaced image gets a new id.
    'Cache-Control': 'public, max-age=31536000, immutable',
    ETag: etag,
    'X-Content-Type-Options': 'nosniff',
    'Cross-Origin-Resource-Policy': 'cross-origin',
    'Content-Security-Policy': "default-src 'none'",
  });
  if (req.get('if-none-match') === etag) return res.status(304).end();
  const stream = openDownloadStream(id);
  stream.on('error', (err) => next(err));
  stream.pipe(res);
});

// ── Newsletter ─────────────────────────────────────────────────────────────
router.post('/newsletter/subscribe', publicWriteLimiter, validate({ body: z.object({ email, source: z.string().max(40).optional() }) }), async (req, res) => {
  const { email: addr, source } = req.body as { email: string; source?: string };
  await NewsletterSubscriber.updateOne({ email: addr }, { $set: { status: 'subscribed', source: source ?? 'footer' } }, { upsert: true });
  res.status(201).json({ ok: true, message: 'You are on the list. Welcome to VELORA.' });
});

export default router;

import { Router } from 'express';
import { z } from 'zod';
import { Types } from 'mongoose';
import { Coupon } from '../../models/Coupon.js';
import { StoreSettings } from '../../models/StoreSettings.js';
import { Admin, ADMIN_ROLES } from '../../models/Admin.js';
import { ActivityLog, Notification, NewsletterSubscriber, Review } from '../../models/Misc.js';
import { Product } from '../../models/Product.js';
import { CURRENCIES } from '../../models/common.js';
import { validate } from '../../middleware/validate.js';
import { requirePermission } from '../../middleware/auth.js';
import { uploadLimiter } from '../../middleware/security.js';
import { imageUpload } from '../../middleware/upload.js';
import { financials, ordersCsv, overview, productAnalytics, revenueSeries, type Granularity } from '../../services/analytics.service.js';
import { getSettings, invalidateSettingsCache } from '../../services/settings.service.js';
import { deleteStoredImage, storeImage } from '../../services/image.service.js';
import { logActivity } from '../../services/activity.service.js';
import { realtime } from '../../realtime/socket.js';
import { revokeAllSessions } from '../../services/session.service.js';
import { cleanupOrphanImages } from '../../services/maintenance.service.js';
import { hashPassword } from '../../utils/crypto.js';
import { email, objectId, pagination, password } from '../../utils/schemas.js';
import { badRequest, conflict, notFound } from '../../utils/errors.js';

const router = Router();

// ── Analytics ──────────────────────────────────────────────────────────────
const rangeQuery = z.object({
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  granularity: z.enum(['day', 'week', 'month', 'year']).default('day'),
});

function resolveRange(q: { from?: Date; to?: Date }, defaultDays = 30) {
  const to = q.to ? new Date(q.to.getTime() + (q.to.getHours() === 0 && q.to.getMinutes() === 0 ? 86_400_000 : 0)) : new Date(Date.now() + 1);
  const from = q.from ?? new Date(to.getTime() - defaultDays * 86_400_000);
  if (from >= to) throw badRequest('The start date must be before the end date.');
  return { from, to };
}

router.get('/analytics/overview', requirePermission('analytics:read'), validate({ query: rangeQuery }), async (req, res) => {
  res.json(await overview(resolveRange(req.valid.query)));
});

router.get('/analytics/revenue', requirePermission('analytics:read'), validate({ query: rangeQuery }), async (req, res) => {
  const g = req.valid.query.granularity as Granularity;
  const days = g === 'day' ? 30 : g === 'week' ? 7 * 12 : g === 'month' ? 365 : 365 * 5;
  const range = resolveRange(req.valid.query, days);
  const [series, totals] = await Promise.all([revenueSeries(range, g), financials(range)]);
  res.json({ granularity: g, from: range.from, to: range.to, baseCurrency: (await getSettings()).currency.base, series, totals });
});

router.get('/analytics/products', requirePermission('analytics:read'), validate({ query: rangeQuery }), async (req, res) => {
  res.json(await productAnalytics(resolveRange(req.valid.query, 90)));
});

router.get('/analytics/export.csv', requirePermission('analytics:read'), validate({ query: rangeQuery }), async (req, res) => {
  const range = resolveRange(req.valid.query, 30);
  const csv = await ordersCsv(range);
  await logActivity(req, 'analytics.export', 'orders', undefined, `Exported orders CSV ${range.from.toISOString().slice(0, 10)} → ${range.to.toISOString().slice(0, 10)}`);
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="velora-orders-${range.from.toISOString().slice(0, 10)}-to-${range.to.toISOString().slice(0, 10)}.csv"`);
  res.send(csv);
});

// ── Coupons & promotions ───────────────────────────────────────────────────
const couponInput = z
  .object({
    code: z.string().trim().min(3).max(40).regex(/^[A-Za-z0-9_-]+$/, 'Letters, numbers, - and _ only'),
    description: z.string().trim().max(200).optional(),
    kind: z.enum(['code', 'automatic']).default('code'),
    type: z.enum(['percentage', 'fixed']),
    value: z.number().int().min(1).max(100_000_00),
    minOrderValue: z.number().int().min(0).max(100_000_00).default(0),
    startsAt: z.coerce.date().nullable().optional(),
    expiresAt: z.coerce.date().nullable().optional(),
    usageLimit: z.number().int().min(1).nullable().optional(),
    perUserLimit: z.number().int().min(1).nullable().optional(),
    isActive: z.boolean().default(true),
  })
  .refine((c) => c.type !== 'percentage' || c.value <= 90, { message: 'Percentage discounts can be at most 90%', path: ['value'] })
  .refine((c) => !c.startsAt || !c.expiresAt || c.startsAt < c.expiresAt, { message: 'Expiry must be after the start date', path: ['expiresAt'] });

router.get('/coupons', requirePermission('promotions:write'), async (_req, res) => {
  res.json({ coupons: await Coupon.find().sort({ createdAt: -1 }).lean() });
});

router.post('/coupons', requirePermission('promotions:write'), validate({ body: couponInput }), async (req, res) => {
  const coupon = await Coupon.create({ ...req.body, code: req.body.code.toUpperCase() });
  await logActivity(req, 'coupon.create', 'coupon', String(coupon._id), `Created ${coupon.kind === 'automatic' ? 'promotion' : 'coupon'} ${coupon.code}`);
  realtime.storefront('settings:changed', { reason: 'promotion' });
  res.status(201).json({ coupon });
});

router.put('/coupons/:id', requirePermission('promotions:write'), validate({ params: z.object({ id: objectId }), body: couponInput }), async (req, res) => {
  const coupon = await Coupon.findByIdAndUpdate(req.valid.params.id, { $set: { ...req.body, code: req.body.code.toUpperCase() } }, { returnDocument: 'after', runValidators: true });
  if (!coupon) throw notFound('Coupon not found.');
  await logActivity(req, 'coupon.update', 'coupon', String(coupon._id), `Updated ${coupon.code}`);
  realtime.storefront('settings:changed', { reason: 'promotion' });
  res.json({ coupon });
});

router.delete('/coupons/:id', requirePermission('promotions:write'), validate({ params: z.object({ id: objectId }) }), async (req, res) => {
  const coupon = await Coupon.findByIdAndDelete(req.valid.params.id);
  if (!coupon) throw notFound('Coupon not found.');
  await logActivity(req, 'coupon.delete', 'coupon', String(coupon._id), `Deleted ${coupon.code}`);
  res.json({ ok: true });
});

// ── Store settings ─────────────────────────────────────────────────────────
router.get('/settings', requirePermission('products:read'), async (_req, res) => {
  const s = await StoreSettings.findOne({ key: 'store' }).lean();
  res.json({ settings: s });
});

const settingsInput = z.object({
  storeName: z.string().trim().min(2).max(60),
  tagline: z.string().trim().max(140),
  contact: z.object({ email: z.string().trim().email().max(254), phone: z.string().trim().max(40), address: z.string().trim().max(300) }),
  currency: z.object({
    base: z.enum(CURRENCIES),
    enabled: z.array(z.enum(CURRENCIES)).min(1),
    rates: z.record(z.string(), z.number().positive().max(1000)),
    rounding: z.enum(['none', 'whole']),
  }),
  tax: z.object({ enabled: z.boolean(), rate: z.number().min(0).max(50), inclusive: z.boolean(), label: z.string().trim().min(1).max(20) }),
  delivery: z
    .array(
      z.object({
        id: z.string().trim().regex(/^[a-z0-9-]+$/).max(40),
        name: z.string().trim().min(2).max(60),
        description: z.string().trim().max(160).optional(),
        price: z.number().int().min(0).max(100_000_00),
        freeOver: z.number().int().min(0).nullable().optional(),
        etaDays: z.string().trim().max(60),
        isActive: z.boolean(),
      }),
    )
    .min(1)
    .max(10),
  returnPolicy: z.string().trim().max(5000),
  announcement: z.object({ enabled: z.boolean(), text: z.string().trim().max(160), link: z.string().trim().max(300).optional() }),
  social: z.object({
    instagram: z.string().trim().url().max(300).optional().or(z.literal('')),
    tiktok: z.string().trim().url().max(300).optional().or(z.literal('')),
    x: z.string().trim().url().max(300).optional().or(z.literal('')),
    facebook: z.string().trim().url().max(300).optional().or(z.literal('')),
    pinterest: z.string().trim().url().max(300).optional().or(z.literal('')),
    youtube: z.string().trim().url().max(300).optional().or(z.literal('')),
  }),
  lowStockThreshold: z.number().int().min(0).max(1000),
});

router.put('/settings', requirePermission('settings:write'), validate({ body: settingsInput }), async (req, res) => {
  const body = req.body as z.infer<typeof settingsInput>;
  if (!body.currency.enabled.includes(body.currency.base)) throw badRequest('The base currency must be enabled.');
  const rates: Record<string, number> = { [body.currency.base]: 1 };
  for (const c of body.currency.enabled) {
    if (c === body.currency.base) continue;
    const r = body.currency.rates[c];
    if (!r) throw badRequest(`Set an exchange rate for ${c}.`);
    rates[c] = r;
  }
  const ids = body.delivery.map((d) => d.id);
  if (new Set(ids).size !== ids.length) throw badRequest('Delivery method ids must be unique.');
  await getSettings();
  const s = await StoreSettings.findOneAndUpdate({ key: 'store' }, { $set: { ...body, currency: { ...body.currency, rates } } }, { returnDocument: 'after' });
  invalidateSettingsCache();
  await logActivity(req, 'settings.update', 'settings', 'store', 'Updated store settings');
  realtime.storefront('settings:changed', { reason: 'settings' });
  res.json({ settings: s });
});

router.post('/settings/logo', requirePermission('settings:write'), uploadLimiter, imageUpload.single('image'), async (req, res) => {
  if (!req.file) throw badRequest('Choose an image to upload.');
  const s = await StoreSettings.findOne({ key: 'store' });
  if (!s) throw notFound();
  const stored = await storeImage(req.file.buffer, { kind: 'branding', originalName: req.file.originalname, uploadedBy: String(req.admin!._id) });
  const old = s.logo;
  s.logo = stored.files as never;
  await s.save();
  if (old) await deleteStoredImage(old);
  invalidateSettingsCache();
  await logActivity(req, 'settings.logo', 'settings', 'store', 'Updated store logo');
  realtime.storefront('settings:changed', { reason: 'logo' });
  res.json({ logo: { sm: String(stored.files.sm), md: String(stored.files.md), lg: String(stored.files.lg) } });
});

router.delete('/settings/logo', requirePermission('settings:write'), async (req, res) => {
  const s = await StoreSettings.findOne({ key: 'store' });
  if (s?.logo) {
    await deleteStoredImage(s.logo);
    s.logo = null;
    await s.save();
    invalidateSettingsCache();
    realtime.storefront('settings:changed', { reason: 'logo' });
  }
  res.json({ ok: true });
});

// Banners (homepage hero, promotions, collection tiles) — images in GridFS.
const bannerFields = z.object({
  placement: z.enum(['hero', 'promo', 'collection']),
  eyebrow: z.string().trim().max(60).optional(),
  title: z.string().trim().min(2).max(120),
  subtitle: z.string().trim().max(240).optional(),
  ctaLabel: z.string().trim().max(40).optional(),
  ctaHref: z.string().trim().max(300).regex(/^\/[^\s]*$/, 'Use a site path such as /clothing').optional().or(z.literal('')),
  isActive: z.preprocess((v) => (v === 'true' ? true : v === 'false' ? false : v), z.boolean()).default(true),
  sortOrder: z.coerce.number().int().min(0).max(100).default(0),
});

router.post('/banners', requirePermission('settings:write'), uploadLimiter, imageUpload.single('image'), async (req, res) => {
  const body = bannerFields.parse(req.body ?? {});
  const s = await StoreSettings.findOne({ key: 'store' });
  if (!s) throw notFound();
  const image = req.file ? (await storeImage(req.file.buffer, { kind: 'banner', originalName: req.file.originalname, uploadedBy: String(req.admin!._id) })).files : null;
  s.banners.push({ ...body, image } as never);
  await s.save();
  invalidateSettingsCache();
  await logActivity(req, 'banner.create', 'banner', undefined, `Created banner "${body.title}"`);
  realtime.storefront('settings:changed', { reason: 'banners' });
  res.status(201).json({ banners: s.banners });
});

router.put('/banners/:id', requirePermission('settings:write'), uploadLimiter, imageUpload.single('image'), async (req, res) => {
  const id = String(req.params.id);
  if (!Types.ObjectId.isValid(id)) throw badRequest('Invalid id');
  const body = bannerFields.parse(req.body ?? {});
  const s = await StoreSettings.findOne({ key: 'store' });
  const banner = s?.banners.id(id);
  if (!s || !banner) throw notFound('Banner not found.');
  let old = null;
  if (req.file) {
    old = banner.image;
    banner.image = (await storeImage(req.file.buffer, { kind: 'banner', originalName: req.file.originalname, uploadedBy: String(req.admin!._id) })).files as never;
  }
  banner.set(body);
  await s.save();
  if (old) await deleteStoredImage(old);
  invalidateSettingsCache();
  await logActivity(req, 'banner.update', 'banner', id, `Updated banner "${body.title}"`);
  realtime.storefront('settings:changed', { reason: 'banners' });
  res.json({ banners: s.banners });
});

router.delete('/banners/:id', requirePermission('settings:write'), validate({ params: z.object({ id: objectId }) }), async (req, res) => {
  const s = await StoreSettings.findOne({ key: 'store' });
  const banner = s?.banners.id(req.valid.params.id);
  if (!s || !banner) throw notFound('Banner not found.');
  const image = banner.image;
  banner.deleteOne();
  await s.save();
  if (image) await deleteStoredImage(image);
  invalidateSettingsCache();
  await logActivity(req, 'banner.delete', 'banner', req.valid.params.id, 'Deleted a banner');
  realtime.storefront('settings:changed', { reason: 'banners' });
  res.json({ banners: s.banners });
});

// ── Notifications & audit log ──────────────────────────────────────────────
router.get('/notifications', async (_req, res) => {
  const [items, unread] = await Promise.all([
    Notification.find({ audience: 'admin' }).sort({ createdAt: -1 }).limit(50).lean(),
    Notification.countDocuments({ audience: 'admin', readAt: null }),
  ]);
  res.json({ notifications: items, unread });
});

router.post('/notifications/read', validate({ body: z.object({ ids: z.array(objectId).max(100).optional() }) }), async (req, res) => {
  const filter: Record<string, unknown> = { audience: 'admin', readAt: null };
  if (req.body.ids?.length) filter._id = { $in: req.body.ids };
  await Notification.updateMany(filter, { $set: { readAt: new Date() } });
  res.json({ ok: true });
});

router.get('/activity', requirePermission('audit:read'), validate({ query: z.object({ entityType: z.string().max(40).optional(), entityId: z.string().max(40).optional(), ...pagination, limit: z.coerce.number().int().min(1).max(200).default(50) }) }), async (req, res) => {
  const { entityType, entityId, page, limit } = req.valid.query;
  const filter: Record<string, unknown> = {};
  if (entityType) filter.entityType = entityType;
  if (entityId) filter.entityId = entityId;
  const [items, total] = await Promise.all([
    ActivityLog.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
    ActivityLog.countDocuments(filter),
  ]);
  res.json({ items, total, page, totalPages: Math.max(1, Math.ceil(total / limit)) });
});

// ── Staff (owner only) ─────────────────────────────────────────────────────
router.get('/staff', requirePermission('staff:manage'), async (_req, res) => {
  res.json({ staff: await Admin.find().sort({ createdAt: 1 }).lean() });
});

router.post(
  '/staff',
  requirePermission('staff:manage'),
  validate({ body: z.object({ name: z.string().trim().min(2).max(120), email, password, role: z.enum(ADMIN_ROLES) }) }),
  async (req, res) => {
    const admin = await Admin.create({ name: req.body.name, email: req.body.email, role: req.body.role, passwordHash: await hashPassword(req.body.password) });
    await logActivity(req, 'staff.create', 'admin', String(admin._id), `Added ${admin.role} ${admin.email}`);
    res.status(201).json({ staff: { _id: String(admin._id), name: admin.name, email: admin.email, role: admin.role, status: admin.status } });
  },
);

router.patch(
  '/staff/:id',
  requirePermission('staff:manage'),
  validate({ params: z.object({ id: objectId }), body: z.object({ role: z.enum(ADMIN_ROLES).optional(), status: z.enum(['active', 'disabled']).optional() }) }),
  async (req, res) => {
    if (req.valid.params.id === String(req.admin!._id)) throw conflict('You cannot change your own role or status.');
    const target = await Admin.findById(req.valid.params.id);
    if (!target) throw notFound('Staff member not found.');
    if (target.role === 'owner' && (req.body.role && req.body.role !== 'owner' || req.body.status === 'disabled')) {
      const owners = await Admin.countDocuments({ role: 'owner', status: 'active' });
      if (owners <= 1) throw conflict('The store must keep at least one active owner.');
    }
    target.set(req.body);
    await target.save();
    if (req.body.status === 'disabled') await revokeAllSessions('admin', target._id);
    await logActivity(req, 'staff.update', 'admin', String(target._id), `Updated ${target.email}: ${JSON.stringify(req.body)}`);
    res.json({ staff: { _id: String(target._id), name: target.name, email: target.email, role: target.role, status: target.status } });
  },
);

// ── Reviews moderation ─────────────────────────────────────────────────────
router.get('/reviews', requirePermission('products:read'), validate({ query: z.object(pagination) }), async (req, res) => {
  const { page, limit } = req.valid.query;
  const [items, total] = await Promise.all([
    Review.find().sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).populate('product', 'name slug').lean(),
    Review.countDocuments(),
  ]);
  res.json({ items, total, page, totalPages: Math.max(1, Math.ceil(total / limit)) });
});

router.patch(
  '/reviews/:id',
  requirePermission('products:write'),
  validate({ params: z.object({ id: objectId }), body: z.object({ status: z.enum(['published', 'hidden']) }) }),
  async (req, res) => {
    const review = await Review.findByIdAndUpdate(req.valid.params.id, { $set: { status: req.body.status } }, { returnDocument: 'after' });
    if (!review) throw notFound('Review not found.');
    const [agg] = await Review.aggregate([
      { $match: { product: review.product, status: 'published' } },
      { $group: { _id: null, avg: { $avg: '$rating' }, count: { $sum: 1 } } },
    ]);
    await Product.updateOne({ _id: review.product }, { $set: { ratingAvg: Math.round((agg?.avg ?? 0) * 10) / 10, ratingCount: agg?.count ?? 0 } });
    await logActivity(req, 'review.moderate', 'review', String(review._id), `Review ${req.body.status}`);
    res.json({ review });
  },
);

// ── Newsletter ─────────────────────────────────────────────────────────────
router.get('/newsletter', requirePermission('customers:read'), validate({ query: z.object(pagination) }), async (req, res) => {
  const { page, limit } = req.valid.query;
  const [items, total] = await Promise.all([
    NewsletterSubscriber.find().sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
    NewsletterSubscriber.countDocuments(),
  ]);
  res.json({ items, total, page, totalPages: Math.max(1, Math.ceil(total / limit)) });
});

// ── Maintenance ────────────────────────────────────────────────────────────
router.post('/maintenance/cleanup-images', requirePermission('settings:write'), async (req, res) => {
  // Skip files younger than 10 minutes: they may belong to an upload still in progress.
  const removed = await cleanupOrphanImages(10 * 60_000);
  await logActivity(req, 'maintenance.cleanup', 'gridfs', undefined, `Removed ${removed} orphaned image file(s)`);
  res.json({ removed });
});

export default router;

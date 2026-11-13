import { Router } from 'express';
import { z } from 'zod';
import { Types } from 'mongoose';
import { Product, type IProduct } from '../../models/Product.js';
import { Category, Brand } from '../../models/Catalog.js';
import { Cart, Wishlist } from '../../models/Cart.js';
import { Order } from '../../models/Order.js';
import { Review, StockMovement } from '../../models/Misc.js';
import { DEPARTMENTS, GENDERS, STYLES } from '../../models/common.js';
import { validate } from '../../middleware/validate.js';
import { requirePermission } from '../../middleware/auth.js';
import { uploadLimiter } from '../../middleware/security.js';
import { imageUpload } from '../../middleware/upload.js';
import { productAdmin } from '../../services/serializers.js';
import { setStock, recomputeTotals } from '../../services/inventory.service.js';
import { deleteStoredImage, storeImage } from '../../services/image.service.js';
import { broadcastInventory, broadcastProductChanged } from '../../services/broadcast.service.js';
import { logActivity } from '../../services/activity.service.js';
import { deleteFile, type FileId } from '../../db/gridfs.js';
import { csv, objectId, pagination } from '../../utils/schemas.js';
import { badRequest, conflict, notFound } from '../../utils/errors.js';
import { escapeRegex, slugify } from '../../utils/money.js';
import type { Actor } from '../../models/common.js';

const router = Router();
type ProductLean = IProduct & { _id: Types.ObjectId };

const actorOf = (req: Express.Request): Actor => ({ type: 'admin', id: String(req.admin!._id), name: req.admin!.name });

// ── List / read ────────────────────────────────────────────────────────────
router.get(
  '/products',
  requirePermission('products:read'),
  validate({
    query: z.object({
      q: z.string().trim().max(80).optional(),
      status: z.enum(['draft', 'published', 'archived']).optional(),
      department: z.enum(DEPARTMENTS).optional(),
      category: csv(),
      stock: z.enum(['low', 'out', 'in']).optional(),
      sort: z.enum(['newest', 'name', 'price_asc', 'price_desc', 'stock_asc', 'best_selling']).default('newest'),
      ...pagination,
      limit: z.coerce.number().int().min(1).max(100).default(20),
    }),
  }),
  async (req, res) => {
    const q = req.valid.query;
    const filter: Record<string, unknown> = {};
    if (q.status) filter.status = q.status;
    else filter.status = { $ne: 'archived' };
    if (q.department) filter.department = q.department;
    if (q.category?.length) filter.categorySlug = { $in: q.category };
    if (q.q) {
      const rx = new RegExp(escapeRegex(q.q), 'i');
      filter.$or = [{ name: rx }, { brandName: rx }, { 'variants.sku': rx }, { slug: rx }];
    }
    if (q.stock === 'out') filter.totalAvailable = { $lte: 0 };
    if (q.stock === 'in') filter.totalAvailable = { $gt: 0 };
    if (q.stock === 'low') filter.$expr = { $and: [{ $gt: ['$totalAvailable', 0] }, { $lte: [{ $min: '$variants.available' }, '$lowStockThreshold'] }] };
    const sort: Record<string, 1 | -1> =
      q.sort === 'name' ? { name: 1 } : q.sort === 'price_asc' ? { effectivePrice: 1 } : q.sort === 'price_desc' ? { effectivePrice: -1 } : q.sort === 'stock_asc' ? { totalAvailable: 1 } : q.sort === 'best_selling' ? { soldCount: -1 } : { createdAt: -1 };
    const [items, total] = await Promise.all([
      Product.find(filter).sort(sort).skip((q.page - 1) * q.limit).limit(q.limit).lean<ProductLean[]>(),
      Product.countDocuments(filter),
    ]);
    res.json({ items: items.map(productAdmin), total, page: q.page, totalPages: Math.max(1, Math.ceil(total / q.limit)) });
  },
);

router.get('/products/:id', requirePermission('products:read'), validate({ params: z.object({ id: objectId }) }), async (req, res) => {
  const product = await Product.findById(req.valid.params.id).lean<ProductLean>();
  if (!product) throw notFound('Product not found.');
  res.json({ product: productAdmin(product) });
});

// ── Create / update ────────────────────────────────────────────────────────
const variantInput = z.object({
  _id: objectId.optional(),
  sku: z.string().trim().min(2).max(64).regex(/^[A-Za-z0-9_-]+$/, 'SKU may contain letters, numbers, - and _'),
  size: z.string().trim().min(1).max(20),
  color: z.string().trim().min(1).max(40),
  colorHex: z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#111111'),
  stock: z.number().int().min(0).max(1_000_000).optional(),
  isActive: z.boolean().default(true),
});

const productInput = z.object({
  name: z.string().trim().min(2).max(140),
  slug: z.string().trim().max(90).optional(),
  description: z.string().trim().min(10).max(5000),
  shortDescription: z.string().trim().max(300).optional(),
  department: z.enum(DEPARTMENTS),
  gender: z.enum(GENDERS),
  categoryId: objectId,
  brandId: objectId,
  styles: z.array(z.enum(STYLES)).max(4).default([]),
  tags: z.array(z.string().trim().toLowerCase().max(40)).max(20).default([]),
  price: z.number().int().min(1).max(100_000_000),
  salePrice: z.number().int().min(0).max(100_000_000).nullable().optional(),
  costPrice: z.number().int().min(0).max(100_000_000).nullable().optional(),
  specifications: z.array(z.object({ label: z.string().trim().min(1).max(60), value: z.string().trim().min(1).max(300) })).max(30).default([]),
  sizeGuide: z.enum(['tops', 'bottoms', 'dresses', 'footwear', 'none']).default('none'),
  status: z.enum(['draft', 'published', 'archived']).default('draft'),
  isFeatured: z.boolean().default(false),
  isNewArrival: z.boolean().default(false),
  isBestSeller: z.boolean().default(false),
  showroom: z.boolean().optional(),
  lowStockThreshold: z.number().int().min(0).max(1000).default(5),
  variants: z.array(variantInput).min(1, 'Add at least one size/colour variant').max(200),
});

async function resolveTaxonomy(categoryId: string, brandId: string, department: string) {
  const [category, brand] = await Promise.all([Category.findById(categoryId).lean(), Brand.findById(brandId).lean()]);
  if (!category) throw badRequest('Choose a valid category.');
  if (!brand) throw badRequest('Choose a valid brand.');
  if (category.department !== department) throw badRequest(`Category "${category.name}" belongs to ${category.department}.`);
  return { category, brand };
}

function checkVariants(variants: z.infer<typeof variantInput>[]) {
  const skus = new Set<string>();
  const combos = new Set<string>();
  for (const v of variants) {
    const sku = v.sku.toUpperCase();
    if (skus.has(sku)) throw badRequest(`Duplicate SKU ${sku}.`);
    skus.add(sku);
    const combo = `${v.color.toLowerCase()}|${v.size.toLowerCase()}`;
    if (combos.has(combo)) throw badRequest(`Duplicate variant ${v.color} / ${v.size}.`);
    combos.add(combo);
  }
}

async function uniqueSlug(base: string, excludeId?: Types.ObjectId) {
  const root = slugify(base) || 'product';
  let slug = root;
  for (let i = 2; await Product.exists({ slug, ...(excludeId ? { _id: { $ne: excludeId } } : {}) }); i++) slug = `${root}-${i}`;
  return slug;
}

router.post('/products', requirePermission('products:write'), validate({ body: productInput }), async (req, res) => {
  const body = req.body as z.infer<typeof productInput>;
  checkVariants(body.variants);
  if (body.salePrice != null && body.salePrice >= body.price) throw badRequest('Discount price must be lower than the regular price.');
  if (body.status === 'published') throw badRequest('Save the product and add at least one image before publishing.');
  const { category, brand } = await resolveTaxonomy(body.categoryId, body.brandId, body.department);
  const product = new Product({
    ...body,
    slug: await uniqueSlug(body.slug || body.name),
    category: category._id,
    categorySlug: category.slug,
    categoryName: category.name,
    brand: brand._id,
    brandName: brand.name,
    salePrice: body.salePrice ?? null,
    costPrice: body.costPrice ?? null,
    variants: body.variants.map((v) => ({ ...v, _id: undefined, sku: v.sku.toUpperCase(), stock: v.stock ?? 0, reserved: 0, available: v.stock ?? 0 })),
  });
  await product.save();
  await StockMovement.insertMany(
    product.variants.map((v) => ({ product: product._id, variant: v._id, sku: v.sku, type: 'initial', stockDelta: v.stock, reservedDelta: 0, stockAfter: v.stock, availableAfter: v.available, actor: actorOf(req), note: 'Initial stock' })),
  );
  await logActivity(req, 'product.create', 'product', String(product._id), `Created product ${product.name}`);
  broadcastProductChanged(product, 'created');
  res.status(201).json({ product: productAdmin(product.toObject() as ProductLean) });
});

router.put('/products/:id', requirePermission('products:write'), validate({ params: z.object({ id: objectId }), body: productInput }), async (req, res) => {
  const body = req.body as z.infer<typeof productInput>;
  checkVariants(body.variants);
  if (body.salePrice != null && body.salePrice >= body.price) throw badRequest('Discount price must be lower than the regular price.');
  const product = await Product.findById(req.valid.params.id);
  if (!product) throw notFound('Product not found.');
  if (body.status === 'published' && product.images.length === 0) throw badRequest('Add at least one image before publishing.');
  const { category, brand } = await resolveTaxonomy(body.categoryId, body.brandId, body.department);
  const before = { price: product.price, salePrice: product.salePrice, status: product.status };

  // Variants: update metadata in place; stock changes go through the ledger below.
  const incoming = new Map(body.variants.filter((v) => v._id).map((v) => [v._id!, v]));
  const stockChanges: { variant: Types.ObjectId; stock: number }[] = [];
  for (const existing of [...product.variants]) {
    const next = incoming.get(String(existing._id));
    if (!next) {
      if (existing.reserved > 0) throw conflict(`${existing.sku} has units reserved in open checkouts and cannot be removed yet.`);
      await StockMovement.create({ product: product._id, variant: existing._id, sku: existing.sku, type: 'variant_removed', stockDelta: -existing.stock, reservedDelta: 0, stockAfter: 0, availableAfter: 0, actor: actorOf(req), note: 'Variant removed' });
      existing.deleteOne();
      continue;
    }
    existing.sku = next.sku.toUpperCase();
    existing.size = next.size;
    existing.color = next.color;
    existing.colorHex = next.colorHex;
    existing.isActive = next.isActive;
    if (next.stock != null && next.stock !== existing.stock) stockChanges.push({ variant: existing._id, stock: next.stock });
  }
  const added = body.variants.filter((v) => !v._id || !product.variants.id(v._id));
  for (const v of added) {
    product.variants.push({ sku: v.sku.toUpperCase(), size: v.size, color: v.color, colorHex: v.colorHex, stock: v.stock ?? 0, reserved: 0, available: v.stock ?? 0, isActive: v.isActive } as never);
  }

  product.set({
    name: body.name,
    slug: body.slug ? await uniqueSlug(body.slug, product._id) : product.slug,
    description: body.description,
    shortDescription: body.shortDescription,
    department: body.department,
    gender: body.gender,
    category: category._id,
    categorySlug: category.slug,
    categoryName: category.name,
    brand: brand._id,
    brandName: brand.name,
    styles: body.styles,
    tags: body.tags,
    price: body.price,
    salePrice: body.salePrice ?? null,
    costPrice: body.costPrice ?? null,
    specifications: body.specifications,
    sizeGuide: body.sizeGuide,
    status: body.status,
    isFeatured: body.isFeatured,
    isNewArrival: body.isNewArrival,
    isBestSeller: body.isBestSeller,
    ...(body.showroom !== undefined ? { showroom: body.showroom } : {}),
    lowStockThreshold: body.lowStockThreshold,
  });
  await product.save();

  const newVariantIds = product.variants.filter((v) => added.some((a) => a.sku.toUpperCase() === v.sku)).map((v) => v);
  if (newVariantIds.length) {
    await StockMovement.insertMany(newVariantIds.map((v) => ({ product: product._id, variant: v._id, sku: v.sku, type: 'initial', stockDelta: v.stock, reservedDelta: 0, stockAfter: v.stock, availableAfter: v.available, actor: actorOf(req), note: 'New variant' })));
  }
  for (const change of stockChanges) await setStock(change.variant, change.stock, actorOf(req), 'Updated from product editor');
  await recomputeTotals([product._id]);

  const changes: string[] = [];
  if (before.price !== body.price || before.salePrice !== (body.salePrice ?? null)) changes.push('price');
  if (before.status !== body.status) changes.push(`status ${before.status}→${body.status}`);
  await logActivity(req, 'product.update', 'product', String(product._id), `Updated ${product.name}${changes.length ? ` (${changes.join(', ')})` : ''}`, { before, after: { price: body.price, salePrice: body.salePrice ?? null, status: body.status } });

  const fresh = await Product.findById(product._id).lean<ProductLean>();
  broadcastProductChanged(fresh!, before.status === 'published' && body.status !== 'published' ? 'removed' : 'updated');
  void broadcastInventory([product._id]);
  res.json({ product: productAdmin(fresh!) });
});

router.patch(
  '/products/:id/status',
  requirePermission('products:write'),
  validate({ params: z.object({ id: objectId }), body: z.object({ status: z.enum(['draft', 'published', 'archived']) }) }),
  async (req, res) => {
    const product = await Product.findById(req.valid.params.id);
    if (!product) throw notFound('Product not found.');
    if (req.body.status === 'published' && product.images.length === 0) throw badRequest('Add at least one image before publishing.');
    const was = product.status;
    product.status = req.body.status;
    await product.save();
    await logActivity(req, `product.${req.body.status}`, 'product', String(product._id), `${product.name}: ${was} → ${req.body.status}`);
    broadcastProductChanged(product, req.body.status === 'published' ? 'updated' : 'removed');
    res.json({ product: productAdmin(product.toObject() as ProductLean) });
  },
);

/** File ids referenced by order snapshots must survive product/image deletion. */
async function retainedFileIds(fileIds: Types.ObjectId[]) {
  if (!fileIds.length) return new Set<string>();
  const used = await Order.distinct('items.image', { 'items.image': { $in: fileIds } });
  return new Set(used.map(String));
}

async function deleteImageFiles(files: { sm: Types.ObjectId; md: Types.ObjectId; lg: Types.ObjectId }) {
  const keep = await retainedFileIds([files.sm, files.md, files.lg]);
  for (const id of [files.sm, files.md, files.lg]) if (!keep.has(String(id))) await deleteFile(id as unknown as FileId);
}

router.delete('/products/:id', requirePermission('products:write'), validate({ params: z.object({ id: objectId }) }), async (req, res) => {
  const product = await Product.findById(req.valid.params.id);
  if (!product) throw notFound('Product not found.');
  if (product.variants.some((v) => v.reserved > 0)) throw conflict('This product has units reserved in open checkouts. Unpublish it and try again shortly.');
  for (const img of product.images) await deleteImageFiles(img.files);
  await Product.deleteOne({ _id: product._id });
  await Promise.all([
    Cart.updateMany({ 'items.product': product._id }, { $pull: { items: { product: product._id } } }),
    Wishlist.updateMany({ products: product._id }, { $pull: { products: product._id } }),
    Review.deleteMany({ product: product._id }),
  ]);
  await logActivity(req, 'product.delete', 'product', String(product._id), `Deleted product ${product.name}`);
  broadcastProductChanged(product, 'removed');
  res.json({ ok: true });
});

// ── Images (stored in GridFS) ──────────────────────────────────────────────
const imageMeta = z.object({ alt: z.string().trim().max(200).optional(), color: z.string().trim().max(40).optional() });

function findImage(product: InstanceType<typeof Product>, key: string) {
  return product.images.find(
    (i) => String(i._id) === key || String(i.files.sm) === key || String(i.files.md) === key || String(i.files.lg) === key,
  );
}

router.post(
  '/products/:id/images',
  requirePermission('products:write'),
  uploadLimiter,
  validate({ params: z.object({ id: objectId }) }),
  imageUpload.array('images', 10),
  async (req, res) => {
    const meta = imageMeta.parse(req.body ?? {});
    const files = (req.files as Express.Multer.File[] | undefined) ?? [];
    if (!files.length) throw badRequest('Choose at least one image to upload.');
    const product = await Product.findById(req.valid.params.id);
    if (!product) throw notFound('Product not found.');
    if (product.images.length + files.length > 12) throw badRequest('A product can have up to 12 images.');
    let order = product.images.reduce((m, i) => Math.max(m, i.sortOrder), -1) + 1;
    const stored = [];
    try {
      for (const f of files) {
        stored.push(await storeImage(f.buffer, { kind: 'product', productId: String(product._id), originalName: f.originalname, uploadedBy: String(req.admin!._id) }));
      }
    } catch (err) {
      for (const s of stored) await deleteStoredImage(s.files);
      throw err;
    }
    for (const s of stored) product.images.push({ ...s, alt: meta.alt || product.name, color: meta.color, sortOrder: order++ } as never);
    await product.save();
    await logActivity(req, 'product.images.upload', 'product', String(product._id), `Uploaded ${stored.length} image(s) to ${product.name}`);
    broadcastProductChanged(product);
    res.status(201).json({ product: productAdmin(product.toObject() as ProductLean) });
  },
);

router.put(
  '/products/:id/images/:imageId',
  requirePermission('products:write'),
  uploadLimiter,
  validate({ params: z.object({ id: objectId, imageId: objectId }) }),
  imageUpload.single('image'),
  async (req, res) => {
    const meta = imageMeta.parse(req.body ?? {});
    if (!req.file) throw badRequest('Choose an image to upload.');
    const product = await Product.findById(req.valid.params.id);
    if (!product) throw notFound('Product not found.');
    const image = findImage(product, req.valid.params.imageId);
    if (!image) throw notFound('Image not found.');
    const stored = await storeImage(req.file.buffer, { kind: 'product', productId: String(product._id), originalName: req.file.originalname, uploadedBy: String(req.admin!._id) });
    const oldFiles = { sm: image.files.sm, md: image.files.md, lg: image.files.lg };
    image.files = stored.files as never;
    image.width = stored.width;
    image.height = stored.height;
    if (meta.alt !== undefined) image.alt = meta.alt;
    if (meta.color !== undefined) image.color = meta.color || undefined;
    await product.save();
    await deleteImageFiles(oldFiles);
    await logActivity(req, 'product.images.replace', 'product', String(product._id), `Replaced an image on ${product.name}`);
    broadcastProductChanged(product);
    res.json({ product: productAdmin(product.toObject() as ProductLean) });
  },
);

router.patch(
  '/products/:id/images/:imageId',
  requirePermission('products:write'),
  validate({ params: z.object({ id: objectId, imageId: objectId }), body: imageMeta }),
  async (req, res) => {
    const product = await Product.findById(req.valid.params.id);
    if (!product) throw notFound('Product not found.');
    const image = findImage(product, req.valid.params.imageId);
    if (!image) throw notFound('Image not found.');
    if (req.body.alt !== undefined) image.alt = req.body.alt;
    if (req.body.color !== undefined) image.color = req.body.color || undefined;
    await product.save();
    broadcastProductChanged(product);
    res.json({ product: productAdmin(product.toObject() as ProductLean) });
  },
);

router.delete('/products/:id/images/:imageId', requirePermission('products:write'), validate({ params: z.object({ id: objectId, imageId: objectId }) }), async (req, res) => {
  const product = await Product.findById(req.valid.params.id);
  if (!product) throw notFound('Product not found.');
  const image = findImage(product, req.valid.params.imageId);
  if (!image) throw notFound('Image not found.');
  if (product.status === 'published' && product.images.length === 1) {
    throw conflict('A published product needs at least one image. Upload a replacement or unpublish first.');
  }
  const files = { sm: image.files.sm, md: image.files.md, lg: image.files.lg };
  image.deleteOne();
  await product.save();
  await deleteImageFiles(files);
  await logActivity(req, 'product.images.delete', 'product', String(product._id), `Deleted an image from ${product.name}`);
  broadcastProductChanged(product);
  res.json({ product: productAdmin(product.toObject() as ProductLean) });
});

router.patch(
  '/products/:id/images-order',
  requirePermission('products:write'),
  validate({ params: z.object({ id: objectId }), body: z.object({ order: z.array(objectId).min(1).max(12) }) }),
  async (req, res) => {
    const product = await Product.findById(req.valid.params.id);
    if (!product) throw notFound('Product not found.');
    const order: string[] = req.body.order;
    if (order.length !== product.images.length || !order.every((id) => product.images.id(id))) {
      throw badRequest('The new order must include every image exactly once.');
    }
    order.forEach((id, idx) => {
      product.images.id(id)!.sortOrder = idx;
    });
    await product.save();
    broadcastProductChanged(product);
    res.json({ product: productAdmin(product.toObject() as ProductLean) });
  },
);

// ── Categories & brands ────────────────────────────────────────────────────
router.get('/categories', requirePermission('products:read'), async (_req, res) => {
  res.json({ categories: await Category.find().sort({ department: 1, sortOrder: 1, name: 1 }).lean() });
});

const categoryInput = z.object({
  name: z.string().trim().min(2).max(80),
  department: z.enum(DEPARTMENTS),
  description: z.string().trim().max(500).optional(),
  sortOrder: z.number().int().min(0).max(1000).default(0),
  isActive: z.boolean().default(true),
});

router.post('/categories', requirePermission('products:write'), validate({ body: categoryInput }), async (req, res) => {
  const category = await Category.create({ ...req.body, slug: slugify(req.body.name) });
  await logActivity(req, 'category.create', 'category', String(category._id), `Created category ${category.name}`);
  res.status(201).json({ category });
});

router.put('/categories/:id', requirePermission('products:write'), validate({ params: z.object({ id: objectId }), body: categoryInput }), async (req, res) => {
  const category = await Category.findById(req.valid.params.id);
  if (!category) throw notFound('Category not found.');
  category.set(req.body);
  await category.save();
  await Product.updateMany({ category: category._id }, { $set: { categoryName: category.name } });
  await logActivity(req, 'category.update', 'category', String(category._id), `Updated category ${category.name}`);
  res.json({ category });
});

router.delete('/categories/:id', requirePermission('products:write'), validate({ params: z.object({ id: objectId }) }), async (req, res) => {
  const inUse = await Product.countDocuments({ category: req.valid.params.id });
  if (inUse) throw conflict(`${inUse} product(s) use this category. Move them first.`);
  await Category.deleteOne({ _id: req.valid.params.id });
  await logActivity(req, 'category.delete', 'category', req.valid.params.id, 'Deleted a category');
  res.json({ ok: true });
});

router.get('/brands', requirePermission('products:read'), async (_req, res) => {
  res.json({ brands: await Brand.find().sort({ name: 1 }).lean() });
});

const brandInput = z.object({ name: z.string().trim().min(2).max(80), description: z.string().trim().max(500).optional(), isActive: z.boolean().default(true) });

router.post('/brands', requirePermission('products:write'), validate({ body: brandInput }), async (req, res) => {
  const brand = await Brand.create({ ...req.body, slug: slugify(req.body.name) });
  await logActivity(req, 'brand.create', 'brand', String(brand._id), `Created brand ${brand.name}`);
  res.status(201).json({ brand });
});

router.put('/brands/:id', requirePermission('products:write'), validate({ params: z.object({ id: objectId }), body: brandInput }), async (req, res) => {
  const brand = await Brand.findByIdAndUpdate(req.valid.params.id, { $set: req.body }, { returnDocument: 'after' });
  if (!brand) throw notFound('Brand not found.');
  await Product.updateMany({ brand: brand._id }, { $set: { brandName: brand.name } });
  res.json({ brand });
});

router.delete('/brands/:id', requirePermission('products:write'), validate({ params: z.object({ id: objectId }) }), async (req, res) => {
  const inUse = await Product.countDocuments({ brand: req.valid.params.id });
  if (inUse) throw conflict(`${inUse} product(s) use this brand.`);
  await Brand.deleteOne({ _id: req.valid.params.id });
  res.json({ ok: true });
});

export default router;

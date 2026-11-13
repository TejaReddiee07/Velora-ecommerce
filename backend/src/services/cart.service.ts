import { Types } from 'mongoose';
import type { Request, Response } from 'express';
import { Cart, type ICart } from '../models/Cart.js';
import { Product, sellingPrice, type IProduct } from '../models/Product.js';
import type { Currency } from '../models/common.js';
import type { IStoreSettings } from '../models/StoreSettings.js';
import { COOKIE_GUEST_CART, cookieOptions } from './session.service.js';
import { convert, getSettings, resolveCurrency } from './settings.service.js';
import { bestAutomaticPromotion, discountFor, validateCouponCode, type CouponDoc } from './coupon.service.js';
import { badRequest, notFound } from '../utils/errors.js';
import { randomToken } from '../utils/crypto.js';
import { AppError } from '../utils/errors.js';

const GUEST_CART_TTL_MS = 30 * 24 * 60 * 60 * 1000;
export const MAX_LINE_QTY = 10;

export type CartIdentity = { userId: Types.ObjectId } | { guestId: string };

export function cartIdentity(req: Request, res: Response, create: boolean): CartIdentity | null {
  if (req.user) return { userId: req.user._id };
  let guestId = req.cookies?.[COOKIE_GUEST_CART];
  if (typeof guestId !== 'string' || !/^[A-Za-z0-9_-]{20,64}$/.test(guestId)) guestId = undefined;
  if (!guestId) {
    if (!create) return null;
    guestId = randomToken(24);
    res.cookie(COOKIE_GUEST_CART, guestId, cookieOptions(GUEST_CART_TTL_MS));
  }
  return { guestId };
}

function filterFor(identity: CartIdentity) {
  return 'userId' in identity ? { user: identity.userId } : { guestId: identity.guestId };
}

export async function getCart(identity: CartIdentity | null) {
  if (!identity) return null;
  return Cart.findOne(filterFor(identity));
}

export async function getOrCreateCart(identity: CartIdentity) {
  const filter = filterFor(identity);
  const update =
    'guestId' in identity
      ? { $setOnInsert: { ...filter, items: [] }, $set: { expiresAt: new Date(Date.now() + GUEST_CART_TTL_MS) } }
      : { $setOnInsert: { ...filter, items: [] } };
  return (await Cart.findOneAndUpdate(filter, update, { upsert: true, returnDocument: 'after' }))!;
}

type ProductLean = IProduct & { _id: Types.ObjectId };

export async function addToCart(identity: CartIdentity, productId: Types.ObjectId, variantId: Types.ObjectId, quantity: number) {
  const product = await Product.findOne({ _id: productId, status: 'published' }).lean<ProductLean>();
  if (!product) throw notFound('This product is no longer available.');
  const variant = product.variants.find((v) => String(v._id) === String(variantId));
  if (!variant || !variant.isActive) throw badRequest('Please choose an available size and colour.');
  if (variant.available <= 0) throw new AppError(409, 'OUT_OF_STOCK', 'This size and colour is out of stock.');

  const cart = await getOrCreateCart(identity);
  const existing = cart.items.find((i) => String(i.variant) === String(variantId));
  const desired = Math.min(MAX_LINE_QTY, (existing?.quantity ?? 0) + quantity);
  if (desired > variant.available) {
    throw new AppError(409, 'INSUFFICIENT_STOCK', `Only ${variant.available} left in this size and colour.`, {
      available: variant.available,
    });
  }
  if (existing) existing.quantity = desired;
  else cart.items.push({ product: product._id, variant: variant._id, quantity: desired, addedAt: new Date() });
  await cart.save();
  return cart;
}

export async function updateCartItem(identity: CartIdentity, itemId: Types.ObjectId, quantity: number) {
  const cart = await getOrCreateCart(identity);
  const item = cart.items.id(itemId);
  if (!item) throw notFound('Item not found in your bag.');
  if (quantity <= 0) {
    item.deleteOne();
  } else {
    const product = await Product.findById(item.product).lean<ProductLean>();
    const variant = product?.variants.find((v) => String(v._id) === String(item.variant));
    if (!product || !variant) throw notFound('This product is no longer available.');
    if (quantity > variant.available) {
      throw new AppError(409, 'INSUFFICIENT_STOCK', `Only ${variant.available} left in this size and colour.`, {
        available: variant.available,
      });
    }
    item.quantity = Math.min(MAX_LINE_QTY, quantity);
  }
  await cart.save();
  return cart;
}

export async function removeCartItem(identity: CartIdentity, itemId: Types.ObjectId) {
  const cart = await getOrCreateCart(identity);
  const item = cart.items.id(itemId);
  if (item) {
    item.deleteOne();
    await cart.save();
  }
  return cart;
}

/** Moves a guest bag into the customer's bag after sign-in. */
export async function mergeGuestCart(guestId: string | undefined, userId: Types.ObjectId) {
  if (!guestId) return;
  const guest = await Cart.findOne({ guestId });
  if (!guest || !guest.items.length) return;
  const cart = await getOrCreateCart({ userId });
  for (const gi of guest.items) {
    const existing = cart.items.find((i) => String(i.variant) === String(gi.variant));
    if (existing) existing.quantity = Math.min(MAX_LINE_QTY, existing.quantity + gi.quantity);
    else cart.items.push({ product: gi.product, variant: gi.variant, quantity: gi.quantity, addedAt: gi.addedAt });
  }
  if (!cart.couponCode && guest.couponCode) cart.couponCode = guest.couponCode;
  await cart.save();
  await Cart.deleteOne({ _id: guest._id });
}

// ── Pricing ────────────────────────────────────────────────────────────────

export interface PricedLine {
  itemId: string;
  productId: string;
  variantId: string;
  name: string;
  slug: string;
  brandName: string;
  department: string;
  categorySlug: string;
  categoryName: string;
  image: string | null;
  sku: string;
  size: string;
  color: string;
  colorHex: string;
  quantity: number;
  available: number;
  unitPrice: number;
  originalUnitPrice: number;
  lineTotal: number;
  unitPriceBase: number;
  unitCost: number | null;
  issue: null | 'unavailable' | 'insufficient_stock';
}

export interface PricedCart {
  currency: Currency;
  fxRate: number;
  lines: PricedLine[];
  itemCount: number;
  subtotal: number;
  discount: { amount: number; code: string | null; label: string | null; type: 'percentage' | 'fixed' | null; value: number | null; couponId: string | null; automatic: boolean };
  couponError: string | null;
  delivery: { methodId: string; name: string; etaDays: string; price: number; freeOver: number | null };
  deliveryOptions: { id: string; name: string; description?: string; etaDays: string; price: number; freeOver: number | null }[];
  tax: { enabled: boolean; inclusive: boolean; rate: number; label: string; amount: number };
  total: number;
  hasIssues: boolean;
}

function lineImage(p: ProductLean, color: string) {
  const sorted = [...p.images].sort((a, b) => a.sortOrder - b.sortOrder);
  const img = sorted.find((i) => i.color && i.color === color) ?? sorted[0];
  return img ? String(img.files.sm) : null;
}

/**
 * Prices a set of cart lines entirely from the database. The client never
 * supplies prices; this is reused by the checkout to build the order.
 */
export async function priceItems(
  items: { _id: Types.ObjectId; product: Types.ObjectId; variant: Types.ObjectId; quantity: number }[],
  opts: { currency?: string | null; couponCode?: string | null; deliveryMethodId?: string | null; userId?: Types.ObjectId | null },
  settingsArg?: IStoreSettings,
): Promise<PricedCart> {
  const settings = settingsArg ?? (await getSettings());
  const currency = resolveCurrency(settings, opts.currency);
  const fxRate = currency === settings.currency.base ? 1 : Number(settings.currency.rates[currency]);

  const productIds = [...new Set(items.map((i) => String(i.product)))].map((id) => new Types.ObjectId(id));
  const products = await Product.find({ _id: { $in: productIds } }).lean<ProductLean[]>();
  const byId = new Map(products.map((p) => [String(p._id), p]));

  const lines: PricedLine[] = [];
  let subtotalBase = 0;
  for (const item of items) {
    const p = byId.get(String(item.product));
    const v = p?.variants.find((x) => String(x._id) === String(item.variant));
    if (!p || !v) continue; // product deleted — silently dropped from the bag view
    const unitBase = sellingPrice(p);
    const unit = convert(settings, unitBase, currency);
    const original = convert(settings, p.price, currency);
    const purchasable = p.status === 'published' && v.isActive;
    const issue: PricedLine['issue'] = !purchasable || v.available <= 0 ? 'unavailable' : item.quantity > v.available ? 'insufficient_stock' : null;
    if (!issue) subtotalBase += unitBase * item.quantity;
    lines.push({
      itemId: String(item._id),
      productId: String(p._id),
      variantId: String(v._id),
      name: p.name,
      slug: p.slug,
      brandName: p.brandName,
      department: p.department,
      categorySlug: p.categorySlug,
      categoryName: p.categoryName,
      image: lineImage(p, v.color),
      sku: v.sku,
      size: v.size,
      color: v.color,
      colorHex: v.colorHex,
      quantity: item.quantity,
      available: purchasable ? v.available : 0,
      unitPrice: unit,
      originalUnitPrice: original,
      lineTotal: unit * item.quantity,
      unitPriceBase: unitBase,
      unitCost: p.costPrice ?? null,
      issue,
    });
  }

  const valid = lines.filter((l) => !l.issue);
  const subtotal = valid.reduce((s, l) => s + l.lineTotal, 0);

  // Discounts: an entered code or the best automatic promotion (no stacking).
  let couponError: string | null = null;
  let applied: CouponDoc | null = null;
  if (opts.couponCode) {
    try {
      applied = await validateCouponCode(opts.couponCode, subtotalBase, opts.userId);
    } catch (err) {
      couponError = err instanceof Error ? err.message : 'Invalid code.';
    }
  }
  const auto = await bestAutomaticPromotion(subtotalBase);
  const valueOf = (c: CouponDoc | null) =>
    c ? discountFor(c, subtotal, c.type === 'fixed' ? convert(settings, c.value, currency) : undefined) : 0;
  let chosen = applied;
  if (auto && valueOf(auto) > valueOf(applied)) chosen = auto;
  const discountAmount = valueOf(chosen);

  // Delivery
  const methods = (settings.delivery ?? []).filter((m) => m.isActive);
  const discountedBase = Math.max(0, subtotalBase - Math.round(discountAmount / fxRate));
  const deliveryOptions = methods.map((m) => ({
    id: m.id,
    name: m.name,
    description: m.description,
    etaDays: m.etaDays,
    price: m.freeOver != null && discountedBase >= m.freeOver ? 0 : convert(settings, m.price, currency),
    freeOver: m.freeOver != null ? convert(settings, m.freeOver, currency) : null,
  }));
  const selected = deliveryOptions.find((m) => m.id === opts.deliveryMethodId) ?? deliveryOptions[0];
  if (!selected) throw new AppError(503, 'NO_DELIVERY', 'No delivery methods are configured.');
  const shipping = valid.length ? selected.price : 0;

  // Tax
  const taxable = Math.max(0, subtotal - discountAmount) + shipping;
  const t = settings.tax;
  let taxAmount = 0;
  if (t.enabled && t.rate > 0) {
    taxAmount = t.inclusive ? Math.round((taxable * t.rate) / (100 + t.rate)) : Math.round((taxable * t.rate) / 100);
  }
  const total = taxable + (t.enabled && !t.inclusive ? taxAmount : 0);

  return {
    currency,
    fxRate,
    lines,
    itemCount: valid.reduce((s, l) => s + l.quantity, 0),
    subtotal,
    discount: {
      amount: discountAmount,
      code: chosen?.code ?? null,
      label: chosen ? chosen.description || chosen.code : null,
      type: chosen?.type ?? null,
      value: chosen?.value ?? null,
      couponId: chosen ? String(chosen._id) : null,
      automatic: chosen?.kind === 'automatic',
    },
    couponError,
    delivery: { methodId: selected.id, name: selected.name, etaDays: selected.etaDays, price: shipping, freeOver: selected.freeOver },
    deliveryOptions,
    tax: { enabled: t.enabled, inclusive: t.inclusive, rate: t.rate, label: t.label, amount: taxAmount },
    total,
    hasIssues: lines.some((l) => l.issue),
  };
}

export async function priceCart(
  cart: Pick<ICart, 'items' | 'couponCode'> | null,
  currency: string | null | undefined,
  userId?: Types.ObjectId | null,
  deliveryMethodId?: string | null,
) {
  return priceItems(cart?.items ?? [], { currency, couponCode: cart?.couponCode, userId, deliveryMethodId });
}

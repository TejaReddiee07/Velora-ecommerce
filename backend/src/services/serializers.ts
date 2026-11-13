import type { Types } from 'mongoose';
import type { IProduct, IProductImage } from '../models/Product.js';
import type { IStoreSettings } from '../models/StoreSettings.js';
import type { Currency } from '../models/common.js';
import { convert } from './settings.service.js';

type ProductLean = IProduct & { _id: Types.ObjectId };

export function imageView(img: IProductImage) {
  return {
    id: String(img._id),
    sm: String(img.files.sm),
    md: String(img.files.md),
    lg: String(img.files.lg),
    width: img.width,
    height: img.height,
    alt: img.alt,
    color: img.color ?? null,
  };
}

function sortedImages(p: ProductLean) {
  return [...(p.images ?? [])].sort((a, b) => a.sortOrder - b.sortOrder);
}

function pricing(p: ProductLean, settings: IStoreSettings, currency: Currency) {
  const onSale = p.salePrice != null && p.salePrice < p.price;
  const price = convert(settings, onSale ? p.salePrice! : p.price, currency);
  const compareAt = onSale ? convert(settings, p.price, currency) : null;
  return {
    price,
    compareAtPrice: compareAt,
    discountPercent: onSale ? Math.round(((p.price - p.salePrice!) / p.price) * 100) : 0,
    currency,
  };
}

/** Public product card — no cost price, no reserved counts. */
export function productCard(p: ProductLean, settings: IStoreSettings, currency: Currency) {
  const images = sortedImages(p);
  return {
    _id: String(p._id),
    name: p.name,
    slug: p.slug,
    brandName: p.brandName,
    department: p.department,
    gender: p.gender,
    categorySlug: p.categorySlug,
    categoryName: p.categoryName,
    styles: p.styles,
    ...pricing(p, settings, currency),
    images: images.slice(0, 2).map(imageView),
    colors: p.colors,
    sizes: p.sizes,
    inStock: p.totalAvailable > 0,
    totalAvailable: p.totalAvailable,
    lowStock: p.totalAvailable > 0 && p.totalAvailable <= p.lowStockThreshold,
    ratingAvg: p.ratingAvg,
    ratingCount: p.ratingCount,
    isFeatured: p.isFeatured,
    isNewArrival: p.isNewArrival,
    isBestSeller: p.isBestSeller,
    showroom: Boolean(p.showroom),
    publishedAt: p.publishedAt,
  };
}

export function productDetail(p: ProductLean, settings: IStoreSettings, currency: Currency) {
  return {
    ...productCard(p, settings, currency),
    description: p.description,
    shortDescription: p.shortDescription ?? null,
    tags: p.tags,
    specifications: p.specifications,
    sizeGuide: p.sizeGuide,
    images: sortedImages(p).map(imageView),
    variants: p.variants.map((v) => ({
      _id: String(v._id),
      sku: v.sku,
      size: v.size,
      color: v.color,
      colorHex: v.colorHex,
      available: v.isActive ? v.available : 0,
      isActive: v.isActive,
    })),
  };
}

/** Full admin view including stock internals and cost. */
export function productAdmin(p: ProductLean) {
  return {
    ...p,
    _id: String(p._id),
    category: String(p.category),
    brand: String(p.brand),
    images: sortedImages(p).map(imageView),
    variants: p.variants.map((v) => ({ ...v, _id: String(v._id) })),
  };
}

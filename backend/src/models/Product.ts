import { Schema, model, type Types, type HydratedDocument } from 'mongoose';
import { DEPARTMENTS, GENDERS, STYLES, type Department, type Gender, type Style } from './common.js';

export interface IProductImage {
  _id: Types.ObjectId;
  /** GridFS ids of the stored renditions (all WebP). */
  files: { sm: Types.ObjectId; md: Types.ObjectId; lg: Types.ObjectId };
  width: number;
  height: number;
  alt: string;
  color?: string;
  sortOrder: number;
}

/**
 * Inventory lives on the variant (one per size × colour, unique SKU).
 * Invariant maintained by every write path: available = stock - reserved, all ≥ 0.
 *  - stock:     physical units on hand
 *  - reserved:  units held by open checkouts (released on expiry/failure)
 *  - available: units a customer can still buy
 */
export interface IVariant {
  _id: Types.ObjectId;
  sku: string;
  size: string;
  color: string;
  colorHex: string;
  stock: number;
  reserved: number;
  available: number;
  isActive: boolean;
}

export interface ISpec {
  label: string;
  value: string;
}

export interface IProduct {
  name: string;
  slug: string;
  description: string;
  shortDescription?: string;
  department: Department;
  gender: Gender;
  category: Types.ObjectId;
  categorySlug: string;
  categoryName: string;
  brand: Types.ObjectId;
  brandName: string;
  styles: Style[];
  tags: string[];
  /** Regular price in base-currency minor units (e.g. pence). */
  price: number;
  /** Optional discounted selling price in base-currency minor units. */
  salePrice?: number | null;
  /** Unit cost for profit reporting (base-currency minor units). */
  costPrice?: number | null;
  /** Denormalised selling price (salePrice ?? price) for filtering and sorting. */
  effectivePrice: number;
  images: Types.DocumentArray<IProductImage & Types.Subdocument>;
  variants: Types.DocumentArray<IVariant & Types.Subdocument>;
  specifications: ISpec[];
  sizeGuide: 'tops' | 'bottoms' | 'dresses' | 'footwear' | 'none';
  status: 'draft' | 'published' | 'archived';
  isFeatured: boolean;
  isNewArrival: boolean;
  isBestSeller: boolean;
  /** Shown on a hanger in the 3D showroom (/showroom). */
  showroom: boolean;
  lowStockThreshold: number;
  // Denormalised for fast listing/filtering; recomputed on every inventory write.
  totalStock: number;
  totalAvailable: number;
  sizes: string[];
  colors: { name: string; hex: string }[];
  soldCount: number;
  ratingAvg: number;
  ratingCount: number;
  publishedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const imageSchema = new Schema<IProductImage>({
  files: {
    sm: { type: Schema.Types.ObjectId, required: true },
    md: { type: Schema.Types.ObjectId, required: true },
    lg: { type: Schema.Types.ObjectId, required: true },
  },
  width: { type: Number, required: true },
  height: { type: Number, required: true },
  alt: { type: String, default: '', maxlength: 200 },
  color: { type: String, maxlength: 40 },
  sortOrder: { type: Number, default: 0 },
});

const variantSchema = new Schema<IVariant>({
  sku: { type: String, required: true, uppercase: true, trim: true, maxlength: 64 },
  size: { type: String, required: true, trim: true, maxlength: 20 },
  color: { type: String, required: true, trim: true, maxlength: 40 },
  colorHex: { type: String, default: '#111111', match: /^#[0-9a-fA-F]{6}$/ },
  stock: { type: Number, required: true, min: 0, default: 0 },
  reserved: { type: Number, required: true, min: 0, default: 0 },
  available: { type: Number, required: true, min: 0, default: 0 },
  isActive: { type: Boolean, default: true },
});

const productSchema = new Schema<IProduct>(
  {
    name: { type: String, required: true, trim: true, maxlength: 140 },
    slug: { type: String, required: true, lowercase: true, trim: true, unique: true },
    description: { type: String, required: true, maxlength: 5000 },
    shortDescription: { type: String, maxlength: 300 },
    department: { type: String, enum: DEPARTMENTS, required: true },
    gender: { type: String, enum: GENDERS, required: true },
    category: { type: Schema.Types.ObjectId, ref: 'Category', required: true },
    categorySlug: { type: String, required: true },
    categoryName: { type: String, required: true },
    brand: { type: Schema.Types.ObjectId, ref: 'Brand', required: true },
    brandName: { type: String, required: true },
    styles: [{ type: String, enum: STYLES }],
    tags: [{ type: String, lowercase: true, trim: true }],
    price: { type: Number, required: true, min: 0 },
    salePrice: { type: Number, min: 0, default: null },
    costPrice: { type: Number, min: 0, default: null },
    effectivePrice: { type: Number, default: 0 },
    images: [imageSchema],
    variants: [variantSchema],
    specifications: [{ _id: false, label: { type: String, required: true }, value: { type: String, required: true } }],
    sizeGuide: { type: String, enum: ['tops', 'bottoms', 'dresses', 'footwear', 'none'], default: 'none' },
    status: { type: String, enum: ['draft', 'published', 'archived'], default: 'draft' },
    isFeatured: { type: Boolean, default: false },
    isNewArrival: { type: Boolean, default: false },
    isBestSeller: { type: Boolean, default: false },
    showroom: { type: Boolean, default: false },
    lowStockThreshold: { type: Number, default: 5, min: 0 },
    totalStock: { type: Number, default: 0 },
    totalAvailable: { type: Number, default: 0 },
    sizes: [String],
    colors: [{ _id: false, name: String, hex: String }],
    soldCount: { type: Number, default: 0 },
    ratingAvg: { type: Number, default: 0 },
    ratingCount: { type: Number, default: 0 },
    publishedAt: Date,
  },
  { timestamps: true },
);

productSchema.index({ status: 1, department: 1, gender: 1, createdAt: -1 });
productSchema.index({ status: 1, categorySlug: 1 });
productSchema.index({ status: 1, showroom: 1 });
productSchema.index({ status: 1, effectivePrice: 1 });

/** Keeps denormalised fields consistent on every document save. */
productSchema.pre('save', function () {
  this.effectivePrice = sellingPrice(this);
  const sizes: string[] = [];
  const colors: { name: string; hex: string }[] = [];
  let totalStock = 0;
  let totalAvailable = 0;
  for (const v of this.variants) {
    v.available = Math.max(0, v.stock - v.reserved);
    totalStock += v.stock;
    if (v.isActive) totalAvailable += v.available;
    if (!sizes.includes(v.size)) sizes.push(v.size);
    if (!colors.some((c) => c.name === v.color)) colors.push({ name: v.color, hex: v.colorHex });
  }
  this.sizes = sizes;
  this.colors = colors;
  this.totalStock = totalStock;
  this.totalAvailable = totalAvailable;
  if (this.status === 'published' && !this.publishedAt) this.publishedAt = new Date();
});
productSchema.index({ status: 1, soldCount: -1 });
productSchema.index({ 'variants._id': 1 });
productSchema.index({ 'variants.sku': 1 }, { unique: true, sparse: true });
productSchema.index(
  { name: 'text', brandName: 'text', categoryName: 'text', tags: 'text', description: 'text' },
  { weights: { name: 10, brandName: 5, categoryName: 5, tags: 4, description: 1 }, name: 'product_text' },
);

/** Effective selling price in base-currency minor units. */
export function sellingPrice(p: Pick<IProduct, 'price' | 'salePrice'>) {
  return p.salePrice != null && p.salePrice < p.price ? p.salePrice : p.price;
}

export const Product = model<IProduct>('Product', productSchema);
export type ProductDoc = HydratedDocument<IProduct>;

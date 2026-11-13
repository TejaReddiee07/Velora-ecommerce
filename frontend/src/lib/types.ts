export type Currency = 'GBP' | 'USD';
export type Department = 'clothing' | 'footwear' | 'accessories';

export interface ImageRef {
  id: string;
  sm: string;
  md: string;
  lg: string;
  width: number;
  height: number;
  alt: string;
  color: string | null;
}

export interface ProductCard {
  _id: string;
  name: string;
  slug: string;
  brandName: string;
  department: Department;
  gender: 'men' | 'women' | 'unisex';
  categorySlug: string;
  categoryName: string;
  styles: string[];
  price: number;
  compareAtPrice: number | null;
  discountPercent: number;
  currency: Currency;
  images: ImageRef[];
  colors: { name: string; hex: string }[];
  sizes: string[];
  inStock: boolean;
  totalAvailable: number;
  lowStock: boolean;
  ratingAvg: number;
  ratingCount: number;
  isFeatured: boolean;
  isNewArrival: boolean;
  isBestSeller: boolean;
  /** Shown on a hanger in the 3D showroom. */
  showroom?: boolean;
  publishedAt?: string;
}

export interface Variant {
  _id: string;
  sku: string;
  size: string;
  color: string;
  colorHex: string;
  available: number;
  isActive: boolean;
}

export interface ProductDetail extends ProductCard {
  description: string;
  shortDescription: string | null;
  tags: string[];
  specifications: { label: string; value: string }[];
  sizeGuide: 'tops' | 'bottoms' | 'dresses' | 'footwear' | 'none';
  variants: Variant[];
}

export interface Facets {
  categories: { slug: string; name: string; count: number }[];
  sizes: { value: string; count: number }[];
  colors: { name: string; hex: string; count: number }[];
  brands: { name: string; count: number }[];
  styles: { value: string; count: number }[];
  price: { min: number; max: number };
}

export interface ProductList {
  items: ProductCard[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  currency: Currency;
  facets?: Facets;
}

export interface Rendition {
  sm: string;
  md: string;
  lg: string;
}

export interface Banner {
  _id: string;
  placement: 'hero' | 'promo' | 'collection';
  eyebrow?: string;
  title: string;
  subtitle?: string;
  ctaLabel?: string;
  ctaHref?: string;
  image: Rendition | null;
}

export interface PublicSettings {
  storeName: string;
  tagline: string;
  logo: Rendition | null;
  contact: { email: string; phone: string; address: string };
  currency: { base: Currency; enabled: Currency[] };
  tax: { enabled: boolean; inclusive: boolean; rate: number; label: string };
  delivery: { id: string; name: string; description?: string; etaDays: string; price: number; freeOver: number | null }[];
  returnPolicy: string;
  announcement: { enabled: boolean; text: string; link?: string };
  banners: Banner[];
  social: Record<string, string | undefined>;
  stripeEnabled: boolean;
}

export interface CartLine {
  itemId: string;
  productId: string;
  variantId: string;
  name: string;
  slug: string;
  brandName: string;
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
  issue: null | 'unavailable' | 'insufficient_stock';
}

export interface Cart {
  currency: Currency;
  lines: CartLine[];
  itemCount: number;
  subtotal: number;
  discount: { amount: number; code: string | null; label: string | null; automatic: boolean };
  couponCode: string | null;
  couponError: string | null;
  delivery: { methodId: string; name: string; etaDays: string; price: number; freeOver: number | null };
  deliveryOptions: { id: string; name: string; description?: string; etaDays: string; price: number; freeOver: number | null }[];
  tax: { enabled: boolean; inclusive: boolean; rate: number; label: string; amount: number };
  total: number;
  hasIssues: boolean;
}

export interface User {
  _id: string;
  name: string;
  email: string;
  emailVerified: boolean;
  phone: string | null;
  marketingOptIn: boolean;
  createdAt?: string;
}

export interface Address {
  _id: string;
  label?: string;
  fullName: string;
  phone?: string;
  line1: string;
  line2?: string;
  city: string;
  state?: string;
  postalCode: string;
  country: string;
  isDefault: boolean;
  /** Set by the API: false when we can't deliver to this saved address (UK only). */
  deliverable?: boolean;
  deliveryIssue?: string | null;
}

export interface OrderItem {
  _id: string;
  productId: string;
  name: string;
  slug: string;
  image: string | null;
  size: string;
  color: string;
  sku: string;
  unitPrice: number;
  quantity: number;
  lineTotal: number;
}

export interface CustomerOrder {
  _id: string;
  orderNumber: string;
  status: string;
  paymentStatus: string;
  currency: Currency;
  items: OrderItem[];
  subtotal: number;
  discountTotal: number;
  shippingTotal: number;
  taxTotal: number;
  taxInclusive: boolean;
  total: number;
  refundedTotal: number;
  coupon: { code: string } | null;
  shippingAddress: Omit<Address, '_id' | 'isDefault' | 'label'>;
  delivery: { methodId: string; name: string; etaDays: string; price: number };
  tracking: { carrier?: string; number?: string; url?: string } | null;
  history: { status: string; message: string; at: string }[];
  payment: { method: string | null; brand: string | null; last4: string | null } | null;
  createdAt: string;
  paidAt: string | null;
  shippedAt: string | null;
  deliveredAt: string | null;
}

export interface Category {
  _id: string;
  name: string;
  slug: string;
  department: Department;
  description?: string;
  productCount: number;
}

export interface AppNotification {
  _id: string;
  type: string;
  title: string;
  message: string;
  link?: string;
  readAt: string | null;
  createdAt: string;
}

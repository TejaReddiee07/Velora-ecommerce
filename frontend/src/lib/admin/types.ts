import type { Currency, ImageRef } from '@/lib/types';

export type Permission =
  | 'products:read'
  | 'products:write'
  | 'inventory:write'
  | 'orders:read'
  | 'orders:write'
  | 'orders:refund'
  | 'customers:read'
  | 'customers:write'
  | 'promotions:write'
  | 'analytics:read'
  | 'settings:write'
  | 'staff:manage'
  | 'audit:read';

export interface AdminUser {
  _id: string;
  name: string;
  email: string;
  role: 'owner' | 'manager' | 'staff';
  permissions: Permission[];
}

export interface Paged<T> {
  items: T[];
  total: number;
  page: number;
  totalPages: number;
}

export interface Financials {
  orders: number;
  unitsSold: number;
  grossSales: number;
  discounts: number;
  deliveryCharges: number;
  taxes: number;
  totalCollected: number;
  refunds: number;
  refundCount: number;
  netRevenue: number;
  averageOrderValue: number;
  costOfGoods: number | null;
  grossProfit: number | null;
  costCoverage: number;
  byCurrency: { currency: string; orders: number; collected: number; refunded: number }[];
}

export interface Overview {
  baseCurrency: Currency;
  revenue: { today: number; week: number; month: number; year: number; allTime: number };
  windows: Record<'today' | 'week' | 'month' | 'year' | 'allTime', Financials>;
  period: Financials | null;
  orders: {
    total: number;
    pendingPayment: number;
    awaitingFulfilment: number;
    inTransit: number;
    completed: number;
    cancelled: number;
    refunded: number;
    byStatus: Record<string, number>;
  };
  customers: { total: number; newThisMonth: number };
  products: { total: number; active: number; outOfStock: number; lowStockProducts: number; lowStockVariants: number; outOfStockVariants: number };
  recentTransactions: {
    _id: string;
    orderId: string | null;
    orderNumber: string | null;
    customerName: string | null;
    status: string;
    amount: number;
    amountRefunded: number;
    currency: Currency;
    method: string | null;
    last4: string | null;
    reference: string | null;
    createdAt: string;
  }[];
}

export interface RevenuePoint {
  period: string;
  orders: number;
  grossSales: number;
  discounts: number;
  delivery: number;
  taxes: number;
  refunds: number;
  netRevenue: number;
}

export interface RevenueResponse {
  granularity: 'day' | 'week' | 'month' | 'year';
  from: string;
  to: string;
  baseCurrency: Currency;
  series: RevenuePoint[];
  totals: Financials;
}

export interface ProductAnalytics {
  bestSellers: { productId: string; name: string; slug: string; image: string | null; units: number; revenue: number }[];
  byCategory: { category: string; units: number; revenue: number }[];
  byDepartment: { department: string; units: number; revenue: number }[];
  topCustomers: { userId: string; name: string; email: string; orders: number; spent: number }[];
}

export interface AdminVariant {
  _id: string;
  sku: string;
  size: string;
  color: string;
  colorHex: string;
  stock: number;
  reserved: number;
  available: number;
  isActive: boolean;
}

export interface AdminProduct {
  _id: string;
  name: string;
  slug: string;
  description: string;
  shortDescription?: string;
  department: 'clothing' | 'footwear' | 'accessories';
  gender: 'men' | 'women' | 'unisex';
  category: string;
  categorySlug: string;
  categoryName: string;
  brand: string;
  brandName: string;
  styles: string[];
  tags: string[];
  price: number;
  salePrice: number | null;
  costPrice: number | null;
  effectivePrice: number;
  images: ImageRef[];
  variants: AdminVariant[];
  specifications: { label: string; value: string }[];
  sizeGuide: 'tops' | 'bottoms' | 'dresses' | 'footwear' | 'none';
  status: 'draft' | 'published' | 'archived';
  isFeatured: boolean;
  isNewArrival: boolean;
  isBestSeller: boolean;
  showroom?: boolean;
  lowStockThreshold: number;
  totalStock: number;
  totalAvailable: number;
  soldCount: number;
  ratingAvg: number;
  ratingCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface AdminCategory {
  _id: string;
  name: string;
  slug: string;
  department: 'clothing' | 'footwear' | 'accessories';
  description?: string;
  sortOrder: number;
  isActive: boolean;
}

export interface AdminBrand {
  _id: string;
  name: string;
  slug: string;
  description?: string;
  isActive: boolean;
}

export interface InventoryRow {
  _id: string;
  productId: string;
  variantId: string;
  name: string;
  slug: string;
  status: string;
  brandName: string;
  lowStockThreshold: number;
  image: string | null;
  sku: string;
  size: string;
  color: string;
  colorHex: string;
  stock: number;
  reserved: number;
  available: number;
  isActive: boolean;
}

export interface StockMovement {
  _id: string;
  product: string;
  variant: string;
  sku: string;
  type: string;
  stockDelta: number;
  reservedDelta: number;
  stockAfter?: number;
  availableAfter?: number;
  order?: string | null;
  actor: { type: string; id?: string; name?: string };
  note?: string;
  createdAt: string;
}

export interface OrderListItem {
  _id: string;
  orderNumber: string;
  customerName: string;
  email: string;
  status: string;
  paymentStatus: string;
  total: number;
  refundedTotal: number;
  currency: Currency;
  itemCount: number;
  stockConflict: boolean;
  createdAt: string;
  paidAt: string | null;
}

export interface AdminOrder {
  _id: string;
  orderNumber: string;
  user: string;
  email: string;
  customerName: string;
  phone?: string;
  items: {
    _id: string;
    product: string;
    variant: string;
    sku: string;
    name: string;
    slug: string;
    image: string | null;
    size: string;
    color: string;
    unitPrice: number;
    originalUnitPrice: number;
    quantity: number;
    lineTotal: number;
    unitCost?: number | null;
    restocked: number;
  }[];
  currency: Currency;
  fxRate: number;
  baseCurrency: Currency;
  subtotal: number;
  discountTotal: number;
  shippingTotal: number;
  taxTotal: number;
  taxInclusive: boolean;
  total: number;
  refundedTotal: number;
  coupon?: { code: string; type: string; value: number } | null;
  shippingAddress: { fullName: string; phone?: string; line1: string; line2?: string; city: string; state?: string; postalCode: string; country: string };
  delivery: { methodId: string; name: string; etaDays: string; price: number };
  status: string;
  paymentStatus: string;
  reservation: { status: string; expiresAt: string };
  stripe: { checkoutSessionId?: string; paymentIntentId?: string };
  tracking?: { carrier?: string; number?: string; url?: string } | null;
  notes?: string;
  stockConflict: boolean;
  history: { status: string; message: string; actor: { type: string; name?: string }; at: string }[];
  paidAt?: string | null;
  cancelledAt?: string | null;
  shippedAt?: string | null;
  deliveredAt?: string | null;
  createdAt: string;
}

export interface AdminPayment {
  _id: string;
  status: string;
  amount: number;
  currency: Currency;
  checkoutSessionId?: string;
  paymentIntentId?: string;
  chargeId?: string;
  paymentMethodType?: string;
  cardBrand?: string;
  cardLast4?: string;
  wallet?: string;
  amountRefunded: number;
  refunds: { stripeRefundId: string; amount: number; reason?: string; status: string; restocked: boolean; createdBy: { name?: string; type: string }; createdAt: string }[];
  failureMessage?: string;
  paidAt?: string;
  createdAt: string;
}

export interface OrderDetailResponse {
  order: AdminOrder;
  payment: AdminPayment | null;
  customer: { _id: string; name: string; email: string; createdAt: string; status: string; paidOrders: number } | null;
  allowedStatuses: string[];
}

export interface CustomerRow {
  _id: string;
  name: string;
  email: string;
  status: 'active' | 'suspended';
  emailVerified: boolean;
  createdAt: string;
  lastLoginAt?: string;
  orderCount: number;
  totalSpent: number;
  lastOrderAt?: string;
}

export interface Coupon {
  _id: string;
  code: string;
  description?: string;
  kind: 'code' | 'automatic';
  type: 'percentage' | 'fixed';
  value: number;
  minOrderValue: number;
  startsAt?: string | null;
  expiresAt?: string | null;
  usageLimit?: number | null;
  usageCount: number;
  perUserLimit?: number | null;
  isActive: boolean;
  createdAt: string;
}

export interface Rendition {
  sm: string;
  md: string;
  lg: string;
}

export interface AdminBanner {
  _id: string;
  placement: 'hero' | 'promo' | 'collection';
  eyebrow?: string;
  title: string;
  subtitle?: string;
  ctaLabel?: string;
  ctaHref?: string;
  image: Rendition | null;
  isActive: boolean;
  sortOrder: number;
}

export interface StoreSettingsDoc {
  storeName: string;
  tagline: string;
  logo: Rendition | null;
  contact: { email: string; phone: string; address: string };
  currency: { base: Currency; enabled: Currency[]; rates: Record<string, number>; rounding: 'none' | 'whole' };
  tax: { enabled: boolean; rate: number; inclusive: boolean; label: string };
  delivery: { id: string; name: string; description?: string; price: number; freeOver?: number | null; etaDays: string; isActive: boolean }[];
  returnPolicy: string;
  announcement: { enabled: boolean; text: string; link?: string };
  banners: AdminBanner[];
  social: { instagram?: string; tiktok?: string; x?: string; facebook?: string; pinterest?: string; youtube?: string };
  lowStockThreshold: number;
}

export interface StaffMember {
  _id: string;
  name: string;
  email: string;
  role: 'owner' | 'manager' | 'staff';
  status: 'active' | 'disabled';
  lastLoginAt?: string;
  createdAt: string;
}

export interface ActivityEntry {
  _id: string;
  actor: { type: string; id?: string; name?: string; email?: string };
  action: string;
  entityType: string;
  entityId?: string;
  summary: string;
  ip?: string;
  createdAt: string;
}

export interface AdminNotification {
  _id: string;
  type: string;
  title: string;
  message: string;
  link?: string;
  readAt: string | null;
  createdAt: string;
}

import { Schema, model, type Types, type HydratedDocument } from 'mongoose';
import {
  ORDER_STATUSES,
  PAYMENT_STATUSES,
  CURRENCIES,
  actorSchema,
  addressSnapshotSchema,
  type Actor,
  type AddressSnapshot,
  type Currency,
  type OrderStatus,
  type PaymentStatus,
} from './common.js';

/** Snapshot of the purchased item — never changes when the product is edited later. */
export interface IOrderItem {
  _id: Types.ObjectId;
  product: Types.ObjectId;
  variant: Types.ObjectId;
  sku: string;
  name: string;
  slug: string;
  image?: Types.ObjectId | null;
  size: string;
  color: string;
  department: string;
  categorySlug: string;
  categoryName: string;
  brandName: string;
  /** Prices in the order currency (minor units). */
  unitPrice: number;
  originalUnitPrice: number;
  quantity: number;
  lineTotal: number;
  /** Unit cost in base currency (minor units), copied at purchase time when configured. */
  unitCost?: number | null;
  restocked: number;
}

export interface IOrderEvent {
  status: OrderStatus | 'note' | 'tracking' | 'refund' | 'payment';
  message: string;
  actor: Actor;
  at: Date;
}

export interface IOrder {
  orderNumber: string;
  user: Types.ObjectId;
  email: string;
  customerName: string;
  phone?: string;
  items: Types.DocumentArray<IOrderItem & Types.Subdocument>;
  currency: Currency;
  /** Units of `currency` per 1 unit of base currency at checkout (1 for base). */
  fxRate: number;
  baseCurrency: Currency;
  subtotal: number;
  discountTotal: number;
  shippingTotal: number;
  taxTotal: number;
  taxInclusive: boolean;
  total: number;
  refundedTotal: number;
  coupon?: { code: string; type: 'percentage' | 'fixed'; value: number; coupon: Types.ObjectId } | null;
  shippingAddress: AddressSnapshot;
  delivery: { methodId: string; name: string; etaDays: string; price: number };
  status: OrderStatus;
  paymentStatus: PaymentStatus;
  reservation: { status: 'active' | 'committed' | 'released'; expiresAt: Date };
  stripe: { checkoutSessionId?: string; paymentIntentId?: string };
  tracking?: { carrier?: string; number?: string; url?: string } | null;
  notes?: string;
  stockConflict: boolean;
  history: IOrderEvent[];
  paidAt?: Date | null;
  cancelledAt?: Date | null;
  shippedAt?: Date | null;
  deliveredAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const orderItemSchema = new Schema<IOrderItem>({
  product: { type: Schema.Types.ObjectId, ref: 'Product', required: true },
  variant: { type: Schema.Types.ObjectId, required: true },
  sku: { type: String, required: true },
  name: { type: String, required: true },
  slug: { type: String, required: true },
  image: { type: Schema.Types.ObjectId, default: null },
  size: { type: String, required: true },
  color: { type: String, required: true },
  department: { type: String, required: true },
  categorySlug: { type: String, required: true },
  categoryName: { type: String, required: true },
  brandName: { type: String, required: true },
  unitPrice: { type: Number, required: true, min: 0 },
  originalUnitPrice: { type: Number, required: true, min: 0 },
  quantity: { type: Number, required: true, min: 1 },
  lineTotal: { type: Number, required: true, min: 0 },
  unitCost: { type: Number, default: null },
  restocked: { type: Number, default: 0 },
});

const orderSchema = new Schema<IOrder>(
  {
    orderNumber: { type: String, required: true, unique: true },
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    email: { type: String, required: true },
    customerName: { type: String, required: true },
    phone: String,
    items: { type: [orderItemSchema], validate: (v: unknown[]) => v.length > 0 },
    currency: { type: String, enum: CURRENCIES, required: true },
    fxRate: { type: Number, required: true, min: 0 },
    baseCurrency: { type: String, enum: CURRENCIES, required: true },
    subtotal: { type: Number, required: true, min: 0 },
    discountTotal: { type: Number, default: 0, min: 0 },
    shippingTotal: { type: Number, default: 0, min: 0 },
    taxTotal: { type: Number, default: 0, min: 0 },
    taxInclusive: { type: Boolean, default: true },
    total: { type: Number, required: true, min: 0 },
    refundedTotal: { type: Number, default: 0, min: 0 },
    coupon: {
      type: new Schema(
        {
          code: String,
          type: { type: String, enum: ['percentage', 'fixed'] },
          value: Number,
          coupon: { type: Schema.Types.ObjectId, ref: 'Coupon' },
        },
        { _id: false },
      ),
      default: null,
    },
    shippingAddress: { type: addressSnapshotSchema, required: true },
    delivery: {
      methodId: { type: String, required: true },
      name: { type: String, required: true },
      etaDays: { type: String, default: '' },
      price: { type: Number, required: true },
    },
    status: { type: String, enum: ORDER_STATUSES, default: 'pending_payment' },
    paymentStatus: { type: String, enum: PAYMENT_STATUSES, default: 'pending' },
    reservation: {
      status: { type: String, enum: ['active', 'committed', 'released'], default: 'active' },
      expiresAt: { type: Date, required: true },
    },
    stripe: {
      checkoutSessionId: String,
      paymentIntentId: String,
    },
    tracking: {
      type: new Schema({ carrier: String, number: String, url: String }, { _id: false }),
      default: null,
    },
    notes: { type: String, maxlength: 500 },
    stockConflict: { type: Boolean, default: false },
    history: [
      {
        _id: false,
        status: { type: String, required: true },
        message: { type: String, required: true },
        actor: { type: actorSchema, required: true },
        at: { type: Date, default: Date.now },
      },
    ],
    paidAt: { type: Date, default: null },
    cancelledAt: { type: Date, default: null },
    shippedAt: { type: Date, default: null },
    deliveredAt: { type: Date, default: null },
  },
  { timestamps: true },
);

orderSchema.index({ user: 1, createdAt: -1 });
orderSchema.index({ status: 1, createdAt: -1 });
orderSchema.index({ paymentStatus: 1, paidAt: -1 });
orderSchema.index({ 'reservation.status': 1, 'reservation.expiresAt': 1 });
orderSchema.index({ 'stripe.checkoutSessionId': 1 }, { unique: true, sparse: true });
orderSchema.index({ email: 1 });

export const Order = model<IOrder>('Order', orderSchema);
export type OrderDoc = HydratedDocument<IOrder>;

/** Orders with a verified successful payment (used for revenue). */
export const REVENUE_PAYMENT_STATUSES: PaymentStatus[] = ['paid', 'partially_refunded', 'refunded'];

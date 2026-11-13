import { Schema, model, type Types } from 'mongoose';
import { actorSchema, type Actor } from './common.js';

// ── Reviews ───────────────────────────────────────────────────────────────
export interface IReview {
  product: Types.ObjectId;
  user: Types.ObjectId;
  authorName: string;
  rating: number;
  title: string;
  body: string;
  verifiedPurchase: boolean;
  status: 'published' | 'hidden';
  createdAt: Date;
  updatedAt: Date;
}

const reviewSchema = new Schema<IReview>(
  {
    product: { type: Schema.Types.ObjectId, ref: 'Product', required: true },
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    authorName: { type: String, required: true },
    rating: { type: Number, required: true, min: 1, max: 5 },
    title: { type: String, required: true, maxlength: 120 },
    body: { type: String, required: true, maxlength: 2000 },
    verifiedPurchase: { type: Boolean, default: false },
    status: { type: String, enum: ['published', 'hidden'], default: 'published' },
  },
  { timestamps: true },
);
reviewSchema.index({ product: 1, user: 1 }, { unique: true });
reviewSchema.index({ product: 1, status: 1, createdAt: -1 });

export const Review = model<IReview>('Review', reviewSchema);

// ── Notifications (persisted, also pushed live over Socket.IO) ────────────
export interface INotification {
  audience: 'admin' | 'user';
  user?: Types.ObjectId | null;
  type: string;
  title: string;
  message: string;
  link?: string;
  data?: Record<string, unknown>;
  readAt?: Date | null;
  createdAt: Date;
}

const notificationSchema = new Schema<INotification>(
  {
    audience: { type: String, enum: ['admin', 'user'], required: true },
    user: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    type: { type: String, required: true },
    title: { type: String, required: true },
    message: { type: String, required: true },
    link: String,
    data: { type: Schema.Types.Mixed },
    readAt: { type: Date, default: null },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);
notificationSchema.index({ audience: 1, user: 1, createdAt: -1 });

export const Notification = model<INotification>('Notification', notificationSchema);

// ── Stock movement ledger ─────────────────────────────────────────────────
export const STOCK_MOVEMENT_TYPES = [
  'initial',
  'restock',
  'adjustment',
  'reservation',
  'release',
  'sale',
  'refund_restock',
  'variant_removed',
] as const;

export interface IStockMovement {
  product: Types.ObjectId;
  variant: Types.ObjectId;
  sku: string;
  type: (typeof STOCK_MOVEMENT_TYPES)[number];
  /** Change to on-hand stock. */
  stockDelta: number;
  /** Change to reserved units. */
  reservedDelta: number;
  stockAfter?: number;
  availableAfter?: number;
  order?: Types.ObjectId | null;
  actor: Actor;
  note?: string;
  createdAt: Date;
}

const stockMovementSchema = new Schema<IStockMovement>(
  {
    product: { type: Schema.Types.ObjectId, ref: 'Product', required: true },
    variant: { type: Schema.Types.ObjectId, required: true },
    sku: { type: String, required: true },
    type: { type: String, enum: STOCK_MOVEMENT_TYPES, required: true },
    stockDelta: { type: Number, default: 0 },
    reservedDelta: { type: Number, default: 0 },
    stockAfter: Number,
    availableAfter: Number,
    order: { type: Schema.Types.ObjectId, ref: 'Order', default: null },
    actor: { type: actorSchema, required: true },
    note: { type: String, maxlength: 300 },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);
stockMovementSchema.index({ product: 1, createdAt: -1 });
stockMovementSchema.index({ variant: 1, createdAt: -1 });
stockMovementSchema.index({ createdAt: -1 });

export const StockMovement = model<IStockMovement>('StockMovement', stockMovementSchema, 'stockMovements');

// ── Admin activity / audit log ────────────────────────────────────────────
export interface IActivityLog {
  actor: Actor & { email?: string };
  action: string;
  entityType: string;
  entityId?: string;
  summary: string;
  details?: Record<string, unknown>;
  ip?: string;
  createdAt: Date;
}

const activityLogSchema = new Schema<IActivityLog>(
  {
    actor: {
      type: new Schema(
        { type: { type: String, required: true }, id: Schema.Types.Mixed, name: String, email: String },
        { _id: false },
      ),
      required: true,
    },
    action: { type: String, required: true },
    entityType: { type: String, required: true },
    entityId: String,
    summary: { type: String, required: true },
    details: { type: Schema.Types.Mixed },
    ip: String,
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);
activityLogSchema.index({ createdAt: -1 });
activityLogSchema.index({ entityType: 1, entityId: 1, createdAt: -1 });

export const ActivityLog = model<IActivityLog>('ActivityLog', activityLogSchema, 'activityLogs');

// ── Newsletter ────────────────────────────────────────────────────────────
export interface INewsletterSubscriber {
  email: string;
  status: 'subscribed' | 'unsubscribed';
  source?: string;
  createdAt: Date;
  updatedAt: Date;
}

const newsletterSchema = new Schema<INewsletterSubscriber>(
  {
    email: { type: String, required: true, lowercase: true, trim: true, unique: true },
    status: { type: String, enum: ['subscribed', 'unsubscribed'], default: 'subscribed' },
    source: String,
  },
  { timestamps: true },
);

export const NewsletterSubscriber = model<INewsletterSubscriber>(
  'NewsletterSubscriber',
  newsletterSchema,
  'newsletterSubscribers',
);

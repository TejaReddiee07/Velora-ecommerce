import { Schema, model } from 'mongoose';

export interface ICoupon {
  code: string;
  description?: string;
  /** `code`: customer enters it. `automatic`: seasonal sale applied to every eligible cart. */
  kind: 'code' | 'automatic';
  type: 'percentage' | 'fixed';
  /** Percentage (1–90) or fixed amount in base-currency minor units. */
  value: number;
  minOrderValue: number;
  startsAt?: Date | null;
  expiresAt?: Date | null;
  usageLimit?: number | null;
  usageCount: number;
  perUserLimit?: number | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const couponSchema = new Schema<ICoupon>(
  {
    code: { type: String, required: true, uppercase: true, trim: true, unique: true, maxlength: 40 },
    description: { type: String, maxlength: 200 },
    kind: { type: String, enum: ['code', 'automatic'], default: 'code' },
    type: { type: String, enum: ['percentage', 'fixed'], required: true },
    value: { type: Number, required: true, min: 1 },
    minOrderValue: { type: Number, default: 0, min: 0 },
    startsAt: { type: Date, default: null },
    expiresAt: { type: Date, default: null },
    usageLimit: { type: Number, default: null },
    usageCount: { type: Number, default: 0 },
    perUserLimit: { type: Number, default: null },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true },
);

couponSchema.index({ kind: 1, isActive: 1 });

export const Coupon = model<ICoupon>('Coupon', couponSchema);

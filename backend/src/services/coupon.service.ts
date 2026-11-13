import type { Types } from 'mongoose';
import { Coupon, type ICoupon } from '../models/Coupon.js';
import { Order } from '../models/Order.js';
import { badRequest } from '../utils/errors.js';

export type CouponDoc = ICoupon & { _id: Types.ObjectId };

function isLive(c: CouponDoc, now = new Date()) {
  if (!c.isActive) return false;
  if (c.startsAt && c.startsAt > now) return false;
  if (c.expiresAt && c.expiresAt <= now) return false;
  if (c.usageLimit != null && c.usageCount >= c.usageLimit) return false;
  return true;
}

/** Throws a customer-friendly error when the code cannot be used. */
export async function validateCouponCode(code: string, subtotalBase: number, userId?: Types.ObjectId | null) {
  const coupon = await Coupon.findOne({ code: code.trim().toUpperCase(), kind: 'code' }).lean<CouponDoc>();
  if (!coupon || !isLive(coupon)) throw badRequest('This code is invalid or has expired.');
  if (subtotalBase < coupon.minOrderValue) {
    throw badRequest('Your bag does not meet the minimum spend for this code.', { minOrderValue: coupon.minOrderValue });
  }
  if (coupon.perUserLimit != null && userId) {
    const used = await Order.countDocuments({
      user: userId,
      'coupon.coupon': coupon._id,
      paymentStatus: { $in: ['paid', 'partially_refunded', 'refunded'] },
    });
    if (used >= coupon.perUserLimit) throw badRequest('You have already used this code.');
  }
  return coupon;
}

export async function bestAutomaticPromotion(subtotalBase: number) {
  const now = new Date();
  const promos = await Coupon.find({ kind: 'automatic', isActive: true }).lean<CouponDoc[]>();
  const eligible = promos.filter((p) => isLive(p, now) && subtotalBase >= p.minOrderValue);
  let best: CouponDoc | null = null;
  let bestValue = 0;
  for (const p of eligible) {
    const v = discountFor(p, subtotalBase);
    if (v > bestValue) {
      best = p;
      bestValue = v;
    }
  }
  return best;
}

/** Discount for a subtotal expressed in the same units as `fixedValue` conversion. */
export function discountFor(c: Pick<ICoupon, 'type' | 'value'>, subtotal: number, fixedValueConverted?: number) {
  if (c.type === 'percentage') return Math.min(subtotal, Math.round((subtotal * Math.min(c.value, 90)) / 100));
  return Math.min(subtotal, fixedValueConverted ?? c.value);
}

export function couponIsLive(c: CouponDoc) {
  return isLive(c);
}

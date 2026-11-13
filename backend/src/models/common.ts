import { Schema, Types } from 'mongoose';

export const DEPARTMENTS = ['clothing', 'footwear', 'accessories'] as const;
export type Department = (typeof DEPARTMENTS)[number];

export const GENDERS = ['men', 'women', 'unisex'] as const;
export type Gender = (typeof GENDERS)[number];

export const STYLES = ['casual', 'formal', 'streetwear', 'sportswear'] as const;
export type Style = (typeof STYLES)[number];

export const CURRENCIES = ['GBP', 'USD'] as const;
export type Currency = (typeof CURRENCIES)[number];

export const ORDER_STATUSES = [
  'pending_payment',
  'paid',
  'processing',
  'packed',
  'shipped',
  'out_for_delivery',
  'delivered',
  'cancelled',
  'refunded',
] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

export const PAYMENT_STATUSES = [
  'pending',
  'paid',
  'failed',
  'expired',
  'cancelled',
  'partially_refunded',
  'refunded',
] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

export interface Actor {
  type: 'system' | 'admin' | 'customer' | 'stripe';
  id?: Types.ObjectId | string;
  name?: string;
}

export const actorSchema = new Schema<Actor>(
  {
    type: { type: String, enum: ['system', 'admin', 'customer', 'stripe'], required: true },
    id: { type: Schema.Types.Mixed },
    name: String,
  },
  { _id: false },
);

export interface AddressSnapshot {
  fullName: string;
  phone?: string;
  line1: string;
  line2?: string;
  city: string;
  state?: string;
  postalCode: string;
  country: string;
}

export const addressSnapshotSchema = new Schema<AddressSnapshot>(
  {
    fullName: { type: String, required: true },
    phone: String,
    line1: { type: String, required: true },
    line2: String,
    city: { type: String, required: true },
    state: String,
    postalCode: { type: String, required: true },
    country: { type: String, required: true },
  },
  { _id: false },
);

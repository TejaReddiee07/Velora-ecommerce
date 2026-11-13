import { Schema, model, type Types } from 'mongoose';
import { CURRENCIES, type Currency } from './common.js';

export interface IDeliveryMethod {
  id: string;
  name: string;
  description?: string;
  /** Base-currency minor units. */
  price: number;
  /** Free when the discounted subtotal reaches this (base minor units); null = never free. */
  freeOver?: number | null;
  etaDays: string;
  isActive: boolean;
}

export interface IBanner {
  _id: Types.ObjectId;
  placement: 'hero' | 'promo' | 'collection';
  eyebrow?: string;
  title: string;
  subtitle?: string;
  ctaLabel?: string;
  ctaHref?: string;
  image?: { sm: Types.ObjectId; md: Types.ObjectId; lg: Types.ObjectId } | null;
  isActive: boolean;
  sortOrder: number;
}

export interface IStoreSettings {
  key: 'store';
  storeName: string;
  tagline: string;
  logo?: { sm: Types.ObjectId; md: Types.ObjectId; lg: Types.ObjectId } | null;
  contact: { email: string; phone: string; address: string };
  currency: {
    base: Currency;
    enabled: Currency[];
    /** Units of each currency per 1 unit of base currency. */
    rates: Record<string, number>;
    rounding: 'none' | 'whole';
  };
  tax: { enabled: boolean; rate: number; inclusive: boolean; label: string };
  delivery: IDeliveryMethod[];
  returnPolicy: string;
  announcement: { enabled: boolean; text: string; link?: string };
  banners: Types.DocumentArray<IBanner & Types.Subdocument>;
  social: { instagram?: string; tiktok?: string; x?: string; facebook?: string; pinterest?: string; youtube?: string };
  lowStockThreshold: number;
  updatedAt: Date;
  createdAt: Date;
}

const renditionSchema = new Schema(
  {
    sm: { type: Schema.Types.ObjectId, required: true },
    md: { type: Schema.Types.ObjectId, required: true },
    lg: { type: Schema.Types.ObjectId, required: true },
  },
  { _id: false },
);

const settingsSchema = new Schema<IStoreSettings>(
  {
    key: { type: String, default: 'store', unique: true },
    storeName: { type: String, default: 'VELORA', maxlength: 60 },
    tagline: { type: String, default: 'Modern luxury, made to move.', maxlength: 140 },
    logo: { type: renditionSchema, default: null },
    contact: {
      email: { type: String, default: 'concierge@velora.store' },
      phone: { type: String, default: '+44 20 0000 0000' },
      address: { type: String, default: 'London, United Kingdom' },
    },
    currency: {
      base: { type: String, enum: CURRENCIES, default: 'GBP' },
      enabled: [{ type: String, enum: CURRENCIES }],
      rates: { type: Schema.Types.Mixed, default: { GBP: 1, USD: 1.27 } },
      rounding: { type: String, enum: ['none', 'whole'], default: 'none' },
    },
    tax: {
      enabled: { type: Boolean, default: true },
      rate: { type: Number, default: 20, min: 0, max: 50 },
      inclusive: { type: Boolean, default: true },
      label: { type: String, default: 'VAT' },
    },
    delivery: [
      {
        _id: false,
        id: { type: String, required: true },
        name: { type: String, required: true },
        description: String,
        price: { type: Number, required: true, min: 0 },
        freeOver: { type: Number, default: null },
        etaDays: { type: String, default: '' },
        isActive: { type: Boolean, default: true },
      },
    ],
    returnPolicy: { type: String, default: '' },
    announcement: {
      enabled: { type: Boolean, default: true },
      text: { type: String, default: '' },
      link: String,
    },
    banners: [
      {
        placement: { type: String, enum: ['hero', 'promo', 'collection'], required: true },
        eyebrow: String,
        title: { type: String, required: true },
        subtitle: String,
        ctaLabel: String,
        ctaHref: String,
        image: { type: renditionSchema, default: null },
        isActive: { type: Boolean, default: true },
        sortOrder: { type: Number, default: 0 },
      },
    ],
    social: {
      instagram: String,
      tiktok: String,
      x: String,
      facebook: String,
      pinterest: String,
      youtube: String,
    },
    lowStockThreshold: { type: Number, default: 5 },
  },
  { timestamps: true, minimize: false },
);

export const StoreSettings = model<IStoreSettings>('StoreSettings', settingsSchema, 'storeSettings');

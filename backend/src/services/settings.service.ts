import { StoreSettings, type IStoreSettings } from '../models/StoreSettings.js';
import type { Currency } from '../models/common.js';
import { badRequest } from '../utils/errors.js';

let cache: { value: IStoreSettings; at: number } | null = null;
const TTL_MS = 30_000;

export const DEFAULT_DELIVERY = [
  {
    id: 'standard',
    name: 'Standard delivery',
    description: 'Tracked, signature on delivery',
    price: 495,
    freeOver: 15000,
    etaDays: '3–5 working days',
    isActive: true,
  },
  {
    id: 'express',
    name: 'Express delivery',
    description: 'Priority tracked courier',
    price: 1295,
    freeOver: null,
    etaDays: '1–2 working days',
    isActive: true,
  },
  {
    id: 'nominated',
    name: 'Nominated day',
    description: 'Choose your delivery day at dispatch',
    price: 1495,
    freeOver: null,
    etaDays: 'Your chosen day',
    isActive: true,
  },
];

export async function getSettings(): Promise<IStoreSettings> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.value;
  let doc = await StoreSettings.findOne({ key: 'store' }).lean<IStoreSettings>();
  if (!doc) {
    await StoreSettings.updateOne(
      { key: 'store' },
      {
        $setOnInsert: {
          key: 'store',
          currency: { base: 'GBP', enabled: ['GBP', 'USD'], rates: { GBP: 1, USD: 1.27 }, rounding: 'none' },
          delivery: DEFAULT_DELIVERY,
          returnPolicy:
            'Free returns within 30 days of delivery. Items must be unworn, with original tags attached. Refunds are issued to the original payment method within 5–10 working days of receipt.',
          announcement: {
            enabled: true,
            text: 'Complimentary standard delivery on orders over £150',
            link: '/clothing',
          },
        },
      },
      { upsert: true },
    );
    doc = await StoreSettings.findOne({ key: 'store' }).lean<IStoreSettings>();
  }
  cache = { value: doc!, at: Date.now() };
  return doc!;
}

export function invalidateSettingsCache() {
  cache = null;
}

export function resolveCurrency(settings: IStoreSettings, requested?: string | null): Currency {
  const enabled = settings.currency.enabled?.length ? settings.currency.enabled : [settings.currency.base];
  if (requested && enabled.includes(requested as Currency)) return requested as Currency;
  return settings.currency.base;
}

export function rateFor(settings: IStoreSettings, currency: Currency) {
  if (currency === settings.currency.base) return 1;
  const rate = Number(settings.currency.rates?.[currency]);
  if (!Number.isFinite(rate) || rate <= 0) throw badRequest(`Currency ${currency} is not configured.`);
  return rate;
}

/** Convert a base-currency minor amount into `currency` minor units. */
export function convert(settings: IStoreSettings, baseAmount: number, currency: Currency) {
  const rate = rateFor(settings, currency);
  if (rate === 1) return baseAmount;
  const converted = baseAmount * rate;
  if (settings.currency.rounding === 'whole') return Math.round(converted / 100) * 100;
  return Math.round(converted);
}

/** Convert an amount in `currency` back into base-currency minor units (for filters). */
export function toBase(settings: IStoreSettings, amount: number, currency: Currency) {
  const rate = rateFor(settings, currency);
  return Math.round(amount / rate);
}

export const API_URL = (process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000').replace(/\/$/, '');
export const API_INTERNAL_URL = (process.env.API_INTERNAL_URL ?? API_URL).replace(/\/$/, '');
export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000').replace(/\/$/, '');
export const BRAND = 'VELORA';
export const CURRENCY_COOKIE = 'velora_currency';

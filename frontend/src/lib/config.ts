const REAL_API_URL = (process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000').replace(/\/$/, '');

/**
 * NEXT_PUBLIC_API_PROXY=1: the API lives on another site than the storefront (e.g. storefront on Vercel, API on Render).
 * The browser then calls this site's own /api, which next.config.ts forwards to the API, so the session cookies stay
 * first-party. Safari/iOS and other privacy-minded browsers refuse the third-party cookies a cross-site API would need.
 */
export const API_PROXY = process.env.NEXT_PUBLIC_API_PROXY === '1';
/** Base URL of the browser's API calls: '' means this site's own /api (proxied). */
export const API_URL = API_PROXY ? '' : REAL_API_URL;
/** The real API host, for the cookie-less things the browser fetches directly: product images and the realtime socket. */
export const API_ORIGIN = REAL_API_URL;
export const API_INTERNAL_URL = (process.env.API_INTERNAL_URL ?? REAL_API_URL).replace(/\/$/, '');
export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000').replace(/\/$/, '');
export const BRAND = 'VELORA';
export const CURRENCY_COOKIE = 'velora_currency';

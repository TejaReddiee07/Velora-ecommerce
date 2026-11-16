// Browser-facing API base. "" (set NEXT_PUBLIC_API_URL=/) means "same domain as
// the site" — used on Vercel, where /api/* is routed to the API service.
export const API_URL = (process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000').replace(/\/$/, '');
export const API_INTERNAL_URL = (process.env.API_INTERNAL_URL ?? API_URL).replace(/\/$/, '');

/**
 * Base URL the Next.js server uses to reach the API while rendering pages.
 * Read per call: on Vercel, BACKEND_URL is injected by the service binding at
 * runtime only (it does not exist while building).
 */
export function apiInternalUrl() {
  return (process.env.BACKEND_URL ?? process.env.API_INTERNAL_URL ?? API_URL).replace(/\/$/, '');
}

export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000').replace(/\/$/, '');

/** Live updates over Socket.IO. Off on Vercel (functions can't hold open connections). */
export const REALTIME_ENABLED = process.env.NEXT_PUBLIC_REALTIME !== 'off';

/** Largest image the owner portal accepts per file, and the most sent in one request. */
export const MAX_UPLOAD_MB = Number(process.env.NEXT_PUBLIC_MAX_UPLOAD_MB) || 8;
export const UPLOAD_REQUEST_MB = Number(process.env.NEXT_PUBLIC_UPLOAD_REQUEST_MB) || Infinity;

export const BRAND = 'VELORA';
export const CURRENCY_COOKIE = 'velora_currency';

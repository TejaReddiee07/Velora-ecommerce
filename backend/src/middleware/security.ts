import type { NextFunction, Request, Response } from 'express';
import rateLimit, { ipKeyGenerator, type Options } from 'express-rate-limit';
import { env } from '../config/env.js';
import { AppError } from '../utils/errors.js';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * True when the browser origin is this very site (storefront and API served
 * from one domain, as on Vercel — including custom domains and preview URLs).
 * Browsers set Origin/Host themselves, so another site cannot fake this.
 */
function isSameSite(req: Request, origin: string) {
  const host = (req.get('x-forwarded-host') ?? req.get('host') ?? '').split(',')[0].trim().toLowerCase();
  try {
    return Boolean(host) && new URL(origin).host.toLowerCase() === host;
  } catch {
    return false;
  }
}

/**
 * CSRF defence for cookie-authenticated requests: state-changing requests that
 * carry an Origin (all modern browsers send one) must come from an allowed
 * origin. Combined with SameSite cookies and JSON-only bodies.
 */
export function originCheck(req: Request, _res: Response, next: NextFunction) {
  if (SAFE_METHODS.has(req.method)) return next();
  const origin = req.get('origin');
  if (!origin) {
    const referer = req.get('referer');
    if (!referer) return next(); // non-browser client (no ambient browser cookies)
    try {
      const refOrigin = new URL(referer).origin;
      if (env.corsOrigins.includes(refOrigin) || refOrigin === new URL(env.API_PUBLIC_URL).origin || isSameSite(req, refOrigin)) return next();
    } catch {
      /* fall through */
    }
    return next(new AppError(403, 'CSRF_REJECTED', 'Request origin not allowed.'));
  }
  if (env.corsOrigins.includes(origin.replace(/\/$/, '')) || isSameSite(req, origin)) return next();
  return next(new AppError(403, 'CSRF_REJECTED', 'Request origin not allowed.'));
}

/** Removes keys that could be interpreted as MongoDB operators from JSON bodies. */
export function stripDangerousKeys(req: Request, _res: Response, next: NextFunction) {
  const clean = (value: unknown, depth = 0): unknown => {
    if (depth > 20) return undefined;
    if (Array.isArray(value)) return value.map((v) => clean(v, depth + 1));
    if (value && typeof value === 'object' && !(value instanceof Buffer)) {
      const out: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(value)) {
        if (k.startsWith('$') || k.includes('.') || k === '__proto__' || k === 'constructor' || k === 'prototype') continue;
        out[k] = clean(v, depth + 1);
      }
      return out;
    }
    return value;
  };
  if (req.body && typeof req.body === 'object' && !Buffer.isBuffer(req.body)) req.body = clean(req.body);
  next();
}

const limiterMessage = (message: string) => ({
  error: { code: 'RATE_LIMITED', message },
});

// On Vercel every request reaches the API through Vercel's proxy, so the visitor's
// own IP comes from the header Vercel sets (clients cannot override it).
const vercelClientKey: Options['keyGenerator'] = (req) =>
  ipKeyGenerator(String(req.headers['x-real-ip'] ?? req.headers['x-vercel-forwarded-for'] ?? req.ip ?? 'unknown').split(',')[0].trim());

function makeLimiter(windowMs: number, limit: number, message: string) {
  return rateLimit({
    windowMs,
    limit,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    skip: () => env.RATE_LIMIT_DISABLED,
    message: limiterMessage(message),
    ...(env.onVercel ? { keyGenerator: vercelClientKey } : {}),
  });
}

export const globalLimiter = makeLimiter(60 * 1000, 600, 'Too many requests. Please slow down.');
export const authLimiter = makeLimiter(15 * 60 * 1000, 20, 'Too many attempts. Please try again in a few minutes.');
export const adminAuthLimiter = makeLimiter(15 * 60 * 1000, 10, 'Too many sign-in attempts. Please wait 15 minutes.');
export const checkoutLimiter = makeLimiter(10 * 60 * 1000, 30, 'Too many checkout attempts. Please wait a moment.');
export const uploadLimiter = makeLimiter(10 * 60 * 1000, 120, 'Too many uploads. Please wait a moment.');
export const publicWriteLimiter = makeLimiter(60 * 60 * 1000, 30, 'Too many requests. Please try later.');

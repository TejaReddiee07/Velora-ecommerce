import 'dotenv/config';
import { z } from 'zod';

const optionalString = z
  .string()
  .optional()
  .transform((v) => (v && v.trim() !== '' ? v.trim() : undefined));

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  API_PUBLIC_URL: z.string().url().default('http://localhost:4000'),
  CLIENT_URL: z.string().url().default('http://localhost:3000'),
  CORS_ORIGINS: z.string().default('http://localhost:3000'),

  MONGODB_URI: z.string().min(1, 'MONGODB_URI is required'),

  SESSION_SECRET: z.string().min(32, 'SESSION_SECRET must be at least 32 characters'),
  COOKIE_SAMESITE: z.enum(['lax', 'strict', 'none']).default('lax'),
  COOKIE_DOMAIN: optionalString,

  ADMIN_NAME: z.string().default('Store Owner'),
  ADMIN_EMAIL: optionalString,
  ADMIN_PASSWORD: optionalString,

  SEED_ON_START: z
    .string()
    .optional()
    .transform((v) => v !== 'false'),

  STRIPE_SECRET_KEY: optionalString,
  STRIPE_WEBHOOK_SECRET: optionalString,
  RESERVATION_MINUTES: z.coerce.number().int().min(30).max(1440).default(30),

  REDIS_URL: optionalString,

  EMAIL_TRANSPORT: z.enum(['auto', 'smtp', 'log']).default('auto'),
  SMTP_HOST: optionalString,
  SMTP_PORT: z.coerce.number().int().default(587),
  SMTP_SECURE: z
    .string()
    .optional()
    .transform((v) => v === 'true'),
  SMTP_USER: optionalString,
  SMTP_PASS: optionalString,
  EMAIL_FROM: z.string().default('VELORA <no-reply@velora.local>'),

  MAX_UPLOAD_MB: z.coerce.number().positive().max(25).default(8),

  RATE_LIMIT_DISABLED: z
    .string()
    .optional()
    .transform((v) => v === 'true'),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  const issues = parsed.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`).join('\n');
  console.error(`Invalid environment configuration:\n${issues}`);
  process.exit(1);
}

const raw = parsed.data;

// ── Vercel ────────────────────────────────────────────────────────────────
// Vercel serves the storefront and the API from the same domain. Its system
// variables give that domain, so CLIENT_URL / API_PUBLIC_URL only need setting
// when you use your own domain. Request bodies are capped at 4.5 MB there.
const onVercel = Boolean(process.env.VERCEL);
const vercelOrigins = [process.env.VERCEL_PROJECT_PRODUCTION_URL, process.env.VERCEL_BRANCH_URL, process.env.VERCEL_URL]
  .filter((h): h is string => Boolean(h))
  .map((h) => `https://${h}`);
const vercelSite = vercelOrigins[0];
const given = (key: string) => Boolean(process.env[key]?.trim());
const clientUrl = !given('CLIENT_URL') && vercelSite ? vercelSite : raw.CLIENT_URL;
const apiPublicUrl = !given('API_PUBLIC_URL') && vercelSite ? vercelSite : raw.API_PUBLIC_URL;
const maxUploadMb = !given('MAX_UPLOAD_MB') && onVercel ? 4 : raw.MAX_UPLOAD_MB;

const corsOrigins = [...raw.CORS_ORIGINS.split(','), clientUrl, ...vercelOrigins]
  .map((o) => o.trim().replace(/\/$/, ''))
  .filter(Boolean);

export const env = {
  ...raw,
  CLIENT_URL: clientUrl,
  API_PUBLIC_URL: apiPublicUrl,
  MAX_UPLOAD_MB: maxUploadMb,
  onVercel,
  isProd: raw.NODE_ENV === 'production',
  isTest: raw.NODE_ENV === 'test',
  corsOrigins: [...new Set(corsOrigins)],
  cookieSecure: raw.NODE_ENV === 'production' || raw.COOKIE_SAMESITE === 'none',
  stripeEnabled: Boolean(raw.STRIPE_SECRET_KEY),
  maxUploadBytes: Math.round(maxUploadMb * 1024 * 1024),
};

export type Env = typeof env;

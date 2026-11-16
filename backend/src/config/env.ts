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

export const env = {
  ...raw,
  isProd: raw.NODE_ENV === 'production',
  isTest: raw.NODE_ENV === 'test',
  corsOrigins: raw.CORS_ORIGINS.split(',')
    .map((o) => o.trim().replace(/\/$/, ''))
    .filter(Boolean),
  cookieSecure: raw.NODE_ENV === 'production' || raw.COOKIE_SAMESITE === 'none',
  stripeEnabled: Boolean(raw.STRIPE_SECRET_KEY),
  maxUploadBytes: Math.round(raw.MAX_UPLOAD_MB * 1024 * 1024),
};

export type Env = typeof env;

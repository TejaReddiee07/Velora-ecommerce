import { inject } from 'vitest';
import crypto from 'node:crypto';

// Must run before any app module is imported (env.ts validates at import time).
const base = inject('mongoUri');
const dbName = `velora_test_${crypto.randomBytes(4).toString('hex')}`;
process.env.MONGODB_URI = base.replace('/?', `/${dbName}?`);
process.env.NODE_ENV = 'test';
process.env.SESSION_SECRET = 'test-secret-test-secret-test-secret-1234567890';
process.env.CLIENT_URL = 'http://localhost:3000';
process.env.CORS_ORIGINS = 'http://localhost:3000';
process.env.API_PUBLIC_URL = 'http://localhost:4000';
process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test_velora_signing_secret';
process.env.STRIPE_SECRET_KEY = '';
process.env.ADMIN_EMAIL = 'owner@velora.test';
process.env.ADMIN_PASSWORD = 'OwnerPass123';
process.env.ADMIN_NAME = 'Test Owner';
process.env.SEED_ON_START = 'false';
process.env.EMAIL_TRANSPORT = 'log';
process.env.REDIS_URL = '';
if (process.env.RATE_LIMIT_DISABLED === undefined) process.env.RATE_LIMIT_DISABLED = 'true';

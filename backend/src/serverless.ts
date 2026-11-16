// Entry point for serverless hosting (Vercel Functions, see /vercel.json).
// `src/index.ts` stays the entry for a normal long-running server (local, Docker, VPS).
//
// Same API and routes as index.ts, minus what a function cannot keep running:
//  - no Socket.IO: live updates are off; pages refresh their data when visitors
//    navigate or return to the tab (NEXT_PUBLIC_REALTIME=off on the storefront).
//  - no timers: maintenance runs on incoming traffic instead — expired checkout
//    reservations are released at most once a minute, orphan images cleaned every 6 h.
//  - no seeding: seed the database once from your computer (`npm run seed`).
import 'express'; // lets Vercel's Express preset recognise this file as the app entry
import type { NextFunction, Request, Response } from 'express';
import mongoose from 'mongoose';
import { attachDatabasePool } from '@vercel/functions';
import { env } from './config/env.js';
import { connectDatabase } from './db/connection.js';
import { createApp } from './app.js';
import { ensureOwnerAdmin } from './seed/seed.js';
import { expireStaleReservations } from './services/order.service.js';
import { cleanupOrphanImages } from './services/maintenance.service.js';
import { keepAlive } from './utils/background.js';
import { AppError } from './utils/errors.js';
import { logger } from './utils/logger.js';

let ready: Promise<void> | null = null;

/** Connects once per instance; a failed attempt is retried on the next request. */
function init() {
  ready ??= (async () => {
    await connectDatabase(env.MONGODB_URI, { maxPoolSize: 5 });
    // Lets Vercel close idle MongoDB connections before an instance is suspended.
    if (env.onVercel) attachDatabasePool(mongoose.connection.getClient());
    await ensureOwnerAdmin();
  })().catch((err) => {
    ready = null;
    throw err;
  });
  return ready;
}

const EXPIRE_EVERY_MS = 60_000;
const CLEANUP_EVERY_MS = 6 * 60 * 60_000;
let lastExpire = 0;
let lastCleanup = Date.now();

function runMaintenance() {
  const now = Date.now();
  if (now - lastExpire >= EXPIRE_EVERY_MS) {
    lastExpire = now;
    keepAlive(expireStaleReservations().catch((err) => logger.error('Releasing expired reservations failed', err)));
  }
  if (now - lastCleanup >= CLEANUP_EVERY_MS) {
    lastCleanup = now;
    keepAlive(cleanupOrphanImages().catch((err) => logger.error('Orphan image cleanup failed', err)));
  }
}

async function ensureReady(_req: Request, _res: Response, next: NextFunction) {
  try {
    await init();
  } catch (err) {
    logger.error('Database connection failed', err);
    return next(new AppError(503, 'SERVICE_UNAVAILABLE', 'The store is temporarily unavailable. Please try again in a moment.'));
  }
  runMaintenance();
  next();
}

const app = createApp({ beforeRoutes: [ensureReady] });

if (!env.stripeEnabled) logger.warn('Stripe is not configured — checkout is disabled until STRIPE_SECRET_KEY is set.');

export default app;

import express, { Router, type RequestHandler } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import mongoose from 'mongoose';
import { env } from './config/env.js';
import { errorHandler, notFoundHandler } from './middleware/error.js';
import { globalLimiter, originCheck, stripDangerousKeys } from './middleware/security.js';
import { requireAdmin } from './middleware/auth.js';
import webhookRoutes from './routes/webhook.routes.js';
import publicRoutes from './routes/public.routes.js';
import authRoutes from './routes/auth.routes.js';
import shopRoutes from './routes/shop.routes.js';
import adminAuthRoutes from './routes/admin/auth.routes.js';
import adminProductRoutes from './routes/admin/products.routes.js';
import adminOperationsRoutes from './routes/admin/operations.routes.js';
import adminStoreRoutes from './routes/admin/store.routes.js';
import { queueMode } from './jobs/queue.js';
import { supportsTransactions } from './db/connection.js';
import { smtpActive } from './services/email.service.js';

/**
 * @param opts.beforeRoutes  middleware that runs before every route — the Vercel
 *   entry (src/serverless.ts) uses it to connect to MongoDB on a cold start.
 */
export function createApp(opts: { beforeRoutes?: RequestHandler[] } = {}) {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1);
  for (const handler of opts.beforeRoutes ?? []) app.use(handler);

  app.use(
    helmet({
      crossOriginResourcePolicy: { policy: 'cross-origin' },
      contentSecurityPolicy: { directives: { defaultSrc: ["'none'"], frameAncestors: ["'none'"] } },
    }),
  );
  app.use(
    cors({
      origin: (origin, cb) => cb(null, !origin || env.corsOrigins.includes(origin.replace(/\/$/, ''))),
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      maxAge: 600,
    }),
  );
  app.use(compression());
  app.use(cookieParser());

  // Stripe needs the raw body — mount before the JSON parser.
  app.use('/api', webhookRoutes);

  app.use(express.json({ limit: '1mb' }));
  app.use(stripDangerousKeys);
  app.use('/api', originCheck);
  app.use('/api', globalLimiter);

  app.get('/api/health', (_req, res) => {
    res.json({
      status: mongoose.connection.readyState === 1 ? 'ok' : 'degraded',
      database: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
      transactions: supportsTransactions(),
      stripe: env.stripeEnabled ? 'configured' : 'not configured',
      stripeWebhook: env.STRIPE_WEBHOOK_SECRET ? 'configured' : 'not configured',
      jobs: queueMode(),
      email: smtpActive() ? 'smtp' : 'log',
      time: new Date().toISOString(),
    });
  });

  app.use('/api', publicRoutes);
  app.use('/api', authRoutes);
  app.use('/api', shopRoutes);

  app.use('/api/admin/auth', adminAuthRoutes);
  const admin = Router();
  admin.use(requireAdmin);
  admin.use(adminProductRoutes);
  admin.use(adminOperationsRoutes);
  admin.use(adminStoreRoutes);
  app.use('/api/admin', admin);

  app.use('/api', notFoundHandler);
  app.use(errorHandler);
  return app;
}

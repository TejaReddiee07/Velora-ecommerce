import http from 'node:http';
import { env } from './config/env.js';
import { connectDatabase, disconnectDatabase } from './db/connection.js';
import { syncIndexes } from './db/indexes.js';
import { createApp } from './app.js';
import { initSocket, closeSocket } from './realtime/socket.js';
import { startJobs, stopJobs } from './jobs/queue.js';
import { expireStaleReservations } from './services/order.service.js';
import { cleanupOrphanImages } from './services/maintenance.service.js';
import { ensureOwnerAdmin, seedIfEmpty } from './seed/seed.js';
import { logger } from './utils/logger.js';

async function main() {
  await connectDatabase(env.MONGODB_URI);
  await syncIndexes();
  if (env.SEED_ON_START) await seedIfEmpty();
  else await ensureOwnerAdmin();

  const app = createApp();
  const server = http.createServer(app);
  initSocket(server);
  await startJobs({ expireReservations: expireStaleReservations, cleanupOrphanImages: () => cleanupOrphanImages() });

  server.listen(env.PORT, () => {
    logger.info(`VELORA API listening on ${env.API_PUBLIC_URL} (port ${env.PORT})`);
    if (!env.stripeEnabled) logger.warn('Stripe is not configured — checkout is disabled until STRIPE_SECRET_KEY is set.');
    if (!env.STRIPE_WEBHOOK_SECRET) logger.warn('STRIPE_WEBHOOK_SECRET is not set — webhooks are rejected; payments are confirmed via server-side Stripe reconciliation only.');
  });

  const shutdown = async (signal: string) => {
    logger.info(`${signal} received — shutting down`);
    server.close();
    await stopJobs();
    await closeSocket();
    await disconnectDatabase();
    process.exit(0);
  };
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

main().catch((err) => {
  logger.error('Failed to start API', err);
  process.exit(1);
});

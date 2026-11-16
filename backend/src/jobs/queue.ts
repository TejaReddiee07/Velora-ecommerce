import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';
import { deliverEmail, type EmailMessage } from '../services/email.service.js';

/**
 * Background work: emails and scheduled maintenance.
 *  - With REDIS_URL: BullMQ queues + workers (retries, survives restarts, multi-instance safe).
 *  - Without: an in-process scheduler (fine for a single instance / local development).
 */
type Task = () => Promise<unknown>;
interface MaintenanceTasks {
  expireReservations: Task;
  cleanupOrphanImages: Task;
}

let mode: 'bullmq' | 'local' = 'local';
let tasks: MaintenanceTasks | null = null;
const timers: NodeJS.Timeout[] = [];
const closers: (() => Promise<unknown>)[] = [];
let emailQueue: { add: (name: string, data: EmailMessage, opts?: object) => Promise<unknown> } | null = null;

export function queueMode() {
  return mode;
}

export async function queueEmail(message: EmailMessage) {
  if (emailQueue) {
    await emailQueue.add('send', message, { attempts: 5, backoff: { type: 'exponential', delay: 5000 }, removeOnComplete: 500 });
    return;
  }
  // Local mode: send asynchronously without blocking the request.
  setImmediate(() => {
    deliverEmail(message).catch((err) => logger.error(`Email to ${message.to} failed`, err));
  });
}

async function runTask(name: string, task: Task) {
  try {
    await task();
  } catch (err) {
    logger.error(`Scheduled task ${name} failed`, err);
  }
}

export async function startJobs(maintenance: MaintenanceTasks) {
  tasks = maintenance;
  if (env.REDIS_URL) {
    try {
      const { Queue, Worker } = await import('bullmq');
      const { Redis } = await import('ioredis');
      const connection = new Redis(env.REDIS_URL, { maxRetriesPerRequest: null });
      const prefix = 'velora';

      const eq = new Queue<EmailMessage>('email', { connection, prefix });
      const ew = new Worker<EmailMessage>('email', async (job) => deliverEmail(job.data), { connection, prefix, concurrency: 5 });
      ew.on('failed', (job, err) => logger.error(`Email job ${job?.id} failed`, err));

      const mq = new Queue('maintenance', { connection, prefix });
      await mq.upsertJobScheduler('expire-reservations', { every: 60_000 }, { name: 'expire-reservations' });
      await mq.upsertJobScheduler('cleanup-orphan-images', { every: 6 * 60 * 60_000 }, { name: 'cleanup-orphan-images' });
      const mw = new Worker(
        'maintenance',
        async (job) => {
          if (job.name === 'expire-reservations') return tasks!.expireReservations();
          if (job.name === 'cleanup-orphan-images') return tasks!.cleanupOrphanImages();
        },
        { connection, prefix, concurrency: 1 },
      );

      emailQueue = eq as unknown as typeof emailQueue;
      closers.push(() => ew.close(), () => mw.close(), () => eq.close(), () => mq.close(), async () => connection.quit());
      mode = 'bullmq';
      logger.info('Background jobs: BullMQ (Redis)');
      return;
    } catch (err) {
      logger.error('Redis/BullMQ unavailable — falling back to in-process scheduler', err);
    }
  }

  mode = 'local';
  timers.push(setInterval(() => void runTask('expire-reservations', maintenance.expireReservations), 60_000));
  timers.push(setInterval(() => void runTask('cleanup-orphan-images', maintenance.cleanupOrphanImages), 6 * 60 * 60_000));
  // Run once shortly after boot to recover from downtime.
  timers.push(setTimeout(() => void runTask('expire-reservations', maintenance.expireReservations), 5_000));
  logger.info('Background jobs: in-process scheduler (set REDIS_URL to use BullMQ)');
}

export async function stopJobs() {
  for (const t of timers) clearInterval(t);
  timers.length = 0;
  for (const close of closers) await close().catch(() => undefined);
  closers.length = 0;
  emailQueue = null;
}

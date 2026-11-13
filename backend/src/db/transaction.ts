import mongoose, { type ClientSession } from 'mongoose';
import { supportsTransactions } from './connection.js';

export type Session = ClientSession | undefined;

/**
 * Runs `fn` inside a MongoDB transaction when the deployment supports it.
 * `fn` may be retried on transient transaction errors, so it must not perform
 * side effects (emails, sockets, Stripe calls) — return them and run them after.
 * Without transaction support, `fn` runs once with `session === undefined` and
 * callers rely on atomic single-document updates plus compensation.
 */
export async function runInTransaction<T>(fn: (session: Session) => Promise<T>): Promise<T> {
  if (!supportsTransactions()) return fn(undefined);

  const session = await mongoose.startSession();
  try {
    let result: T | undefined;
    await session.withTransaction(
      async () => {
        result = await fn(session);
      },
      { readPreference: 'primary', readConcern: { level: 'snapshot' }, writeConcern: { w: 'majority' } },
    );
    return result as T;
  } finally {
    await session.endSession();
  }
}

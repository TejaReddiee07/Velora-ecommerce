import mongoose from 'mongoose';
import { logger } from '../utils/logger.js';

let transactionsSupported = false;

export function supportsTransactions() {
  return transactionsSupported;
}

/** Test hook: force the non-transactional code path. */
export function setTransactionsSupported(value: boolean) {
  transactionsSupported = value;
}

export async function connectDatabase(uri: string, opts: { maxPoolSize?: number } = {}) {
  mongoose.set('strictQuery', true);
  await mongoose.connect(uri, {
    serverSelectionTimeoutMS: 15000,
    // Serverless hosts run many small instances, so they pass a smaller pool.
    maxPoolSize: opts.maxPoolSize ?? 20,
  });

  const db = mongoose.connection.db;
  if (!db) throw new Error('MongoDB connection has no database handle');

  // Transactions need a replica set (Atlas always is) or a sharded cluster.
  const hello = (await db.admin().command({ hello: 1 })) as { setName?: string; msg?: string };
  transactionsSupported = Boolean(hello.setName) || hello.msg === 'isdbgrid';

  logger.info(
    `MongoDB connected (db: ${db.databaseName}, transactions: ${transactionsSupported ? 'yes' : 'no'})`,
  );
  return mongoose.connection;
}

export async function disconnectDatabase() {
  await mongoose.disconnect();
}

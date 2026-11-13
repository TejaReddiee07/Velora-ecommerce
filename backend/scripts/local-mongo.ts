// Local MongoDB for development without Atlas: a single-node replica set
// (transactions work) persisted in backend/.data/mongo. Usage: npm run db:local
// Then set MONGODB_URI=mongodb://127.0.0.1:27017/velora?replicaSet=velora-local
import fs from 'node:fs';
import path from 'node:path';
import { MongoMemoryReplSet } from 'mongodb-memory-server';

const dbPath = path.resolve('.data/mongo');
fs.mkdirSync(dbPath, { recursive: true });

const replSet = await MongoMemoryReplSet.create({
  replSet: { name: 'velora-local', count: 1, storageEngine: 'wiredTiger' },
  instanceOpts: [{ port: 27017, dbPath }],
});
console.log(`Local MongoDB running: mongodb://127.0.0.1:27017/velora?replicaSet=velora-local`);
console.log(`Data directory: ${dbPath} (Ctrl+C to stop)`);

const stop = async () => {
  await replSet.stop({ doCleanup: false, force: false });
  process.exit(0);
};
process.on('SIGINT', stop);
process.on('SIGTERM', stop);

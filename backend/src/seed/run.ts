import { env } from '../config/env.js';
import { connectDatabase, disconnectDatabase } from '../db/connection.js';
import { resetDatabase, seedIfEmpty } from './seed.js';
import { syncIndexes } from '../db/indexes.js';

const reset = process.argv.includes('--reset');

await connectDatabase(env.MONGODB_URI);
if (reset) await resetDatabase();
await syncIndexes();
const result = await seedIfEmpty();
console.log(result.seeded ? `Seeded ${result.products} products.` : 'Database already has products — nothing to seed (use --reset to start over).');
await disconnectDatabase();

// Turns the 3D showroom flag on for the garments listed in SHOWROOM_SLUGS.
// Safe to run repeatedly; touches no other field. Usage: npm run showroom:enable
import { env } from '../src/config/env.js';
import { connectDatabase, disconnectDatabase } from '../src/db/connection.js';
import { Product } from '../src/models/Product.js';
import { SHOWROOM_SLUGS } from '../src/seed/catalog.js';

await connectDatabase(env.MONGODB_URI);
const res = await Product.updateMany({ slug: { $in: SHOWROOM_SLUGS } }, { $set: { showroom: true } });
const found = await Product.find({ slug: { $in: SHOWROOM_SLUGS } }, { slug: 1 }).lean();
const missing = SHOWROOM_SLUGS.filter((s) => !found.some((p) => p.slug === s));
console.log(`Showroom enabled on ${found.length} product(s) (${res.modifiedCount} changed).`);
if (missing.length) console.log(`Not found (skipped): ${missing.join(', ')}`);
await disconnectDatabase();

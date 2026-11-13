// Makes every product available: raises each size/colour to at least MIN
// units for sale, using the same inventory service as the owner portal
// (each change is recorded in the stock history; one Activity log entry).
// Usage: npm run restock:all            (minimum 20 per variant)
//        npm run restock:all -- 30      (custom minimum)
import { env } from '../src/config/env.js';
import { connectDatabase, disconnectDatabase } from '../src/db/connection.js';
import { Product } from '../src/models/Product.js';
import { Admin } from '../src/models/Admin.js';
import { ActivityLog } from '../src/models/Misc.js';
import { adjustStock } from '../src/services/inventory.service.js';
import type { Actor } from '../src/models/common.js';

const MIN = Math.max(1, Number(process.argv[2]) || 20);

await connectDatabase(env.MONGODB_URI);
const owner = await Admin.findOne({ role: 'owner', status: 'active' }).lean();
const actor: Actor = owner ? { type: 'admin', id: String(owner._id), name: owner.name } : { type: 'system', name: 'Restock script' };

const products = await Product.find({ status: { $ne: 'archived' } }).lean();
let variants = 0;
let units = 0;
let activated = 0;
for (const p of products) {
  for (const v of p.variants) {
    if (!v.isActive) {
      await Product.updateOne({ _id: p._id, 'variants._id': v._id }, { $set: { 'variants.$.isActive': true } });
      activated++;
    }
    if (v.available < MIN) {
      const qty = MIN - v.available;
      await adjustStock(v._id, qty, actor, 'restock', `Bulk restock to ${MIN} available`);
      variants++;
      units += qty;
    }
  }
}
const drafts = await Product.updateMany({ status: 'draft', 'images.0': { $exists: true } }, { $set: { status: 'published' } });

if (variants || activated || drafts.modifiedCount) {
  await ActivityLog.create({
    actor: { ...actor, email: owner?.email },
    action: 'inventory.bulk_restock',
    entityType: 'inventory',
    summary: `Bulk restock: ${variants} variant(s) raised to at least ${MIN} available (+${units} units)`,
    details: { minimum: MIN, variants, units, activated, published: drafts.modifiedCount },
  });
}
console.log(`Restocked ${variants} variant(s) (+${units} units) to at least ${MIN} available.`);
if (activated) console.log(`Re-activated ${activated} hidden variant(s).`);
if (drafts.modifiedCount) console.log(`Published ${drafts.modifiedCount} draft product(s) that had images.`);
await disconnectDatabase();

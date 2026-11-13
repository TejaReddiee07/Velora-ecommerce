import mongoose from 'mongoose';
import { logger } from '../utils/logger.js';

/** Builds indexes declared on every registered model (idempotent). */
export async function syncIndexes() {
  // Ensure all models are registered.
  await Promise.all([
    import('../models/User.js'),
    import('../models/Admin.js'),
    import('../models/Session.js'),
    import('../models/Address.js'),
    import('../models/Catalog.js'),
    import('../models/Product.js'),
    import('../models/Cart.js'),
    import('../models/Order.js'),
    import('../models/Payment.js'),
    import('../models/Coupon.js'),
    import('../models/Misc.js'),
    import('../models/StoreSettings.js'),
  ]);
  for (const name of mongoose.modelNames()) {
    try {
      await mongoose.model(name).createIndexes();
    } catch (err) {
      logger.warn(`Index build for ${name} failed`, err);
    }
  }
  // GridFS lookup index for orphan cleanup and product image queries.
  await mongoose.connection.db!.collection('fs.files').createIndex({ 'metadata.productId': 1 }).catch(() => undefined);
}

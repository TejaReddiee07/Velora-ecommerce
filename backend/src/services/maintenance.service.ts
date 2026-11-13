import mongoose, { Types } from 'mongoose';
import { Product } from '../models/Product.js';
import { Order } from '../models/Order.js';
import { StoreSettings } from '../models/StoreSettings.js';
import { Category } from '../models/Catalog.js';
import { deleteFile } from '../db/gridfs.js';
import { logger } from '../utils/logger.js';

/**
 * Deletes GridFS files that nothing references any more (e.g. an upload whose
 * request failed mid-way). Files younger than `minAgeMs` are skipped so
 * in-flight uploads are never touched.
 */
export async function cleanupOrphanImages(minAgeMs = 60 * 60_000) {
  const referenced = new Set<string>();
  const add = (files?: { sm?: unknown; md?: unknown; lg?: unknown } | null) => {
    if (!files) return;
    for (const id of [files.sm, files.md, files.lg]) if (id) referenced.add(String(id));
  };

  for await (const p of Product.find({}, { images: 1 }).lean().cursor()) for (const img of p.images ?? []) add(img.files);
  for (const id of await Order.distinct('items.image')) if (id) referenced.add(String(id));
  const settings = await StoreSettings.findOne({ key: 'store' }).lean();
  add(settings?.logo);
  for (const b of settings?.banners ?? []) add(b.image);
  for (const c of await Category.find({ image: { $ne: null } }, { image: 1 }).lean()) if (c.image) referenced.add(String(c.image));

  const cutoff = new Date(Date.now() - minAgeMs);
  const files = mongoose.connection.db!.collection('fs.files').find({ uploadDate: { $lt: cutoff } }, { projection: { _id: 1 } });
  let removed = 0;
  for await (const f of files) {
    if (!referenced.has(String(f._id))) {
      await deleteFile(f._id as Types.ObjectId as never);
      removed += 1;
    }
  }
  if (removed) logger.info(`Removed ${removed} orphaned GridFS file(s)`);
  return removed;
}

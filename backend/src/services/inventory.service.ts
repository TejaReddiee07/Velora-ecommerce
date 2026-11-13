import { Types } from 'mongoose';
import { Product, type IProduct, type IVariant } from '../models/Product.js';
import { StockMovement, type IStockMovement } from '../models/Misc.js';
import type { Actor } from '../models/common.js';
import type { Session } from '../db/transaction.js';
import { badRequest, conflict, notFound, outOfStock } from '../utils/errors.js';

export interface StockLine {
  product: Types.ObjectId;
  variant: Types.ObjectId;
  quantity: number;
  sku: string;
}

const SYSTEM: Actor = { type: 'system', name: 'System' };

/** Re-derives denormalised totals used for listing filters ("in stock"). */
export async function recomputeTotals(productIds: Types.ObjectId[], session?: Session) {
  if (!productIds.length) return;
  await Product.updateMany(
    { _id: { $in: productIds } },
    [
      {
        $set: {
          totalStock: { $sum: '$variants.stock' },
          totalAvailable: {
            $sum: {
              $map: { input: '$variants', as: 'v', in: { $cond: ['$$v.isActive', '$$v.available', 0] } },
            },
          },
        },
      },
    ],
    { session, updatePipeline: true },
  );
}

async function recordMovements(
  entries: Omit<IStockMovement, 'createdAt' | 'stockAfter' | 'availableAfter'>[],
  session?: Session,
) {
  if (!entries.length) return;
  // Snapshot resulting levels for the ledger.
  const productIds = [...new Set(entries.map((e) => String(e.product)))].map((id) => new Types.ObjectId(id));
  const products = await Product.find({ _id: { $in: productIds } }, { variants: 1 }, { session }).lean();
  const levels = new Map<string, IVariant>();
  for (const p of products) for (const v of p.variants) levels.set(String(v._id), v);
  await StockMovement.insertMany(
    entries.map((e) => ({
      ...e,
      stockAfter: levels.get(String(e.variant))?.stock,
      availableAfter: levels.get(String(e.variant))?.available,
    })),
    { session },
  );
}

/**
 * Atomically holds stock for a checkout. Each line is a single conditional
 * update (`available >= qty`), so concurrent buyers can never oversell.
 * Inside a transaction a failure aborts everything; without one, earlier
 * holds are compensated before throwing.
 */
export async function reserveLines(lines: StockLine[], order: Types.ObjectId, actor: Actor, session?: Session) {
  const done: StockLine[] = [];
  for (const line of lines) {
    const res = await Product.updateOne(
      {
        _id: line.product,
        status: 'published',
        variants: { $elemMatch: { _id: line.variant, isActive: true, available: { $gte: line.quantity } } },
      },
      { $inc: { 'variants.$.available': -line.quantity, 'variants.$.reserved': line.quantity } },
      { session },
    );
    if (res.modifiedCount !== 1) {
      if (!session && done.length) await releaseLines(done, order, SYSTEM, 'Checkout reservation rolled back').catch(() => undefined);
      throw outOfStock(`Sorry — ${line.sku} no longer has ${line.quantity} available.`, { sku: line.sku });
    }
    done.push(line);
  }
  await recomputeTotals(lines.map((l) => l.product), session);
  await recordMovements(
    lines.map((l) => ({
      product: l.product,
      variant: l.variant,
      sku: l.sku,
      type: 'reservation' as const,
      stockDelta: 0,
      reservedDelta: l.quantity,
      order,
      actor,
    })),
    session,
  );
}

/** Returns reserved units to sale (checkout expired, cancelled or failed). */
export async function releaseLines(lines: StockLine[], order: Types.ObjectId, actor: Actor, note?: string, session?: Session) {
  for (const line of lines) {
    await Product.updateOne(
      { _id: line.product, variants: { $elemMatch: { _id: line.variant, reserved: { $gte: line.quantity } } } },
      { $inc: { 'variants.$.available': line.quantity, 'variants.$.reserved': -line.quantity } },
      { session },
    );
  }
  await recomputeTotals(lines.map((l) => l.product), session);
  await recordMovements(
    lines.map((l) => ({
      product: l.product,
      variant: l.variant,
      sku: l.sku,
      type: 'release' as const,
      stockDelta: 0,
      reservedDelta: -l.quantity,
      order,
      actor,
      note,
    })),
    session,
  );
}

/** Converts a reservation into a sale after verified payment: stock and reserved both drop. */
export async function commitLines(lines: StockLine[], order: Types.ObjectId, session?: Session) {
  for (const line of lines) {
    const res = await Product.updateOne(
      {
        _id: line.product,
        variants: { $elemMatch: { _id: line.variant, reserved: { $gte: line.quantity }, stock: { $gte: line.quantity } } },
      },
      { $inc: { 'variants.$.stock': -line.quantity, 'variants.$.reserved': -line.quantity, soldCount: line.quantity } },
      { session },
    );
    if (res.modifiedCount !== 1) {
      throw conflict(`Reservation for ${line.sku} is missing; cannot commit sale.`);
    }
  }
  await recomputeTotals(lines.map((l) => l.product), session);
  await recordMovements(
    lines.map((l) => ({
      product: l.product,
      variant: l.variant,
      sku: l.sku,
      type: 'sale' as const,
      stockDelta: -l.quantity,
      reservedDelta: -l.quantity,
      order,
      actor: { type: 'stripe' as const, name: 'Stripe webhook' },
    })),
    session,
  );
}

/**
 * Used only when a payment succeeds after its reservation was already released
 * (e.g. very late async payment). Takes stock directly if still available.
 * Returns the lines that could not be fulfilled.
 */
export async function sellWithoutReservation(lines: StockLine[], order: Types.ObjectId, session?: Session) {
  const failed: StockLine[] = [];
  const sold: StockLine[] = [];
  for (const line of lines) {
    const res = await Product.updateOne(
      { _id: line.product, variants: { $elemMatch: { _id: line.variant, available: { $gte: line.quantity } } } },
      { $inc: { 'variants.$.stock': -line.quantity, 'variants.$.available': -line.quantity, soldCount: line.quantity } },
      { session },
    );
    if (res.modifiedCount === 1) sold.push(line);
    else failed.push(line);
  }
  await recomputeTotals(lines.map((l) => l.product), session);
  await recordMovements(
    sold.map((l) => ({
      product: l.product,
      variant: l.variant,
      sku: l.sku,
      type: 'sale' as const,
      stockDelta: -l.quantity,
      reservedDelta: 0,
      order,
      actor: { type: 'stripe' as const, name: 'Stripe webhook' },
      note: 'Late payment after reservation expiry',
    })),
    session,
  );
  return failed;
}

export async function findVariant(variantId: Types.ObjectId) {
  const product = await Product.findOne({ 'variants._id': variantId });
  if (!product) throw notFound('Variant not found.');
  const variant = product.variants.id(variantId);
  if (!variant) throw notFound('Variant not found.');
  return { product, variant };
}

/** Adds (positive) or removes (negative) on-hand units. Removal cannot touch reserved units. */
export async function adjustStock(
  variantId: Types.ObjectId,
  delta: number,
  actor: Actor,
  type: 'restock' | 'adjustment' | 'refund_restock' = delta > 0 ? 'restock' : 'adjustment',
  note?: string,
  order?: Types.ObjectId,
  session?: Session,
) {
  if (!Number.isInteger(delta) || delta === 0) throw badRequest('Quantity must be a non-zero whole number.');
  const filter: Record<string, unknown> =
    delta < 0
      ? { variants: { $elemMatch: { _id: variantId, available: { $gte: -delta } } } }
      : { 'variants._id': variantId };
  const product = await Product.findOneAndUpdate(
    filter,
    { $inc: { 'variants.$.stock': delta, 'variants.$.available': delta } },
    { returnDocument: 'after', session },
  ).lean<IProduct & { _id: Types.ObjectId }>();
  if (!product) {
    if (delta < 0) throw conflict('Cannot remove more units than are available (reserved units are held by open checkouts).');
    throw notFound('Variant not found.');
  }
  const variant = product.variants.find((v) => String(v._id) === String(variantId))!;
  await recomputeTotals([product._id], session);
  await recordMovements(
    [{ product: product._id, variant: variantId, sku: variant.sku, type, stockDelta: delta, reservedDelta: 0, order: order ?? null, actor, note }],
    session,
  );
  return { productId: product._id, variant: { ...variant, stock: variant.stock, available: variant.available } };
}

/** Sets on-hand stock to an absolute value (optimistic concurrency, retried). */
export async function setStock(variantId: Types.ObjectId, newStock: number, actor: Actor, note?: string) {
  if (!Number.isInteger(newStock) || newStock < 0) throw badRequest('Stock must be a whole number ≥ 0.');
  for (let attempt = 0; attempt < 5; attempt++) {
    const { product, variant } = await findVariant(variantId);
    if (newStock < variant.reserved) {
      throw conflict(`${variant.reserved} unit(s) are reserved by open checkouts. Stock cannot go below that.`);
    }
    const delta = newStock - variant.stock;
    if (delta === 0) return { productId: product._id, variant: variant.toObject() as IVariant };
    const res = await Product.updateOne(
      { _id: product._id, variants: { $elemMatch: { _id: variantId, stock: variant.stock, reserved: variant.reserved } } },
      { $inc: { 'variants.$.stock': delta, 'variants.$.available': delta } },
    );
    if (res.modifiedCount === 1) {
      await recomputeTotals([product._id]);
      await recordMovements([
        {
          product: product._id,
          variant: variantId,
          sku: variant.sku,
          type: delta > 0 ? 'restock' : 'adjustment',
          stockDelta: delta,
          reservedDelta: 0,
          order: null,
          actor,
          note: note ?? `Stock set to ${newStock}`,
        },
      ]);
      const fresh = await findVariant(variantId);
      return { productId: product._id, variant: fresh.variant.toObject() as IVariant };
    }
  }
  throw conflict('Stock changed while updating. Please retry.');
}

export function availabilityPayload(product: Pick<IProduct, 'variants' | 'totalAvailable'> & { _id: unknown; slug: string }) {
  return {
    productId: String(product._id),
    slug: product.slug,
    totalAvailable: product.totalAvailable,
    variants: product.variants.map((v) => ({ _id: String(v._id), available: v.isActive ? v.available : 0 })),
  };
}

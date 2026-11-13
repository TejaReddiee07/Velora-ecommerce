import { Types } from 'mongoose';
import { Product, type IProduct } from '../models/Product.js';
import type { IOrder } from '../models/Order.js';
import { realtime } from '../realtime/socket.js';
import { availabilityPayload } from './inventory.service.js';
import { notifyAdmins } from './notification.service.js';
import { queueEmail } from '../jobs/queue.js';
import { adminAlertMessage } from './email.service.js';
import { Admin } from '../models/Admin.js';
import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';

type ProductLean = IProduct & { _id: Types.ObjectId };

/** Catalogue change visible to shoppers (create/edit/price/publish/image). */
export function broadcastProductChanged(product: { _id: unknown; slug: string; status?: string }, kind: 'created' | 'updated' | 'removed' = 'updated') {
  const payload = { productId: String(product._id), slug: product.slug, kind, status: product.status };
  realtime.storefront(kind === 'removed' ? 'product:removed' : 'product:changed', payload);
  realtime.admin('product:changed', payload);
}

/** Pushes current availability for the given products to every shopper and admin. */
export async function broadcastInventory(productIds: (Types.ObjectId | string)[]) {
  const ids = [...new Set(productIds.map(String))].map((id) => new Types.ObjectId(id));
  if (!ids.length) return;
  const products = await Product.find({ _id: { $in: ids } }, { slug: 1, variants: 1, totalAvailable: 1, status: 1 }).lean<ProductLean[]>();
  for (const p of products) {
    const payload = availabilityPayload(p);
    if (p.status === 'published') realtime.storefront('inventory:changed', payload);
    realtime.admin('inventory:changed', payload);
  }
}

async function ownerEmails() {
  const admins = await Admin.find({ status: 'active', role: { $in: ['owner', 'manager'] } }, { email: 1 }).lean();
  return admins.map((a) => a.email);
}

/**
 * Raises low/out-of-stock alerts for variants whose available count crossed
 * a threshold because of `deltas` (variantId → units removed).
 */
export async function stockAlerts(deltas: Map<string, number>) {
  if (!deltas.size) return;
  try {
    const variantIds = [...deltas.keys()].map((id) => new Types.ObjectId(id));
    const products = await Product.find({ 'variants._id': { $in: variantIds } }).lean<ProductLean[]>();
    for (const p of products) {
      for (const v of p.variants) {
        const removed = deltas.get(String(v._id));
        if (!removed || removed <= 0) continue;
        const before = v.available + removed;
        const link = `${env.CLIENT_URL}/admin/inventory?q=${encodeURIComponent(v.sku)}`;
        if (v.available === 0 && before > 0) {
          const title = `Out of stock: ${p.name}`;
          const message = `${v.sku} (${v.color} / ${v.size}) has sold out and is no longer purchasable.`;
          await notifyAdmins({ type: 'stock.out', title, message, link: `/admin/inventory?q=${v.sku}`, data: { productId: String(p._id), variantId: String(v._id) } });
          for (const to of await ownerEmails()) await queueEmail(adminAlertMessage(to, title, message, link));
        } else if (v.available > 0 && v.available <= p.lowStockThreshold && before > p.lowStockThreshold) {
          const title = `Low stock: ${p.name}`;
          const message = `${v.sku} (${v.color} / ${v.size}) has ${v.available} unit(s) left.`;
          await notifyAdmins({ type: 'stock.low', title, message, link: `/admin/inventory?q=${v.sku}`, data: { productId: String(p._id), variantId: String(v._id) } });
          for (const to of await ownerEmails()) await queueEmail(adminAlertMessage(to, title, message, link));
        }
      }
    }
  } catch (err) {
    logger.warn('Stock alert evaluation failed', err);
  }
}

export function orderSummary(order: IOrder & { _id: unknown }) {
  return {
    _id: String(order._id),
    orderNumber: order.orderNumber,
    status: order.status,
    paymentStatus: order.paymentStatus,
    total: order.total,
    currency: order.currency,
    customerName: order.customerName,
    itemCount: order.items.reduce((s, i) => s + i.quantity, 0),
    createdAt: order.createdAt,
    paidAt: order.paidAt,
  };
}

export function broadcastOrder(order: IOrder & { _id: unknown }, event: 'order:created' | 'order:updated') {
  const summary = orderSummary(order);
  realtime.admin(event, summary);
  realtime.admin('analytics:refresh', { at: Date.now() });
  realtime.user(String(order.user), 'order:updated', summary);
}

export async function newOrderAlerts(order: IOrder & { _id: unknown }) {
  const amount = new Intl.NumberFormat('en-GB', { style: 'currency', currency: order.currency }).format(order.total / 100);
  const title = `New order ${order.orderNumber}`;
  const message = `${order.customerName} paid ${amount} for ${order.items.reduce((s, i) => s + i.quantity, 0)} item(s).`;
  await notifyAdmins({ type: 'order.new', title, message, link: `/admin/orders/${order._id}`, data: { orderId: String(order._id) } });
  for (const to of await ownerEmails()) await queueEmail(adminAlertMessage(to, title, message, `${env.CLIENT_URL}/admin/orders/${order._id}`));
}

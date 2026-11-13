import express, { Router } from 'express';
import { env } from '../config/env.js';
import { WebhookEvent } from '../models/Payment.js';
import { verifyWebhook, type StripeEventLike } from '../services/stripe.service.js';
import {
  handleAsyncPaymentFailed,
  handleChargeRefunded,
  handleCheckoutCompleted,
  handleCheckoutExpired,
  handlePaymentFailed,
  handleRefundUpdated,
} from '../services/order.service.js';
import { logger } from '../utils/logger.js';

const router = Router();

async function dispatch(event: StripeEventLike) {
  const obj = event.data.object;
  switch (event.type) {
    case 'checkout.session.completed':
    case 'checkout.session.async_payment_succeeded':
      return handleCheckoutCompleted(obj);
    case 'checkout.session.async_payment_failed':
      return handleAsyncPaymentFailed(obj);
    case 'checkout.session.expired':
      return handleCheckoutExpired(obj);
    case 'payment_intent.payment_failed':
      return handlePaymentFailed(obj);
    case 'charge.refunded':
      return handleChargeRefunded(obj);
    case 'refund.updated':
    case 'refund.failed':
      return handleRefundUpdated(obj);
    default:
      return undefined; // acknowledged, not used
  }
}

/**
 * Must receive the raw body (signature is computed over the exact bytes),
 * so this router is mounted before the JSON body parser.
 */
router.post('/webhooks/stripe', express.raw({ type: '*/*', limit: '1mb' }), async (req, res) => {
  if (!env.STRIPE_WEBHOOK_SECRET) {
    return res.status(503).json({ error: { code: 'WEBHOOK_NOT_CONFIGURED', message: 'STRIPE_WEBHOOK_SECRET is not set.' } });
  }
  const signature = req.get('stripe-signature');
  if (!signature || !Buffer.isBuffer(req.body)) {
    return res.status(400).json({ error: { code: 'INVALID_SIGNATURE', message: 'Missing Stripe signature.' } });
  }

  let event: StripeEventLike;
  try {
    event = verifyWebhook(req.body, signature, env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    logger.warn('Rejected Stripe webhook with invalid signature');
    return res.status(400).json({ error: { code: 'INVALID_SIGNATURE', message: 'Invalid signature.' } });
  }

  // Idempotency: each Stripe event id is processed at most once.
  try {
    await WebhookEvent.create({ eventId: event.id, type: event.type, status: 'processing' });
  } catch (err) {
    if ((err as { code?: number }).code !== 11000) throw err;
    const existing = await WebhookEvent.findOne({ eventId: event.id });
    const stale = existing && existing.status === 'processing' && Date.now() - existing.updatedAt.getTime() > 2 * 60_000;
    if (existing?.status === 'processed' || (existing?.status === 'processing' && !stale)) {
      return res.json({ received: true, duplicate: true });
    }
    await WebhookEvent.updateOne({ eventId: event.id }, { $set: { status: 'processing' } });
  }

  try {
    await dispatch(event);
    await WebhookEvent.updateOne({ eventId: event.id }, { $set: { status: 'processed' }, $unset: { error: 1 } });
    res.json({ received: true });
  } catch (err) {
    logger.error(`Webhook ${event.type} (${event.id}) failed`, err);
    await WebhookEvent.updateOne({ eventId: event.id }, { $set: { status: 'failed', error: err instanceof Error ? err.message : String(err) } });
    // 500 → Stripe retries with backoff.
    res.status(500).json({ error: { code: 'WEBHOOK_FAILED', message: 'Processing failed; Stripe will retry.' } });
  }
});

export default router;

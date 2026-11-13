import Stripe from 'stripe';
import { env } from '../config/env.js';

export interface CheckoutSessionLike {
  id: string;
  url: string | null;
  status: 'open' | 'complete' | 'expired' | null;
  payment_status: 'paid' | 'unpaid' | 'no_payment_required';
  amount_total: number | null;
  currency: string | null;
  metadata: Record<string, string> | null;
  client_reference_id: string | null;
  payment_intent: string | { id: string } | null;
}

export interface RefundLike {
  id: string;
  status: string | null;
  amount: number;
  payment_intent?: string | { id: string } | null;
  metadata?: Record<string, string> | null;
}

export interface StripeEventLike {
  id: string;
  type: string;
  data: { object: any };
}

export interface PaymentDetails {
  chargeId?: string;
  paymentMethodType?: string;
  cardBrand?: string;
  cardLast4?: string;
  wallet?: string;
}

/** The subset of Stripe this app uses — real SDK in production, a fake in tests. */
export interface StripeGateway {
  createCheckoutSession(params: Record<string, unknown>, idempotencyKey: string): Promise<CheckoutSessionLike>;
  retrieveCheckoutSession(id: string): Promise<CheckoutSessionLike>;
  expireCheckoutSession(id: string): Promise<CheckoutSessionLike>;
  createCoupon(params: { amount_off: number; currency: string; name: string }, idempotencyKey: string): Promise<{ id: string }>;
  createRefund(
    params: { payment_intent: string; amount: number; reason?: 'requested_by_customer' | 'duplicate' | 'fraudulent'; metadata: Record<string, string> },
    idempotencyKey: string,
  ): Promise<RefundLike>;
  paymentDetails(paymentIntentId: string): Promise<PaymentDetails>;
  constructEvent(rawBody: Buffer, signature: string, secret: string): StripeEventLike;
}

class SdkGateway implements StripeGateway {
  private client: Stripe;
  constructor(secretKey: string) {
    this.client = new Stripe(secretKey, { maxNetworkRetries: 2, timeout: 20_000, appInfo: { name: 'VELORA Commerce' } });
  }
  async createCheckoutSession(params: Record<string, unknown>, idempotencyKey: string) {
    return (await this.client.checkout.sessions.create(params as never, { idempotencyKey })) as unknown as CheckoutSessionLike;
  }
  async retrieveCheckoutSession(id: string) {
    return (await this.client.checkout.sessions.retrieve(id)) as unknown as CheckoutSessionLike;
  }
  async expireCheckoutSession(id: string) {
    return (await this.client.checkout.sessions.expire(id)) as unknown as CheckoutSessionLike;
  }
  async createCoupon(params: { amount_off: number; currency: string; name: string }, idempotencyKey: string) {
    const c = await this.client.coupons.create({ ...params, duration: 'once', max_redemptions: 1 } as never, { idempotencyKey });
    return { id: (c as { id: string }).id };
  }
  async createRefund(
    params: { payment_intent: string; amount: number; reason?: 'requested_by_customer' | 'duplicate' | 'fraudulent'; metadata: Record<string, string> },
    idempotencyKey: string,
  ) {
    return (await this.client.refunds.create(params as never, { idempotencyKey })) as unknown as RefundLike;
  }
  async paymentDetails(paymentIntentId: string): Promise<PaymentDetails> {
    const pi = (await this.client.paymentIntents.retrieve(paymentIntentId, { expand: ['latest_charge'] } as never)) as any;
    const charge = pi?.latest_charge && typeof pi.latest_charge === 'object' ? pi.latest_charge : null;
    const details = charge?.payment_method_details;
    return {
      chargeId: charge?.id,
      paymentMethodType: details?.type,
      cardBrand: details?.card?.brand,
      cardLast4: details?.card?.last4,
      wallet: details?.card?.wallet?.type,
    };
  }
  constructEvent(rawBody: Buffer, signature: string, secret: string) {
    return this.client.webhooks.constructEvent(rawBody, signature, secret) as unknown as StripeEventLike;
  }
}

let gateway: StripeGateway | null | undefined;

export function getStripe(): StripeGateway | null {
  if (gateway === undefined) gateway = env.STRIPE_SECRET_KEY ? new SdkGateway(env.STRIPE_SECRET_KEY) : null;
  return gateway;
}

/** Test hook. */
export function setStripeGateway(g: StripeGateway | null) {
  gateway = g;
}

/** Signature verification only needs the webhook secret, not an API key. */
export function verifyWebhook(rawBody: Buffer, signature: string, secret: string): StripeEventLike {
  const g = getStripe();
  if (g) return g.constructEvent(rawBody, signature, secret);
  const verifier = new Stripe('sk_test_signature_verification_only');
  return verifier.webhooks.constructEvent(rawBody, signature, secret) as unknown as StripeEventLike;
}

export function paymentIntentId(value: CheckoutSessionLike['payment_intent'] | RefundLike['payment_intent']) {
  if (!value) return undefined;
  return typeof value === 'string' ? value : value.id;
}

import { Schema, model, type Types } from 'mongoose';
import { CURRENCIES, actorSchema, type Actor, type Currency } from './common.js';

export interface IRefund {
  stripeRefundId: string;
  amount: number;
  reason?: string;
  status: 'pending' | 'succeeded' | 'failed' | 'canceled' | 'requires_action';
  restocked: boolean;
  createdBy: Actor;
  createdAt: Date;
}

export interface IPayment {
  order: Types.ObjectId;
  user: Types.ObjectId;
  provider: 'stripe';
  status: 'pending' | 'succeeded' | 'failed' | 'expired' | 'cancelled' | 'partially_refunded' | 'refunded';
  amount: number;
  currency: Currency;
  fxRate: number;
  checkoutSessionId?: string;
  paymentIntentId?: string;
  chargeId?: string;
  paymentMethodType?: string;
  cardBrand?: string;
  cardLast4?: string;
  wallet?: string;
  amountRefunded: number;
  refunds: IRefund[];
  failureMessage?: string;
  events: { type: string; id: string; at: Date }[];
  paidAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const paymentSchema = new Schema<IPayment>(
  {
    order: { type: Schema.Types.ObjectId, ref: 'Order', required: true, index: true },
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    provider: { type: String, enum: ['stripe'], default: 'stripe' },
    status: {
      type: String,
      enum: ['pending', 'succeeded', 'failed', 'expired', 'cancelled', 'partially_refunded', 'refunded'],
      default: 'pending',
    },
    amount: { type: Number, required: true },
    currency: { type: String, enum: CURRENCIES, required: true },
    fxRate: { type: Number, required: true },
    checkoutSessionId: { type: String },
    paymentIntentId: { type: String },
    chargeId: String,
    paymentMethodType: String,
    cardBrand: String,
    cardLast4: String,
    wallet: String,
    amountRefunded: { type: Number, default: 0 },
    refunds: [
      {
        _id: false,
        stripeRefundId: { type: String, required: true },
        amount: { type: Number, required: true },
        reason: String,
        status: { type: String, required: true },
        restocked: { type: Boolean, default: false },
        createdBy: { type: actorSchema, required: true },
        createdAt: { type: Date, default: Date.now },
      },
    ],
    failureMessage: String,
    events: [{ _id: false, type: { type: String }, id: String, at: { type: Date, default: Date.now } }],
    paidAt: Date,
  },
  { timestamps: true },
);

paymentSchema.index({ checkoutSessionId: 1 }, { unique: true, sparse: true });
paymentSchema.index({ paymentIntentId: 1 }, { sparse: true });
paymentSchema.index({ createdAt: -1 });

export const Payment = model<IPayment>('Payment', paymentSchema);

/** Processed Stripe webhook event ids — guarantees each event is applied once. */
export interface IWebhookEvent {
  eventId: string;
  type: string;
  status: 'processing' | 'processed' | 'failed';
  error?: string;
  createdAt: Date;
  updatedAt: Date;
}

const webhookEventSchema = new Schema<IWebhookEvent>(
  {
    eventId: { type: String, required: true, unique: true },
    type: { type: String, required: true },
    status: { type: String, enum: ['processing', 'processed', 'failed'], default: 'processing' },
    error: String,
  },
  { timestamps: true },
);

export const WebhookEvent = model<IWebhookEvent>('WebhookEvent', webhookEventSchema);

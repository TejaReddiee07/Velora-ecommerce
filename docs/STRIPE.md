# Stripe setup

VELORA uses **Stripe Checkout** (a hosted payment page). Card data never touches your servers. Apple Pay and Google Pay appear automatically on eligible devices once they're enabled in your Stripe Dashboard.

## 1. Keys

1. In the [Stripe Dashboard](https://dashboard.stripe.com/test/apikeys), stay in **Test mode** and copy the **Secret key** (`sk_test_…`).
2. Put it in `backend/.env`:

```
STRIPE_SECRET_KEY=sk_test_...
```

The publishable key isn't needed, because the server creates the Checkout Session and redirects the customer to Stripe.

## 2. Webhooks

Webhooks are the main way payments are confirmed. Without a webhook secret the API rejects all webhook calls and relies on server-side checks with Stripe (see §4).

### Local development (Stripe CLI)

```bash
stripe login        # or pass --api-key sk_test_...
stripe listen --forward-to localhost:4000/api/webhooks/stripe
```

The CLI prints a signing secret (`whsec_…`). Put it in `backend/.env`:

```
STRIPE_WEBHOOK_SECRET=whsec_...
```

Restart the API. `GET /api/health` should then show `"stripeWebhook": "configured"`.

### Production

Dashboard → **Developers → Webhooks → Add endpoint**:

- URL: `https://api.your-domain.com/api/webhooks/stripe`
- Events:
  - `checkout.session.completed`
  - `checkout.session.async_payment_succeeded`
  - `checkout.session.async_payment_failed`
  - `checkout.session.expired`
  - `payment_intent.payment_failed`
  - `charge.refunded`
  - `refund.updated`
  - `refund.failed`

Copy the endpoint's signing secret into `STRIPE_WEBHOOK_SECRET`.

## 3. Payment lifecycle

| Step | What happens |
| --- | --- |
| Customer clicks **Pay** | The server recalculates everything from MongoDB, **reserves stock** in a transaction, creates the order (`pending_payment`), then creates a Checkout Session. The idempotency key is `checkout_<orderId>`, and the session expires after `RESERVATION_MINUTES` (30 or more) plus 1 minute. Prices, delivery and discounts are sent as server-calculated amounts. |
| `checkout.session.completed` (paid) | The signature is verified, and the event id is recorded so it is only applied once. Within a transaction the order becomes `paid`, the reservation becomes a sale (stock − qty, reserved − qty), the coupon usage count goes up and the bag is cleared. The customer and owner are then notified by email, in-app and in real time. |
| Delayed payment methods | The order stays `pending` until `async_payment_succeeded` or `async_payment_failed` arrives. |
| `checkout.session.expired`, `async_payment_failed`, customer cancels | The reservation is released, the order becomes `cancelled` (payment `expired`, `failed` or `cancelled`), and stock returns to sale. |
| `payment_intent.payment_failed` | The decline reason is recorded. The reservation is kept so the customer can retry until the session expires. |
| Scheduled job (every minute) | Finds expired reservations and checks the session with Stripe first. If it was actually paid, it confirms the order; otherwise it expires the session and releases the stock. |
| Refund (owner portal) | `POST /api/admin/orders/:id/refund` calls `refunds.create` with an idempotency key, records it on the payment, can restock, and emails the customer. Refunds made in the Stripe Dashboard are picked up via `charge.refunded`. |

If a payment arrives after its reservation was released (a rare late async payment), the API tries to take the stock directly. If that size has sold out, the order is flagged **stock conflict** for the owner to refund or fulfil.

## 4. Server-side confirmation backup

The success page calls `GET /api/orders/by-session/:id`. That endpoint fetches the session **from Stripe's API with your secret key** and confirms the order if Stripe says it's paid. This covers delayed webhooks and local development without the CLI. It is still verified by Stripe; the browser's redirect is never trusted.

## 5. Testing

| Card | Result |
| --- | --- |
| `4242 4242 4242 4242` | Succeeds |
| `4000 0000 0000 9995` | Declined (insufficient funds) |
| `4000 0025 0000 3155` | Requires 3-D Secure authentication |

Use any future expiry date and any CVC. Automated tests (`npm test`) sign webhook events with Stripe's own library to test signature checks, duplicate events and every lifecycle branch. The Playwright test (`npm run test:e2e`) pays on Stripe's real test checkout.

## 6. Going live

1. Complete Stripe account activation.
2. Switch to live keys (`sk_live_…`) and create a live webhook endpoint with its own secret.
3. Enable Apple Pay and Google Pay under Settings → Payment methods (Apple Pay requires domain verification).
4. Run a real low-value purchase and refund it.

# Deployment guide

VELORA deploys as two services sharing one MongoDB Atlas database:

```
Browser ──► Storefront (Next.js, :3000) ──SSR──► API (Express + Socket.IO, :4000) ──► MongoDB Atlas (+ GridFS)
   └──────────── fetch / WebSocket / images ──────────►┘                              └► Stripe, SMTP, Redis (optional)
```

## Recommended topology

Put both on the **same site** so the session cookies stay first-party (`SameSite=Lax`):

- Storefront: `https://www.example.com`
- API: `https://api.example.com`

Set `COOKIE_DOMAIN=.example.com` only if the storefront's server-side rendering needs the cookie. Client-side calls work without it.

If the API must be on a different site (e.g. `*.onrender.com` with the storefront on `*.vercel.app`), set `COOKIE_SAMESITE=none` (HTTPS required) and add the storefront origin to `CORS_ORIGINS`.

## API (Node.js)

Any Node 20+ host works: Render, Railway, Fly.io, AWS, a VPS, etc. **WebSockets must be supported** for Socket.IO.

```bash
cd backend
npm ci
npm run build
NODE_ENV=production node dist/index.js
```

Production environment (see `backend/.env.example`):

```
NODE_ENV=production
PORT=4000
API_PUBLIC_URL=https://api.example.com
CLIENT_URL=https://www.example.com
CORS_ORIGINS=https://www.example.com
MONGODB_URI=mongodb+srv://…/velora?retryWrites=true&w=majority
SESSION_SECRET=<48+ random chars>
ADMIN_EMAIL=… ADMIN_PASSWORD=…      # used only to create the first owner
STRIPE_SECRET_KEY=sk_live_…
STRIPE_WEBHOOK_SECRET=whsec_…
REDIS_URL=rediss://…                 # recommended when running more than one instance
SMTP_HOST=… SMTP_PORT=587 SMTP_USER=… SMTP_PASS=… EMAIL_FROM="VELORA <orders@example.com>"
EMAIL_TRANSPORT=auto
```

Notes:
- **Atlas network access:** add the host's outbound IP addresses.
- **Proxies:** the app sets `trust proxy` to 1 so rate limiting uses the real client IP behind one proxy or load balancer. Adjust in `src/app.ts` if your proxy chain differs.
- **Multiple instances:** set `REDIS_URL` so BullMQ coordinates reservation expiry and emails. Socket.IO across instances also needs sticky sessions or the `@socket.io/redis-adapter`.
- **Health check:** `GET /api/health`.
- **Seeding:** the bundled seed images live in `backend/src/seed/assets` and must be deployed with the build (they are, because the folder is part of the backend). After launch you can set `SEED_ON_START=false`.

## Storefront (Next.js)

Vercel, Netlify or any Node host:

```bash
cd frontend
npm ci
npm run build
npm start            # or the platform's Next.js runtime
```

Environment:

```
NEXT_PUBLIC_API_URL=https://api.example.com     # browser → API, images, WebSocket
API_INTERNAL_URL=https://api.example.com        # server-side rendering → API (can be a private URL)
NEXT_PUBLIC_SITE_URL=https://www.example.com
```

## Stripe

Create the live webhook endpoint `https://api.example.com/api/webhooks/stripe` (see [STRIPE.md](STRIPE.md)) and enable Apple Pay and Google Pay domains.

## Email

Any SMTP provider works (Postmark, SES, SendGrid, Mailgun, Gmail with an app password). For Gmail, `EMAIL_FROM` must be the authenticated address or a verified alias. Use `EMAIL_TRANSPORT=log` in staging to print emails instead of sending them.

## Pre-launch checklist

- [ ] Strong `SESSION_SECRET`, unique `ADMIN_PASSWORD`; change the owner password after first login
- [ ] `NODE_ENV=production` (secure cookies)
- [ ] Live Stripe keys and webhook secret; place and refund a real low-value order
- [ ] Replace demo product photography and copy with the client's own
- [ ] Settings: store name, logo, contact, currencies and exchange rate, tax, delivery prices, return policy, social links
- [ ] Remove demo data: `npm run seed:reset` with `SEED_ON_START=false`, then add real products, or keep the demo catalogue for a showroom build
- [ ] Atlas backups enabled; IP access list restricted
- [ ] `npm test` and `npm run test:e2e` pass against staging

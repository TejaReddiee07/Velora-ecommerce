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

If the API must be on a different site (e.g. `*.onrender.com` with the storefront on `*.vercel.app`) and you have no custom domain yet, do **not** rely on cross-site cookies: Safari (every iPhone), Brave and private windows block them, so customers could not stay signed in, keep a bag or check out. Use the same-site proxy described in [Storefront and API on different sites](#storefront-and-api-on-different-sites-vercel--render) instead.

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
NEXT_PUBLIC_API_PROXY=1                         # only if the API is on a different site, see below
```

## Storefront and API on different sites (Vercel + Render)

Browsers treat `*.vercel.app` and `*.onrender.com` as different sites. A login or bag cookie set by the API would be a *third-party* cookie, and Safari (every iPhone), Brave and private windows block those: customers could not stay signed in, keep a bag or check out, and the owner portal would show "Could not load analytics". `SameSite=None` does not help.

The fix needs no custom domain: the storefront forwards its own `/api` to the API, so the cookies belong to the storefront's domain.

1. On the storefront host (Vercel) keep `NEXT_PUBLIC_API_URL=https://<your-api>.onrender.com` and add `NEXT_PUBLIC_API_PROXY=1`.
2. Redeploy the storefront (`NEXT_PUBLIC_*` values are baked in at build time). The build fails with a clear message if the API address is missing.
3. Leave the API as it is: `CORS_ORIGINS` and `CLIENT_URL` keep the storefront address.

What changes: the browser calls `https://<storefront>/api/...`, which `next.config.ts` forwards to the API. Product images still load straight from the API host (they are public), and so does the realtime socket; because the socket cannot see the storefront's cookies it authenticates with a one-minute signed ticket from `GET /api/realtime/ticket`. Remove the variable to go back to direct calls.

Good to know:

- The API sees the proxy's IP address instead of each visitor's, so its rate limits are shared by everyone using the store. That is fine for a small shop; a custom domain removes the limitation.
- Image uploads from the owner portal pass through the proxy too. Test one large photo after deploying.
- With a custom domain for both (`www.example.com` and `api.example.com`, `COOKIE_DOMAIN=.example.com`) none of this is needed.

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

# API reference

Base URL: `http://localhost:4000/api`

**Conventions**
- Requests and responses use JSON (image uploads use `multipart/form-data`).
- Money is always an **integer in minor units** (pence or cents) together with a `currency` code.
- Errors look like `{ "error": { "code", "message", "fields?": [{ "path", "message" }], "details?" } }`.

**Authentication**
- Customers use the `velora_sid` cookie (httpOnly, SameSite=Lax, 30 days).
- Staff use the `velora_admin` cookie (httpOnly, SameSite=Strict, 12 hours). Customer and staff accounts are completely separate.
- Browser requests must send credentials (`credentials: 'include'`).
- State-changing requests from browsers must come from an allowed `Origin` (CSRF protection).

**Rate limits**
- Global: 600 requests/min per IP.
- Customer auth: 20 per 15 min.
- Admin sign-in: 10 per 15 min, plus account lockout after 5 failures.
- Checkout: 30 per 10 min.
- Uploads: 120 per 10 min.

Exceeding a limit returns `429 RATE_LIMITED`.

---

## Public

| Method | Path | Description |
| --- | --- | --- |
| GET | `/health` | Database, transactions, Stripe, jobs and email status |
| GET | `/realtime/ticket` | `{ ticket }`: a one-minute signed ticket for the Socket.IO handshake (`null` when signed out). Never cached. See *Real-time events* |
| GET | `/settings/public` | Store name, logo, contact, currencies, tax display, delivery methods, return policy, announcement, active banners, social links, `stripeEnabled` |
| GET | `/catalog/categories` | Active categories with published product counts |
| GET | `/catalog/brands` | Active brands |
| GET | `/products` | Product listing (see query below) |
| GET | `/products/suggest?q=` | Search suggestions: up to 6 products, matching categories and brands |
| GET | `/products/:idOrSlug?currency=` | Published product detail (variants with `available`) plus related products |
| GET | `/products/:id/reviews?page=&limit=` | Published reviews and the rating distribution |
| GET | `/images/:fileId` | **Streams an image file from GridFS** (WebP, ETag, immutable cache) |
| POST | `/newsletter/subscribe` | `{ email, source? }` |

`GET /products` query parameters (all optional):

| Param | Notes |
| --- | --- |
| `department` | `clothing` · `footwear` · `accessories` |
| `gender` | Comma-separated: `men,women,unisex` |
| `category`, `style`, `size`, `color`, `brand` | Comma-separated values (category slugs, style keys, sizes, colour names, brand names) |
| `minPrice`, `maxPrice` | Minor units in the requested `currency` |
| `rating` | Minimum average rating |
| `inStock`, `onSale`, `featured`, `newArrival`, `bestSeller` | `true` / `false` |
| `ids` | Comma-separated product ids |
| `q` | Full-text search, falling back to partial-word matching |
| `sort` | `featured` · `newest` · `price_asc` · `price_desc` · `best_selling` · `popular` · `rating` · `relevance` |
| `page`, `limit` | Pagination (`limit` ≤ 100) |
| `currency` | `GBP` · `USD` (any enabled currency) |
| `facets` | `true` adds the available filter values for the current department and gender |

Response: `{ items: ProductCard[], page, limit, total, totalPages, currency, facets? }`. Cards never include cost prices or reserved stock.

## Customer authentication & account

| Method | Path | Body / notes |
| --- | --- | --- |
| POST | `/auth/register` | `{ name, email, password, marketingOptIn? }`. Signs the user in, merges any guest bag and sends a verification email |
| POST | `/auth/login` | `{ email, password }`. One sign-in for the whole site: owner/staff credentials start an owner-portal session and return `{ role: "admin", admin }` (same lockout as `/admin/auth/login`); customer credentials return `{ role: "customer", user }` and merge any guest bag |
| POST | `/auth/logout` | |
| GET | `/auth/me` | `{ user \| null }` |
| POST | `/auth/forgot-password` | `{ email }`. Same response whether or not the account exists |
| POST | `/auth/reset-password` | `{ token, password }`. Single-use 1-hour token; signs out all sessions |
| POST | `/auth/verify-email` | `{ token }` |
| POST | `/auth/resend-verification` | Signed in |
| PATCH | `/account/profile` | `{ name?, phone?, marketingOptIn? }` |
| POST | `/account/change-password` | `{ currentPassword, newPassword }`. Signs out other devices |
| GET / POST | `/account/addresses` | List or create `{ fullName, line1, line2?, city, state?, postalCode, country: "GB", phone?, label?, isDefault? }`. UK only: `country` must be `GB` and `postalCode` a valid UK postcode (returned as `SW1A 1AA`). The list adds `deliverable` and `deliveryIssue` to each address |
| PUT / DELETE | `/account/addresses/:id` | Only the account's own addresses |

## Bag, wishlist, checkout, orders

| Method | Path | Body / notes |
| --- | --- | --- |
| GET | `/cart?currency=&delivery=` | Server-priced bag: lines with stock issues, discount, delivery options, tax, total. Guests are identified by a `velora_cart` cookie |
| POST | `/cart/items` | `{ productId, variantId, quantity }`. Checks availability (`409 OUT_OF_STOCK` / `INSUFFICIENT_STOCK`) |
| PATCH / DELETE | `/cart/items/:itemId` | `{ quantity }` (0 removes the line) |
| POST / DELETE | `/cart/coupon` | `{ code }` |
| GET | `/wishlist` | Signed in |
| POST / DELETE | `/wishlist/:productId` | |
| POST | `/wishlist/:productId/move-to-cart` | `{ variantId, quantity? }` |
| POST | `/checkout/create-session` | `{ addressId \| address, saveAddress?, deliveryMethodId?, couponCode?, currency?, phone?, notes? }` → `{ url, orderId, orderNumber }`. Prices are calculated on the server and stock is reserved; Stripe Checkout URL returned. Errors: `400 ADDRESS_NOT_DELIVERABLE` (address outside the UK, also for saved addresses), `409 CART_CHANGED`, `409 OUT_OF_STOCK`, `503` if Stripe isn't configured or is unreachable |
| POST | `/checkout/:orderNumber/cancel` | Customer left Stripe without paying: expires the session and releases the reservation |
| GET | `/orders?page=&limit=` | The customer's orders (open checkouts excluded) |
| GET | `/orders/:orderNumber` | Order with tracking, history (internal notes hidden) and payment brand/last 4 |
| GET | `/orders/by-session/:sessionId` | Success page: confirms the payment with Stripe's API on the server, then returns the order |
| GET | `/notifications` · POST `/notifications/read` | In-app notifications |
| POST | `/products/:id/reviews` | `{ rating 1–5, title, body }`. Only customers who bought the product |

## Stripe webhook

| Method | Path | Notes |
| --- | --- | --- |
| POST | `/webhooks/stripe` | Raw body plus `Stripe-Signature`. Invalid signature returns `400`. Each event id is processed once (duplicates return `{ received: true, duplicate: true }`). See [STRIPE.md](STRIPE.md) for the events handled |

## Admin — authentication

| Method | Path | Notes |
| --- | --- | --- |
| POST | `/admin/auth/login` | `{ email, password }`. Returns `423 ACCOUNT_LOCKED` after 5 failures (locked 15 min) |
| POST | `/admin/auth/logout` | |
| GET | `/admin/auth/me` | `{ admin: { name, email, role, permissions[] } }` |

Every other `/admin/*` route requires the admin cookie and a permission. Roles: **owner** has all permissions. **Manager** has everything except staff management and store settings. **Staff** can view products, update inventory, view and fulfil orders, and view customers.

## Admin — products & images

| Method | Path | Permission | Notes |
| --- | --- | --- | --- |
| GET | `/admin/products?q=&status=&department=&category=&stock=low\|out\|in&sort=&page=&limit=` | products:read | Includes drafts; archived only when filtered |
| GET | `/admin/products/:id` | products:read | Full document including cost, stock and reserved counts |
| POST | `/admin/products` | products:write | Created as a draft. Body: `name, slug?, description, shortDescription?, department, gender, categoryId, brandId, styles[], tags[], price, salePrice?, costPrice?, specifications[], sizeGuide, isFeatured, isNewArrival, isBestSeller, lowStockThreshold, variants[{ sku, size, color, colorHex, stock?, isActive }]` |
| PUT | `/admin/products/:id` | products:write | Same body. Existing variants keep their `_id`; stock changes are recorded in the ledger; variants with reserved stock can't be removed |
| PATCH | `/admin/products/:id/status` | products:write | `{ status: draft \| published \| archived }`. Publishing requires at least one image |
| DELETE | `/admin/products/:id` | products:write | Deletes the product and its GridFS files (keeps thumbnails used by past orders) |
| POST | `/admin/products/:id/images` | products:write | Multipart: `images` (1–10 files), `color?`, `alt?`. Each file is validated and stored as three WebP sizes in GridFS |
| PUT | `/admin/products/:id/images/:imageId` | products:write | Multipart `image`. Replaces the files and deletes the old ones. `:imageId` may be the image entry id or any of its file ids |
| PATCH | `/admin/products/:id/images/:imageId` | products:write | `{ alt?, color? }` |
| DELETE | `/admin/products/:id/images/:imageId` | products:write | The last image of a published product can't be deleted |
| PATCH | `/admin/products/:id/images-order` | products:write | `{ order: [imageId…] }` |
| GET / POST / PUT / DELETE | `/admin/categories[/:id]` | products:* | |
| GET / POST / PUT / DELETE | `/admin/brands[/:id]` | products:* | |

Upload limits: JPEG, PNG, WebP or AVIF; at most `MAX_UPLOAD_MB` (8 MB by default); at least 200×200 px; at most 50 MP. Files are checked by decoding them, not by trusting their extension.

## Admin — inventory

| Method | Path | Notes |
| --- | --- | --- |
| GET | `/admin/inventory?q=&filter=all\|low\|out\|reserved&page=&limit=` | One row per variant: on-hand, reserved, available |
| PUT | `/admin/inventory/:variantId` | `{ stock, note? }`. Sets the on-hand amount (can't go below reserved) |
| POST | `/admin/inventory/restock` | `{ variantId, quantity, note? }` |
| POST | `/admin/inventory/adjust` | `{ variantId, delta, note }`. Removals can't touch reserved units |
| GET | `/admin/inventory/movements?productId=&variantId=` | Stock ledger |

## Admin — orders & customers

| Method | Path | Notes |
| --- | --- | --- |
| GET | `/admin/orders?q=&status=&paymentStatus=&from=&to=&includePending=&page=&limit=` | Search by order number, email, name, SKU or tracking number |
| GET | `/admin/orders/:id` | Order, payment (Stripe ids, card, refunds), customer and `allowedStatuses` |
| PUT | `/admin/orders/:id/status` | `{ status: processing\|packed\|shipped\|out_for_delivery\|delivered, note? }`. Only allowed transitions; the customer is emailed |
| PUT | `/admin/orders/:id/tracking` | `{ carrier, number, url? }` |
| POST | `/admin/orders/:id/notes` | `{ message }`. Internal note, never shown to the customer |
| POST | `/admin/orders/:id/cancel` | Unpaid: releases stock. Paid and not yet shipped: full refund plus restock |
| POST | `/admin/orders/:id/refund` | `{ amount? (minor units; omit for the remaining balance), reason?, restock? }` |
| GET | `/admin/customers?q=&sort=newest\|spent\|orders` | Order count and net spend |
| GET | `/admin/customers/:id` | Profile, stats, orders, addresses |
| PATCH | `/admin/customers/:id/status` | `{ status: active \| suspended }`. Suspending signs the customer out everywhere |

## Admin — analytics

| Method | Path | Notes |
| --- | --- | --- |
| GET | `/admin/analytics/overview?from=&to=` | Revenue windows, the period breakdown, order, customer and product counts, recent transactions |
| GET | `/admin/analytics/revenue?granularity=day\|week\|month\|year&from=&to=` | Time series plus period totals |
| GET | `/admin/analytics/products?from=&to=` | Best sellers, sales by category and department, top customers |
| GET | `/admin/analytics/export.csv?from=&to=` | Orders CSV |

Accounting rules: [ANALYTICS.md](ANALYTICS.md).

## Admin — promotions, settings, staff, misc

| Method | Path | Notes |
| --- | --- | --- |
| GET / POST / PUT / DELETE | `/admin/coupons[/:id]` | `{ code, description?, kind: code\|automatic, type: percentage\|fixed, value, minOrderValue, startsAt?, expiresAt?, usageLimit?, perUserLimit?, isActive }` |
| GET / PUT | `/admin/settings` | Store details, currency (base, enabled, rates, rounding), tax, delivery methods, return policy, announcement, social links, low-stock threshold |
| POST / DELETE | `/admin/settings/logo` | Multipart `image`, stored in GridFS |
| POST / PUT / DELETE | `/admin/banners[/:id]` | Multipart (`image` + fields), images stored in GridFS |
| GET / POST / PATCH | `/admin/staff[/:id]` | Owner only |
| GET | `/admin/notifications` · POST `/admin/notifications/read` | |
| GET | `/admin/activity?entityType=&entityId=` | Audit log |
| GET / PATCH | `/admin/reviews[/:id]` | Moderation (`published` / `hidden`) |
| GET | `/admin/newsletter` | Subscribers |
| POST | `/admin/maintenance/cleanup-images` | Removes orphaned GridFS files older than 10 minutes |

## Real-time events (Socket.IO)

Connect to the API origin with `withCredentials: true`. Rooms are assigned on the server from the session cookies; clients can't choose rooms.

When the storefront reaches the API through its own domain (`NEXT_PUBLIC_API_PROXY=1`, see [DEPLOYMENT.md](DEPLOYMENT.md)) the cookies never reach the socket host. The client then fetches `GET /realtime/ticket` over the proxy and passes it as `io(url, { auth: { ticket } })`; a valid ticket decides the rooms instead of the cookies, and an invalid or expired one simply gives an anonymous `storefront` connection.

| Room | Events |
| --- | --- |
| everyone (`storefront`) | `product:changed`, `product:removed` `{ productId, slug }` · `inventory:changed` `{ productId, slug, totalAvailable, variants[{ _id, available }] }` · `settings:changed` |
| `admin` | everything above plus `order:created`, `order:updated`, `notification`, `analytics:refresh` |
| `user:<id>` | `order:updated` (that customer's orders only) and `notification` |

Socket messages only say *what changed*; clients re-read the data from the API. Notifications are saved in MongoDB, so nothing is lost while a client is disconnected.

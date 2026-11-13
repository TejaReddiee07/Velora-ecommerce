# MongoDB Atlas & GridFS

## 1. Create the database

1. Create a cluster in [MongoDB Atlas](https://cloud.mongodb.com). The free M0 tier is enough for a demo: the seeded catalogue uses about 35 MB of GridFS storage.
2. **Database Access** → add a database user with *Read and write to any database*, or scope it to your database.
3. **Network Access** → allow the IP addresses of your API servers. For local development add your current IP. Use `0.0.0.0/0` only temporarily.
4. **Connect → Drivers** → copy the connection string and put **your database name in the path**:

```
MONGODB_URI=mongodb+srv://USER:PASSWORD@cluster0.xxxxx.mongodb.net/velora?retryWrites=true&w=majority
```

Use a dedicated database name (e.g. `velora`) so the store's collections never mix with another application's.

Atlas clusters are replica sets, so the API automatically uses **multi-document transactions** for stock reservation and payment confirmation. The `/api/health` endpoint reports `"transactions": true`. On a standalone `mongod` without a replica set, the API falls back to single-document atomic updates with compensation. It still cannot oversell, but run a replica set in production.

## 2. First start

On boot the API:
1. Connects and builds every index (`syncIndexes`).
2. Creates the default store settings.
3. Creates the owner admin from `ADMIN_EMAIL` and `ADMIN_PASSWORD` if it doesn't exist yet.
4. If the products collection is empty, **seeds the catalogue**. Each bundled photo in `backend/src/seed/assets` is processed into three WebP sizes and stored in GridFS, then products are created that reference those files.

A lock document in the `meta` collection stops two instances from seeding at the same time. Set `SEED_ON_START=false` to disable seeding.

Commands:

```bash
npm run seed         # seed if empty
npm run seed:reset   # DROP every collection in the configured database, then reseed
```

## 3. Collections

| Collection | Purpose |
| --- | --- |
| `users` | Customers (Argon2id hash, verification and reset token hashes) |
| `admins` | Owner, manager and staff accounts (separate from customers) |
| `sessions` | Hashed session tokens for both audiences; TTL index removes expired ones |
| `products` | Catalogue; **variants hold inventory** (`stock`, `reserved`, `available`) and images hold **GridFS ids** |
| `categories`, `brands` | Taxonomy |
| `carts` | Customer and guest bags (guest bags expire after 30 days via TTL) |
| `wishlists` | Saved products per customer |
| `addresses` | Saved delivery addresses |
| `orders` | Orders with **snapshots** of items, prices, address and exchange rate, plus full history |
| `payments` | Stripe references, card brand and last 4 digits, refunds (never card numbers or CVC) |
| `webhookEvents` | Processed Stripe event ids (each event applied once) |
| `coupons` | Discount codes and automatic seasonal sales |
| `reviews` | Verified-purchase reviews |
| `notifications` | Persisted admin and customer notifications (also pushed live) |
| `stockMovements` | Inventory ledger: initial stock, restock, adjustment, reservation, release, sale, refund restock |
| `activityLogs` | Admin audit trail |
| `storeSettings` | Single document: branding, currencies, tax, delivery, banners, policies |
| `newsletterSubscribers` | Newsletter sign-ups |
| `fs.files`, `fs.chunks` | **GridFS image storage** |

The inventory table in the brief is modelled as variant subdocuments inside `products`, plus the `stockMovements` ledger. Keeping stock on the product document lets every reservation be one atomic conditional update (`variants.$elemMatch: { available ≥ qty }`), which is what guarantees no overselling.

## 4. GridFS image storage

- Bucket: the default `fs` (`fs.files` + `fs.chunks`, 255 KB chunks).
- Each uploaded image becomes **three files** (`sm` 480 px, `md` 960 px, `lg` 1800 px, WebP). Their `metadata` records `kind`, `role`, `groupId`, `productId`, size and uploader.
- A product image entry stores `{ files: { sm, md, lg }, width, height, alt, color, sortOrder }`. No Base64 or URLs are stored in product documents.
- Images are served by `GET /api/images/:fileId` with `Cache-Control: public, max-age=31536000, immutable` and an ETag. A replaced image always gets new ids, so caches never serve a stale image.
- Deleting or replacing an image deletes its files, except the small thumbnail if a past order still shows it.
- `cleanupOrphanImages` runs every 6 hours and from **Settings → Maintenance**. It removes files that nothing references and that are older than 10 minutes, so uploads still in progress are never touched.

## 5. Backups

Enable Atlas **Cloud Backup** (M10+) or schedule `mongodump`. GridFS data is ordinary collection data and is included in normal backups.

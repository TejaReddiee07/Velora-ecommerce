import fs from 'node:fs';
import path from 'node:path';
import { test, expect, type Frame, type Page } from '@playwright/test';

/**
 * Final acceptance workflow (owner → customer → Stripe test payment → live sync).
 * Requires: API on :4000 with STRIPE_SECRET_KEY (test mode) and the storefront on :3000.
 * Admin credentials come from E2E_ADMIN_EMAIL / E2E_ADMIN_PASSWORD or backend/.env.
 */
const WEB = process.env.E2E_BASE_URL ?? 'http://localhost:3000';
const API = `${process.env.E2E_API_URL ?? 'http://localhost:4000'}/api`;
const backendEnv = (() => {
  try {
    return fs.readFileSync(path.resolve(__dirname, '../../../backend/.env'), 'utf8');
  } catch {
    return '';
  }
})();
const envVal = (k: string) => backendEnv.match(new RegExp(`^${k}=(.*)$`, 'm'))?.[1]?.replace(/^"|"$/g, '');
const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL ?? envVal('ADMIN_EMAIL')!;
const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD ?? envVal('ADMIN_PASSWORD')!;
const ASSETS = path.resolve(__dirname, '../../../backend/src/seed/assets/products');
const ORIGIN = { Origin: WEB };

async function stripeFrame(page: Page, match: string): Promise<Frame> {
  await expect.poll(() => page.frames().some((f) => f.url().includes(match)), { timeout: 60_000 }).toBe(true);
  return page.frames().find((f) => f.url().includes(match))!;
}

test('owner creates a sneaker, customer buys it with Stripe, everything stays in sync', async ({ browser }) => {
  test.skip(!ADMIN_EMAIL || !ADMIN_PASSWORD, 'Admin credentials are required');
  const stamp = Date.now().toString(36).toUpperCase();
  const NAME = `Aurora Court Sneaker ${stamp}`;
  const adminCtx = await browser.newContext();
  const shopCtx = await browser.newContext();
  for (const c of [adminCtx, shopCtx]) await c.addInitScript(() => sessionStorage.setItem('velora_intro', '1'));
  const admin = await adminCtx.newPage();
  const shop = await shopCtx.newPage();
  const adminApi = (p: string, opts: Parameters<typeof admin.request.fetch>[1] = {}) => admin.request.fetch(`${API}${p}`, { headers: ORIGIN, ...opts });
  let product: { _id: string; slug: string; images: { id: string; lg: string }[]; variants: { _id: string; size: string }[] };
  let variantId = '';
  let orderNumber = '';

  await test.step('1. Owner logs into the admin portal', async () => {
    await admin.goto(`${WEB}/admin/login`);
    await admin.getByLabel(/email/i).fill(ADMIN_EMAIL);
    await admin.getByLabel(/password/i).first().fill(ADMIN_PASSWORD);
    await admin.getByRole('button', { name: /sign in/i }).click();
    await admin.waitForURL(`${WEB}/admin`);
  });

  await test.step('2–5. Owner creates a sneaker and uploads images to GridFS', async () => {
    const cats = await (await adminApi('/admin/categories')).json();
    const brands = await (await adminApi('/admin/brands')).json();
    const res = await adminApi('/admin/products', {
      method: 'POST',
      data: {
        name: NAME,
        description: 'Created by the automated acceptance test.',
        department: 'footwear',
        gender: 'unisex',
        categoryId: cats.categories.find((c: { slug: string }) => c.slug === 'sneakers')._id,
        brandId: brands.brands[0]._id,
        price: 13500,
        sizeGuide: 'footwear',
        variants: [
          { sku: `AUR-${stamp}-8`, size: 'UK 8', color: 'White', colorHex: '#F4F4F2', stock: 10 },
          { sku: `AUR-${stamp}-9`, size: 'UK 9', color: 'White', colorHex: '#F4F4F2', stock: 10 },
        ],
      },
    });
    expect(res.status()).toBe(201);
    product = (await res.json()).product;
    variantId = product.variants.find((v) => v.size === 'UK 9')!._id;
    const up = await adminApi(`/admin/products/${product._id}/images`, {
      method: 'POST',
      multipart: { images: { name: 'a.jpg', mimeType: 'image/jpeg', buffer: fs.readFileSync(`${ASSETS}/court-classic-sneaker-1.jpg`) }, color: 'White' },
    });
    expect(up.status()).toBe(201);
    product = (await up.json()).product;
    const img = await shop.request.get(`${API}/images/${product.images[0].lg}`);
    expect(img.status()).toBe(200);
    expect(img.headers()['content-type']).toBe('image/webp');
  });

  await test.step('6–7. Stock 25; product appears on the footwear page without refresh', async () => {
    expect((await adminApi(`/admin/inventory/${variantId}`, { method: 'PUT', data: { stock: 25 } })).status()).toBe(200);
    await shop.goto(`${WEB}/footwear?sort=newest`);
    expect((await adminApi(`/admin/products/${product._id}/status`, { method: 'PATCH', data: { status: 'published' } })).status()).toBe(200);
    await expect(shop.getByText(NAME).first()).toBeVisible();
  });

  await test.step('8–9. Customer registers, selects size & colour, adds to bag', async () => {
    await shop.goto(`${WEB}/register`);
    await shop.getByLabel(/^Full name( \*)?$/).fill('Evelyn Hart');
    await shop.getByLabel(/^Email( \*)?$/).fill(`e2e.${stamp.toLowerCase()}@example.com`);
    await shop.getByLabel(/^Password( \*)?$/).fill('Velora2026!');
    await shop.getByRole('button', { name: 'Create account' }).click();
    await shop.waitForURL(/\/account/);
    await shop.goto(`${WEB}/product/${product.slug}`);
    await shop.getByRole('button', { name: /^White/ }).click();
    await shop.getByRole('button', { name: /^Size UK 9/ }).click();
    await shop.getByRole('button', { name: 'Add to bag' }).click();
    await expect.poll(async () => (await (await shop.request.get(`${API}/cart`)).json()).cart.itemCount).toBe(1);
  });

  await test.step('10–12. Stripe test checkout; payment verified; paid order created', async () => {
    await shop.goto(`${WEB}/checkout`);
    await shop.getByLabel(/^Address line 1( \*)?$/).fill('221B Baker Street');
    await shop.getByLabel(/^Town \/ City( \*)?$/).fill('London');
    await shop.getByLabel(/^Postcode( \*)?$/).fill('NW1 6XE');
    await shop.getByRole('button', { name: /^Pay / }).click();
    await shop.waitForURL(/checkout\.stripe\.com/);
    const form = await stripeFrame(shop, 'elements-inner-habanero');
    await form.getByText('Card', { exact: true }).first().click();
    const num = 'input[autocomplete="cc-number"], input[name="number"], input[name="cardnumber"]';
    let cardFrame: Frame = form;
    await expect.poll(async () => {
      for (const f of shop.frames()) if (await f.locator(num).count().catch(() => 0)) { cardFrame = f; return true; }
      return false;
    }, { timeout: 30_000 }).toBe(true);
    await cardFrame.locator(num).first().fill('4242424242424242');
    await cardFrame.locator('input[autocomplete="cc-exp"], input[name="expiry"]').first().fill('12 / 34');
    await cardFrame.locator('input[autocomplete="cc-csc"], input[name="cvc"]').first().fill('123');
    const nameInput = cardFrame.locator('input[autocomplete="cc-name"], input[name="name"]');
    if (await nameInput.count()) await nameInput.first().fill('Evelyn Hart');
    const postal = cardFrame.locator('input[autocomplete="postal-code"], input[autocomplete="billing postal-code"]');
    if (await postal.count()) await postal.first().fill('NW1 6XE');
    await form.locator('[data-testid="payment-form-submit-button"]').click();
    await shop.waitForURL(/\/checkout\/success/, { timeout: 120_000 });
    await expect(shop.getByText(/Thank you/)).toBeVisible({ timeout: 90_000 });
    orderNumber = ((await shop.locator('strong').filter({ hasText: /^VEL-/ }).first().textContent()) ?? '').trim();
    const order = await (await shop.request.get(`${API}/orders/${orderNumber}`)).json();
    expect(order.order.paymentStatus).toBe('paid');
  });

  await test.step('13–15. Stock 25 → 24, dashboard updated, order in history', async () => {
    const p = (await (await adminApi(`/admin/products/${product._id}`)).json()).product;
    const v = p.variants.find((x: { _id: string }) => x._id === variantId);
    expect(v).toMatchObject({ stock: 24, reserved: 0, available: 24 });
    const o = await (await adminApi('/admin/analytics/overview')).json();
    expect(o.revenue.today).toBeGreaterThan(0);
    await shop.goto(`${WEB}/account/orders`);
    await expect(shop.getByText(orderNumber).first()).toBeVisible();
  });

  await test.step('16–19. Price edit and image replacement reach the open product page live', async () => {
    await shop.goto(`${WEB}/product/${product.slug}`);
    const full = (await (await adminApi(`/admin/products/${product._id}`)).json()).product;
    const body = {
      name: full.name, description: full.description, department: full.department, gender: full.gender, categoryId: full.category, brandId: full.brand,
      price: 14900, styles: full.styles, sizeGuide: full.sizeGuide, status: 'published',
      variants: full.variants.map((v: Record<string, unknown>) => ({ _id: v._id, sku: v.sku, size: v.size, color: v.color, colorHex: v.colorHex, isActive: v.isActive })),
    };
    expect((await adminApi(`/admin/products/${product._id}`, { method: 'PUT', data: body })).status()).toBe(200);
    await expect(shop.getByText('£149').first()).toBeVisible();
    const old = product.images[0];
    const r = await adminApi(`/admin/products/${product._id}/images/${old.id}`, {
      method: 'PUT',
      multipart: { image: { name: 'b.jpg', mimeType: 'image/jpeg', buffer: fs.readFileSync(`${ASSETS}/retro-runner-sneaker-1.jpg`) } },
    });
    const updated = (await r.json()).product.images.find((i: { id: string }) => i.id === old.id);
    await shop.waitForFunction((id) => [...document.images].some((img) => img.currentSrc.includes(id) || img.src.includes(id)), updated.lg);
    expect((await shop.request.get(`${API}/images/${old.lg}`)).status()).toBe(404);
  });

  await test.step('20–21. Sell-out disables the size live; restock re-enables it', async () => {
    const size = shop.getByRole('button', { name: /^Size UK 9/ });
    await adminApi(`/admin/inventory/${variantId}`, { method: 'PUT', data: { stock: 0 } });
    await expect(size).toBeDisabled();
    await adminApi('/admin/inventory/restock', { method: 'POST', data: { variantId, quantity: 5 } });
    await expect(size).toBeEnabled();
  });

  await test.step('Clean up: refund (real Stripe test refund) and archive the test product', async () => {
    const list = await (await adminApi(`/admin/orders?q=${orderNumber}`)).json();
    const refund = await adminApi(`/admin/orders/${list.items[0]._id}/refund`, { method: 'POST', data: { restock: true, reason: 'E2E cleanup' } });
    expect(refund.status()).toBe(200);
    await adminApi(`/admin/products/${product._id}/status`, { method: 'PATCH', data: { status: 'archived' } });
  });

  await adminCtx.close();
  await shopCtx.close();
});

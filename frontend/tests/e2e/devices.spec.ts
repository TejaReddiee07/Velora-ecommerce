import { expect, test, type Page } from '@playwright/test';

/**
 * Cross-browser / cross-device smoke tests (see docs/BROWSERS.md).
 *
 * Read-only: they only browse the storefront, so they are safe to run against any stack. Every Playwright project in
 * playwright.config.ts is one browser engine + device (Edge, Safari, Firefox, iPhone, iPad, Android phone and tablet...):
 *   npm run test:devices
 */
const PAGES = ['/', '/clothing', '/footwear', '/accessories', '/new-arrivals', '/sale', '/search?q=boot', '/showroom', '/cart', '/login', '/register', '/forgot-password', '/wishlist', '/about', '/contact', '/returns', '/size-guide'];

test.beforeEach(async ({ context }) => {
  test.setTimeout(120_000);
  await context.addInitScript(() => {
    try {
      sessionStorage.setItem('velora_intro', '1'); // skip the first-visit intro animation
    } catch {
      /* storage can be blocked */
    }
  });
});

/** Script errors only. WebKit reports a fetch it cancels on navigation (e.g. a link prefetch) as an access-control error. */
function scriptErrors(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', (e) => {
    if (!/access control checks|Load failed|Load request cancelled/.test(e.message)) errors.push(e.message.slice(0, 160));
  });
  return errors;
}

/** Wait for the page, then scroll through it once so lazy images and reveal-on-scroll content are rendered. */
async function settle(page: Page) {
  await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => undefined);
  await page.waitForTimeout(800);
  const height = await page.evaluate(() => document.documentElement.scrollHeight);
  for (let y = 0; y < height; y += 1000) {
    await page.evaluate((v) => window.scrollTo(0, v), y);
    await page.waitForTimeout(60);
  }
  await page.waitForTimeout(400);
}

for (const path of PAGES) {
  test(`${path} loads, fits the screen and has no script errors`, async ({ page }) => {
    const errors = scriptErrors(page);
    const response = await page.goto(path, { waitUntil: 'load' });
    expect(response?.status()).toBe(200);
    await settle(page);
    const m = await page.evaluate(() => ({
      overflow: document.documentElement.scrollWidth - window.innerWidth,
      heading: Boolean(document.querySelector('h1')),
      brokenImages: [...document.images].filter((i) => i.complete && i.naturalWidth === 0 && i.src && !i.src.startsWith('data:')).length,
    }));
    expect(m.overflow, 'the page is wider than the screen').toBeLessThanOrEqual(1);
    if (path !== '/showroom') expect(m.heading, 'the page has a heading').toBe(true);
    expect(m.brokenImages, 'broken images').toBe(0);
    expect(errors, 'script errors').toEqual([]);
  });
}

test('a product page fits the screen and its Add to bag row is usable', async ({ page }) => {
  await page.goto('/clothing', { waitUntil: 'load' });
  await settle(page);
  const href = await page.locator('a[href^="/product/"]').first().getAttribute('href');
  expect(href).toBeTruthy();
  await page.goto(href!, { waitUntil: 'load' });
  await settle(page);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow, 'the page is wider than the screen').toBeLessThanOrEqual(1);
  const add = page.getByRole('button', { name: /add to bag|sold out/i }).first();
  await expect(add).toBeVisible();
  const box = await add.boundingBox();
  const width = page.viewportSize()?.width ?? 1280;
  expect(box!.x + box!.width, 'the Add to bag button sticks out of the screen').toBeLessThanOrEqual(width + 1);
});

test('the header logo is centred', async ({ page }) => {
  await page.goto('/about', { waitUntil: 'load' });
  await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => undefined);
  const off = await page.evaluate(() => {
    const logo = document.querySelector('a[aria-label="VELORA home"]');
    if (!logo) return null;
    const r = logo.getBoundingClientRect();
    return Math.round(r.left + r.width / 2 - document.documentElement.clientWidth / 2);
  });
  expect(off, 'logo not found').not.toBeNull();
  expect(Math.abs(off!), 'the logo is off-centre').toBeLessThanOrEqual(12);
});

test('the main menu opens and closes on small screens', async ({ page }) => {
  test.skip((page.viewportSize()?.width ?? 1280) >= 1024, 'the full menu is always visible on wide screens');
  await page.goto('/', { waitUntil: 'load' });
  await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => undefined);
  await page.getByRole('button', { name: 'Open menu' }).click();
  const menu = page.getByRole('navigation', { name: 'Mobile' });
  await expect(menu).toBeVisible();
  await expect(menu.getByRole('link', { name: 'Clothing' })).toBeVisible();
  await page.getByRole('button', { name: 'Close menu' }).click();
  await expect(menu).toBeHidden();
});

test('Quick add can be reached on every kind of screen (hover or touch)', async ({ page }) => {
  await page.goto('/clothing', { waitUntil: 'load' });
  await settle(page);
  await page.evaluate(() => window.scrollTo(0, 0));
  const quick = page.getByRole('button', { name: /quick add/i }).first();
  const canHover = await page.evaluate(() => window.matchMedia('(hover: hover)').matches);
  const width = page.viewportSize()?.width ?? 1280;
  if (canHover && width >= 1024) {
    // on a mouse-driven laptop/desktop it appears when the card is hovered
    await quick.locator('xpath=ancestor::*[contains(concat(" ", normalize-space(@class), " "), " group ")][1]').hover();
  }
  await expect(quick).toHaveCSS('opacity', '1');
});

test('the 3D footwear carousel appears wherever WebGL works', async ({ page }) => {
  await page.goto('/', { waitUntil: 'load' });
  await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => undefined);
  const webgl = await page.evaluate(() => {
    try {
      const c = document.createElement('canvas');
      return Boolean(c.getContext('webgl2') || c.getContext('webgl'));
    } catch {
      return false;
    }
  });
  test.skip(!webgl, 'this browser has no WebGL; the flat carousel is shown instead');
  await settle(page);
  await page.evaluate(() => {
    const h = document.getElementById('footwear-heading');
    if (h) window.scrollTo(0, h.getBoundingClientRect().top + window.scrollY + 200);
  });
  await expect(page.locator('section[aria-labelledby="footwear-heading"] canvas')).toBeVisible({ timeout: 30_000 });
});

/** A bag holding one item, served from a stand-in response: the test stays read-only (no real cart is created). */
const BAG_WITH_ITEM = {
  cart: {
    currency: 'GBP',
    lines: [
      {
        itemId: 'stand-in-item',
        productId: 'stand-in-product',
        variantId: 'stand-in-variant',
        name: 'Leather Combat Boot',
        slug: 'stand-in-product',
        brandName: 'Nordvale',
        image: null,
        sku: 'STAND-IN-1',
        size: 'UK 9',
        color: 'Dark Brown',
        colorHex: '#4a3b32',
        quantity: 1,
        available: 5,
        unitPrice: 22500,
        originalUnitPrice: 22500,
        lineTotal: 22500,
        issue: null,
      },
    ],
    itemCount: 1,
    subtotal: 22500,
    discount: { amount: 0, code: null, label: null, automatic: false },
    couponCode: null,
    couponError: null,
    delivery: { methodId: 'standard', name: 'Standard delivery', etaDays: '3-5', price: 0, freeOver: 15000 },
    deliveryOptions: [{ id: 'standard', name: 'Standard delivery', etaDays: '3-5', price: 0, freeOver: 15000 }],
    tax: { enabled: true, inclusive: true, rate: 0.2, label: 'VAT', amount: 3750 },
    total: 22500,
    hasIssues: false,
  },
};

// Regression: the promo-code box made the summary column wider than a phone screen (Safari/iPhone) as soon as the bag had an item.
test('the cart and checkout pages fit the screen when the bag has an item', async ({ page }) => {
  await page.route(
    (url) => url.pathname === '/api/cart',
    async (route) => {
      const origin = route.request().headers()['origin'] ?? '';
      await route.fulfill({
        json: BAG_WITH_ITEM,
        headers: origin ? { 'access-control-allow-origin': origin, 'access-control-allow-credentials': 'true' } : {},
      });
    },
  );
  const errors = scriptErrors(page);
  await page.goto('/cart', { waitUntil: 'load' });
  await expect(page.getByRole('link', { name: 'Leather Combat Boot' }).first()).toBeVisible();
  await settle(page);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth), 'the cart is wider than the screen').toBeLessThanOrEqual(1);
  await page.goto('/checkout', { waitUntil: 'load' });
  await expect(page.locator('main input[type=email]').first()).toBeVisible();
  await settle(page);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth), 'checkout is wider than the screen').toBeLessThanOrEqual(1);
  expect(errors, 'script errors').toEqual([]);
});

// Regression: with the US-dollar choice saved, the first browser render differed from the server HTML (React hydration error).
test('a shopper who chose US dollars gets no script errors on a product page', async ({ page, context, baseURL }) => {
  const api = process.env.E2E_API_URL ?? 'http://localhost:4000';
  const settings = await page.request.get(`${api}/api/settings/public`).then((r) => r.json()).catch(() => null);
  test.skip(!settings?.currency?.enabled?.includes('USD'), 'US dollars are not enabled in this store');
  await context.addCookies([{ name: 'velora_currency', value: 'USD', url: baseURL ?? 'http://localhost:3000' }]);
  const errors = scriptErrors(page);
  await page.goto('/clothing', { waitUntil: 'load' });
  await settle(page);
  const href = await page.locator('a[href^="/product/"]').first().getAttribute('href');
  expect(href).toBeTruthy();
  await page.goto(href!, { waitUntil: 'load' });
  await settle(page);
  await expect(page.locator('h1').first()).toBeVisible();
  await expect(page.getByRole('button', { name: /add to bag|sold out/i }).first()).toBeVisible();
  expect(errors, 'script errors').toEqual([]);
});

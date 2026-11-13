import { test, expect } from '@playwright/test';

/**
 * 3D showroom: entry points, rack → focus → add to bag (existing cart),
 * keyboard navigation, mobile bottom sheet and the no-WebGL fallback.
 * Requires the running stack (API :4000, storefront :3000).
 */
const API = `${process.env.E2E_API_URL ?? 'http://localhost:4000'}/api`;

test.beforeEach(async ({ context }) => {
  await context.addInitScript(() => sessionStorage.setItem('velora_intro', '1'));
});

const loaded = async (page: import('@playwright/test').Page) => {
  await expect(page.getByText('Dressing the rails')).toHaveCount(0, { timeout: 90_000 });
};

test('rack, focus view, add to bag and keyboard navigation', async ({ page }) => {
  await page.goto('/showroom?category=shirts');
  await loaded(page);
  await expect(page.getByRole('tab', { name: 'Shirts' })).toHaveAttribute('aria-selected', 'true');
  const rail = page.getByRole('navigation', { name: /Shirts on the rail/ });
  await expect(rail.getByRole('button')).toHaveCount(3);

  await rail.getByRole('button', { name: /Oxford Button-Down Shirt/ }).click();
  const card = page.getByRole('dialog', { name: 'Oxford Button-Down Shirt' });
  await expect(card).toBeVisible();
  await expect(page).toHaveURL(/product=oxford-button-down-shirt/);
  await expect(card.getByRole('link', { name: 'View full details' })).toHaveAttribute('href', '/product/oxford-button-down-shirt');

  // Add to bag without a size → asks for one; then uses the existing cart.
  await card.getByRole('button', { name: 'Add to bag' }).click();
  await expect(card.getByText('Please select a size.')).toBeVisible();
  const size = card.getByRole('button', { name: /^Size (S|M|L|XL|XXL)$/ }).first();
  await size.click();
  await card.getByRole('button', { name: 'Add to bag' }).click();
  await expect(card.getByRole('button', { name: 'Added to bag' })).toBeVisible();
  const cart = await (await page.request.get(`${API}/cart`)).json();
  expect(cart.cart.lines.some((l: { slug: string }) => l.slug === 'oxford-button-down-shirt')).toBe(true);

  await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('dialog', { name: 'Piqué Polo Shirt' })).toBeVisible();
  await expect(page).toHaveURL(/product=pique-polo-shirt/);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);

  await page.getByRole('tab', { name: 'Outerwear' }).click();
  await expect(page).toHaveURL(/category=outerwear/);
  await expect(page.getByRole('navigation', { name: /Outerwear on the rail/ }).getByRole('button')).toHaveCount(4);
});

test('entry points: listing, product page and homepage', async ({ page }) => {
  await page.goto('/clothing?category=shirts');
  await expect(page.getByRole('link', { name: 'Explore in 3D' })).toHaveAttribute('href', '/showroom?category=shirts');

  await page.goto('/product/camel-wool-overcoat');
  await page.getByRole('link', { name: 'View in 3D' }).click();
  await expect(page).toHaveURL(/\/showroom\?product=camel-wool-overcoat/);
  await loaded(page);
  await expect(page.getByRole('dialog', { name: 'Camel Wool Overcoat' })).toBeVisible();

  // Non-showroom products keep their page unchanged.
  await page.goto('/product/court-classic-leather-sneaker');
  await expect(page.getByRole('heading', { name: 'Court Classic Leather Sneaker' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'View in 3D' })).toHaveCount(0);
});

test('mobile shows the product card as a bottom sheet', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  await ctx.addInitScript(() => sessionStorage.setItem('velora_intro', '1'));
  const page = await ctx.newPage();
  await page.goto('/showroom?product=satin-slip-dress');
  await loaded(page);
  const sheet = page.getByRole('dialog', { name: 'Satin Slip Dress' });
  await expect(sheet).toBeVisible();
  const box = await sheet.boundingBox();
  expect(box!.y + box!.height).toBeGreaterThan(830); // anchored to the bottom edge
  await expect(page.getByRole('tablist')).toHaveCount(0); // tabs step aside while the sheet is open
  await ctx.close();
});

test('without WebGL, showroom links fall back to the normal product page', async ({ browser }) => {
  const ctx = await browser.newContext();
  await ctx.addInitScript(() => {
    sessionStorage.setItem('velora_intro', '1');
    const orig = HTMLCanvasElement.prototype.getContext;
    // @ts-expect-error simulate a browser without WebGL
    HTMLCanvasElement.prototype.getContext = function (type: string, ...rest: unknown[]) {
      return /webgl/i.test(type) ? null : orig.apply(this, [type, ...rest] as never);
    };
  });
  const page = await ctx.newPage();
  await page.goto('/showroom?product=navy-tailored-suit');
  await expect(page).toHaveURL(/\/product\/navy-tailored-suit/);
  await page.goto('/showroom');
  await expect(page.getByRole('heading', { name: 'On the rail' })).toBeVisible();
  await page.goto('/product/navy-tailored-suit');
  await expect(page.getByRole('link', { name: 'View in 3D' })).toHaveCount(0);
  await ctx.close();
});

test('reduced motion still renders a usable showroom', async ({ browser }) => {
  const ctx = await browser.newContext({ reducedMotion: 'reduce' });
  await ctx.addInitScript(() => sessionStorage.setItem('velora_intro', '1'));
  const page = await ctx.newPage();
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/showroom?category=dresses');
  await loaded(page);
  await page.getByRole('navigation', { name: /Dresses on the rail/ }).getByRole('button').first().click();
  await expect(page.getByRole('dialog')).toBeVisible();
  expect(errors).toEqual([]);
  await ctx.close();
});

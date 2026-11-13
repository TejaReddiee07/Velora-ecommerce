import type { ProductCard } from '@/lib/types';

/** Racks in the 3D showroom, in display order. Each maps one or more catalogue categories. */
export const SHOWROOM_GROUPS = [
  { key: 'shirts', label: 'Shirts', categories: ['shirts'] },
  { key: 'tees', label: 'Tees', categories: ['t-shirts'] },
  { key: 'outerwear', label: 'Outerwear', categories: ['jackets'] },
  { key: 'dresses', label: 'Dresses', categories: ['dresses'] },
  { key: 'tailoring', label: 'Tailoring', categories: ['suits'] },
  { key: 'knitwear', label: 'Knit & Hoodies', categories: ['knitwear', 'hoodies'] },
] as const;

export interface Rack {
  key: string;
  label: string;
  items: ProductCard[];
}

/** Showroom group key for a catalogue category slug (null when the category has no rack). */
export function groupForCategory(categorySlug: string | null | undefined): string | null {
  if (!categorySlug) return null;
  return SHOWROOM_GROUPS.find((g) => (g.categories as readonly string[]).includes(categorySlug))?.key ?? null;
}

export function buildRacks(products: ProductCard[]): Rack[] {
  const racks: Rack[] = SHOWROOM_GROUPS.map((g) => ({ key: g.key, label: g.label, items: [] as ProductCard[] }));
  const more: Rack = { key: 'more', label: 'More', items: [] };
  for (const p of products) {
    if (!p.images[0]) continue;
    const key = groupForCategory(p.categorySlug);
    (racks.find((r) => r.key === key) ?? more).items.push(p);
  }
  return [...racks, more].filter((r) => r.items.length > 0);
}

/** Where a transparent cut-out for a product lives (served from /public). */
export function cutoutPath(slug: string) {
  return `/showroom/${slug}.png`;
}

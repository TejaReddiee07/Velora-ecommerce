'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { Box, ChevronDown, SlidersHorizontal, X } from 'lucide-react';
import { api } from '@/lib/api';
import { useCurrency } from '@/lib/hooks';
import { cn, money } from '@/lib/format';
import { EASE_LUXE } from '@/lib/motion';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/Media';
import { ProductGrid } from './ProductCard';
import { getLenis } from './SmoothScroll';
import { groupForCategory } from '@/components/showroom/groups';
import { useWebGL } from '@/lib/use-visibility';
import type { Department, ProductList } from '@/lib/types';

const SORTS = [
  { value: 'featured', label: 'Featured' },
  { value: 'newest', label: 'New arrivals' },
  { value: 'best_selling', label: 'Best sellers' },
  { value: 'popular', label: 'Most popular' },
  { value: 'price_asc', label: 'Price: low to high' },
  { value: 'price_desc', label: 'Price: high to low' },
];

const GENDERS = [
  { value: 'women', label: 'Women' },
  { value: 'men', label: 'Men' },
  { value: 'unisex', label: 'Unisex' },
];

const STYLE_LABEL: Record<string, string> = { casual: 'Casual wear', formal: 'Formal wear', streetwear: 'Streetwear', sportswear: 'Sportswear' };

export interface ListingPreset {
  department?: Department;
  newArrival?: boolean;
  onSale?: boolean;
  defaultSort?: string;
}

const MULTI = ['gender', 'category', 'style', 'size', 'color', 'brand'] as const;

function FilterGroup({ title, children, defaultOpen = true }: { title: string; children: React.ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border-b border-line py-5">
      <button type="button" onClick={() => setOpen(!open)} className="flex w-full items-center justify-between text-left" aria-expanded={open}>
        <span className="eyebrow text-graphite">{title}</span>
        <ChevronDown className={cn('h-4 w-4 text-muted transition-transform duration-300', open && 'rotate-180')} />
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.35, ease: EASE_LUXE }} className="overflow-hidden">
            <div className="pt-4">{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export function ShopListing({ preset, title, intro }: { preset: ListingPreset; title: string; intro?: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const currency = useCurrency();
  const [drawer, setDrawer] = useState(false);
  const webgl = useWebGL();

  const state = useMemo(() => {
    const get = (k: string) => params.get(k) ?? undefined;
    const list = (k: string) => (params.get(k) ? params.get(k)!.split(',').filter(Boolean) : []);
    return {
      department: (get('department') as Department | undefined) ?? preset.department,
      gender: list('gender'),
      category: list('category'),
      style: list('style'),
      size: list('size'),
      color: list('color'),
      brand: list('brand'),
      minPrice: get('minPrice'),
      maxPrice: get('maxPrice'),
      rating: get('rating'),
      inStock: get('inStock') === 'true',
      onSale: get('onSale') === 'true' || preset.onSale,
      q: get('q'),
      sort: get('sort') ?? preset.defaultSort ?? (get('q') ? 'relevance' : 'featured'),
      page: Number(get('page') ?? 1) || 1,
    };
  }, [params, preset]);

  const query = {
    department: state.department,
    gender: state.gender,
    category: state.category,
    style: state.style,
    size: state.size,
    color: state.color,
    brand: state.brand,
    minPrice: state.minPrice,
    maxPrice: state.maxPrice,
    rating: state.rating,
    inStock: state.inStock || undefined,
    onSale: state.onSale || undefined,
    newArrival: preset.newArrival || undefined,
    q: state.q,
    sort: state.sort,
    page: state.page,
    limit: 24,
    currency,
    facets: true,
  };

  const { data, isLoading, isFetching, isError, refetch } = useQuery({
    queryKey: ['products', 'listing', query],
    queryFn: ({ signal }) => api<ProductList>('/products', { query: query as never, signal }),
    placeholderData: keepPreviousData,
  });

  const setParams = (patch: Record<string, string | string[] | undefined | null>, resetPage = true) => {
    const next = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(patch)) {
      if (v == null || v === '' || (Array.isArray(v) && v.length === 0)) next.delete(k);
      else next.set(k, Array.isArray(v) ? v.join(',') : v);
    }
    if (resetPage) next.delete('page');
    router.replace(`${pathname}${next.toString() ? `?${next}` : ''}`, { scroll: false });
  };
  const toggle = (key: (typeof MULTI)[number], value: string) => {
    const cur = state[key] as string[];
    setParams({ [key]: cur.includes(value) ? cur.filter((v) => v !== value) : [...cur, value] });
  };

  useEffect(() => {
    if (!drawer) return;
    getLenis()?.stop();
    document.body.style.overflow = 'hidden';
    return () => {
      getLenis()?.start();
      document.body.style.overflow = '';
    };
  }, [drawer]);

  const facets = data?.facets;
  // A single showroom category is selected → offer the 3D showroom for it.
  const showroomKey = state.category.length === 1 ? groupForCategory(state.category[0]) : null;
  const chips: { label: string; clear: () => void }[] = [];
  for (const g of state.gender) chips.push({ label: GENDERS.find((x) => x.value === g)?.label ?? g, clear: () => toggle('gender', g) });
  for (const c of state.category) chips.push({ label: facets?.categories.find((x) => x.slug === c)?.name ?? c, clear: () => toggle('category', c) });
  for (const s of state.style) chips.push({ label: STYLE_LABEL[s] ?? s, clear: () => toggle('style', s) });
  for (const s of state.size) chips.push({ label: `Size ${s}`, clear: () => toggle('size', s) });
  for (const c of state.color) chips.push({ label: c, clear: () => toggle('color', c) });
  for (const b of state.brand) chips.push({ label: b, clear: () => toggle('brand', b) });
  if (state.minPrice || state.maxPrice) chips.push({ label: `${state.minPrice ? money(Number(state.minPrice), currency) : 'Any'} – ${state.maxPrice ? money(Number(state.maxPrice), currency) : 'Any'}`, clear: () => setParams({ minPrice: null, maxPrice: null }) });
  if (state.inStock) chips.push({ label: 'In stock', clear: () => setParams({ inStock: null }) });
  if (state.rating) chips.push({ label: `${state.rating}★ & up`, clear: () => setParams({ rating: null }) });
  if (state.onSale && !preset.onSale) chips.push({ label: 'On sale', clear: () => setParams({ onSale: null }) });

  const filters = (
    <div>
      {!preset.department && (
        <FilterGroup title="Department">
          <div className="flex flex-wrap gap-2">
            {(['clothing', 'footwear', 'accessories'] as const).map((d) => (
              <button key={d} type="button" onClick={() => setParams({ department: state.department === d ? null : d, category: null })} className={cn('h-9 border px-3 text-[13px] capitalize transition-colors', state.department === d ? 'border-ink bg-ink text-ivory' : 'border-line-strong hover:border-ink')} aria-pressed={state.department === d}>
                {d}
              </button>
            ))}
          </div>
        </FilterGroup>
      )}
      <FilterGroup title="Gender">
        <div className="space-y-2.5">
          {GENDERS.map((g) => (
            <label key={g.value} className="flex items-center gap-3 text-[14px]">
              <input type="checkbox" checked={state.gender.includes(g.value)} onChange={() => toggle('gender', g.value)} className="h-4 w-4 accent-[var(--color-charcoal)]" />
              {g.label}
            </label>
          ))}
        </div>
      </FilterGroup>
      {facets && facets.categories.length > 0 && (
        <FilterGroup title="Category">
          <div className="space-y-2.5">
            {facets.categories.map((c) => (
              <label key={c.slug} className="flex items-center gap-3 text-[14px]">
                <input type="checkbox" checked={state.category.includes(c.slug)} onChange={() => toggle('category', c.slug)} className="h-4 w-4 accent-[var(--color-charcoal)]" />
                <span className="flex-1">{c.name}</span>
                <span className="tabular text-[12px] text-muted">{c.count}</span>
              </label>
            ))}
          </div>
        </FilterGroup>
      )}
      {facets && facets.styles.length > 0 && state.department !== 'footwear' && (
        <FilterGroup title="Style" defaultOpen={false}>
          <div className="space-y-2.5">
            {facets.styles.map((s) => (
              <label key={s.value} className="flex items-center gap-3 text-[14px]">
                <input type="checkbox" checked={state.style.includes(s.value)} onChange={() => toggle('style', s.value)} className="h-4 w-4 accent-[var(--color-charcoal)]" />
                {STYLE_LABEL[s.value] ?? s.value}
              </label>
            ))}
          </div>
        </FilterGroup>
      )}
      {facets && facets.sizes.length > 0 && (
        <FilterGroup title="Size">
          <div className="flex flex-wrap gap-1.5">
            {facets.sizes.map((s) => (
              <button key={s.value} type="button" onClick={() => toggle('size', s.value)} aria-pressed={state.size.includes(s.value)} className={cn('h-9 min-w-11 border px-2.5 text-[12px] transition-colors', state.size.includes(s.value) ? 'border-ink bg-ink text-ivory' : 'border-line-strong hover:border-ink')}>
                {s.value}
              </button>
            ))}
          </div>
        </FilterGroup>
      )}
      {facets && facets.colors.length > 0 && (
        <FilterGroup title="Colour">
          <div className="grid grid-cols-2 gap-x-3 gap-y-2.5">
            {facets.colors.map((c) => (
              <label key={c.name} className="flex items-center gap-2.5 text-[13px]">
                <input type="checkbox" checked={state.color.includes(c.name)} onChange={() => toggle('color', c.name)} className="peer sr-only" />
                <span className="h-5 w-5 shrink-0 rounded-full ring-1 ring-line-strong ring-offset-2 ring-offset-ivory peer-checked:ring-2 peer-checked:ring-ink peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-gold-deep" style={{ background: c.hex }} aria-hidden />
                <span className="truncate">{c.name}</span>
              </label>
            ))}
          </div>
        </FilterGroup>
      )}
      {facets && (
        <FilterGroup title="Price">
          <PriceFilter key={`${state.minPrice}-${state.maxPrice}-${currency}`} min={state.minPrice} max={state.maxPrice} range={facets.price} currency={currency} onApply={(min, max) => setParams({ minPrice: min, maxPrice: max })} />
        </FilterGroup>
      )}
      {facets && facets.brands.length > 1 && (
        <FilterGroup title="Brand" defaultOpen={false}>
          <div className="space-y-2.5">
            {facets.brands.map((b) => (
              <label key={b.name} className="flex items-center gap-3 text-[14px]">
                <input type="checkbox" checked={state.brand.includes(b.name)} onChange={() => toggle('brand', b.name)} className="h-4 w-4 accent-[var(--color-charcoal)]" />
                <span className="flex-1">{b.name}</span>
                <span className="tabular text-[12px] text-muted">{b.count}</span>
              </label>
            ))}
          </div>
        </FilterGroup>
      )}
      <FilterGroup title="Rating" defaultOpen={false}>
        <div className="flex flex-wrap gap-2">
          {[4, 3].map((r) => (
            <button key={r} type="button" onClick={() => setParams({ rating: state.rating === String(r) ? null : String(r) })} aria-pressed={state.rating === String(r)} className={cn('h-9 border px-3 text-[13px]', state.rating === String(r) ? 'border-ink bg-ink text-ivory' : 'border-line-strong hover:border-ink')}>
              {r}★ & up
            </button>
          ))}
        </div>
      </FilterGroup>
      <FilterGroup title="Availability">
        <label className="flex items-center gap-3 text-[14px]">
          <input type="checkbox" checked={state.inStock} onChange={(e) => setParams({ inStock: e.target.checked ? 'true' : null })} className="h-4 w-4 accent-[var(--color-charcoal)]" />
          In stock only
        </label>
        {!preset.onSale && (
          <label className="mt-2.5 flex items-center gap-3 text-[14px]">
            <input type="checkbox" checked={Boolean(state.onSale)} onChange={(e) => setParams({ onSale: e.target.checked ? 'true' : null })} className="h-4 w-4 accent-[var(--color-charcoal)]" />
            On sale
          </label>
        )}
      </FilterGroup>
    </div>
  );

  return (
    <div className="container-luxe pt-[150px]">
      <header className="mb-10 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <motion.h1 initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.9, ease: EASE_LUXE }} className="text-[clamp(2.6rem,6vw,4.75rem)] leading-[0.95]">
            {title}
          </motion.h1>
          {intro && <p className="mt-4 max-w-xl text-muted">{intro}</p>}
        </div>
        <div className="flex items-center gap-5">
          {showroomKey && webgl && (
            <Link
              href={`/showroom?category=${showroomKey}`}
              className="group inline-flex h-10 items-center gap-2 rounded-full border border-ink px-5 text-[11px] uppercase tracking-[0.18em] transition-colors hover:bg-ink hover:text-ivory"
            >
              <Box className="h-3.5 w-3.5 transition-transform duration-500 group-hover:rotate-12" aria-hidden /> Explore in 3D
            </Link>
          )}
          <p className="tabular text-[13px] text-muted" aria-live="polite">
            {data ? `${data.total} ${data.total === 1 ? 'piece' : 'pieces'}` : ' '}
          </p>
        </div>
      </header>

      <div className="sticky top-[68px] z-20 -mx-4 mb-8 flex items-center justify-between gap-3 border-y border-line bg-ivory/95 px-4 py-3 backdrop-blur md:mx-0 md:px-0">
        <button type="button" onClick={() => setDrawer(true)} className="inline-flex h-10 items-center gap-2 text-[12px] uppercase tracking-[0.18em] lg:hidden">
          <SlidersHorizontal className="h-4 w-4" /> Filters {chips.length > 0 && <span className="tabular">({chips.length})</span>}
        </button>
        <div className="hidden min-w-0 flex-1 flex-wrap items-center gap-2 lg:flex">
          {chips.map((c) => (
            <button key={c.label} type="button" onClick={c.clear} className="inline-flex h-8 items-center gap-1.5 border border-line-strong px-3 text-[12px] hover:border-ink">
              {c.label} <X className="h-3 w-3" aria-label="remove filter" />
            </button>
          ))}
          {chips.length > 0 && (
            <button type="button" onClick={() => router.replace(pathname + (state.q ? `?q=${encodeURIComponent(state.q)}` : ''), { scroll: false })} className="link-underline ml-1 text-[12px] text-muted">
              Clear all
            </button>
          )}
        </div>
        <label className="relative inline-flex items-center gap-2 text-[12px] uppercase tracking-[0.16em]">
          <span className="hidden text-muted sm:inline">Sort</span>
          <select value={state.sort} onChange={(e) => setParams({ sort: e.target.value })} className="h-10 cursor-pointer appearance-none bg-transparent pr-6 text-[12px] uppercase tracking-[0.16em] focus:outline-none">
            {state.q && <option value="relevance">Relevance</option>}
            {SORTS.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
          <ChevronDown className="pointer-events-none absolute right-0 h-3.5 w-3.5" />
        </label>
      </div>

      <div className="grid gap-10 lg:grid-cols-[260px_1fr]">
        <aside className="hidden lg:block" aria-label="Filters">
          <div className="sticky top-[140px] max-h-[calc(100vh-160px)] overflow-y-auto pr-2 scrollbar-none" data-lenis-prevent>
            {filters}
          </div>
        </aside>
        <section aria-label="Products" className={cn('transition-opacity duration-300', isFetching && !isLoading && 'opacity-60')}>
          {isError ? (
            <EmptyState title="We couldn't load the collection" body="Please check your connection and try again." action={<Button variant="secondary" onClick={() => refetch()}>Try again</Button>} />
          ) : data && data.items.length === 0 ? (
            <EmptyState title="Nothing matches — yet" body="Try removing a filter or exploring the full collection." action={<Button variant="secondary" onClick={() => router.replace(pathname, { scroll: false })}>Clear filters</Button>} />
          ) : (
            <ProductGrid products={data?.items} loading={isLoading} count={12} className="xl:grid-cols-3 2xl:grid-cols-4" />
          )}
          {data && data.totalPages > 1 && (
            <nav aria-label="Pagination" className="mt-16 flex items-center justify-center gap-2">
              {Array.from({ length: data.totalPages }, (_, i) => i + 1).map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => {
                    setParams({ page: p === 1 ? null : String(p) }, false);
                    getLenis()?.scrollTo(0) ?? window.scrollTo({ top: 0, behavior: 'smooth' });
                  }}
                  aria-current={p === data.page ? 'page' : undefined}
                  className={cn('tabular h-11 w-11 border text-sm transition-colors', p === data.page ? 'border-ink bg-ink text-ivory' : 'border-line-strong hover:border-ink')}
                >
                  {p}
                </button>
              ))}
            </nav>
          )}
        </section>
      </div>

      <AnimatePresence>
        {drawer && (
          <>
            <motion.div className="fixed inset-0 z-[60] bg-ink/45" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setDrawer(false)} />
            <motion.div role="dialog" aria-modal="true" aria-label="Filters" className="fixed inset-y-0 left-0 z-[61] flex w-[88%] max-w-sm flex-col bg-ivory" initial={{ x: '-100%' }} animate={{ x: 0 }} exit={{ x: '-100%' }} transition={{ duration: 0.45, ease: EASE_LUXE }} data-lenis-prevent>
              <div className="flex h-16 items-center justify-between border-b border-line px-5">
                <p className="font-display text-2xl">Filters</p>
                <button type="button" onClick={() => setDrawer(false)} className="flex h-11 w-11 items-center justify-center" aria-label="Close filters">
                  <X className="h-5 w-5" />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto px-5">{filters}</div>
              <div className="grid grid-cols-2 gap-3 border-t border-line p-5">
                <Button variant="secondary" onClick={() => router.replace(pathname, { scroll: false })}>
                  Clear
                </Button>
                <Button onClick={() => setDrawer(false)}>Show {data?.total ?? ''}</Button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}

function PriceFilter({ min, max, range, currency, onApply }: { min?: string; max?: string; range: { min: number; max: number }; currency: string; onApply: (min: string | null, max: string | null) => void }) {
  const [lo, setLo] = useState(min ? String(Number(min) / 100) : '');
  const [hi, setHi] = useState(max ? String(Number(max) / 100) : '');
  const sym = currency === 'GBP' ? '£' : '$';
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onApply(lo ? String(Math.round(Number(lo) * 100)) : null, hi ? String(Math.round(Number(hi) * 100)) : null);
      }}
      className="space-y-3"
    >
      <div className="flex items-center gap-2">
        <label className="flex-1">
          <span className="sr-only">Minimum price</span>
          <input type="number" min={0} inputMode="numeric" value={lo} onChange={(e) => setLo(e.target.value)} placeholder={`${sym}${Math.floor(range.min / 100)}`} className="h-10 w-full border border-line-strong bg-paper px-3 text-sm focus:border-ink focus:outline-none" />
        </label>
        <span className="text-muted">–</span>
        <label className="flex-1">
          <span className="sr-only">Maximum price</span>
          <input type="number" min={0} inputMode="numeric" value={hi} onChange={(e) => setHi(e.target.value)} placeholder={`${sym}${Math.ceil(range.max / 100)}`} className="h-10 w-full border border-line-strong bg-paper px-3 text-sm focus:border-ink focus:outline-none" />
        </label>
      </div>
      <Button type="submit" variant="secondary" size="sm" full>
        Apply price
      </Button>
    </form>
  );
}

'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowRight, Search, X } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { api, imageUrl } from '@/lib/api';
import { useCurrency, useDebounced } from '@/lib/hooks';
import { useUI } from '@/lib/store';
import { money } from '@/lib/format';
import { EASE_LUXE } from '@/lib/motion';
import { getLenis } from './SmoothScroll';

interface Suggest {
  products: { _id: string; name: string; slug: string; brandName: string; price: number; currency: string; image: string | null; department: string }[];
  categories: { name: string; slug: string; department: string }[];
  brands: { name: string; slug: string }[];
}

const POPULAR = ['Sneakers', 'Leather jacket', 'Dresses', 'Boots', 'Knitwear', 'Tailoring'];

export function SearchOverlay() {
  const { searchOpen, setSearchOpen } = useUI();
  const router = useRouter();
  const currency = useCurrency();
  const [q, setQ] = useState('');
  const input = useRef<HTMLInputElement>(null);
  const term = useDebounced(q.trim(), 220);

  const { data, isFetching } = useQuery({
    queryKey: ['suggest', term, currency],
    enabled: searchOpen && term.length >= 1,
    queryFn: ({ signal }) => api<Suggest>('/products/suggest', { query: { q: term, currency }, signal }),
    staleTime: 30_000,
  });

  useEffect(() => {
    if (!searchOpen) return;
    getLenis()?.stop();
    setTimeout(() => input.current?.focus(), 50);
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setSearchOpen(false);
    window.addEventListener('keydown', onKey);
    return () => {
      getLenis()?.start();
      window.removeEventListener('keydown', onKey);
    };
  }, [searchOpen, setSearchOpen]);

  const go = (href: string) => {
    setSearchOpen(false);
    setQ('');
    router.push(href);
  };

  return (
    <AnimatePresence>
      {searchOpen && (
        <motion.div
          role="dialog"
          aria-modal="true"
          aria-label="Search"
          className="fixed inset-0 z-[70] overflow-y-auto bg-ivory"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0, transition: { duration: 0.2 } }}
          data-lenis-prevent
        >
          <div className="container-luxe pt-6">
            <div className="flex justify-end">
              <button onClick={() => setSearchOpen(false)} className="flex h-11 w-11 items-center justify-center" aria-label="Close search">
                <X className="h-5 w-5" />
              </button>
            </div>
            <motion.form
              initial={{ y: 24, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ duration: 0.6, ease: EASE_LUXE }}
              onSubmit={(e) => {
                e.preventDefault();
                if (q.trim()) go(`/search?q=${encodeURIComponent(q.trim())}`);
              }}
              className="mx-auto mt-8 max-w-4xl"
              role="search"
            >
              <label htmlFor="site-search" className="eyebrow text-muted">
                Search the collection
              </label>
              <div className="mt-3 flex items-center gap-4 border-b border-ink pb-3">
                <Search className="h-6 w-6 shrink-0 text-graphite" strokeWidth={1.25} aria-hidden />
                <input
                  ref={input}
                  id="site-search"
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="Sneakers, cashmere, tailoring…"
                  autoComplete="off"
                  className="w-full bg-transparent font-display text-3xl placeholder:text-line-strong focus:outline-none md:text-5xl"
                />
                {isFetching && <span className="h-4 w-4 animate-spin rounded-full border-2 border-line-strong border-t-ink" aria-hidden />}
                <button type="submit" className="flex h-11 w-11 shrink-0 items-center justify-center" aria-label="Show all results">
                  <ArrowRight className="h-5 w-5" />
                </button>
              </div>
            </motion.form>

            <div className="mx-auto mt-10 grid max-w-4xl gap-10 pb-16 md:grid-cols-[1fr_2fr]">
              <div>
                {term && (data?.categories.length || data?.brands.length) ? (
                  <>
                    <p className="eyebrow mb-4 text-muted">Categories & brands</p>
                    <ul className="space-y-2">
                      {data!.categories.map((c) => (
                        <li key={c.slug}>
                          <button onClick={() => go(`/${c.department}?category=${c.slug}`)} className="link-underline text-left text-lg">
                            {c.name} <span className="text-sm text-muted">in {c.department}</span>
                          </button>
                        </li>
                      ))}
                      {data!.brands.map((b) => (
                        <li key={b.slug}>
                          <button onClick={() => go(`/search?q=${encodeURIComponent(b.name)}`)} className="link-underline text-left text-lg">
                            {b.name}
                          </button>
                        </li>
                      ))}
                    </ul>
                  </>
                ) : (
                  <>
                    <p className="eyebrow mb-4 text-muted">Popular searches</p>
                    <ul className="flex flex-wrap gap-2">
                      {POPULAR.map((p) => (
                        <li key={p}>
                          <button onClick={() => go(`/search?q=${encodeURIComponent(p)}`)} className="border border-line-strong px-4 py-2 text-sm transition-colors hover:border-ink hover:bg-ink hover:text-ivory">
                            {p}
                          </button>
                        </li>
                      ))}
                    </ul>
                  </>
                )}
              </div>
              <div>
                {term && (
                  <>
                    <p className="eyebrow mb-4 text-muted">{data?.products.length ? 'Products' : isFetching ? 'Searching…' : `No products match “${term}”`}</p>
                    <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3">
                      {data?.products.map((p, i) => (
                        <motion.li key={p._id} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04, duration: 0.4, ease: EASE_LUXE }}>
                          <Link href={`/product/${p.slug}`} onClick={() => setSearchOpen(false)} className="group block">
                            <div className="aspect-[4/5] overflow-hidden bg-sand">
                              {p.image && (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img src={imageUrl(p.image)} alt={p.name} className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-105" />
                              )}
                            </div>
                            <p className="mt-2 text-[13px] leading-snug">{p.name}</p>
                            <p className="tabular text-[13px] text-muted">{money(p.price, p.currency)}</p>
                          </Link>
                        </motion.li>
                      ))}
                    </ul>
                  </>
                )}
              </div>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

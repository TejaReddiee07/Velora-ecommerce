'use client';

import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Component, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useQuery } from '@tanstack/react-query';
import { useProgress } from '@react-three/drei';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import { api } from '@/lib/api';
import { useCurrency, useMediaQuery, useReducedMotion } from '@/lib/hooks';
import { useWebGL } from '@/lib/use-visibility';
import { cn, money } from '@/lib/format';
import { EASE_LUXE } from '@/lib/motion';
import { ButtonLink } from '@/components/ui/Button';
import { ProductGrid } from '@/components/store/ProductCard';
import { SHOWROOM_GROUPS, buildRacks, cutoutPath, groupForCategory, type Rack } from './groups';
import { ShowroomCard } from './ShowroomCard';
import type { HoverRef } from './ShowroomScene';
import type { ProductList } from '@/lib/types';

// The 3D bundle (three.js, R3F, drei) is only downloaded on this page.
const ShowroomScene = dynamic(() => import('./ShowroomScene'), { ssr: false });

class SceneBoundary extends Component<{ onError: () => void; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch() {
    this.props.onError();
  }
  render() {
    return this.state.failed ? null : this.props.children;
  }
}

function LoadingScreen({ visible }: { visible: boolean }) {
  const { progress } = useProgress();
  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          className="absolute inset-0 z-40 flex flex-col items-center justify-center bg-[#f7f5f1]"
          exit={{ opacity: 0, transition: { duration: 0.7, ease: EASE_LUXE } }}
          role="status"
          aria-live="polite"
        >
          <p className="eyebrow text-gold-deep">The showroom</p>
          <p className="mt-3 font-display text-4xl italic">Dressing the rails…</p>
          <div className="mt-8 h-px w-56 bg-line" aria-hidden>
            <motion.div className="h-full bg-ink" animate={{ width: `${Math.max(6, progress)}%` }} transition={{ duration: 0.4 }} />
          </div>
          <p className="tabular mt-3 text-[12px] text-muted">{Math.round(progress)}%</p>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function Fallback({ racks, reason }: { racks: Rack[]; reason: string }) {
  const items = racks.flatMap((r) => r.items);
  return (
    <div className="container-luxe pt-[150px]">
      <p className="eyebrow text-gold-deep">The showroom</p>
      <h1 className="mt-3 text-[clamp(2.6rem,6vw,4.5rem)] leading-none">On the rail</h1>
      <p className="mt-4 max-w-xl text-muted">{reason}</p>
      <div className="mt-12">
        <ProductGrid products={items} loading={!items.length} count={8} />
      </div>
    </div>
  );
}

export function Showroom({ cutoutSlugs }: { cutoutSlugs: string[] | null }) {
  const params = useSearchParams();
  const router = useRouter();
  const currency = useCurrency();
  const reduced = useReducedMotion();
  const mobile = useMediaQuery('(max-width: 767px)');
  const webgl = useWebGL();
  const [sceneFailed, setSceneFailed] = useState(false);

  const { data, isError } = useQuery({
    queryKey: ['products', 'showroom', currency],
    queryFn: () => api<ProductList>('/products', { query: { showroom: true, limit: 100, sort: 'featured', currency } }),
    staleTime: 30_000,
  });
  const racks = useMemo(() => buildRacks(data?.items ?? []), [data]);
  const slugs = useMemo(() => racks.flatMap((r) => r.items.map((p) => p.slug)), [racks]);

  // Which products already have a transparent PNG in /public/showroom.
  const { data: probed } = useQuery({
    queryKey: ['showroom-cutouts', slugs],
    enabled: cutoutSlugs === null && slugs.length > 0,
    queryFn: async () => {
      const hits = await Promise.all(slugs.map(async (s) => ((await fetch(cutoutPath(s), { method: 'HEAD' }).catch(() => null))?.ok ? s : null)));
      return hits.filter((s): s is string => Boolean(s));
    },
    staleTime: Infinity,
  });
  const cutoutList = cutoutSlugs ?? probed;
  const cutouts = useMemo(() => new Set(cutoutList ?? []), [cutoutList]);

  const [active, setActive] = useState(0);
  const [focus, setFocus] = useState<number | null>(null);
  const [activation, setActivation] = useState(0);
  const [hover, setHover] = useState<HoverRef | null>(null);
  const [ready, setReady] = useState(false);
  const panRef = useRef(0);
  const started = useRef(false);

  // Initial rack / focused item from the URL (?category= or ?product=).
  useEffect(() => {
    if (!racks.length || started.current) return;
    started.current = true;
    const productSlug = params.get('product');
    const category = params.get('category');
    let r = 0;
    let f: number | null = null;
    if (productSlug) {
      racks.forEach((rack, ri) => {
        const j = rack.items.findIndex((p) => p.slug === productSlug);
        if (j >= 0) {
          r = ri;
          f = j;
        }
      });
    } else if (category) {
      const key = racks.some((x) => x.key === category) ? category : groupForCategory(category);
      const idx = racks.findIndex((x) => x.key === key);
      if (idx >= 0) r = idx;
    }
    setActive(r);
    setFocus(f);
    setActivation((a) => a + 1);
  }, [racks, params]);

  // Keep the URL shareable without triggering a navigation.
  useEffect(() => {
    if (!started.current || !racks[active]) return;
    const sp = new URLSearchParams({ category: racks[active].key });
    if (focus != null && racks[active].items[focus]) sp.set('product', racks[active].items[focus].slug);
    window.history.replaceState(window.history.state, '', `/showroom?${sp.toString()}`);
  }, [active, focus, racks]);

  // No WebGL: a product deep link goes to the normal product page.
  useEffect(() => {
    if (webgl === false && params.get('product')) router.replace(`/product/${params.get('product')}`);
  }, [webgl, params, router]);

  const rack = racks[active];
  const count = rack?.items.length ?? 0;

  const selectRack = useCallback(
    (i: number) => {
      setFocus(null);
      if (i !== active) {
        setActive(i);
        setActivation((a) => a + 1);
        panRef.current = 0;
      }
    },
    [active],
  );
  const select = useCallback(
    (ri: number, j: number) => {
      if (ri !== active) {
        setActive(ri);
        setActivation((a) => a + 1);
      }
      setFocus(j);
    },
    [active],
  );
  const cycle = useCallback((dir: 1 | -1) => setFocus((f) => (f == null || !count ? f : (f + dir + count) % count)), [count]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT')) return;
      if (e.key === 'Escape' && focus != null) setFocus(null);
      if (focus != null && e.key === 'ArrowRight') cycle(1);
      if (focus != null && e.key === 'ArrowLeft') cycle(-1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [focus, cycle]);

  // Touch: swipe sideways along the rail.
  const drag = useRef<{ x: number } | null>(null);
  const onPointerDown = (e: React.PointerEvent) => {
    if (mobile && focus == null) drag.current = { x: e.clientX };
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!drag.current) return;
    panRef.current -= (e.clientX - drag.current.x) * 0.006;
    drag.current.x = e.clientX;
  };
  const endDrag = () => {
    drag.current = null;
  };

  const handleReady = useCallback(() => setReady(true), []);

  if (isError) return <Fallback racks={[]} reason="The showroom could not be loaded. Please try again shortly." />;
  if (webgl === false || sceneFailed) {
    return <Fallback racks={racks} reason="Your browser can't display the 3D showroom, so here are the same pieces — select any one to view its full product page." />;
  }

  const sceneCanRender = webgl === true && racks.length > 0 && cutoutList !== undefined;

  return (
    <section className="theme-lock relative h-[100svh] min-h-[620px] w-full overflow-hidden bg-[#f7f5f1]" aria-label="3D showroom">
      <div className="absolute inset-0 touch-pan-y" onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={endDrag} onPointerCancel={endDrag} onPointerLeave={endDrag}>
        {sceneCanRender && (
          <SceneBoundary onError={() => setSceneFailed(true)}>
            <ShowroomScene
              racks={racks}
              active={active}
              focus={focus}
              hover={hover}
              cutouts={cutouts}
              mobile={mobile}
              reduced={reduced}
              activation={activation}
              panRef={panRef}
              onHover={setHover}
              onSelect={select}
              onReady={handleReady}
            />
          </SceneBoundary>
        )}
      </div>

      <LoadingScreen visible={!ready} />

      {/* Rail index (desktop): names, prices and keyboard access to every piece */}
      {rack && (
        <motion.nav
          aria-label={`${rack.label} on the rail`}
          className={cn('absolute left-6 top-[128px] z-20 hidden w-[240px] transition-opacity duration-500 md:block xl:left-12', focus != null && 'pointer-events-none opacity-0')}
          initial={false}
        >
          <p className="eyebrow text-[0.66rem] text-gold-deep">On the rail · {rack.label}</p>
          <ol className="mt-4 space-y-1">
            {rack.items.map((p, j) => (
              <li key={p._id}>
                <button
                  type="button"
                  onClick={() => select(active, j)}
                  onMouseEnter={() => setHover({ rack: active, item: j })}
                  onMouseLeave={() => setHover(null)}
                  onFocus={() => setHover({ rack: active, item: j })}
                  onBlur={() => setHover(null)}
                  className={cn('group flex w-full items-baseline gap-3 py-1.5 text-left transition-colors', hover?.rack === active && hover.item === j ? 'text-ink' : 'text-graphite')}
                >
                  <span className="tabular text-[11px] text-muted">{String(j + 1).padStart(2, '0')}</span>
                  <span className="link-underline flex-1 text-[14px]">{p.name}</span>
                  <span className="tabular text-[12px] text-muted">{money(p.price, p.currency)}</span>
                </button>
              </li>
            ))}
          </ol>
          <p className="mt-6 text-[12px] text-muted">Select a piece for a closer look. Use ← → to browse and Esc to return.</p>
        </motion.nav>
      )}

      {/* Back to rack */}
      <AnimatePresence>
        {focus != null && (
          <motion.button
            type="button"
            onClick={() => setFocus(null)}
            initial={{ opacity: 0, x: -12 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -12 }}
            transition={{ duration: reduced ? 0 : 0.4, ease: EASE_LUXE }}
            className="absolute left-4 top-[124px] z-30 inline-flex h-10 items-center gap-2 rounded-full border border-line bg-ivory/90 px-4 text-[11px] uppercase tracking-[0.18em] backdrop-blur transition-colors hover:border-ink md:left-6 xl:left-12"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> Back to rack
          </motion.button>
        )}
      </AnimatePresence>

      {/* Stage arrows (desktop) */}
      {focus != null && !mobile && count > 1 && (
        <>
          <button type="button" onClick={() => cycle(-1)} className="absolute left-6 top-1/2 z-20 flex h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full border border-line bg-ivory/85 backdrop-blur transition-colors hover:border-ink xl:left-12" aria-label="Previous piece">
            <ArrowLeft className="h-5 w-5" />
          </button>
          <button type="button" onClick={() => cycle(1)} className="absolute right-[430px] top-1/2 z-20 flex h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full border border-line bg-ivory/85 backdrop-blur transition-colors hover:border-ink xl:right-[480px]" aria-label="Next piece">
            <ArrowRight className="h-5 w-5" />
          </button>
        </>
      )}

      {/* Product focus card / bottom sheet */}
      <AnimatePresence>
        {focus != null && rack?.items[focus] && (
          <ShowroomCard
            key={rack.items[focus]._id}
            product={rack.items[focus]}
            index={focus}
            total={count}
            mobile={mobile}
            reduced={reduced}
            onPrev={() => cycle(-1)}
            onNext={() => cycle(1)}
            onClose={() => setFocus(null)}
          />
        )}
      </AnimatePresence>

      {/* Floating pill tabs */}
      <AnimatePresence>
        {racks.length > 0 && !(mobile && focus != null) && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            transition={{ duration: reduced ? 0 : 0.5, ease: EASE_LUXE }}
            className="absolute bottom-5 left-1/2 z-20 max-w-[calc(100vw-32px)] -translate-x-1/2 md:bottom-8"
          >
            <div role="tablist" aria-label="Showroom categories" className="flex gap-1 overflow-x-auto rounded-full border border-line bg-ivory/85 p-1.5 shadow-[0_12px_32px_-14px_rgba(12,10,9,0.35)] backdrop-blur-md scrollbar-none">
              {racks.map((r, i) => (
                <button
                  key={r.key}
                  type="button"
                  role="tab"
                  aria-selected={i === active}
                  onClick={() => selectRack(i)}
                  className={cn('relative h-10 shrink-0 whitespace-nowrap rounded-full px-4 text-[11px] uppercase tracking-[0.16em] transition-colors md:px-5', i === active ? 'text-ivory' : 'text-graphite hover:text-ink')}
                >
                  {i === active && <motion.span layoutId="showroom-tab" className="absolute inset-0 rounded-full bg-ink" transition={{ type: 'spring', stiffness: 380, damping: 32 }} />}
                  <span className="relative">{r.label}</span>
                </button>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Hints */}
      {ready && focus == null && (
        <p className="pointer-events-none absolute inset-x-0 bottom-[84px] z-10 text-center text-[11px] uppercase tracking-[0.2em] text-muted md:hidden">Swipe to browse · tap a piece</p>
      )}
      {mobile && focus == null && rack && (
        <div className="absolute inset-x-4 top-[120px] z-10 flex items-center justify-between">
          <p className="eyebrow text-[0.62rem] text-gold-deep">{rack.items.length} pieces on the rail</p>
          <Link href="/clothing" className="link-underline text-[11px] uppercase tracking-[0.18em] text-graphite">
            Shop all
          </Link>
        </div>
      )}
      {!mobile && focus == null && (
        <div className="absolute bottom-8 right-6 z-10 hidden xl:right-12 lg:block">
          <ButtonLink href={rack ? `/clothing?category=${(SHOWROOM_GROUPS.find((g) => g.key === rack.key)?.categories ?? [rack.items[0]?.categorySlug]).join(',')}` : '/clothing'} variant="ghost" size="sm">
            Shop {rack?.label ?? 'clothing'}
          </ButtonLink>
        </div>
      )}
    </section>
  );
}

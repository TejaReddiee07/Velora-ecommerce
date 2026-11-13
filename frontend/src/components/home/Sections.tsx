'use client';

import Link from 'next/link';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { useQuery } from '@tanstack/react-query';
import { ArrowRight, ArrowUpRight } from 'lucide-react';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { api, imageUrl, srcSet } from '@/lib/api';
import { useCurrency, useMediaQuery, useReducedMotion } from '@/lib/hooks';
import { useVisibility, useWebGL } from '@/lib/use-visibility';
import { cn, money } from '@/lib/format';
import { EASE_LUXE } from '@/lib/motion';
import { ButtonLink } from '@/components/ui/Button';
import { GridImage } from '@/components/ui/Media';
import { ProductCard, ProductGrid } from '@/components/store/ProductCard';
import { NewsletterForm } from '@/components/store/Footer';
import { useCategories } from '@/components/store/Header';
import { FadeIn, ParallaxImage, RevealText } from './effects';
import type { Banner, ProductCard as Card, ProductList } from '@/lib/types';

gsap.registerPlugin(ScrollTrigger);

const FootwearCarousel = dynamic(() => import('@/components/three/FootwearCarousel'), { ssr: false });

export function useHomeProducts(name: string, query: Record<string, string | number | boolean>, initial?: Card[] | null) {
  const currency = useCurrency();
  return useQuery({
    queryKey: ['products', 'home', name, currency],
    queryFn: async () => (await api<ProductList>('/products', { query: { ...query, currency } })).items,
    initialData: initial && initial[0]?.currency === currency ? initial : undefined,
    staleTime: 30_000,
  });
}

function SectionHeading({ eyebrow, title, href, linkLabel = 'View all', light }: { eyebrow?: string; title: string; href?: string; linkLabel?: string; light?: boolean }) {
  return (
    <div className="mb-12 flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
      <div>
        {eyebrow && <p className={cn('eyebrow mb-4', light ? 'text-champagne' : 'text-gold-deep')}>{eyebrow}</p>}
        <RevealText text={title} className="text-[clamp(2.4rem,5.5vw,4.6rem)] leading-[0.95]" />
      </div>
      {href && (
        <Link href={href} className={cn('group inline-flex items-center gap-2 text-[12px] uppercase tracking-[0.2em]', light ? 'text-ivory' : 'text-ink')}>
          <span className="link-underline">{linkLabel}</span>
          <ArrowRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-1" />
        </Link>
      )}
    </div>
  );
}

// ── Marquee ────────────────────────────────────────────────────────────────
export function Marquee() {
  const items = ['Complimentary delivery over £150', 'Free 30-day returns', 'Responsibly sourced materials', 'Secure Stripe checkout', 'Apple Pay & Google Pay accepted', 'Crafted to last'];
  const row = [...items, ...items];
  return (
    <div className="overflow-hidden border-y border-line bg-paper py-4" aria-label="Store promises">
      <div className="flex w-max animate-marquee gap-12 motion-reduce:animate-none">
        {row.map((t, i) => (
          <span key={i} className="flex items-center gap-12 whitespace-nowrap font-display text-xl italic text-graphite" aria-hidden={i >= items.length}>
            {t} <span className="text-gold">✦</span>
          </span>
        ))}
      </div>
    </div>
  );
}

// ── Collection tiles ───────────────────────────────────────────────────────
export function CollectionTiles({ banners }: { banners: Banner[] }) {
  const tiles = banners.filter((b) => b.placement === 'collection' && b.title !== 'The Boutique').slice(0, 4);
  if (!tiles.length) return null;
  // Fixed-height editorial grid: one tall tile, two stacked, one wide.
  const layout = [
    'h-[460px] md:col-span-7 md:row-span-2 md:h-[760px]',
    'h-[340px] md:col-span-5 md:h-[368px]',
    'h-[340px] md:col-span-5 md:h-[368px]',
    'h-[340px] md:col-span-12 md:h-[440px]',
  ];
  return (
    <section className="container-luxe py-24 md:py-32" aria-labelledby="collections-heading">
      <SectionHeading eyebrow="The collections" title="Dressed for every chapter" />
      <h2 id="collections-heading" className="sr-only">Shop by collection</h2>
      <div className="grid gap-4 md:grid-cols-12 md:gap-6">
        {tiles.map((t, i) => (
          <FadeIn key={t._id} delay={i * 0.08} className={cn('group relative overflow-hidden', layout[i])}>
            <Link href={t.ctaHref || '/'} className="block h-full">
              <div className="relative h-full overflow-hidden">
                {t.image && (
                  <ParallaxImage
                    src={imageUrl(t.image.lg)}
                    srcSet={srcSet(t.image)}
                    alt={t.title}
                    sizes={i === 0 ? '(min-width: 768px) 58vw, 100vw' : i === 3 ? '100vw' : '(min-width: 768px) 42vw, 100vw'}
                    imgClassName="transition-transform duration-[1.6s] ease-[var(--ease-luxe)] group-hover:scale-[1.06]"
                  />
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-ink/70 via-ink/10 to-transparent transition-opacity duration-700 group-hover:opacity-90" />
                <div className="absolute inset-x-0 bottom-0 flex items-end justify-between p-6 text-ivory md:p-8">
                  <div>
                    <p className="eyebrow text-champagne">{t.subtitle}</p>
                    <p className="mt-2 font-display text-[clamp(2rem,4vw,3.4rem)] leading-none">{t.title}</p>
                  </div>
                  <span className="flex h-12 w-12 items-center justify-center rounded-full border border-ivory/50 transition-all duration-500 group-hover:rotate-45 group-hover:bg-ivory group-hover:text-ink">
                    <ArrowUpRight className="h-5 w-5" />
                  </span>
                </div>
              </div>
            </Link>
          </FadeIn>
        ))}
      </div>
    </section>
  );
}

// ── Pinned horizontal rail ─────────────────────────────────────────────────
export function EditRail({ initial }: { initial?: Card[] | null }) {
  const { data } = useHomeProducts('featured', { featured: true, limit: 10, sort: 'featured' }, initial);
  const section = useRef<HTMLElement>(null);
  const track = useRef<HTMLDivElement>(null);
  const desktop = useMediaQuery('(min-width: 1024px)');
  const reduced = useReducedMotion();

  useEffect(() => {
    if (!desktop || reduced || !section.current || !track.current || !data?.length) return;
    const ctx = gsap.context(() => {
      const distance = () => Math.max(0, track.current!.scrollWidth - window.innerWidth + 96);
      gsap.to(track.current, {
        x: () => -distance(),
        ease: 'none',
        scrollTrigger: { trigger: section.current, start: 'top top', end: () => `+=${distance()}`, scrub: 0.8, pin: true, invalidateOnRefresh: true, anticipatePin: 1 },
      });
    }, section);
    return () => ctx.revert();
  }, [desktop, reduced, data?.length]);

  if (data && !data.length) return null;
  return (
    <section ref={section} className="overflow-hidden bg-ink py-24 text-ivory lg:flex lg:h-screen lg:flex-col lg:justify-center lg:py-0" aria-labelledby="edit-heading">
      <div className="container-luxe">
        <div className="mb-12 flex items-end justify-between gap-6">
          <div>
            <p className="eyebrow mb-4 text-champagne">Featured collection</p>
            <h2 id="edit-heading" className="text-[clamp(2.4rem,5.5vw,4.6rem)] leading-[0.95]">
              The <em className="italic text-champagne">Edit</em>
            </h2>
          </div>
          <p className="hidden max-w-sm text-ivory/70 md:block">Signature pieces chosen by our studio — the foundations of a considered wardrobe.</p>
        </div>
      </div>
      <div ref={track} className="flex gap-6 overflow-x-auto px-4 pb-4 scrollbar-none max-lg:snap-x max-lg:snap-mandatory md:px-8 lg:overflow-visible lg:pl-12 lg:will-change-transform">
        {(data ?? Array.from({ length: 5 })).map((p, i) =>
          p ? (
            <div key={(p as Card)._id} className="w-[72vw] shrink-0 snap-start sm:w-[44vw] lg:w-[23vw] [&_.text-muted]:text-ivory/60 [&_a]:text-ivory [&_p]:text-ivory">
              <ProductCard product={p as Card} index={i} />
            </div>
          ) : (
            <div key={i} className="skeleton aspect-[4/5] w-[72vw] shrink-0 opacity-20 sm:w-[44vw] lg:w-[23vw]" />
          ),
        )}
        <Link href="/clothing" className="flex w-[60vw] shrink-0 snap-start flex-col items-center justify-center gap-4 border border-ivory/20 text-center transition-colors hover:border-ivory sm:w-[30vw] lg:w-[18vw]">
          <span className="font-display text-3xl">Discover all</span>
          <ArrowRight className="h-6 w-6" />
        </Link>
      </div>
    </section>
  );
}

// ── Clothing section ───────────────────────────────────────────────────────
export function ClothingSection({ initial }: { initial?: Card[] | null }) {
  const { data } = useHomeProducts('clothing-new', { department: 'clothing', limit: 8, sort: 'newest' }, initial);
  const { data: categories } = useCategories();
  const cats = (categories ?? []).filter((c) => c.department === 'clothing' && c.productCount > 0);
  return (
    <section className="container-luxe py-24 md:py-32" aria-labelledby="clothing-heading">
      <SectionHeading eyebrow="Clothing · New arrivals" title="New season clothing" href="/clothing" />
      <h2 id="clothing-heading" className="sr-only">Clothing new arrivals</h2>
      <ul className="-mt-4 mb-12 flex flex-wrap gap-2">
        {cats.map((c) => (
          <li key={c.slug}>
            <Link href={`/clothing?category=${c.slug}`} className="inline-flex h-10 items-center border border-line-strong px-4 text-[13px] transition-colors hover:border-ink hover:bg-ink hover:text-ivory">
              {c.name}
            </Link>
          </li>
        ))}
      </ul>
      <ProductGrid products={data} loading={!data} count={8} />
    </section>
  );
}

// ── Footwear 3D showcase ───────────────────────────────────────────────────
export function FootwearShowcase({ initial }: { initial?: Card[] | null }) {
  const { data } = useHomeProducts('footwear', { department: 'footwear', limit: 10, sort: 'featured' }, initial);
  const { data: categories } = useCategories();
  const router = useRouter();
  const reduced = useReducedMotion();
  const mobile = useMediaQuery('(max-width: 767px)');
  const webgl = useWebGL();
  const { ref, near, visible } = useVisibility<HTMLDivElement>('400px');
  const [active, setActive] = useState(0);
  const items = (data ?? []).filter((p) => p.images[0]).slice(0, 8);
  const cats = (categories ?? []).filter((c) => c.department === 'footwear' && c.productCount > 0);
  const use3D = webgl && !reduced && !mobile && items.length >= 4;

  return (
    <section className="relative bg-ink py-24 text-ivory md:py-32" aria-labelledby="footwear-heading">
      <div className="container-luxe">
        <div className="mb-10 grid gap-8 md:grid-cols-[1.2fr_1fr] md:items-end">
          <div>
            <p className="eyebrow mb-4 text-champagne">Footwear</p>
            <h2 id="footwear-heading" className="text-[clamp(2.4rem,5.5vw,4.6rem)] leading-[0.95]">
              Footwear <em className="italic text-champagne">in focus</em>
            </h2>
          </div>
          <div>
            <p className="max-w-md text-ivory/70">Sneakers, sports shoes, loafers, formal shoes, boots and sandals. Drag the carousel to explore — select a pair to see it in detail.</p>
            <ul className="mt-6 flex flex-wrap gap-2">
              {cats.map((c) => (
                <li key={c.slug}>
                  <Link href={`/footwear?category=${c.slug}`} className="inline-flex h-10 items-center border border-ivory/30 px-4 text-[13px] transition-colors hover:border-ivory hover:bg-ivory hover:text-ink">
                    {c.name}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>

      {use3D ? (
        <div ref={ref} className="relative h-[620px] w-full cursor-grab active:cursor-grabbing">
          {near && <FootwearCarousel items={items.map((p) => ({ id: p._id, slug: p.slug, name: p.name, image: imageUrl(p.images[0].md) }))} active={visible} mobile={false} onOpen={(slug) => router.push(`/product/${slug}`)} />}
          <p className="pointer-events-none absolute bottom-6 left-1/2 -translate-x-1/2 text-[11px] uppercase tracking-[0.24em] text-ivory/60">Drag to rotate · click a pair to open</p>
        </div>
      ) : (
        <div className="flex snap-x snap-mandatory gap-5 overflow-x-auto px-4 pb-6 scrollbar-none md:px-8" onScroll={(e) => setActive(Math.round(e.currentTarget.scrollLeft / 300))}>
          {items.map((p, i) => (
            <Link key={p._id} href={`/product/${p.slug}`} className="group w-[70vw] shrink-0 snap-center sm:w-[300px]">
              <motion.div animate={{ scale: i === active ? 1 : 0.94, opacity: i === active ? 1 : 0.7 }} transition={{ duration: 0.5, ease: EASE_LUXE }}>
                <GridImage image={p.images[0]} alt={p.name} sizes="300px" />
              </motion.div>
            </Link>
          ))}
        </div>
      )}

      {/* Accessible list of the same products (and the primary path on touch devices) */}
      <div className="container-luxe mt-10">
        <ul className="grid grid-cols-2 gap-x-6 gap-y-4 border-t border-ivory/15 pt-8 sm:grid-cols-4">
          {items.map((p) => (
            <li key={p._id}>
              <Link href={`/product/${p.slug}`} className="group flex items-baseline justify-between gap-3">
                <span className="link-underline text-[14px]">{p.name}</span>
                <span className="tabular shrink-0 text-[13px] text-ivory/60">{money(p.price, p.currency)}</span>
              </Link>
            </li>
          ))}
        </ul>
        <div className="mt-10">
          <ButtonLink href="/footwear" variant="light">
            Shop all footwear
          </ButtonLink>
        </div>
      </div>
    </section>
  );
}

// ── Tabbed best sellers ────────────────────────────────────────────────────
export function BestSellers({ initial }: { initial?: Card[] | null }) {
  const [tab, setTab] = useState<'all' | 'clothing' | 'footwear' | 'accessories'>('all');
  const { data } = useHomeProducts(`best-${tab}`, { bestSeller: true, limit: 8, sort: 'best_selling', ...(tab !== 'all' ? { department: tab } : {}) }, tab === 'all' ? initial : undefined);
  const tabs = ['all', 'clothing', 'footwear', 'accessories'] as const;
  return (
    <section className="container-luxe py-24 md:py-32" aria-labelledby="best-heading">
      <div className="mb-12 flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="eyebrow mb-4 text-gold-deep">Most loved</p>
          <h2 id="best-heading" className="text-[clamp(2.4rem,5.5vw,4.6rem)] leading-[0.95]">
            Best sellers
          </h2>
        </div>
        <div role="tablist" aria-label="Best seller department" className="flex gap-1 border-b border-line">
          {tabs.map((t) => (
            <button key={t} role="tab" aria-selected={tab === t} onClick={() => setTab(t)} className={cn('relative h-11 px-4 text-[12px] uppercase tracking-[0.18em] transition-colors', tab === t ? 'text-ink' : 'text-muted hover:text-ink')}>
              {t}
              {tab === t && <motion.span layoutId="best-tab" className="absolute inset-x-2 -bottom-px h-px bg-ink" />}
            </button>
          ))}
        </div>
      </div>
      <ProductGrid products={data} loading={!data} count={4} />
    </section>
  );
}

// ── Special offers ─────────────────────────────────────────────────────────
export function SpecialOffers({ initial }: { initial?: Card[] | null }) {
  const { data } = useHomeProducts('sale', { onSale: true, limit: 4, sort: 'price_desc' }, initial);
  if (data && data.length === 0) return null;
  return (
    <section className="container-luxe py-24 md:py-32" aria-labelledby="offers-heading">
      <SectionHeading eyebrow="Special offers" title="Thoughtfully reduced" href="/sale" linkLabel="Shop the sale" />
      <h2 id="offers-heading" className="sr-only">Special offers</h2>
      <ProductGrid products={data} loading={!data} count={4} />
    </section>
  );
}

// ── Promotional banner ─────────────────────────────────────────────────────
export function PromoBanner({ banners }: { banners: Banner[] }) {
  const promo = banners.find((b) => b.placement === 'promo');
  if (!promo) return null;
  return (
    <section className="relative overflow-hidden bg-ink text-ivory" aria-label={promo.title}>
      <div className="grid md:grid-cols-2">
        <div className="relative min-h-[420px] overflow-hidden md:min-h-[600px]">
          {promo.image && <ParallaxImage src={imageUrl(promo.image.lg)} srcSet={srcSet(promo.image)} alt="" sizes="(min-width: 768px) 50vw, 100vw" amount={90} />}
        </div>
        <div className="flex flex-col justify-center px-6 py-20 md:px-16">
          {promo.eyebrow && <p className="eyebrow text-champagne">{promo.eyebrow}</p>}
          <RevealText text={promo.title} className="mt-5 text-[clamp(2.6rem,5vw,4.4rem)] leading-[0.95]" />
          {promo.subtitle && <p className="mt-6 max-w-md text-ivory/75">{promo.subtitle}</p>}
          {promo.ctaHref && (
            <div className="mt-10">
              <ButtonLink href={promo.ctaHref} variant="gold" size="lg">
                {promo.ctaLabel ?? 'Shop now'}
              </ButtonLink>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

// ── Brand story ────────────────────────────────────────────────────────────
export function BrandStory({ banners }: { banners: Banner[] }) {
  const boutique = banners.find((b) => b.placement === 'collection' && b.title === 'The Boutique');
  return (
    <section className="container-luxe py-24 md:py-36" aria-labelledby="story-heading">
      <div className="grid items-center gap-12 md:grid-cols-[1fr_1.1fr] md:gap-20">
        <div className="relative aspect-[4/5] overflow-hidden">
          {boutique?.image && <ParallaxImage src={imageUrl(boutique.image.lg)} srcSet={srcSet(boutique.image)} alt="Inside the VELORA boutique" sizes="(min-width: 768px) 45vw, 100vw" amount={80} />}
        </div>
        <div>
          <p className="eyebrow mb-5 text-gold-deep">The house of VELORA</p>
          <RevealText as="h2" text="Made slowly. Worn for years." className="text-[clamp(2.6rem,5.5vw,4.8rem)] leading-[0.95]" />
          <FadeIn delay={0.2}>
            <p id="story-heading" className="mt-8 max-w-lg text-[17px] leading-relaxed text-graphite">
              VELORA began with a simple belief: that the pieces you reach for most should be the ones made best. We work with small mills and family-run workshops, choose natural and recycled fibres, and design silhouettes that outlast the season.
            </p>
            <dl className="mt-12 grid grid-cols-3 gap-6 border-t border-line pt-8">
              {[
                ['30', 'day free returns'],
                ['100%', 'secure checkout'],
                ['2', 'currencies, GBP & USD'],
              ].map(([n, l]) => (
                <div key={l}>
                  <dt className="sr-only">{l}</dt>
                  <dd className="font-display text-4xl">{n}</dd>
                  <dd className="mt-1 text-[13px] text-muted">{l}</dd>
                </div>
              ))}
            </dl>
            <div className="mt-10">
              <ButtonLink href="/about" variant="secondary">
                Our story
              </ButtonLink>
            </div>
          </FadeIn>
        </div>
      </div>
    </section>
  );
}

// ── Newsletter ─────────────────────────────────────────────────────────────
export function NewsletterSection() {
  return (
    <section className="border-t border-line bg-paper py-24" aria-labelledby="newsletter-heading">
      <div className="container-luxe grid gap-10 md:grid-cols-2 md:items-end">
        <div>
          <p className="eyebrow mb-4 text-gold-deep">The VELORA letter</p>
          <h2 id="newsletter-heading" className="text-[clamp(2.2rem,4.5vw,3.8rem)] leading-[0.95]">
            First to know. <em className="italic">Never too often.</em>
          </h2>
        </div>
        <div>
          <p className="mb-6 max-w-md text-graphite">New collections, private sales and stories from the studio — once or twice a month.</p>
          <NewsletterForm source="home" />
        </div>
      </div>
    </section>
  );
}

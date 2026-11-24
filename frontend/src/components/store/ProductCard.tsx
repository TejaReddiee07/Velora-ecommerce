'use client';

import Link from 'next/link';
import { useRef, useState } from 'react';
import { AnimatePresence, motion, useMotionValue, useSpring, useTransform } from 'framer-motion';
import { Heart, Plus } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { api, imageUrl, srcSet } from '@/lib/api';
import { useCartMutations, useReducedMotion, useToggleWishlist, useWishlistIds } from '@/lib/hooks';
import { useUI } from '@/lib/store';
import { cn } from '@/lib/format';
import { EASE_LUXE } from '@/lib/motion';
import { Price, Stars } from '@/components/ui/Media';
import type { ProductCard as Card, ProductDetail } from '@/lib/types';

export function ProductCard({ product, index = 0, priority }: { product: Card; index?: number; priority?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion();
  const qc = useQueryClient();
  const [hover, setHover] = useState(false);
  const [quick, setQuick] = useState<ProductDetail | null>(null);
  const [loadingQuick, setLoadingQuick] = useState(false);
  const { data: wish } = useWishlistIds();
  const toggleWish = useToggleWishlist();
  const { add } = useCartMutations();
  const launchFlight = useUI((s) => s.launchFlight);
  const saved = wish?.productIds.includes(product._id) ?? false;

  // 3D tilt
  const mx = useMotionValue(0);
  const my = useMotionValue(0);
  const rx = useSpring(useTransform(my, [-0.5, 0.5], [6, -6]), { stiffness: 200, damping: 20 });
  const ry = useSpring(useTransform(mx, [-0.5, 0.5], [-8, 8]), { stiffness: 200, damping: 20 });

  const onMove = (e: React.PointerEvent) => {
    if (reduced || e.pointerType !== 'mouse' || !ref.current) return;
    const r = ref.current.getBoundingClientRect();
    mx.set((e.clientX - r.left) / r.width - 0.5);
    my.set((e.clientY - r.top) / r.height - 0.5);
  };
  const onLeave = () => {
    mx.set(0);
    my.set(0);
    setHover(false);
  };

  const primary = product.images[0];
  const secondary = product.images[1];

  const openQuick = async () => {
    if (quick) return setQuick(null);
    setLoadingQuick(true);
    try {
      const d = await qc.fetchQuery({
        queryKey: ['product', product.slug, product.currency],
        queryFn: () => api<{ product: ProductDetail }>(`/products/${product.slug}`, { query: { currency: product.currency } }),
        staleTime: 10_000,
      });
      setQuick(d.product);
    } catch {
      toast.error('Could not load sizes.');
    } finally {
      setLoadingQuick(false);
    }
  };

  const quickAdd = (variantId: string) => {
    add.mutate(
      { productId: product._id, variantId },
      {
        onSuccess: () => {
          if (ref.current && primary) launchFlight(imageUrl(primary.sm), ref.current.getBoundingClientRect());
          toast.success(`${product.name} added to your bag`);
          setQuick(null);
        },
      },
    );
  };

  const quickVariants = quick ? (quick.colors.length > 1 ? quick.variants.filter((v) => v.color === quick.colors[0].name) : quick.variants) : [];

  return (
    <motion.article
      initial={{ opacity: 0, y: 30 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-40px' }}
      transition={{ duration: 0.8, ease: EASE_LUXE, delay: (index % 4) * 0.06 }}
      className="group relative"
    >
      <motion.div
        ref={ref}
        onPointerMove={onMove}
        // Mouse only: on iPhone/iPad, content that changes when a finger lands (the second photo fading in) makes Safari
        // treat the first tap as a "hover" and swallow it, so the shopper had to tap twice to open the product.
        onPointerEnter={(e) => {
          if (e.pointerType === 'mouse') setHover(true);
        }}
        onPointerLeave={onLeave}
        style={{ rotateX: rx, rotateY: ry, transformPerspective: 900 }}
        className="relative"
      >
        <Link href={`/product/${product.slug}`} className="block" aria-label={product.name}>
          <div className="relative aspect-[4/5] overflow-hidden bg-sand">
            {primary && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={imageUrl(primary.md)}
                srcSet={srcSet(primary)}
                sizes="(min-width: 1280px) 22vw, (min-width: 768px) 30vw, 50vw"
                alt={primary.alt || product.name}
                loading={priority ? 'eager' : 'lazy'}
                decoding="async"
                className={cn('absolute inset-0 h-full w-full object-cover transition-[transform,opacity] duration-[1.2s] ease-[var(--ease-luxe)]', hover && secondary ? 'opacity-0' : 'opacity-100', hover && 'scale-[1.04]')}
              />
            )}
            {secondary && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={imageUrl(secondary.md)}
                srcSet={srcSet(secondary)}
                sizes="(min-width: 1280px) 22vw, (min-width: 768px) 30vw, 50vw"
                alt=""
                aria-hidden
                loading="lazy"
                decoding="async"
                className={cn('absolute inset-0 h-full w-full object-cover transition-[transform,opacity] duration-[1.2s] ease-[var(--ease-luxe)]', hover ? 'scale-100 opacity-100' : 'scale-[1.06] opacity-0')}
              />
            )}
            <div className="absolute left-3 top-3 flex flex-col items-start gap-1.5">
              {!product.inStock && <span className="bg-ink px-2 py-1 text-[10px] uppercase tracking-[0.18em] text-ivory">Sold out</span>}
              {product.inStock && product.discountPercent > 0 && <span className="bg-sale px-2 py-1 text-[10px] uppercase tracking-[0.18em] text-white">−{product.discountPercent}%</span>}
              {product.isNewArrival && <span className="bg-ivory/95 px-2 py-1 text-[10px] uppercase tracking-[0.18em] text-ink">New</span>}
              {product.inStock && product.lowStock && <span className="bg-ivory/95 px-2 py-1 text-[10px] uppercase tracking-[0.18em] text-warning">Few left</span>}
            </div>
          </div>
        </Link>

        <button
          type="button"
          onClick={() => toggleWish.mutate({ productId: product._id, saved })}
          className="absolute right-2 top-2 flex h-10 w-10 items-center justify-center rounded-full bg-ivory/85 backdrop-blur transition-transform hover:scale-110"
          aria-label={saved ? `Remove ${product.name} from wishlist` : `Save ${product.name} to wishlist`}
          aria-pressed={saved}
        >
          <Heart className={cn('h-[17px] w-[17px] transition-colors', saved ? 'fill-ink text-ink' : 'text-ink')} strokeWidth={1.5} />
        </button>

        {product.inStock && (
          <div className="absolute inset-x-2 bottom-2">
            <AnimatePresence>
              {quick && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 8 }}
                  transition={{ duration: 0.3, ease: EASE_LUXE }}
                  className="mb-2 bg-ivory/95 p-3 backdrop-blur"
                >
                  <p className="eyebrow mb-2 text-[0.6rem] text-muted">{quick.colors.length > 1 ? `${quick.colors[0].name} · select size` : 'Select size'}</p>
                  <div className="flex flex-wrap gap-1.5">
                    {quickVariants.map((v) => (
                      <button
                        key={v._id}
                        type="button"
                        disabled={v.available <= 0 || add.isPending}
                        onClick={() => quickAdd(v._id)}
                        className="h-9 min-w-9 border border-line-strong px-2 text-[12px] transition-colors hover:border-ink hover:bg-ink hover:text-ivory disabled:cursor-not-allowed disabled:text-line-strong disabled:line-through disabled:hover:bg-transparent disabled:hover:text-line-strong"
                        aria-label={`Add size ${v.size}${v.available <= 0 ? ' (sold out)' : ''}`}
                      >
                        {v.size.replace('UK ', '')}
                      </button>
                    ))}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
            <button
              type="button"
              onClick={openQuick}
              className={cn(
                'flex h-10 w-full items-center justify-center gap-2 bg-ivory/95 text-[11px] uppercase tracking-[0.2em] backdrop-blur transition-all duration-500 hover:bg-ink hover:text-ivory',
                // hidden-until-hover only where a pointer can hover; touch screens keep the button visible
                'lg:[@media(hover:hover)]:translate-y-2 lg:[@media(hover:hover)]:opacity-0 lg:group-hover:translate-y-0 lg:group-hover:opacity-100 lg:focus-visible:translate-y-0 lg:focus-visible:opacity-100',
                quick && 'lg:translate-y-0 lg:opacity-100',
              )}
              aria-expanded={Boolean(quick)}
            >
              {loadingQuick ? <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" /> : <Plus className="h-3.5 w-3.5" />}
              {quick ? 'Close' : 'Quick add'}
            </button>
          </div>
        )}
      </motion.div>

      <div className="mt-4 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="eyebrow text-[0.62rem] text-muted">{product.brandName}</p>
          <h3 className="mt-1 truncate font-sans text-[15px] font-normal tracking-normal">
            <Link href={`/product/${product.slug}`} className="link-underline">
              {product.name}
            </Link>
          </h3>
          {product.ratingCount > 0 && <Stars value={product.ratingAvg} count={product.ratingCount} className="mt-1" />}
        </div>
        <Price price={product.price} compareAt={product.compareAtPrice} currency={product.currency} className="shrink-0 flex-col items-end gap-0 text-right" />
      </div>
      {product.colors.length > 1 && (
        <ul className="mt-2 flex gap-1.5" aria-label="Available colours">
          {product.colors.slice(0, 5).map((c) => (
            <li key={c.name} title={c.name} className="h-3 w-3 rounded-full ring-1 ring-line-strong" style={{ background: c.hex }}>
              <span className="sr-only">{c.name}</span>
            </li>
          ))}
        </ul>
      )}
    </motion.article>
  );
}

export function ProductCardSkeleton() {
  return (
    <div>
      <div className="skeleton aspect-[4/5]" />
      <div className="skeleton mt-4 h-3 w-1/3" />
      <div className="skeleton mt-2 h-4 w-2/3" />
    </div>
  );
}

export function ProductGrid({ products, loading, count = 8, className }: { products?: Card[]; loading?: boolean; count?: number; className?: string }) {
  return (
    <div className={cn('grid grid-cols-2 gap-x-4 gap-y-12 md:grid-cols-3 md:gap-x-6 xl:grid-cols-4', className)}>
      {loading || !products
        ? Array.from({ length: count }).map((_, i) => <ProductCardSkeleton key={i} />)
        : products.map((p, i) => <ProductCard key={p._id} product={p} index={i} priority={i < 4} />)}
    </div>
  );
}

'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { motion, useIsPresent } from 'framer-motion';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, ArrowRight, Check, Loader2, X } from 'lucide-react';
import { toast } from 'sonner';
import { api, imageUrl } from '@/lib/api';
import { useCartMutations, useCurrency } from '@/lib/hooks';
import { useUI } from '@/lib/store';
import { cn } from '@/lib/format';
import { EASE_LUXE } from '@/lib/motion';
import { Price } from '@/components/ui/Media';
import type { ProductCard, ProductDetail } from '@/lib/types';

interface Props {
  product: ProductCard;
  index: number;
  total: number;
  mobile: boolean;
  reduced: boolean;
  onPrev: () => void;
  onNext: () => void;
  onClose: () => void;
}

/**
 * Focus card for a showroom piece. Uses the same product API and the same
 * `useCartMutations().add` as the product page, so the bag, fly-to-bag
 * animation and stock checks behave identically.
 */
export function ShowroomCard({ product: card, index, total, mobile, reduced, onPrev, onNext, onClose }: Props) {
  const currency = useCurrency();
  const { data } = useQuery({
    queryKey: ['product', card.slug, currency],
    queryFn: () => api<{ product: ProductDetail; related: ProductCard[] }>(`/products/${card.slug}`, { query: { currency } }),
    staleTime: 10_000,
  });
  const product = data?.product;
  const { add } = useCartMutations();
  const launchFlight = useUI((s) => s.launchFlight);
  const setCartOpen = useUI((s) => s.setCartOpen);
  const addBtn = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const [color, setColor] = useState<string | null>(null);
  const [variantId, setVariantId] = useState<string | null>(null);
  const [sizeError, setSizeError] = useState(false);
  const [added, setAdded] = useState(false);
  // While animating out (e.g. switching pieces) the old card is hidden from assistive tech.
  const isPresent = useIsPresent();

  useEffect(() => {
    panel.current?.focus({ preventScroll: true });
  }, []);
  useEffect(() => {
    if (!added) return;
    const t = setTimeout(() => setAdded(false), 2400);
    return () => clearTimeout(t);
  }, [added]);

  const activeColor = color ?? product?.colors[0]?.name ?? null;
  const sizes = useMemo(() => (product ? product.variants.filter((v) => v.color === activeColor && v.isActive) : []), [product, activeColor]);
  const selected = product?.variants.find((v) => v._id === variantId && v.color === activeColor) ?? null;

  const addToBag = () => {
    if (!product) return;
    if (!selected) {
      setSizeError(true);
      return;
    }
    add.mutate(
      { productId: product._id, variantId: selected._id, quantity: 1 },
      {
        onSuccess: () => {
          setAdded(true);
          const img = product.images.find((i) => i.color === activeColor) ?? product.images[0];
          if (addBtn.current && img) launchFlight(imageUrl(img.sm), addBtn.current.getBoundingClientRect());
          toast.success(`${product.name} added to your bag`, { action: { label: 'View bag', onClick: () => setCartOpen(true) } });
        },
      },
    );
  };

  const variants = mobile
    ? { hidden: { y: '100%' }, show: { y: 0 }, exit: { y: '100%' } }
    : { hidden: { x: 60, opacity: 0 }, show: { x: 0, opacity: 1 }, exit: { x: 40, opacity: 0 } };

  return (
    <motion.aside
      ref={panel}
      tabIndex={-1}
      role="dialog"
      aria-modal="false"
      aria-label={card.name}
      aria-hidden={!isPresent || undefined}
      inert={!isPresent || undefined}
      initial="hidden"
      animate="show"
      exit="exit"
      variants={variants}
      transition={{ duration: reduced ? 0 : 0.6, ease: EASE_LUXE }}
      className={cn(
        'z-30 flex flex-col bg-ivory/95 shadow-[0_24px_60px_-20px_rgba(12,10,9,0.35)] backdrop-blur-md outline-none',
        mobile
          ? 'fixed inset-x-0 bottom-0 max-h-[54svh] rounded-t-[22px] border-t border-line px-5 pb-6 pt-3'
          : 'absolute bottom-24 right-6 top-[128px] w-[380px] border border-line px-7 py-7 xl:right-12 xl:w-[400px]',
      )}
      data-lenis-prevent
    >
      {mobile && <span className="mx-auto mb-3 block h-1 w-10 rounded-full bg-line-strong" aria-hidden />}
      <div className="flex items-center justify-between">
        <p className="eyebrow tabular text-[0.66rem] text-muted">
          {String(index + 1).padStart(2, '0')} / {String(total).padStart(2, '0')}
        </p>
        <div className="flex items-center gap-1">
          <button type="button" onClick={onPrev} className="flex h-10 w-10 items-center justify-center text-graphite transition-colors hover:text-ink" aria-label="Previous piece">
            <ArrowLeft className="h-4 w-4" />
          </button>
          <button type="button" onClick={onNext} className="flex h-10 w-10 items-center justify-center text-graphite transition-colors hover:text-ink" aria-label="Next piece">
            <ArrowRight className="h-4 w-4" />
          </button>
          <button type="button" onClick={onClose} className="-mr-2 flex h-10 w-10 items-center justify-center text-graphite transition-colors hover:text-ink" aria-label="Back to the rack">
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="mt-2 flex-1 overflow-y-auto pr-1">
        <p className="eyebrow text-[0.66rem] text-muted">{card.brandName}</p>
        <h2 className="mt-1 text-[2.1rem] leading-[1.02]">{card.name}</h2>
        <Price price={product?.price ?? card.price} compareAt={product?.compareAtPrice ?? card.compareAtPrice} currency={product?.currency ?? card.currency} className="mt-3" size="md" />
        {product?.shortDescription && <p className="mt-4 text-[14px] leading-relaxed text-graphite">{product.shortDescription}</p>}

        {!product ? (
          <div className="mt-6 space-y-3" aria-hidden>
            <div className="skeleton h-4 w-1/3" />
            <div className="skeleton h-11 w-full" />
          </div>
        ) : (
          <>
            {product.colors.length > 1 && (
              <fieldset className="mt-6">
                <legend className="eyebrow mb-2.5 text-[0.66rem] text-graphite">
                  Colour: <span className="normal-case tracking-normal text-ink">{activeColor}</span>
                </legend>
                <div className="flex flex-wrap gap-2.5">
                  {product.colors.map((c) => (
                    <button
                      key={c.name}
                      type="button"
                      onClick={() => {
                        setColor(c.name);
                        setVariantId(null);
                      }}
                      aria-pressed={activeColor === c.name}
                      aria-label={c.name}
                      title={c.name}
                      className={cn('h-8 w-8 rounded-full ring-offset-2 ring-offset-ivory transition', activeColor === c.name ? 'ring-1 ring-ink' : 'ring-1 ring-line-strong hover:ring-graphite')}
                      style={{ background: c.hex }}
                    />
                  ))}
                </div>
              </fieldset>
            )}

            <fieldset className="mt-6" aria-describedby={sizeError ? 'sr-size-error' : undefined}>
              <legend className="eyebrow mb-2.5 text-[0.66rem] text-graphite">
                Size{selected ? <span className="normal-case tracking-normal text-ink">: {selected.size}</span> : null}
              </legend>
              <div className="flex flex-wrap gap-2">
                {sizes.map((v) => {
                  const sold = v.available <= 0;
                  return (
                    <button
                      key={v._id}
                      type="button"
                      disabled={sold}
                      onClick={() => {
                        setVariantId(v._id);
                        setSizeError(false);
                      }}
                      aria-pressed={variantId === v._id}
                      aria-label={`Size ${v.size}${sold ? ', sold out' : ''}`}
                      className={cn(
                        'h-11 min-w-12 border px-3 text-[13px] transition-colors',
                        variantId === v._id ? 'border-ink bg-ink text-ivory' : 'border-line-strong hover:border-ink',
                        sold && 'cursor-not-allowed border-line text-line-strong line-through hover:border-line',
                      )}
                    >
                      {v.size}
                    </button>
                  );
                })}
              </div>
              <p id="sr-size-error" className="mt-2 min-h-5 text-[13px]" aria-live="polite">
                {sizeError ? (
                  <span className="text-danger">Please select a size.</span>
                ) : !product.inStock ? (
                  <span className="text-danger">Sold out in every size.</span>
                ) : selected && selected.available <= 5 ? (
                  <span className="text-warning">Only {selected.available} left in this size</span>
                ) : null}
              </p>
            </fieldset>
          </>
        )}
      </div>

      <div className="mt-4 space-y-3 border-t border-line pt-5">
        <button
          ref={addBtn}
          type="button"
          onClick={addToBag}
          disabled={!product || !product.inStock || add.isPending}
          aria-live="polite"
          className={cn(
            'relative inline-flex h-12 w-full items-center justify-center gap-2 border font-sans text-[0.72rem] uppercase tracking-[0.18em] transition-[background-color,border-color,color,transform] duration-300 ease-[var(--ease-luxe)] active:scale-[0.98] disabled:opacity-45',
            added ? 'border-success bg-success text-white' : 'border-charcoal bg-charcoal text-ivory hover:bg-ink',
          )}
        >
          {add.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          ) : added ? (
            <motion.span initial={{ scale: 0.4, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: 'spring', stiffness: 420, damping: 18 }} className="inline-flex">
              <Check className="h-4 w-4" aria-hidden />
            </motion.span>
          ) : null}
          <span>{added ? 'Added to bag' : product && !product.inStock ? 'Sold out' : 'Add to bag'}</span>
        </button>
        <Link href={`/product/${card.slug}`} className="link-underline block text-center text-[12px] uppercase tracking-[0.18em] text-graphite">
          View full details
        </Link>
      </div>
    </motion.aside>
  );
}

'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Box, Check, ChevronDown, Heart, Ruler, ShieldCheck, Truck, RotateCcw } from 'lucide-react';
import { toast } from 'sonner';
import { api, ApiError, imageUrl } from '@/lib/api';
import { useCartMutations, useCurrency, useMe, useSettings, useToggleWishlist, useWishlistIds } from '@/lib/hooks';
import { useUI } from '@/lib/store';
import { cn, date, money } from '@/lib/format';
import { EASE_LUXE } from '@/lib/motion';
import { Button } from '@/components/ui/Button';
import { Input, Textarea } from '@/components/ui/Field';
import { Price, Stars } from '@/components/ui/Media';
import { ProductGallery } from './ProductGallery';
import { SizeGuideModal } from './SizeGuide';
import { QtyStepper } from './CartDrawer';
import { ProductCard } from './ProductCard';
import { useWebGL } from '@/lib/use-visibility';
import type { ProductCard as Card, ProductDetail } from '@/lib/types';

interface Payload {
  product: ProductDetail;
  related: Card[];
}

function Accordion({ title, children, defaultOpen }: { title: string; children: React.ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(Boolean(defaultOpen));
  return (
    <div className="border-b border-line">
      <button type="button" onClick={() => setOpen(!open)} className="flex w-full items-center justify-between py-5 text-left" aria-expanded={open}>
        <span className="eyebrow">{title}</span>
        <ChevronDown className={cn('h-4 w-4 transition-transform duration-300', open && 'rotate-180')} />
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.4, ease: EASE_LUXE }} className="overflow-hidden">
            <div className="pb-6 text-[15px] leading-relaxed text-graphite">{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export function ProductView({ slug, initial }: { slug: string; initial: Payload | null }) {
  const currency = useCurrency();
  const router = useRouter();
  const { data, isError } = useQuery({
    queryKey: ['product', slug, currency],
    queryFn: () => api<Payload>(`/products/${slug}`, { query: { currency } }),
    initialData: initial && initial.product.currency === currency ? initial : undefined,
    staleTime: 10_000,
  });
  const { data: settings } = useSettings();
  const { data: wish } = useWishlistIds();
  const toggleWish = useToggleWishlist();
  const { add } = useCartMutations();
  const launchFlight = useUI((s) => s.launchFlight);
  const setCartOpen = useUI((s) => s.setCartOpen);
  const addBtn = useRef<HTMLButtonElement>(null);

  const product = data?.product;
  const [color, setColor] = useState<string | null>(null);
  const [variantId, setVariantId] = useState<string | null>(null);
  const [qty, setQty] = useState(1);
  const [guide, setGuide] = useState(false);
  const [sizeError, setSizeError] = useState(false);
  const webgl = useWebGL();

  const activeColor = color ?? product?.colors[0]?.name ?? null;
  const sizesForColor = useMemo(() => (product ? product.variants.filter((v) => v.color === activeColor && v.isActive) : []), [product, activeColor]);
  const selected = product?.variants.find((v) => v._id === variantId && v.color === activeColor) ?? null;
  const maxQty = Math.max(1, Math.min(10, selected?.available ?? 1));

  if (isError && !product) {
    return (
      <div className="container-luxe pt-[160px] text-center">
        <h1 className="text-5xl">This piece is no longer available</h1>
        <p className="mt-4 text-muted">It may have been removed from the collection.</p>
        <Link href="/" className="link-underline mt-8 inline-block">
          Return home
        </Link>
      </div>
    );
  }
  if (!product) return <div className="container-luxe pt-[160px]"><div className="skeleton aspect-[4/5] w-full max-w-xl" /></div>;

  const saved = wish?.productIds.includes(product._id) ?? false;
  const freeOver = settings?.delivery.find((d) => d.freeOver != null)?.freeOver;

  const doAdd = (thenCheckout: boolean) => {
    if (!selected) {
      setSizeError(true);
      return;
    }
    if (selected.available <= 0) return;
    add.mutate(
      { productId: product._id, variantId: selected._id, quantity: qty },
      {
        onSuccess: () => {
          if (thenCheckout) {
            router.push('/checkout');
            return;
          }
          const img = product.images.find((i) => i.color === activeColor) ?? product.images[0];
          if (addBtn.current && img) launchFlight(imageUrl(img.sm), addBtn.current.getBoundingClientRect());
          toast.success(`${product.name} added to your bag`, { action: { label: 'View bag', onClick: () => setCartOpen(true) } });
        },
      },
    );
  };

  const galleryImages = product.images;

  return (
    <>
      <div className="container-luxe pt-[130px]">
        <nav aria-label="Breadcrumb" className="mb-6 text-[12px] text-muted">
          <ol className="flex flex-wrap items-center gap-2">
            <li><Link href="/" className="link-underline">Home</Link></li>
            <li aria-hidden>/</li>
            <li><Link href={`/${product.department}`} className="link-underline capitalize">{product.department}</Link></li>
            <li aria-hidden>/</li>
            <li><Link href={`/${product.department}?category=${product.categorySlug}`} className="link-underline">{product.categoryName}</Link></li>
            <li aria-hidden>/</li>
            <li aria-current="page" className="text-graphite">{product.name}</li>
          </ol>
        </nav>

        <div className="grid gap-10 lg:grid-cols-[1.15fr_1fr] lg:gap-16">
          <ProductGallery images={galleryImages} name={product.name} activeColor={activeColor ?? undefined} />

          <div className="lg:sticky lg:top-[110px] lg:self-start">
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8, ease: EASE_LUXE }}>
              <p className="eyebrow text-muted">{product.brandName}</p>
              <h1 className="mt-2 text-[clamp(2.2rem,4vw,3.4rem)] leading-[1.02]">{product.name}</h1>
              <div className="mt-4 flex flex-wrap items-center gap-4">
                <Price price={product.price} compareAt={product.compareAtPrice} currency={product.currency} size="lg" />
                {product.discountPercent > 0 && <span className="bg-sale px-2 py-1 text-[11px] uppercase tracking-[0.16em] text-white">Save {product.discountPercent}%</span>}
                {product.showroom && webgl && (
                  <Link
                    href={`/showroom?product=${product.slug}`}
                    className="group inline-flex h-8 items-center gap-1.5 rounded-full border border-line-strong px-3.5 text-[10px] uppercase tracking-[0.18em] text-graphite transition-colors hover:border-ink hover:bg-ink hover:text-ivory"
                  >
                    <Box className="h-3.5 w-3.5 transition-transform duration-500 group-hover:rotate-12" aria-hidden /> View in 3D
                  </Link>
                )}
              </div>
              {product.ratingCount > 0 ? (
                <a href="#reviews" className="mt-3 inline-flex items-center gap-2 text-[13px]">
                  <Stars value={product.ratingAvg} /> <span className="link-underline text-muted">{product.ratingCount} review{product.ratingCount === 1 ? '' : 's'}</span>
                </a>
              ) : null}
              <p className="mt-2 text-[12px] text-muted">{settings?.tax.inclusive ? `Price includes ${settings.tax.label}.` : ''}</p>
              {product.shortDescription && <p className="mt-6 text-[16px] leading-relaxed text-graphite">{product.shortDescription}</p>}

              {/* Colour */}
              {product.colors.length > 0 && (
                <fieldset className="mt-8">
                  <legend className="eyebrow mb-3 text-graphite">
                    Colour: <span className="normal-case tracking-normal text-ink">{activeColor}</span>
                  </legend>
                  <div className="flex flex-wrap gap-3">
                    {product.colors.map((c) => {
                      const anyAvail = product.variants.some((v) => v.color === c.name && v.available > 0);
                      return (
                        <button
                          key={c.name}
                          type="button"
                          onClick={() => {
                            setColor(c.name);
                            setVariantId(null);
                            setQty(1);
                          }}
                          aria-pressed={activeColor === c.name}
                          aria-label={`${c.name}${anyAvail ? '' : ' (sold out)'}`}
                          title={c.name}
                          className={cn('relative h-10 w-10 rounded-full ring-offset-[3px] ring-offset-ivory transition', activeColor === c.name ? 'ring-1 ring-ink' : 'ring-1 ring-line-strong hover:ring-graphite')}
                          style={{ background: c.hex }}
                        >
                          {!anyAvail && <span className="absolute left-1/2 top-1/2 h-px w-[130%] -translate-x-1/2 -translate-y-1/2 rotate-45 bg-ink/60" aria-hidden />}
                        </button>
                      );
                    })}
                  </div>
                </fieldset>
              )}

              {/* Size */}
              <fieldset className="mt-8" aria-describedby={sizeError ? 'size-error' : undefined}>
                <div className="mb-3 flex items-center justify-between">
                  <legend className="eyebrow text-graphite">
                    Size{selected ? <span className="normal-case tracking-normal text-ink">: {selected.size}</span> : null}
                  </legend>
                  {product.sizeGuide !== 'none' && (
                    <button type="button" onClick={() => setGuide(true)} className="link-underline inline-flex items-center gap-1.5 text-[12px] text-graphite">
                      <Ruler className="h-3.5 w-3.5" /> Size guide
                    </button>
                  )}
                </div>
                <div className="flex flex-wrap gap-2">
                  {sizesForColor.map((v) => {
                    const sold = v.available <= 0;
                    return (
                      <button
                        key={v._id}
                        type="button"
                        disabled={sold}
                        onClick={() => {
                          setVariantId(v._id);
                          setSizeError(false);
                          setQty(1);
                        }}
                        aria-pressed={variantId === v._id}
                        aria-label={`Size ${v.size}${sold ? ', sold out' : v.available <= 3 ? `, only ${v.available} left` : ''}`}
                        className={cn(
                          'relative h-12 min-w-14 border px-3 text-[14px] transition-colors',
                          variantId === v._id ? 'border-ink bg-ink text-ivory' : 'border-line-strong hover:border-ink',
                          sold && 'cursor-not-allowed border-line text-line-strong line-through hover:border-line',
                        )}
                      >
                        {v.size}
                      </button>
                    );
                  })}
                </div>
                {sizeError && (
                  <p id="size-error" role="alert" className="mt-2 text-[13px] text-danger">
                    Please select a size.
                  </p>
                )}
                <p className="mt-3 min-h-5 text-[13px]" aria-live="polite">
                  {!product.inStock ? (
                    <span className="text-danger">Sold out in every size. Save it to your wishlist to hear about restocks.</span>
                  ) : selected ? (
                    selected.available <= 0 ? (
                      <span className="text-danger">Out of stock</span>
                    ) : selected.available <= 5 ? (
                      <span className="text-warning">Only {selected.available} left in this size</span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 text-success"><Check className="h-3.5 w-3.5" /> In stock, ready to ship</span>
                    )
                  ) : null}
                </p>
              </fieldset>

              {/* Actions */}
              <div className="mt-6 flex items-center gap-3 max-[380px]:gap-2">
                <QtyStepper value={qty} max={maxQty} onChange={setQty} disabled={!selected || selected.available <= 0} />
                <Button ref={addBtn} size="lg" className="flex-1 max-[380px]:px-4 max-[380px]:tracking-[0.14em]" onClick={() => doAdd(false)} loading={add.isPending} disabled={!product.inStock}>
                  {product.inStock ? 'Add to bag' : 'Sold out'}
                </Button>
                <button
                  type="button"
                  onClick={() => toggleWish.mutate({ productId: product._id, saved })}
                  className="flex h-14 w-14 shrink-0 items-center justify-center border border-line-strong transition-colors hover:border-ink"
                  aria-label={saved ? 'Remove from wishlist' : 'Save to wishlist'}
                  aria-pressed={saved}
                >
                  <Heart className={cn('h-5 w-5', saved && 'fill-ink')} strokeWidth={1.5} />
                </button>
              </div>
              {product.inStock && (
                <Button variant="secondary" size="lg" full className="mt-3" onClick={() => doAdd(true)} disabled={add.isPending}>
                  Buy now
                </Button>
              )}

              <ul className="mt-8 grid gap-3 text-[13px] text-graphite sm:grid-cols-3">
                <li className="flex items-center gap-2"><Truck className="h-4 w-4 shrink-0" strokeWidth={1.5} /> {freeOver ? `Free delivery over ${money(freeOver, 'GBP')}` : 'Tracked delivery'}</li>
                <li className="flex items-center gap-2"><RotateCcw className="h-4 w-4 shrink-0" strokeWidth={1.5} /> Free 30-day returns</li>
                <li className="flex items-center gap-2"><ShieldCheck className="h-4 w-4 shrink-0" strokeWidth={1.5} /> Secure Stripe checkout</li>
              </ul>

              <div className="mt-8 border-t border-line">
                <Accordion title="Description" defaultOpen>
                  <p>{product.description}</p>
                </Accordion>
                {product.specifications.length > 0 && (
                  <Accordion title="Specifications">
                    <dl className="divide-y divide-line">
                      {product.specifications.map((s) => (
                        <div key={s.label} className="grid grid-cols-[140px_1fr] gap-4 py-2.5">
                          <dt className="text-muted">{s.label}</dt>
                          <dd>{s.value}</dd>
                        </div>
                      ))}
                    </dl>
                  </Accordion>
                )}
                <Accordion title="Delivery & returns">
                  <ul className="space-y-2">
                    {settings?.delivery.map((d) => (
                      <li key={d.id} className="flex justify-between gap-4">
                        <span>{d.name} <span className="text-muted">· {d.etaDays}</span></span>
                        <span className="tabular">{money(d.price, 'GBP')}{d.freeOver != null ? ` · free over ${money(d.freeOver, 'GBP')}` : ''}</span>
                      </li>
                    ))}
                  </ul>
                  {settings?.returnPolicy && <p className="mt-4">{settings.returnPolicy}</p>}
                </Accordion>
              </div>
            </motion.div>
          </div>
        </div>
      </div>

      <Reviews productId={product._id} ratingAvg={product.ratingAvg} ratingCount={product.ratingCount} />

      {data.related.length > 0 && (
        <section className="container-luxe mt-28" aria-labelledby="related-heading">
          <div className="mb-10 flex items-end justify-between">
            <h2 id="related-heading" className="text-[clamp(2rem,4vw,3rem)]">You may also like</h2>
            <Link href={`/${product.department}?category=${product.categorySlug}`} className="link-underline text-[12px] uppercase tracking-[0.18em]">
              View all
            </Link>
          </div>
          <div className="grid grid-cols-2 gap-x-4 gap-y-12 md:grid-cols-4 md:gap-x-6">
            {data.related.slice(0, 4).map((p, i) => (
              <ProductCard key={p._id} product={p} index={i} />
            ))}
          </div>
        </section>
      )}

      <SizeGuideModal type={product.sizeGuide} open={guide} onClose={() => setGuide(false)} />
    </>
  );
}

interface ReviewsPayload {
  reviews: { _id: string; authorName: string; rating: number; title: string; body: string; verifiedPurchase: boolean; createdAt: string }[];
  total: number;
  distribution: Record<string, number>;
}

function Reviews({ productId, ratingAvg, ratingCount }: { productId: string; ratingAvg: number; ratingCount: number }) {
  const qc = useQueryClient();
  const { data: me } = useMe();
  const { data } = useQuery({
    queryKey: ['reviews', productId],
    queryFn: () => api<ReviewsPayload>(`/products/${productId}/reviews`, { query: { limit: 10 } }),
  });
  const [writing, setWriting] = useState(false);
  const [rating, setRating] = useState(5);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const submit = useMutation({
    mutationFn: () => api(`/products/${productId}/reviews`, { body: { rating, title, body } }),
    onSuccess: () => {
      toast.success('Thank you — your review is live.');
      setWriting(false);
      setTitle('');
      setBody('');
      qc.invalidateQueries({ queryKey: ['reviews', productId] });
      qc.invalidateQueries({ queryKey: ['product'] });
    },
    onError: (e) => toast.error(e instanceof ApiError ? (e.fields?.[0]?.message ?? e.message) : 'Could not submit review.'),
  });

  return (
    <section id="reviews" className="container-luxe mt-28 scroll-mt-32" aria-labelledby="reviews-heading">
      <div className="grid gap-12 border-t border-line pt-16 lg:grid-cols-[320px_1fr]">
        <div>
          <h2 id="reviews-heading" className="text-[clamp(2rem,4vw,3rem)]">Reviews</h2>
          {ratingCount > 0 ? (
            <>
              <p className="mt-4 font-display text-5xl">{ratingAvg.toFixed(1)}</p>
              <Stars value={ratingAvg} count={ratingCount} className="mt-2" />
              <ul className="mt-6 space-y-2">
                {[5, 4, 3, 2, 1].map((n) => {
                  const c = data?.distribution[n] ?? 0;
                  return (
                    <li key={n} className="flex items-center gap-3 text-[13px]">
                      <span className="w-6 text-muted">{n}★</span>
                      <span className="h-1 flex-1 bg-line"><span className="block h-full bg-ink" style={{ width: `${ratingCount ? (c / ratingCount) * 100 : 0}%` }} /></span>
                      <span className="tabular w-6 text-right text-muted">{c}</span>
                    </li>
                  );
                })}
              </ul>
            </>
          ) : (
            <p className="mt-4 text-muted">No reviews yet. Reviews are written by verified customers after purchase.</p>
          )}
          {me ? (
            <Button variant="secondary" size="sm" className="mt-8" onClick={() => setWriting(!writing)}>
              {writing ? 'Cancel' : 'Write a review'}
            </Button>
          ) : (
            <p className="mt-8 text-[13px] text-muted">
              <Link href="/login" className="link-underline text-ink">Sign in</Link> to review a piece you have purchased.
            </p>
          )}
        </div>
        <div>
          <AnimatePresence>
            {writing && (
              <motion.form initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="mb-12 space-y-5 overflow-hidden" onSubmit={(e) => { e.preventDefault(); submit.mutate(); }}>
                <fieldset>
                  <legend className="mb-2 text-[0.72rem] font-medium uppercase tracking-[0.16em] text-graphite">Your rating</legend>
                  <div className="flex gap-1">
                    {[1, 2, 3, 4, 5].map((n) => (
                      <button key={n} type="button" onClick={() => setRating(n)} aria-label={`${n} star${n > 1 ? 's' : ''}`} aria-pressed={rating === n} className={cn('h-11 w-11 text-2xl', n <= rating ? 'text-gold-deep' : 'text-line-strong')}>
                        ★
                      </button>
                    ))}
                  </div>
                </fieldset>
                <Input label="Title" value={title} onChange={(e) => setTitle(e.target.value)} required maxLength={120} />
                <Textarea label="Review" value={body} onChange={(e) => setBody(e.target.value)} required minLength={10} maxLength={2000} hint="Tell others about fit, feel and quality." />
                <Button type="submit" loading={submit.isPending}>Submit review</Button>
              </motion.form>
            )}
          </AnimatePresence>
          <ul className="divide-y divide-line">
            {data?.reviews.map((r) => (
              <li key={r._id} className="py-8 first:pt-0">
                <div className="flex items-center justify-between gap-4">
                  <Stars value={r.rating} />
                  <span className="text-[12px] text-muted">{date(r.createdAt)}</span>
                </div>
                <h3 className="mt-3 font-display text-2xl">{r.title}</h3>
                <p className="mt-2 leading-relaxed text-graphite">{r.body}</p>
                <p className="mt-3 text-[12px] text-muted">
                  {r.authorName}
                  {r.verifiedPurchase && <span className="ml-2 inline-flex items-center gap-1 text-success"><Check className="h-3 w-3" /> Verified purchase</span>}
                </p>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}

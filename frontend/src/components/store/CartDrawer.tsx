'use client';

import Link from 'next/link';
import { useEffect, useRef } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Minus, Plus, ShoppingBag, X } from 'lucide-react';
import { useCart, useCartMutations } from '@/lib/hooks';
import { useUI } from '@/lib/store';
import { imageUrl } from '@/lib/api';
import { cn, money } from '@/lib/format';
import { EASE_LUXE } from '@/lib/motion';
import { ButtonLink } from '@/components/ui/Button';
import { getLenis } from './SmoothScroll';

export function QtyStepper({ value, max, onChange, disabled, size = 'md' }: { value: number; max: number; onChange: (v: number) => void; disabled?: boolean; size?: 'sm' | 'md' }) {
  const h = size === 'sm' ? 'h-9' : 'h-11';
  return (
    <div className={cn('inline-flex items-center border border-line-strong', h)} role="group" aria-label="Quantity">
      <button type="button" className={cn('flex w-9 items-center justify-center text-graphite hover:text-ink disabled:opacity-30', h)} onClick={() => onChange(value - 1)} disabled={disabled || value <= 1} aria-label="Decrease quantity">
        <Minus className="h-3.5 w-3.5" />
      </button>
      <span className="tabular w-8 text-center text-sm" aria-live="polite">
        {value}
      </span>
      <button type="button" className={cn('flex w-9 items-center justify-center text-graphite hover:text-ink disabled:opacity-30', h)} onClick={() => onChange(value + 1)} disabled={disabled || value >= max} aria-label="Increase quantity">
        <Plus className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

export function CartDrawer() {
  const { cartOpen, setCartOpen } = useUI();
  const { data: cart, isLoading } = useCart();
  const { update, remove } = useCartMutations();
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!cartOpen) return;
    getLenis()?.stop();
    const prev = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setCartOpen(false);
    window.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      getLenis()?.start();
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
      prev?.focus?.();
    };
  }, [cartOpen, setCartOpen]);

  const free = cart?.deliveryOptions.find((d) => d.id === 'standard') ?? cart?.deliveryOptions[0];
  const threshold = free?.freeOver ?? null;
  const remaining = threshold != null && cart ? Math.max(0, threshold - (cart.subtotal - cart.discount.amount)) : null;
  const progress = threshold && cart ? Math.min(100, ((cart.subtotal - cart.discount.amount) / threshold) * 100) : 0;

  return (
    <AnimatePresence>
      {cartOpen && (
        <>
          <motion.div className="fixed inset-0 z-[60] bg-ink/45 backdrop-blur-[2px]" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setCartOpen(false)} />
          <motion.aside
            role="dialog"
            aria-modal="true"
            aria-label="Shopping bag"
            className="fixed inset-y-0 right-0 z-[61] flex w-full max-w-[460px] flex-col bg-ivory shadow-2xl"
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%', transition: { duration: 0.35, ease: EASE_LUXE } }}
            transition={{ duration: 0.55, ease: EASE_LUXE }}
            data-lenis-prevent
          >
            <div className="flex h-[68px] items-center justify-between border-b border-line px-6">
              <h2 className="font-display text-2xl">
                Your bag <span className="tabular text-base text-muted">({cart?.itemCount ?? 0})</span>
              </h2>
              <button ref={closeRef} onClick={() => setCartOpen(false)} className="-mr-2 flex h-11 w-11 items-center justify-center" aria-label="Close bag">
                <X className="h-5 w-5" />
              </button>
            </div>

            {threshold != null && cart && cart.lines.length > 0 && (
              <div className="border-b border-line px-6 py-4">
                <p className="text-[13px] text-graphite">
                  {remaining && remaining > 0 ? (
                    <>
                      You are <strong className="tabular">{money(remaining, cart.currency)}</strong> away from complimentary delivery.
                    </>
                  ) : (
                    <>You have unlocked complimentary standard delivery.</>
                  )}
                </p>
                <div className="mt-2 h-[2px] bg-line" aria-hidden>
                  <motion.div className="h-full bg-gold-deep" initial={{ width: 0 }} animate={{ width: `${progress}%` }} transition={{ duration: 0.8, ease: EASE_LUXE }} />
                </div>
              </div>
            )}

            <div className="flex-1 overflow-y-auto px-6">
              {isLoading ? (
                <div className="space-y-4 py-6">
                  {[0, 1].map((i) => (
                    <div key={i} className="flex gap-4">
                      <div className="skeleton h-32 w-24" />
                      <div className="flex-1 space-y-2">
                        <div className="skeleton h-4 w-3/4" />
                        <div className="skeleton h-4 w-1/3" />
                      </div>
                    </div>
                  ))}
                </div>
              ) : !cart || cart.lines.length === 0 ? (
                <div className="flex h-full flex-col items-center justify-center gap-5 text-center">
                  <ShoppingBag className="h-10 w-10 text-line-strong" strokeWidth={1} />
                  <p className="font-display text-2xl">Your bag is empty</p>
                  <p className="max-w-[260px] text-sm text-muted">Discover new arrivals and timeless pieces from the collection.</p>
                  <ButtonLink href="/new-arrivals" variant="secondary" size="sm" onClick={() => setCartOpen(false)}>
                    Shop new arrivals
                  </ButtonLink>
                </div>
              ) : (
                <ul className="divide-y divide-line">
                  <AnimatePresence initial={false}>
                    {cart.lines.map((l) => (
                      <motion.li key={l.itemId} layout initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 40, height: 0, paddingTop: 0, paddingBottom: 0 }} transition={{ duration: 0.45, ease: EASE_LUXE }} className="flex gap-4 overflow-hidden py-5">
                        <Link href={`/product/${l.slug}`} onClick={() => setCartOpen(false)} className="relative block h-32 w-24 shrink-0 overflow-hidden bg-sand">
                          {l.image && (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={imageUrl(l.image)} alt={l.name} className="h-full w-full object-cover" loading="lazy" />
                          )}
                        </Link>
                        <div className="flex min-w-0 flex-1 flex-col">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className="eyebrow text-[0.62rem] text-muted">{l.brandName}</p>
                              <Link href={`/product/${l.slug}`} onClick={() => setCartOpen(false)} className="mt-0.5 block font-display text-lg leading-tight">
                                {l.name}
                              </Link>
                              <p className="mt-1 text-[13px] text-muted">
                                {l.color} · {l.size}
                              </p>
                            </div>
                            <button onClick={() => remove.mutate(l.itemId)} className="-mr-2 -mt-2 flex h-9 w-9 shrink-0 items-center justify-center text-muted hover:text-ink" aria-label={`Remove ${l.name}`}>
                              <X className="h-4 w-4" />
                            </button>
                          </div>
                          {l.issue && (
                            <p className="mt-1 text-[13px] text-danger" role="alert">
                              {l.issue === 'unavailable' ? 'No longer available — please remove.' : `Only ${l.available} left — reduce quantity.`}
                            </p>
                          )}
                          <div className="mt-auto flex items-end justify-between pt-3">
                            <QtyStepper size="sm" value={l.quantity} max={Math.min(10, Math.max(l.available, 1))} onChange={(q) => update.mutate({ itemId: l.itemId, quantity: q })} disabled={update.isPending} />
                            <div className="text-right">
                              {l.originalUnitPrice > l.unitPrice && <s className="tabular block text-[12px] text-muted">{money(l.originalUnitPrice * l.quantity, cart.currency)}</s>}
                              <span className={cn('tabular text-[15px]', l.originalUnitPrice > l.unitPrice && 'text-sale')}>{money(l.lineTotal, cart.currency)}</span>
                            </div>
                          </div>
                        </div>
                      </motion.li>
                    ))}
                  </AnimatePresence>
                </ul>
              )}
            </div>

            {cart && cart.lines.length > 0 && (
              <div className="border-t border-line px-6 pb-6 pt-5">
                <dl className="space-y-1.5 text-[14px]">
                  <div className="flex justify-between">
                    <dt className="text-graphite">Subtotal</dt>
                    <dd className="tabular">{money(cart.subtotal, cart.currency)}</dd>
                  </div>
                  {cart.discount.amount > 0 && (
                    <div className="flex justify-between text-success">
                      <dt>{cart.discount.label ?? 'Discount'}</dt>
                      <dd className="tabular">−{money(cart.discount.amount, cart.currency)}</dd>
                    </div>
                  )}
                  <div className="flex justify-between text-muted">
                    <dt>Delivery</dt>
                    <dd>Calculated at checkout</dd>
                  </div>
                </dl>
                <div className="mt-5 grid grid-cols-2 gap-3">
                  <ButtonLink href="/cart" variant="secondary" full onClick={() => setCartOpen(false)}>
                    View bag
                  </ButtonLink>
                  <ButtonLink href="/checkout" full onClick={() => setCartOpen(false)}>
                    Checkout
                  </ButtonLink>
                </div>
              </div>
            )}
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}

'use client';

import Link from 'next/link';
import { AnimatePresence, motion } from 'framer-motion';
import { X } from 'lucide-react';
import { useCart, useCartMutations } from '@/lib/hooks';
import { imageUrl } from '@/lib/api';
import { cn, money } from '@/lib/format';
import { EASE_LUXE } from '@/lib/motion';
import { ButtonLink } from '@/components/ui/Button';
import { EmptyState, Skeleton } from '@/components/ui/Media';
import { QtyStepper } from '@/components/store/CartDrawer';
import { CouponForm, Totals } from '@/components/store/CartSummary';

export default function CartPage() {
  const { data: cart, isLoading } = useCart();
  const { update, remove } = useCartMutations();

  return (
    <div className="container-luxe pt-[150px]">
      <h1 className="text-[clamp(2.6rem,6vw,4.5rem)] leading-none">Your bag</h1>
      {isLoading ? (
        <div className="mt-12 space-y-6">
          <Skeleton className="h-40" />
          <Skeleton className="h-40" />
        </div>
      ) : !cart || cart.lines.length === 0 ? (
        <div className="mt-12">
          <EmptyState title="Your bag is empty" body="Pieces you add will appear here." action={<ButtonLink href="/new-arrivals">Discover new arrivals</ButtonLink>} />
        </div>
      ) : (
        <div className="mt-12 grid gap-12 lg:grid-cols-[1fr_400px]">
          <section aria-label="Items in your bag">
            {cart.hasIssues && (
              <p role="alert" className="mb-6 border border-warning/40 bg-warning/5 px-4 py-3 text-[14px] text-warning">
                Stock has changed for some items. Please review the highlighted lines before checking out.
              </p>
            )}
            <ul className="divide-y divide-line border-y border-line">
              <AnimatePresence initial={false}>
                {cart.lines.map((l) => (
                  <motion.li key={l.itemId} layout exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.4, ease: EASE_LUXE }} className="grid grid-cols-[100px_1fr] gap-5 overflow-hidden py-6 sm:grid-cols-[130px_1fr]">
                    <Link href={`/product/${l.slug}`} className="block aspect-[4/5] overflow-hidden bg-sand">
                      {l.image && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={imageUrl(l.image)} alt={l.name} className="h-full w-full object-cover" />
                      )}
                    </Link>
                    <div className="flex flex-col">
                      <div className="flex justify-between gap-4">
                        <div>
                          <p className="eyebrow text-[0.62rem] text-muted">{l.brandName}</p>
                          <Link href={`/product/${l.slug}`} className="mt-1 block font-display text-2xl leading-tight">
                            {l.name}
                          </Link>
                          <p className="mt-1 text-[14px] text-muted">
                            {l.color} · Size {l.size} · <span className="tabular">{money(l.unitPrice, cart.currency)}</span> each
                          </p>
                          {l.issue && (
                            <p role="alert" className="mt-2 text-[13px] text-danger">
                              {l.issue === 'unavailable' ? 'This item is no longer available.' : `Only ${l.available} available — please reduce the quantity.`}
                            </p>
                          )}
                        </div>
                        <button type="button" onClick={() => remove.mutate(l.itemId)} className="-mr-2 -mt-2 flex h-10 w-10 shrink-0 items-center justify-center text-muted hover:text-ink" aria-label={`Remove ${l.name}`}>
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                      <div className="mt-auto flex items-end justify-between pt-4">
                        <QtyStepper value={l.quantity} max={Math.min(10, Math.max(1, l.available))} onChange={(q) => update.mutate({ itemId: l.itemId, quantity: q })} disabled={update.isPending || l.issue === 'unavailable'} />
                        <p className="tabular text-lg">{money(l.lineTotal, cart.currency)}</p>
                      </div>
                    </div>
                  </motion.li>
                ))}
              </AnimatePresence>
            </ul>
            <Link href="/clothing" className="link-underline mt-8 inline-block text-[13px] uppercase tracking-[0.18em]">
              Continue shopping
            </Link>
          </section>
          <aside className="h-fit border border-line bg-paper p-6 lg:sticky lg:top-[110px]" aria-label="Order summary">
            <h2 className="font-display text-3xl">Summary</h2>
            <div className="mt-6">
              <CouponForm />
            </div>
            <Totals className="mt-6" />
            <ButtonLink href="/checkout" size="lg" full className={cn('mt-8', cart.hasIssues && 'pointer-events-none opacity-45')}>
              Proceed to checkout
            </ButtonLink>
            <p className="mt-4 text-center text-[12px] text-muted">Delivery options and final total are confirmed at checkout. Prices are verified securely on our server.</p>
          </aside>
        </div>
      )}
    </div>
  );
}

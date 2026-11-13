'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { Check, ExternalLink } from 'lucide-react';
import { api, imageUrl } from '@/lib/api';
import { cn, dateTime, money, statusLabel } from '@/lib/format';
import { EASE_LUXE } from '@/lib/motion';
import { EmptyState, Skeleton } from '@/components/ui/Media';
import { StatusPill } from '@/components/store/StatusPill';
import type { CustomerOrder } from '@/lib/types';

const TRACK = ['paid', 'processing', 'packed', 'shipped', 'out_for_delivery', 'delivered'];

export default function OrderDetailPage() {
  const { orderNumber } = useParams<{ orderNumber: string }>();
  const { data: order, isLoading, isError } = useQuery({
    queryKey: ['order', orderNumber],
    queryFn: async () => (await api<{ order: CustomerOrder }>(`/orders/${orderNumber}`)).order,
  });
  if (isLoading) return <Skeleton className="h-96" />;
  if (isError || !order) return <EmptyState title="Order not found" action={<Link href="/account/orders" className="link-underline">Back to orders</Link>} />;

  const current = TRACK.indexOf(order.status);
  const ended = ['cancelled', 'refunded'].includes(order.status);

  return (
    <div className="space-y-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <Link href="/account/orders" className="link-underline text-[13px] text-muted">← All orders</Link>
          <h2 className="mt-3 font-display text-4xl">{order.orderNumber}</h2>
          <p className="mt-1 text-[14px] text-muted">Placed {dateTime(order.createdAt)}</p>
        </div>
        <StatusPill status={order.status} />
      </div>

      {!ended && current >= 0 && (
        <section aria-label="Order tracking" className="border border-line bg-paper p-6">
          <ol className="grid grid-cols-6 gap-2">
            {TRACK.map((s, i) => {
              const done = i <= current;
              return (
                <li key={s} className="flex flex-col items-center text-center">
                  <div className="relative flex w-full items-center">
                    <span className={cn('h-px flex-1', i === 0 ? 'bg-transparent' : i <= current ? 'bg-ink' : 'bg-line')} />
                    <motion.span initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ delay: i * 0.08, duration: 0.4, ease: EASE_LUXE }} className={cn('flex h-7 w-7 shrink-0 items-center justify-center rounded-full border', done ? 'border-ink bg-ink text-ivory' : 'border-line-strong bg-ivory text-muted')}>
                      {done ? <Check className="h-3.5 w-3.5" /> : <span className="h-1.5 w-1.5 rounded-full bg-line-strong" />}
                    </motion.span>
                    <span className={cn('h-px flex-1', i === TRACK.length - 1 ? 'bg-transparent' : i < current ? 'bg-ink' : 'bg-line')} />
                  </div>
                  <span className={cn('mt-2 text-[11px] leading-tight sm:text-[12px]', done ? 'text-ink' : 'text-muted')}>{statusLabel(s)}</span>
                </li>
              );
            })}
          </ol>
          {order.tracking?.number && (
            <p className="mt-6 text-[14px]">
              {order.tracking.carrier} tracking <strong>{order.tracking.number}</strong>
              {order.tracking.url && (
                <a href={order.tracking.url} target="_blank" rel="noopener noreferrer" className="link-underline ml-3 inline-flex items-center gap-1">
                  Track parcel <ExternalLink className="h-3.5 w-3.5" />
                </a>
              )}
            </p>
          )}
        </section>
      )}

      <div className="grid gap-10 lg:grid-cols-[1fr_320px]">
        <section aria-label="Items">
          <ul className="divide-y divide-line border-y border-line">
            {order.items.map((i) => (
              <li key={i._id} className="flex gap-4 py-5">
                <Link href={`/product/${i.slug}`} className="h-28 w-[88px] shrink-0 bg-sand">
                  {i.image && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={imageUrl(i.image)} alt={i.name} className="h-full w-full object-cover" />
                  )}
                </Link>
                <div className="flex-1">
                  <Link href={`/product/${i.slug}`} className="font-display text-xl">{i.name}</Link>
                  <p className="text-[14px] text-muted">{i.color} · Size {i.size} · Qty {i.quantity}</p>
                  <p className="text-[12px] text-muted">SKU {i.sku}</p>
                </div>
                <p className="tabular">{money(i.lineTotal, order.currency)}</p>
              </li>
            ))}
          </ul>
          <section className="mt-10" aria-labelledby="history">
            <h3 id="history" className="mb-4 font-display text-2xl">Order activity</h3>
            <ol className="space-y-4 border-l border-line pl-6">
              {[...order.history].reverse().map((h, idx) => (
                <li key={idx} className="relative">
                  <span className="absolute -left-[29px] top-1.5 h-2 w-2 rounded-full bg-ink" aria-hidden />
                  <p className="text-[14px]">{h.message}</p>
                  <p className="text-[12px] text-muted">{dateTime(h.at)}</p>
                </li>
              ))}
            </ol>
          </section>
        </section>
        <aside className="space-y-6">
          <div className="border border-line bg-paper p-5 text-[14px]">
            <h3 className="eyebrow mb-3 text-muted">Summary</h3>
            <dl className="space-y-2">
              <div className="flex justify-between"><dt>Subtotal</dt><dd className="tabular">{money(order.subtotal, order.currency)}</dd></div>
              {order.discountTotal > 0 && <div className="flex justify-between text-success"><dt>Discount{order.coupon ? ` (${order.coupon.code})` : ''}</dt><dd className="tabular">−{money(order.discountTotal, order.currency)}</dd></div>}
              <div className="flex justify-between"><dt>Delivery</dt><dd className="tabular">{order.shippingTotal ? money(order.shippingTotal, order.currency) : 'Free'}</dd></div>
              {order.taxTotal > 0 && <div className="flex justify-between text-muted"><dt>{order.taxInclusive ? 'Includes tax' : 'Tax'}</dt><dd className="tabular">{money(order.taxTotal, order.currency)}</dd></div>}
              <div className="flex justify-between border-t border-line pt-2 text-base font-medium"><dt>Total</dt><dd className="tabular">{money(order.total, order.currency)}</dd></div>
              {order.refundedTotal > 0 && <div className="flex justify-between text-danger"><dt>Refunded</dt><dd className="tabular">−{money(order.refundedTotal, order.currency)}</dd></div>}
            </dl>
          </div>
          <div className="border border-line bg-paper p-5 text-[14px]">
            <h3 className="eyebrow mb-3 text-muted">Delivery</h3>
            <p>{order.shippingAddress.fullName}</p>
            <p className="text-graphite">{order.shippingAddress.line1}{order.shippingAddress.line2 ? `, ${order.shippingAddress.line2}` : ''}</p>
            <p className="text-graphite">{order.shippingAddress.city} {order.shippingAddress.postalCode}</p>
            <p className="text-graphite">{order.shippingAddress.country}</p>
            <p className="mt-3 text-muted">{order.delivery.name} · {order.delivery.etaDays}</p>
          </div>
          {order.payment && (
            <div className="border border-line bg-paper p-5 text-[14px]">
              <h3 className="eyebrow mb-3 text-muted">Payment</h3>
              <p className="capitalize">{[order.payment.method?.replace('_', ' '), order.payment.brand].filter(Boolean).join(' · ') || 'Card'}{order.payment.last4 ? ` ending ${order.payment.last4}` : ''}</p>
              <p className="text-muted">{statusLabel(order.paymentStatus)}</p>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}

'use client';

import Link from 'next/link';
import { Suspense, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { Check, Clock } from 'lucide-react';
import { api, imageUrl } from '@/lib/api';
import { money, statusLabel } from '@/lib/format';
import { EASE_LUXE } from '@/lib/motion';
import { ButtonLink } from '@/components/ui/Button';
import { EmptyState, Spinner } from '@/components/ui/Media';
import type { CustomerOrder } from '@/lib/types';

function Success() {
  const sessionId = useSearchParams().get('session_id') ?? '';
  const qc = useQueryClient();
  const { data: order, isError, dataUpdatedAt } = useQuery({
    queryKey: ['order', 'session', sessionId],
    enabled: /^cs_/.test(sessionId),
    queryFn: async () => (await api<{ order: CustomerOrder }>(`/orders/by-session/${sessionId}`)).order,
    // The order is confirmed by Stripe (webhook or server-side verification) — poll until then.
    refetchInterval: (q) => (q.state.data?.paymentStatus === 'pending' && Date.now() - (q.state.dataUpdatedAt || Date.now()) < 120_000 ? 2000 : false),
  });
  const paid = order && order.paymentStatus !== 'pending' && order.status !== 'cancelled';

  useEffect(() => {
    if (paid) qc.invalidateQueries({ queryKey: ['cart'] });
  }, [paid, qc]);

  if (!/^cs_/.test(sessionId) || isError) return <EmptyState title="We couldn't find that payment" body="If you completed a payment, your confirmation will appear in your account shortly." action={<ButtonLink href="/account/orders">View orders</ButtonLink>} />;
  if (!order) return <div className="flex justify-center py-24"><Spinner /></div>;

  if (!paid) {
    const stale = Date.now() - dataUpdatedAt > 100_000;
    return (
      <div className="mx-auto max-w-xl py-16 text-center">
        <Clock className="mx-auto h-10 w-10 text-gold-deep" strokeWidth={1.25} />
        <h1 className="mt-6 text-5xl">Confirming your payment…</h1>
        <p className="mt-4 text-muted" role="status">
          {order.status === 'cancelled' ? 'This checkout was cancelled and no payment was taken.' : stale ? 'This is taking longer than usual. We will email you as soon as your payment is confirmed.' : 'We are waiting for confirmation from Stripe. This usually takes a few seconds.'}
        </p>
        <p className="mt-2 text-[13px] text-muted">Order reference {order.orderNumber}</p>
      </div>
    );
  }

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8, ease: EASE_LUXE }} className="mx-auto max-w-2xl">
      <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: 'spring', stiffness: 260, damping: 18, delay: 0.2 }} className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-ink text-ivory">
        <Check className="h-7 w-7" />
      </motion.span>
      <h1 className="mt-8 text-center text-[clamp(2.6rem,6vw,4.2rem)] leading-none">Thank you, {order.shippingAddress.fullName.split(' ')[0]}</h1>
      <p className="mt-4 text-center text-muted">Your payment was confirmed and order <strong className="text-ink">{order.orderNumber}</strong> is being prepared. A confirmation email is on its way.</p>
      <div className="mt-12 border border-line bg-paper p-6">
        <ul className="divide-y divide-line">
          {order.items.map((i) => (
            <li key={i._id} className="flex gap-4 py-4 first:pt-0">
              <div className="h-20 w-16 shrink-0 bg-sand">
                {i.image && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={imageUrl(i.image)} alt="" className="h-full w-full object-cover" />
                )}
              </div>
              <div className="flex-1 text-[14px]">
                <p>{i.name}</p>
                <p className="text-muted">{i.color} · {i.size} · Qty {i.quantity}</p>
              </div>
              <p className="tabular text-[14px]">{money(i.lineTotal, order.currency)}</p>
            </li>
          ))}
        </ul>
        <dl className="mt-4 space-y-2 border-t border-line pt-4 text-[14px]">
          <div className="flex justify-between"><dt className="text-muted">Status</dt><dd>{statusLabel(order.status)}</dd></div>
          <div className="flex justify-between"><dt className="text-muted">Delivery</dt><dd>{order.delivery.name} · {order.delivery.etaDays}</dd></div>
          <div className="flex justify-between text-lg"><dt>Total paid</dt><dd className="tabular">{money(order.total, order.currency)}</dd></div>
        </dl>
      </div>
      <div className="mt-10 flex flex-wrap justify-center gap-3">
        <ButtonLink href={`/account/orders/${order.orderNumber}`}>Track order</ButtonLink>
        <ButtonLink href="/" variant="secondary">Continue shopping</ButtonLink>
      </div>
    </motion.div>
  );
}

export default function CheckoutSuccessPage() {
  return (
    <div className="container-luxe pt-[150px]">
      <Suspense fallback={<div className="flex justify-center py-24"><Spinner /></div>}>
        <Success />
      </Suspense>
      <p className="mt-16 text-center text-[13px] text-muted">
        Questions? <Link href="/contact" className="link-underline">Contact our concierge</Link>.
      </p>
    </div>
  );
}

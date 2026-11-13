'use client';

import { Suspense, useEffect, useRef } from 'react';
import { useSearchParams } from 'next/navigation';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { ButtonLink } from '@/components/ui/Button';

function Cancelled() {
  const order = useSearchParams().get('order') ?? '';
  const qc = useQueryClient();
  const done = useRef(false);
  const release = useMutation({
    mutationFn: () => api<{ status: string; paymentStatus: string }>(`/checkout/${order}/cancel`, { method: 'POST' }),
    onSettled: () => qc.invalidateQueries({ queryKey: ['cart'] }),
  });
  useEffect(() => {
    if (!done.current && /^VEL-[A-Z0-9]{8}$/.test(order)) {
      done.current = true;
      release.mutate();
    }
  }, [order, release]);
  const paid = release.data && release.data.paymentStatus === 'paid';
  return (
    <div className="mx-auto max-w-xl text-center">
      <h1 className="text-[clamp(2.6rem,6vw,4.2rem)] leading-none">{paid ? 'Your payment went through' : 'Checkout cancelled'}</h1>
      <p className="mt-6 text-muted" role="status">
        {paid ? 'Good news — Stripe confirmed your payment, so your order is complete.' : 'No payment was taken. Your bag has been saved and the items you reserved have been returned to stock.'}
      </p>
      <div className="mt-10 flex flex-wrap justify-center gap-3">
        {paid ? <ButtonLink href="/account/orders">View your orders</ButtonLink> : <ButtonLink href="/checkout">Return to checkout</ButtonLink>}
        <ButtonLink href="/cart" variant="secondary">View bag</ButtonLink>
      </div>
    </div>
  );
}

export default function CheckoutCancelledPage() {
  return (
    <div className="container-luxe pt-[170px]">
      <Suspense>
        <Cancelled />
      </Suspense>
    </div>
  );
}

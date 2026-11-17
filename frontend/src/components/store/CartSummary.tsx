'use client';

import { useState } from 'react';
import { useCart, useCartMutations } from '@/lib/hooks';
import { ApiError } from '@/lib/api';
import { cn, money } from '@/lib/format';
import { Button } from '@/components/ui/Button';

export function CouponForm() {
  const { data: cart } = useCart();
  const { applyCoupon, removeCoupon } = useCartMutations();
  const [code, setCode] = useState('');
  const err = applyCoupon.error instanceof ApiError ? applyCoupon.error.message : null;
  if (cart?.couponCode) {
    return (
      <div className="flex items-center justify-between border border-line bg-paper px-4 py-3 text-[14px]">
        <span>
          Code <strong className="tracking-wide">{cart.couponCode}</strong> {cart.couponError ? <span className="text-danger">— {cart.couponError}</span> : <span className="text-success">applied</span>}
        </span>
        <button type="button" onClick={() => removeCoupon.mutate()} className="link-underline text-[13px] text-muted">
          Remove
        </button>
      </div>
    );
  }
  // Not a <form>: on the checkout page this sits inside the checkout form, and a
  // nested form makes the browser reload the page instead of applying the code.
  const apply = () => {
    if (code.trim() && !applyCoupon.isPending) applyCoupon.mutate(code.trim(), { onSuccess: () => setCode('') });
  };
  return (
    <div role="group" aria-labelledby="coupon-label">
      <label id="coupon-label" htmlFor="coupon" className="text-[0.72rem] font-medium uppercase tracking-[0.16em] text-graphite">
        Promo code
      </label>
      <div className="mt-1.5 flex">
        <input
          id="coupon"
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          onKeyDown={(e) => {
            // Enter applies the code (and must never submit the surrounding checkout form).
            if (e.key === 'Enter') {
              e.preventDefault();
              apply();
            }
          }}
          placeholder="e.g. WELCOME10"
          aria-invalid={err ? true : undefined}
          aria-describedby={err ? 'coupon-error' : undefined}
          className="h-12 min-w-0 flex-1 border border-r-0 border-line-strong bg-paper px-4 text-[15px] uppercase tracking-wide focus:border-ink focus:outline-none"
        />
        <Button type="button" variant="secondary" loading={applyCoupon.isPending} className="h-12" onClick={apply}>
          Apply
        </Button>
      </div>
      {err && (
        <p id="coupon-error" role="alert" className="mt-1.5 text-[13px] text-danger">
          {err}
        </p>
      )}
    </div>
  );
}

export function Totals({ className }: { className?: string }) {
  const { data: cart } = useCart();
  if (!cart) return null;
  return (
    <dl className={cn('space-y-2.5 text-[15px]', className)}>
      <div className="flex justify-between">
        <dt className="text-graphite">Subtotal</dt>
        <dd className="tabular">{money(cart.subtotal, cart.currency)}</dd>
      </div>
      {cart.discount.amount > 0 && (
        <div className="flex justify-between text-success">
          <dt>
            Discount {cart.discount.code && <span className="text-[13px]">({cart.discount.automatic ? cart.discount.label : cart.discount.code})</span>}
          </dt>
          <dd className="tabular">−{money(cart.discount.amount, cart.currency)}</dd>
        </div>
      )}
      <div className="flex justify-between">
        <dt className="text-graphite">Delivery · {cart.delivery.name}</dt>
        <dd className="tabular">{cart.delivery.price === 0 ? 'Free' : money(cart.delivery.price, cart.currency)}</dd>
      </div>
      {cart.tax.enabled && cart.tax.amount > 0 && (
        <div className="flex justify-between text-[13px] text-muted">
          <dt>{cart.tax.inclusive ? `Includes ${cart.tax.label} (${cart.tax.rate}%)` : `${cart.tax.label} (${cart.tax.rate}%)`}</dt>
          <dd className="tabular">{money(cart.tax.amount, cart.currency)}</dd>
        </div>
      )}
      <div className="flex justify-between border-t border-line pt-4 text-lg">
        <dt>Total</dt>
        <dd className="tabular font-medium">{money(cart.total, cart.currency)}</dd>
      </div>
    </dl>
  );
}

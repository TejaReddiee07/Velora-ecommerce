'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Lock, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';
import { api, ApiError, imageUrl } from '@/lib/api';
import { useCurrency, useMe, useSettings } from '@/lib/hooks';
import { useUI } from '@/lib/store';
import { cn, money } from '@/lib/format';
import { Button, ButtonLink } from '@/components/ui/Button';
import { Checkbox, Input, Select, Textarea, fieldErrors } from '@/components/ui/Field';
import { EmptyState, Skeleton } from '@/components/ui/Media';
import { CouponForm } from '@/components/store/CartSummary';
import { CheckoutAuthModal } from '@/components/store/CheckoutAuthModal';
import { DELIVERY_COUNTRY_OPTIONS, UK_ONLY_NOTE, normalizeUkPostcode, postcodeError } from '@/lib/address';
import type { Address, Cart, Currency } from '@/lib/types';

// UK delivery only — the API enforces the same rule.
const COUNTRIES = DELIVERY_COUNTRY_OPTIONS;

const emptyAddress = { fullName: '', phone: '', line1: '', line2: '', city: '', state: '', postalCode: '', country: 'GB' };

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <section className="border-t border-line py-8" aria-labelledby={`step-${n}`}>
      <h2 id={`step-${n}`} className="mb-6 flex items-baseline gap-4 font-display text-3xl">
        <span className="tabular font-sans text-[13px] text-muted">0{n}</span>
        {title}
      </h2>
      {children}
    </section>
  );
}

export default function CheckoutPage() {
  const qc = useQueryClient();
  const { data: me, isLoading: meLoading } = useMe();
  const { data: settings } = useSettings();
  const currency = useCurrency();
  const setCurrency = useUI((s) => s.setCurrency);
  const [delivery, setDelivery] = useState<string | undefined>();
  const [addressId, setAddressId] = useState<string>('new');
  const [address, setAddress] = useState(emptyAddress);
  const [saveAddress, setSaveAddress] = useState(true);
  const [phone, setPhone] = useState('');
  const [notes, setNotes] = useState('');
  // Guests can fill in checkout; pressing Pay asks them to create an account (or sign in) first.
  const [guestEmail, setGuestEmail] = useState('');
  const [tried, setTried] = useState(false);
  const [authOpen, setAuthOpen] = useState(false);

  const cartKey = ['cart', currency, 'checkout', delivery];
  const fetchCart = async () => (await api<{ cart: Cart }>('/cart', { query: { currency, delivery } })).cart;
  const { data: cart, isLoading } = useQuery({
    queryKey: cartKey,
    queryFn: fetchCart,
    enabled: !meLoading,
  });
  const { data: addresses } = useQuery({
    queryKey: ['addresses'],
    enabled: Boolean(me),
    queryFn: async () => (await api<{ addresses: Address[] }>('/account/addresses')).addresses,
  });

  useEffect(() => {
    const usable = addresses?.filter((a) => a.deliverable !== false) ?? [];
    if (usable.length && addressId === 'new' && !address.line1) setAddressId(usable.find((a) => a.isDefault)?._id ?? usable[0]._id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [addresses]);
  useEffect(() => {
    if (me && !address.fullName) setAddress((a) => ({ ...a, fullName: me.name }));
    if (me?.phone && !phone) setPhone(me.phone);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me]);

  const pay = useMutation({
    mutationFn: (fresh: Cart | void) =>
      api<{ url: string; orderNumber: string }>('/checkout/create-session', {
        body: {
          currency,
          deliveryMethodId: (fresh || cart)?.delivery.methodId,
          couponCode: (fresh || cart)?.couponCode ?? null,
          ...(addressId !== 'new' ? { addressId } : { address: { ...address, line2: address.line2 || undefined, state: address.state || undefined, phone: address.phone || undefined }, saveAddress }),
          phone: phone || undefined,
          notes: notes || undefined,
        },
      }),
    onSuccess: (d) => {
      window.location.assign(d.url);
    },
    onError: (e) => {
      if (e instanceof ApiError && e.code === 'CART_CHANGED') {
        qc.invalidateQueries({ queryKey: ['cart'] });
        toast.error(e.message);
      } else if (e instanceof ApiError && !e.fields) {
        toast.error(e.message);
      }
    },
  });
  const err = pay.error instanceof ApiError ? pay.error : null;
  const fe = fieldErrors(err?.fields);

  // Checked before paying: contact email (guests) and a complete UK delivery address.
  const detailsMissing = () => {
    const m: Record<string, string> = {};
    if (!me && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(guestEmail.trim())) m.email = 'Enter a valid email address.';
    if (addressId === 'new') {
      if (address.fullName.trim().length < 2) m['address.fullName'] = 'Enter your full name.';
      if (!address.line1.trim()) m['address.line1'] = 'Enter the first line of your address.';
      if (!address.city.trim()) m['address.city'] = 'Enter your town or city.';
      const pc = postcodeError(address.postalCode);
      if (pc) m['address.postalCode'] = pc;
    }
    return m;
  };
  const localErr = tried ? detailsMissing() : {};
  const addrErr = (k: string) => fe[`address.${k}`] ?? localErr[`address.${k}`];

  const submit = () => {
    setTried(true);
    if (Object.keys(detailsMissing()).length) {
      toast.error('Please complete your contact details and a UK delivery address.');
      requestAnimationFrame(() => document.querySelector<HTMLElement>('form [aria-invalid="true"]')?.focus());
      return;
    }
    if (me) {
      pay.mutate();
      return;
    }
    toast.dismiss();
    setAuthOpen(true);
  };

  // After the guest creates an account / signs in, their bag is merged server-side.
  // Continue straight to payment when the bag is unchanged; otherwise let them review it.
  const continueAfterAuth = async (mode: 'register' | 'login') => {
    setAuthOpen(false);
    const shown = cart;
    try {
      const fresh = await qc.fetchQuery({ queryKey: cartKey, queryFn: fetchCart, staleTime: 0 });
      qc.invalidateQueries({ queryKey: ['cart'] });
      qc.invalidateQueries({ queryKey: ['addresses'] });
      const unchanged = shown && fresh.itemCount === shown.itemCount && fresh.total === shown.total;
      if (fresh.lines.length && !fresh.hasIssues && (mode === 'register' || unchanged)) {
        pay.mutate(fresh);
      } else if (fresh.lines.length) {
        toast.info('Items saved in your account were added to your bag. Please review your order, then press Pay.');
      }
    } catch {
      toast.error('Please press Pay again to continue.');
    }
  };

  if (meLoading) return <div className="container-luxe pt-[150px]"><Skeleton className="h-96" /></div>;
  if (isLoading) return <div className="container-luxe pt-[150px]"><Skeleton className="h-96" /></div>;
  if (!cart || cart.lines.length === 0) {
    return (
      <div className="container-luxe pt-[150px]">
        <EmptyState title="Your bag is empty" action={<ButtonLink href="/new-arrivals">Continue shopping</ButtonLink>} />
      </div>
    );
  }

  return (
    <div className="container-luxe pt-[140px]">
      <div className="flex items-end justify-between">
        <h1 className="text-[clamp(2.6rem,6vw,4.5rem)] leading-none">Checkout</h1>
        <p className="hidden items-center gap-2 text-[13px] text-muted sm:flex"><Lock className="h-4 w-4" /> Secure checkout</p>
      </div>

      <form
        className="mt-10 grid grid-cols-1 gap-12 lg:grid-cols-[1fr_420px]"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
        noValidate
      >
        <div>
          <Step n={1} title="Contact">
            <div className="grid gap-5 sm:grid-cols-2">
              {me ? (
                <Input label="Email" type="email" value={me.email} readOnly disabled hint="Order updates are sent here." />
              ) : (
                <Input label="Email" type="email" autoComplete="email" required value={guestEmail} onChange={(e) => setGuestEmail(e.target.value)} hint="Order updates are sent here." error={localErr.email} />
              )}
              <Input label="Phone" type="tel" autoComplete="tel" value={phone} onChange={(e) => setPhone(e.target.value)} hint="For delivery updates (optional)." error={fe.phone} />
            </div>
          </Step>

          <Step n={2} title="Delivery address">
            <p className="-mt-2 mb-6 text-[14px] text-graphite">{UK_ONLY_NOTE}</p>
            {addresses && addresses.length > 0 && (
              <fieldset className="mb-6 grid gap-3 sm:grid-cols-2">
                <legend className="sr-only">Saved addresses</legend>
                {addresses.map((a) => {
                  const blocked = a.deliverable === false;
                  return (
                    <label
                      key={a._id}
                      className={cn(
                        'flex gap-3 border p-4 text-[14px] transition-colors',
                        blocked ? 'cursor-not-allowed border-line bg-sand/30 opacity-70' : 'cursor-pointer',
                        !blocked && (addressId === a._id ? 'border-ink bg-paper' : 'border-line-strong hover:border-graphite'),
                      )}
                    >
                      <input type="radio" name="address" value={a._id} checked={addressId === a._id} disabled={blocked} onChange={() => setAddressId(a._id)} className="mt-1 accent-[var(--color-charcoal)]" />
                      <span>
                        <span className="block font-medium">{a.fullName}{a.isDefault && <span className="ml-2 text-[11px] uppercase tracking-[0.14em] text-muted">Default</span>}</span>
                        <span className="block text-graphite">{a.line1}{a.line2 ? `, ${a.line2}` : ''}</span>
                        <span className="block text-graphite">{a.city} {a.postalCode} · {a.country}</span>
                        {blocked && (
                          <span className="mt-2 block text-[13px] text-danger">
                            We can&apos;t deliver here: {a.deliveryIssue ?? 'UK addresses only.'}{' '}
                            <Link href="/account/addresses" className="link-underline text-ink">Edit address</Link>
                          </span>
                        )}
                      </span>
                    </label>
                  );
                })}
                <label className={cn('flex cursor-pointer items-center gap-3 border p-4 text-[14px]', addressId === 'new' ? 'border-ink bg-paper' : 'border-line-strong hover:border-graphite')}>
                  <input type="radio" name="address" value="new" checked={addressId === 'new'} onChange={() => setAddressId('new')} className="accent-[var(--color-charcoal)]" />
                  Use a new address
                </label>
              </fieldset>
            )}
            {addressId === 'new' && (
              <div className="grid gap-5 sm:grid-cols-2">
                <Input wrapperClassName="sm:col-span-2" label="Full name" autoComplete="name" required value={address.fullName} onChange={(e) => setAddress({ ...address, fullName: e.target.value })} error={addrErr('fullName')} />
                <Input wrapperClassName="sm:col-span-2" label="Address line 1" autoComplete="address-line1" required value={address.line1} onChange={(e) => setAddress({ ...address, line1: e.target.value })} error={addrErr('line1')} />
                <Input wrapperClassName="sm:col-span-2" label="Address line 2" autoComplete="address-line2" value={address.line2} onChange={(e) => setAddress({ ...address, line2: e.target.value })} />
                <Input label="Town / City" autoComplete="address-level2" required value={address.city} onChange={(e) => setAddress({ ...address, city: e.target.value })} error={addrErr('city')} />
                <Input label="County / State" autoComplete="address-level1" value={address.state} onChange={(e) => setAddress({ ...address, state: e.target.value })} />
                <Input label="Postcode" autoComplete="postal-code" required value={address.postalCode} onChange={(e) => setAddress({ ...address, postalCode: e.target.value })} onBlur={() => { const pc = normalizeUkPostcode(address.postalCode); if (pc && pc !== address.postalCode) setAddress((a) => ({ ...a, postalCode: pc })); }} error={addrErr('postalCode')} hint="UK postcode, e.g. SW1A 1AA" />
                <Select label="Country" autoComplete="country" required value={address.country} onChange={(e) => setAddress({ ...address, country: e.target.value })} options={COUNTRIES} hint="UK delivery only" error={addrErr('country')} />
                <div className="sm:col-span-2">
                  <Checkbox label="Save this address to my account" checked={saveAddress} onChange={setSaveAddress} />
                </div>
              </div>
            )}
          </Step>

          <Step n={3} title="Delivery method">
            <fieldset className="space-y-3">
              <legend className="sr-only">Delivery method</legend>
              {cart.deliveryOptions.map((d) => (
                <label key={d.id} className={cn('flex cursor-pointer items-center justify-between gap-4 border p-4 transition-colors', cart.delivery.methodId === d.id ? 'border-ink bg-paper' : 'border-line-strong hover:border-graphite')}>
                  <span className="flex items-center gap-3">
                    <input type="radio" name="delivery" checked={cart.delivery.methodId === d.id} onChange={() => setDelivery(d.id)} className="accent-[var(--color-charcoal)]" />
                    <span>
                      <span className="block text-[15px]">{d.name}</span>
                      <span className="block text-[13px] text-muted">{d.etaDays}{d.description ? ` · ${d.description}` : ''}</span>
                    </span>
                  </span>
                  <span className="tabular text-[15px]">{d.price === 0 ? 'Free' : money(d.price, cart.currency)}</span>
                </label>
              ))}
            </fieldset>
            <div className="mt-6">
              <Textarea label="Delivery note" value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={500} hint="Optional — e.g. leave with concierge." className="min-h-20" />
            </div>
          </Step>

          <Step n={4} title="Payment">
            <div className="grid gap-5 sm:grid-cols-2">
              {settings && settings.currency.enabled.length > 1 && (
                <Select label="Pay in" value={currency} onChange={(e) => setCurrency(e.target.value as Currency)} options={settings.currency.enabled.map((c) => ({ value: c, label: c === 'GBP' ? 'British pound (£)' : 'US dollar ($)' }))} />
              )}
            </div>
            <div className="mt-6 flex items-start gap-3 border border-line bg-paper p-5 text-[14px] text-graphite">
              <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-gold-deep" />
              <p>
                You will complete payment on Stripe&apos;s secure page — cards, Apple Pay and Google Pay are supported where available. Your card details never touch our servers. Stock is reserved for you for 30 minutes while you pay.
              </p>
            </div>
            {settings && !settings.stripeEnabled && (
              <p role="alert" className="mt-4 border border-warning/40 bg-warning/5 p-4 text-[14px] text-warning">
                Online payment is not configured on this store yet.
              </p>
            )}
          </Step>
        </div>

        <aside className="h-fit border border-line bg-paper p-6 lg:sticky lg:top-[110px]" aria-label="Order summary">
          <h2 className="font-display text-3xl">Order summary</h2>
          <ul className="mt-6 max-h-[320px] space-y-4 overflow-y-auto pr-1" data-lenis-prevent>
            {cart.lines.map((l) => (
              <li key={l.itemId} className="flex gap-4">
                <div className="relative h-20 w-16 shrink-0 bg-sand">
                  {l.image && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={imageUrl(l.image)} alt="" className="h-full w-full object-cover" />
                  )}
                  <span className="tabular absolute -right-2 -top-2 flex h-5 min-w-5 items-center justify-center rounded-full bg-ink px-1 text-[10px] text-ivory">{l.quantity}</span>
                </div>
                <div className="min-w-0 flex-1 text-[14px]">
                  <p className="truncate">{l.name}</p>
                  <p className="text-muted">{l.color} · {l.size}</p>
                  {l.issue && <p className="text-danger">{l.issue === 'unavailable' ? 'Unavailable' : `Only ${l.available} left`}</p>}
                </div>
                <p className="tabular text-[14px]">{money(l.lineTotal, cart.currency)}</p>
              </li>
            ))}
          </ul>
          <div className="mt-6 border-t border-line pt-6">
            <CouponForm />
          </div>
          <dl className="mt-6 space-y-2.5 text-[15px]">
            <div className="flex justify-between"><dt className="text-graphite">Subtotal</dt><dd className="tabular">{money(cart.subtotal, cart.currency)}</dd></div>
            {cart.discount.amount > 0 && (
              <div className="flex justify-between text-success"><dt>Discount</dt><dd className="tabular">−{money(cart.discount.amount, cart.currency)}</dd></div>
            )}
            <div className="flex justify-between"><dt className="text-graphite">Delivery</dt><dd className="tabular">{cart.delivery.price === 0 ? 'Free' : money(cart.delivery.price, cart.currency)}</dd></div>
            {cart.tax.enabled && cart.tax.amount > 0 && (
              <div className="flex justify-between text-[13px] text-muted"><dt>{cart.tax.inclusive ? `Includes ${cart.tax.label}` : cart.tax.label}</dt><dd className="tabular">{money(cart.tax.amount, cart.currency)}</dd></div>
            )}
            <div className="flex justify-between border-t border-line pt-4 text-lg"><dt>Total</dt><dd className="tabular font-medium">{money(cart.total, cart.currency)}</dd></div>
          </dl>
          {err && !err.fields && err.code !== 'CART_CHANGED' && (
            <p role="alert" className="mt-4 text-[14px] text-danger">{err.message}</p>
          )}
          {err?.fields && (
            <p role="alert" className="mt-4 text-[14px] text-danger">Please check the highlighted fields.</p>
          )}
          <Button type="submit" size="lg" full className="mt-6" loading={pay.isPending} disabled={cart.hasIssues || (settings ? !settings.stripeEnabled : false)} icon={<Lock className="h-4 w-4" />}>
            Pay {money(cart.total, cart.currency)}
          </Button>
          {!me && (
            <p className="mt-3 text-center text-[13px] text-graphite">
              New here? You&apos;ll create your VELORA account when you press Pay.{' '}
              <Link href="/login?next=/checkout" className="link-underline text-ink">Sign in</Link>
            </p>
          )}
          {cart.hasIssues && <p className="mt-3 text-[13px] text-danger">Some items changed availability. <Link href="/cart" className="link-underline">Review your bag</Link>.</p>}
          <p className="mt-4 text-center text-[12px] text-muted">Prices, stock and discounts are verified on our server before payment.</p>
        </aside>
      </form>
      <CheckoutAuthModal
        open={authOpen}
        onClose={() => setAuthOpen(false)}
        defaults={{ name: address.fullName, email: guestEmail }}
        onAuthenticated={continueAfterAuth}
      />
    </div>
  );
}

'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { ArrowRight } from 'lucide-react';
import { toast } from 'sonner';
import { api, ApiError } from '@/lib/api';
import { useSettings } from '@/lib/hooks';
import { Logo } from '@/components/ui/Media';
import type { PublicSettings } from '@/lib/types';

const COLUMNS = [
  {
    title: 'Shop',
    links: [
      { label: 'Womenswear', href: '/clothing?gender=women,unisex' },
      { label: 'Menswear', href: '/clothing?gender=men,unisex' },
      { label: 'Footwear', href: '/footwear' },
      { label: 'Accessories', href: '/accessories' },
      { label: 'New arrivals', href: '/new-arrivals' },
      { label: 'Sale', href: '/sale' },
    ],
  },
  {
    title: 'Client care',
    links: [
      { label: 'Your account', href: '/account' },
      { label: 'Track an order', href: '/account/orders' },
      { label: 'Delivery & returns', href: '/returns' },
      { label: 'Size guide', href: '/size-guide' },
      { label: 'Contact us', href: '/contact' },
    ],
  },
  {
    title: 'The house',
    links: [
      { label: 'Our story', href: '/about' },
      { label: 'Craft & materials', href: '/about#craft' },
      { label: 'Wishlist', href: '/wishlist' },
    ],
  },
];

export function NewsletterForm({ tone = 'dark', source = 'footer' }: { tone?: 'dark' | 'light'; source?: string }) {
  const [email, setEmail] = useState('');
  const m = useMutation({
    mutationFn: () => api<{ message: string }>('/newsletter/subscribe', { body: { email, source } }),
    onSuccess: (d) => {
      toast.success(d.message);
      setEmail('');
    },
    onError: (e) => toast.error(e instanceof ApiError ? (e.fields?.[0]?.message ?? e.message) : 'Please try again.'),
  });
  const light = tone === 'light';
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        m.mutate();
      }}
      className={`flex items-center border-b ${light ? 'border-ivory/40 focus-within:border-ivory' : 'border-ink/40 focus-within:border-ink'} transition-colors`}
    >
      <label htmlFor={`nl-${source}`} className="sr-only">
        Email address
      </label>
      <input
        id={`nl-${source}`}
        type="email"
        required
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="Your email address"
        autoComplete="email"
        className={`h-12 w-full bg-transparent text-[15px] focus:outline-none ${light ? 'text-ivory placeholder:text-ivory/50' : 'text-ink placeholder:text-muted'}`}
      />
      <button type="submit" disabled={m.isPending} className="flex h-12 w-12 items-center justify-center" aria-label="Subscribe">
        {m.isPending ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" /> : <ArrowRight className="h-5 w-5" />}
      </button>
    </form>
  );
}

export function Footer({ initialSettings }: { initialSettings?: PublicSettings | null }) {
  const { data: s } = useSettings(initialSettings);
  const social = Object.entries(s?.social ?? {}).filter(([, v]) => Boolean(v));
  return (
    <footer className="theme-lock relative mt-24 bg-ink text-ivory">
      <div className="container-luxe grid gap-14 py-20 lg:grid-cols-[1.3fr_2fr]">
        <div className="max-w-md">
          <Logo light className="text-[2.2rem]" />
          <p className="mt-6 font-display text-3xl leading-tight text-ivory/90">Private previews, new collections and the occasional letter from the studio.</p>
          <div className="mt-8">
            <NewsletterForm tone="light" />
          </div>
          <p className="mt-3 text-[12px] text-ivory/60">By subscribing you agree to receive marketing emails. Unsubscribe at any time.</p>
        </div>
        <div className="grid grid-cols-2 gap-10 sm:grid-cols-3">
          {COLUMNS.map((c) => (
            <div key={c.title}>
              <p className="eyebrow mb-5 text-ivory/60">{c.title}</p>
              <ul className="space-y-3">
                {c.links.map((l) => (
                  <li key={l.href}>
                    <Link href={l.href} className="link-underline text-[15px] text-ivory/90 hover:text-ivory">
                      {l.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
          {s && (
            <div className="col-span-2 sm:col-span-3">
              <p className="eyebrow mb-3 text-ivory/60">Concierge</p>
              <p className="text-[15px] text-ivory/90">
                <a href={`mailto:${s.contact.email}`} className="link-underline">
                  {s.contact.email}
                </a>
                <span className="mx-3 text-ivory/40">·</span>
                <a href={`tel:${s.contact.phone.replace(/\s/g, '')}`} className="link-underline">
                  {s.contact.phone}
                </a>
                <span className="mx-3 text-ivory/40">·</span>
                {s.contact.address}
              </p>
            </div>
          )}
        </div>
      </div>
      <div className="border-t border-ivory/15">
        <div className="container-luxe flex flex-col items-start justify-between gap-4 py-6 text-[12px] text-ivory/60 md:flex-row md:items-center">
          <p>© {new Date().getFullYear()} {s?.storeName ?? 'VELORA'}. All rights reserved.</p>
          {social.length > 0 && (
            <ul className="flex gap-5">
              {social.map(([k, v]) => (
                <li key={k}>
                  <a href={v} target="_blank" rel="noopener noreferrer" className="link-underline capitalize">
                    {k === 'x' ? 'X' : k}
                  </a>
                </li>
              ))}
            </ul>
          )}
          <p>Secure payments by Stripe · Prices {s?.tax.inclusive ? `include ${s.tax.label}` : `exclude ${s?.tax.label ?? 'tax'}`}</p>
        </div>
      </div>
    </footer>
  );
}

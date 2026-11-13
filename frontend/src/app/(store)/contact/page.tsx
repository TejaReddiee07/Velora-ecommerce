import type { Metadata } from 'next';
import { serverApi } from '@/lib/server-api';
import type { PublicSettings } from '@/lib/types';

export const metadata: Metadata = { title: 'Contact' };

export default async function ContactPage() {
  const s = await serverApi<PublicSettings>('/settings/public');
  return (
    <div className="container-luxe max-w-4xl pt-[150px]">
      <h1 className="text-[clamp(2.6rem,6vw,4.5rem)] leading-none">Client care</h1>
      <p className="mt-6 max-w-xl text-graphite">Our concierge team is here to help with orders, sizing and returns, Monday to Saturday, 9am – 6pm.</p>
      <dl className="mt-12 grid gap-8 border-t border-line pt-10 sm:grid-cols-3">
        <div>
          <dt className="eyebrow text-muted">Email</dt>
          <dd className="mt-2"><a className="link-underline" href={`mailto:${s?.contact.email}`}>{s?.contact.email}</a></dd>
        </div>
        <div>
          <dt className="eyebrow text-muted">Telephone</dt>
          <dd className="mt-2"><a className="link-underline" href={`tel:${s?.contact.phone.replace(/\s/g, '')}`}>{s?.contact.phone}</a></dd>
        </div>
        <div>
          <dt className="eyebrow text-muted">Studio</dt>
          <dd className="mt-2">{s?.contact.address}</dd>
        </div>
      </dl>
    </div>
  );
}

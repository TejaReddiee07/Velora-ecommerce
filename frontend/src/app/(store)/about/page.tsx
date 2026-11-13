import type { Metadata } from 'next';
import { RevealText, FadeIn } from '@/components/home/effects';
import { ButtonLink } from '@/components/ui/Button';
import { serverApi } from '@/lib/server-api';
import { imageUrl } from '@/lib/api';
import type { PublicSettings } from '@/lib/types';

export const metadata: Metadata = { title: 'Our story', description: 'The VELORA house: considered design, responsible materials and craft that lasts.' };

const PILLARS = [
  { title: 'Considered design', body: 'Silhouettes refined over seasons, not trends. We design pieces to be worn, re-worn and kept.' },
  { title: 'Honest materials', body: 'Organic cotton, merino, Italian leather and recycled performance fabrics — chosen for how they wear over years.' },
  { title: 'Made in partnership', body: 'We work with small mills and family-run workshops and visit them often. Fewer partners, closer relationships.' },
];

export default async function AboutPage() {
  const settings = await serverApi<PublicSettings>('/settings/public');
  const img = settings?.banners.find((b) => b.title === 'The Boutique')?.image ?? settings?.banners[0]?.image;
  return (
    <div className="pt-[140px]">
      <section className="container-luxe">
        <p className="eyebrow text-gold-deep">Our story</p>
        <RevealText as="h1" text="A wardrobe made slowly, to be worn for years." className="mt-5 max-w-5xl text-[clamp(2.8rem,7vw,6rem)] leading-[0.95]" />
      </section>
      {img && (
        <div className="relative mt-16 h-[60vh] min-h-[380px] overflow-hidden">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={imageUrl(img.lg)} alt="Inside the VELORA boutique" className="h-full w-full object-cover" />
        </div>
      )}
      <section id="craft" className="container-luxe grid gap-12 py-24 md:grid-cols-3">
        {PILLARS.map((p, i) => (
          <FadeIn key={p.title} delay={i * 0.1}>
            <p className="tabular text-[13px] text-muted">0{i + 1}</p>
            <h2 className="mt-3 text-4xl">{p.title}</h2>
            <p className="mt-4 leading-relaxed text-graphite">{p.body}</p>
          </FadeIn>
        ))}
      </section>
      <section className="container-luxe border-t border-line py-20 text-center">
        <p className="mx-auto max-w-2xl font-display text-3xl leading-snug">“We would rather make one coat you keep for a decade than ten you forget by spring.”</p>
        <div className="mt-10">
          <ButtonLink href="/new-arrivals">Discover the collection</ButtonLink>
        </div>
      </section>
    </div>
  );
}

'use client';

import Link from 'next/link';
import { useRef } from 'react';
import { motion, useScroll, useTransform } from 'framer-motion';
import { Box } from 'lucide-react';
import { imageUrl } from '@/lib/api';
import { useReducedMotion } from '@/lib/hooks';
import { useWebGL } from '@/lib/use-visibility';
import { EASE_LUXE } from '@/lib/motion';
import { ButtonLink } from '@/components/ui/Button';
import { FadeIn, RevealText } from './effects';
import { useHomeProducts } from './Sections';

/**
 * Homepage invitation to the 3D showroom. Pure DOM (no WebGL here) so the
 * homepage stays light: shirts hang on a rail, sway, and drift along it as
 * the section scrolls through the viewport.
 */
export function ShowroomTeaser() {
  const { data } = useHomeProducts('showroom-teaser', { showroom: true, category: 'shirts', limit: 3, sort: 'featured' });
  const reduced = useReducedMotion();
  const webgl = useWebGL();
  const section = useRef<HTMLElement>(null);
  const { scrollYProgress } = useScroll({ target: section, offset: ['start end', 'end start'] });
  const drift = useTransform(scrollYProgress, [0, 1], reduced ? [0, 0] : [-70, 50]);
  const items = (data ?? []).filter((p) => p.images[0]).slice(0, 3);
  if (data && !items.length) return null;

  return (
    <section ref={section} className="relative overflow-hidden border-y border-line bg-paper py-24 md:py-32" aria-labelledby="showroom-teaser-heading">
      <div className="container-luxe grid items-center gap-14 lg:grid-cols-[1fr_1.15fr]">
        <div>
          <p className="eyebrow mb-4 text-gold-deep">New · The 3D showroom</p>
          <RevealText as="h2" text="Step onto the rail." className="text-[clamp(2.4rem,5.5vw,4.6rem)] leading-[0.95]" />
          <h2 id="showroom-teaser-heading" className="sr-only">
            The 3D showroom
          </h2>
          <FadeIn delay={0.15}>
            <p className="mt-6 max-w-md text-[17px] leading-relaxed text-graphite">
              Shirts, outerwear, dresses and tailoring hang in a quiet white gallery. Glide between rails, take a piece down for a closer look, choose your size and add it to your bag — without leaving the room.
            </p>
            <div className="mt-10 flex flex-wrap items-center gap-4">
              <ButtonLink href={webgl === false ? '/clothing?category=shirts' : '/showroom'} size="lg" icon={<Box className="h-4 w-4" aria-hidden />}>
                Enter the showroom
              </ButtonLink>
              <Link href="/clothing?category=shirts" className="link-underline text-[12px] uppercase tracking-[0.18em] text-graphite">
                Shop shirts
              </Link>
            </div>
          </FadeIn>
        </div>

        <Link href="/showroom" className="group relative block" aria-label="Open the 3D showroom">
          {/* rail */}
          <motion.div
            className="relative mx-auto h-[340px] max-w-[560px] md:h-[370px]"
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-80px' }}
            transition={{ duration: 0.9, ease: EASE_LUXE }}
          >
            <div className="absolute inset-x-2 top-6 h-[3px] rounded-full bg-ink" aria-hidden />
            <div className="absolute left-2 top-6 h-[calc(100%-24px)] w-[3px] bg-ink" aria-hidden />
            <div className="absolute right-2 top-6 h-[calc(100%-24px)] w-[3px] bg-ink" aria-hidden />
            <div className="absolute bottom-0 left-0 h-[3px] w-10 bg-ink" aria-hidden />
            <div className="absolute bottom-0 right-0 h-[3px] w-10 bg-ink" aria-hidden />

            <motion.div className="absolute inset-x-8 top-[10px] flex justify-around" style={{ x: drift }}>
              {(items.length ? items : Array.from({ length: 3 })).map((p, i) => {
                const item = p as (typeof items)[number] | undefined;
                return (
                  <motion.div
                    key={item?._id ?? i}
                    className="flex w-[30%] flex-col items-center"
                    style={{ transformOrigin: '50% 0%' }}
                    initial={{ opacity: 0, x: -40 }}
                    whileInView={{ opacity: 1, x: 0 }}
                    viewport={{ once: true, margin: '-80px' }}
                    transition={{ duration: 0.8, ease: EASE_LUXE, delay: 0.2 + i * 0.14 }}
                  >
                    <motion.div
                      className="flex w-full flex-col items-center"
                      style={{ transformOrigin: '50% 0%' }}
                      animate={reduced ? undefined : { rotate: [-1.6, 1.6, -1.6] }}
                      transition={{ duration: 3.6 + i * 0.5, repeat: Infinity, ease: 'easeInOut' }}
                    >
                      {/* hanger */}
                      <svg viewBox="0 0 120 52" className="w-[78%] text-ink" aria-hidden>
                        <path d="M60 2c-6 0-9 4-9 8 0 3 2 5 5 6l4 2v6L6 46h108L60 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinejoin="round" strokeLinecap="round" />
                      </svg>
                      <div className="theme-lock -mt-1 w-full border-[6px] border-white bg-white shadow-[0_18px_30px_-16px_rgba(12,10,9,0.45)] transition-transform duration-700 ease-[var(--ease-luxe)] group-hover:-translate-y-1">
                        <div className="aspect-[4/5] overflow-hidden bg-sand">
                          {item && (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={imageUrl(item.images[0].md)} alt={item.name} loading="lazy" className="h-full w-full object-cover transition-transform duration-[1.2s] ease-[var(--ease-luxe)] group-hover:scale-105" />
                          )}
                        </div>
                        <p className="truncate pt-2 text-center text-[11px] uppercase tracking-[0.14em] text-graphite">{item?.name ?? ' '}</p>
                      </div>
                    </motion.div>
                  </motion.div>
                );
              })}
            </motion.div>

            {/* sticker */}
            <motion.span
              className="theme-lock absolute -right-2 top-[58%] flex h-20 w-20 items-center justify-center rounded-full border-[4px] border-white bg-champagne font-display text-2xl italic text-ink shadow-[0_12px_26px_-10px_rgba(12,10,9,0.45)] md:-right-6"
              initial={{ scale: 0, rotate: -30 }}
              whileInView={{ scale: 1, rotate: 12 }}
              viewport={{ once: true }}
              transition={{ type: 'spring', stiffness: 220, damping: 14, delay: 0.7 }}
              aria-hidden
            >
              3D
            </motion.span>
          </motion.div>
        </Link>
      </div>
    </section>
  );
}

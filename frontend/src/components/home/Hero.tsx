'use client';

import dynamic from 'next/dynamic';
import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowDown } from 'lucide-react';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { imageUrl, srcSet } from '@/lib/api';
import { useMediaQuery, useReducedMotion } from '@/lib/hooks';
import { useVisibility, useWebGL } from '@/lib/use-visibility';
import { EASE_LUXE } from '@/lib/motion';
import { ButtonLink } from '@/components/ui/Button';
import type { Banner } from '@/lib/types';

gsap.registerPlugin(ScrollTrigger);

const SilkScene = dynamic(() => import('@/components/three/SilkScene'), { ssr: false });

export function Hero({ banners }: { banners: Banner[] }) {
  const heroes = banners.filter((b) => b.placement === 'hero');
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const reduced = useReducedMotion();
  const mobile = useMediaQuery('(max-width: 767px)');
  const webgl = useWebGL();
  const { ref, el, visible } = useVisibility<HTMLElement>('0px');
  const scrollRef = useRef(0);
  const content = useRef<HTMLDivElement>(null);
  const banner = heroes[index] ?? heroes[0];

  // Rotate headline banners (pausable; stops on reduced motion).
  useEffect(() => {
    if (heroes.length < 2 || paused || reduced) return;
    const t = setInterval(() => setIndex((i) => (i + 1) % heroes.length), 7000);
    return () => clearInterval(t);
  }, [heroes.length, paused, reduced]);

  // Scroll progress drives the silk and fades the copy.
  useEffect(() => {
    if (!el) return;
    const st = ScrollTrigger.create({
      trigger: el,
      start: 'top top',
      end: 'bottom top',
      scrub: true,
      onUpdate: (s) => {
        scrollRef.current = s.progress;
        if (content.current && !reduced) {
          content.current.style.transform = `translate3d(0, ${s.progress * -90}px, 0)`;
          content.current.style.opacity = String(1 - s.progress * 1.3);
        }
      },
    });
    return () => st.kill();
  }, [el, reduced]);

  const show3D = webgl && !reduced;

  return (
    <section ref={ref} className="theme-lock grain relative h-[100svh] min-h-[640px] overflow-hidden bg-ink text-ivory" aria-label="Featured collection" onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)}>
      {/* Editorial photograph — visible on load, beneath the 3D silk */}
      <AnimatePresence mode="sync">
        {banner?.image && (
          <motion.div key={banner._id} className="absolute inset-0" initial={{ opacity: 0, scale: 1.08 }} animate={{ opacity: show3D ? 0.38 : 0.6, scale: 1 }} exit={{ opacity: 0 }} transition={{ duration: 1.6, ease: EASE_LUXE }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={imageUrl(banner.image.lg)} srcSet={srcSet(banner.image)} sizes="100vw" alt="" className="h-full w-full object-cover" fetchPriority="high" />
          </motion.div>
        )}
      </AnimatePresence>
      <div className="absolute inset-0 bg-gradient-to-r from-ink via-ink/70 to-ink/20" />
      {show3D && <SilkScene mobile={mobile} active={visible} scrollRef={scrollRef} />}
      {/* Legibility scrim above the silk, behind the copy */}
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-ink/80 via-ink/35 to-transparent md:via-ink/20" />
      <div className="absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-ink to-transparent" />

      <div ref={content} className="container-luxe relative z-10 flex h-full flex-col justify-end pb-[12vh] will-change-transform">
        <AnimatePresence mode="wait">
          {banner && (
            <motion.div key={banner._id} initial="hidden" animate="show" exit="exit" className="max-w-3xl">
              {banner.eyebrow && (
                <motion.p className="eyebrow text-champagne" variants={{ hidden: { opacity: 0, y: 12 }, show: { opacity: 1, y: 0, transition: { duration: 0.8, ease: EASE_LUXE, delay: 0.2 } }, exit: { opacity: 0, transition: { duration: 0.3 } } }}>
                  {banner.eyebrow}
                </motion.p>
              )}
              <h1 className="mt-5 text-[clamp(3rem,9vw,8.5rem)] font-light leading-[0.9] tracking-[-0.02em]" aria-label={banner.title}>
                {banner.title.split(' ').map((w, i) => (
                  <span key={i} className="inline-block overflow-hidden pb-[0.06em] align-bottom" aria-hidden>
                    <motion.span
                      className="inline-block"
                      variants={{ hidden: { y: '110%' }, show: { y: '0%', transition: { duration: 1.1, ease: EASE_LUXE, delay: 0.3 + i * 0.08 } }, exit: { y: '-105%', transition: { duration: 0.45, ease: EASE_LUXE, delay: i * 0.03 } } }}
                    >
                      {i === 1 ? <em className="font-light italic text-champagne">{w}</em> : w}
                      {' '}
                    </motion.span>
                  </span>
                ))}
              </h1>
              {banner.subtitle && (
                <motion.p className="mt-6 max-w-lg text-[17px] leading-relaxed text-ivory/80" variants={{ hidden: { opacity: 0, y: 16 }, show: { opacity: 1, y: 0, transition: { duration: 0.9, ease: EASE_LUXE, delay: 0.7 } }, exit: { opacity: 0, transition: { duration: 0.3 } } }}>
                  {banner.subtitle}
                </motion.p>
              )}
              <motion.div className="mt-10 flex flex-wrap gap-3" variants={{ hidden: { opacity: 0, y: 16 }, show: { opacity: 1, y: 0, transition: { duration: 0.9, ease: EASE_LUXE, delay: 0.85 } }, exit: { opacity: 0, transition: { duration: 0.3 } } }}>
                {banner.ctaHref && (
                  <ButtonLink href={banner.ctaHref} variant="light" size="lg">
                    {banner.ctaLabel ?? 'Shop now'}
                  </ButtonLink>
                )}
                <ButtonLink href="/footwear" variant="ghost" size="lg" className="border-ivory/40 text-ivory hover:border-ivory">
                  Explore footwear
                </ButtonLink>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="mt-14 flex items-center justify-between">
          {heroes.length > 1 ? (
            <div className="flex items-center gap-4" role="tablist" aria-label="Featured stories">
              {heroes.map((h, i) => (
                <button key={h._id} role="tab" aria-selected={i === index} aria-label={h.title} onClick={() => setIndex(i)} className="group flex h-8 items-center">
                  <span className="relative block h-px w-14 overflow-hidden bg-ivory/30">
                    {i === index && <motion.span key={`${index}-${paused}`} className="absolute inset-y-0 left-0 bg-ivory" initial={{ width: 0 }} animate={{ width: paused || reduced ? '100%' : '100%' }} transition={{ duration: paused || reduced ? 0 : 7, ease: 'linear' }} />}
                  </span>
                </button>
              ))}
              <button type="button" onClick={() => setPaused((p) => !p)} className="ml-2 text-[11px] uppercase tracking-[0.2em] text-ivory/70 hover:text-ivory">
                {paused ? 'Play' : 'Pause'}
              </button>
            </div>
          ) : (
            <span />
          )}
          <div className="hidden items-center gap-3 text-[11px] uppercase tracking-[0.24em] text-ivory/70 md:flex">
            <motion.span animate={reduced ? undefined : { y: [0, 6, 0] }} transition={{ duration: 2.2, repeat: Infinity, ease: 'easeInOut' }}>
              <ArrowDown className="h-4 w-4" />
            </motion.span>
            Scroll to discover
          </div>
        </div>
      </div>
    </section>
  );
}

'use client';

import { useEffect, useRef, type ReactNode } from 'react';
import { motion } from 'framer-motion';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { EASE_LUXE } from '@/lib/motion';
import { cn } from '@/lib/format';

gsap.registerPlugin(ScrollTrigger);

/** Word-by-word masked reveal when the heading scrolls into view. */
export function RevealText({ text, as: Tag = 'h2', className, delay = 0 }: { text: string; as?: 'h1' | 'h2' | 'h3' | 'p'; className?: string; delay?: number }) {
  const words = text.split(' ');
  const MotionTag = motion[Tag];
  return (
    <MotionTag className={className} initial="hidden" whileInView="show" viewport={{ once: true, margin: '-60px' }} transition={{ staggerChildren: 0.06, delayChildren: delay }} aria-label={text}>
      {words.map((w, i) => (
        <span key={i} className="inline-block overflow-hidden pb-[0.08em] align-bottom" aria-hidden>
          <motion.span className="inline-block" variants={{ hidden: { y: '105%' }, show: { y: '0%', transition: { duration: 0.95, ease: EASE_LUXE } } }}>
            {w}
            {i < words.length - 1 ? ' ' : ''}
          </motion.span>
        </span>
      ))}
    </MotionTag>
  );
}

/** Vertical parallax on scroll (transform only; disabled for reduced motion). */
export function Parallax({ children, amount = 80, className }: { children: ReactNode; amount?: number; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const tween = gsap.fromTo(el, { y: -amount / 2 }, { y: amount / 2, ease: 'none', scrollTrigger: { trigger: el.parentElement ?? el, start: 'top bottom', end: 'bottom top', scrub: true } });
    return () => {
      tween.scrollTrigger?.kill();
      tween.kill();
    };
  }, [amount]);
  return (
    <div ref={ref} className={cn('will-change-transform', className)}>
      {children}
    </div>
  );
}

/** Image that fills its container and drifts on scroll; oversized so edges never show. */
export function ParallaxImage({ src, srcSet: set, alt, sizes, amount = 70, className, imgClassName }: { src: string; srcSet?: string; alt: string; sizes: string; amount?: number; className?: string; imgClassName?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const tween = gsap.fromTo(el, { y: -amount / 2 }, { y: amount / 2, ease: 'none', scrollTrigger: { trigger: el.parentElement!, start: 'top bottom', end: 'bottom top', scrub: true } });
    return () => {
      tween.scrollTrigger?.kill();
      tween.kill();
    };
  }, [amount]);
  return (
    <div className={cn('absolute inset-0 overflow-hidden bg-sand', className)}>
      <div ref={ref} className="absolute inset-x-0 will-change-transform" style={{ top: -amount, bottom: -amount }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} srcSet={set} sizes={sizes} alt={alt} loading="lazy" decoding="async" className={cn('h-full w-full object-cover', imgClassName)} />
      </div>
    </div>
  );
}

export function FadeIn({ children, className, delay = 0, y = 30 }: { children: ReactNode; className?: string; delay?: number; y?: number }) {
  return (
    <motion.div className={className} initial={{ opacity: 0, y }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: '-60px' }} transition={{ duration: 0.9, ease: EASE_LUXE, delay }}>
      {children}
    </motion.div>
  );
}

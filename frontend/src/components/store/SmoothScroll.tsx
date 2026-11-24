'use client';

import { useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';
import Lenis from 'lenis';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { currentTier } from '@/lib/perf';

gsap.registerPlugin(ScrollTrigger);

let lenis: Lenis | null = null;
export function getLenis() {
  return lenis;
}

/**
 * Lenis smooth scrolling synced with GSAP ScrollTrigger, for mouse wheels and trackpads. Off for reduced motion, on
 * phones and tablets (their own scrolling is already smooth, and the engine would run on every frame for nothing) and
 * on low-powered devices (lib/perf.ts).
 */
export function SmoothScroll() {
  const pathname = usePathname();

  useEffect(() => {
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const touchOnly = window.matchMedia('(hover: none) and (pointer: coarse)').matches;
    if (reduce || touchOnly || currentTier() === 'low') return;
    lenis = new Lenis({ duration: 1.1, easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)), smoothWheel: true });
    lenis.on('scroll', ScrollTrigger.update);
    const tick = (time: number) => lenis?.raf(time * 1000);
    gsap.ticker.add(tick);
    gsap.ticker.lagSmoothing(0);
    return () => {
      gsap.ticker.remove(tick);
      lenis?.destroy();
      lenis = null;
    };
  }, []);

  // A newly opened page starts at the top. Not on the very first load: the browser already starts there, and a reset
  // that lands once the page has finished starting up would yank it back if the shopper had already begun scrolling.
  const firstPage = useRef(true);
  useEffect(() => {
    if (firstPage.current) firstPage.current = false;
    else if (lenis) lenis.scrollTo(0, { immediate: true });
    else window.scrollTo(0, 0);
    // Let new content mount before measuring triggers.
    const t = setTimeout(() => ScrollTrigger.refresh(), 300);
    return () => clearTimeout(t);
  }, [pathname]);

  return null;
}

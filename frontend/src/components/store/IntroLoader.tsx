'use client';

import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { EASE_LUXE } from '@/lib/motion';

/** Brand reveal shown once per browser session. */
export function IntroLoader() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    let seen = false;
    try {
      seen = sessionStorage.getItem('velora_intro') === '1';
      sessionStorage.setItem('velora_intro', '1');
    } catch {
      seen = true;
    }
    // the installed app opens straight to the shop (every app launch is a new session, so the reveal would play each time)
    const installedApp = window.matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
    if (seen || installedApp || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    setShow(true);
    const t = setTimeout(() => setShow(false), 1900);
    return () => clearTimeout(t);
  }, []);

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          className="theme-lock fixed inset-0 z-[100] flex items-center justify-center bg-ink"
          initial={{ clipPath: 'inset(0 0 0 0)' }}
          exit={{ clipPath: 'inset(0 0 100% 0)', transition: { duration: 0.9, ease: EASE_LUXE } }}
          aria-hidden
        >
          <div className="overflow-hidden">
            <motion.div className="flex font-display text-[clamp(2.6rem,9vw,6rem)] tracking-[0.42em] text-ivory" initial="hidden" animate="show" variants={{ show: { transition: { staggerChildren: 0.08 } } }}>
              {'VELORA'.split('').map((ch, i) => (
                <motion.span key={i} variants={{ hidden: { y: '110%', opacity: 0 }, show: { y: '0%', opacity: 1, transition: { duration: 0.9, ease: EASE_LUXE } } }}>
                  {ch}
                </motion.span>
              ))}
            </motion.div>
            <motion.div className="mx-auto mt-6 h-px bg-gold" initial={{ width: 0 }} animate={{ width: '100%' }} transition={{ delay: 0.5, duration: 1.1, ease: EASE_LUXE }} />
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

'use client';

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { useUI } from '@/lib/store';
import { useReducedMotion } from '@/lib/hooks';

const SIZE = 64;

/** Animates a product thumbnail from the add button into the bag icon. */
export function FlyToBag() {
  const { flight, clearFlight } = useUI();
  const reduced = useReducedMotion();
  const [path, setPath] = useState<{ id: number; src: string; sx: number; sy: number; ex: number; ey: number } | null>(null);

  useEffect(() => {
    if (!flight) return;
    const target = document.getElementById('bag-button')?.getBoundingClientRect();
    if (!target || reduced) {
      clearFlight();
      return;
    }
    setPath({
      id: flight.id,
      src: flight.src,
      sx: flight.rect.x + flight.rect.w / 2 - SIZE / 2,
      sy: flight.rect.y + flight.rect.h / 2 - SIZE / 2,
      ex: target.left + target.width / 2 - SIZE / 2,
      ey: target.top + target.height / 2 - SIZE / 2,
    });
  }, [flight, reduced, clearFlight]);

  if (!path) return null;
  return (
    <motion.div
      key={path.id}
      className="pointer-events-none fixed left-0 top-0 z-[80] overflow-hidden rounded-full shadow-xl ring-1 ring-line"
      style={{ width: SIZE, height: SIZE }}
      initial={{ x: path.sx, y: path.sy, scale: 1.4, opacity: 1 }}
      animate={{ x: [path.sx, (path.sx + path.ex) / 2, path.ex], y: [path.sy, Math.min(path.sy, path.ey) - 120, path.ey], scale: [1.4, 1, 0.25], opacity: [1, 1, 0.6] }}
      transition={{ duration: 0.85, ease: [0.5, 0, 0.3, 1], times: [0, 0.45, 1] }}
      onAnimationComplete={() => {
        setPath(null);
        clearFlight();
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={path.src} alt="" className="h-full w-full object-cover" />
    </motion.div>
  );
}

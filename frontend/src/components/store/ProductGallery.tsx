'use client';

import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ChevronLeft, ChevronRight, Maximize2, X } from 'lucide-react';
import { imageUrl, srcSet } from '@/lib/api';
import { cn } from '@/lib/format';
import { EASE_LUXE } from '@/lib/motion';
import { useReducedMotion } from '@/lib/hooks';
import type { ImageRef } from '@/lib/types';

/**
 * Photo gallery (these are photographs, not 3D models): a turntable-style
 * transition between shots, hover lens zoom on desktop, swipe on touch, and a
 * full-screen viewer.
 */
export function ProductGallery({ images, name, activeColor }: { images: ImageRef[]; name: string; activeColor?: string }) {
  const [index, setIndex] = useState(0);
  const [dir, setDir] = useState(1);
  const [zoom, setZoom] = useState<{ x: number; y: number } | null>(null);
  const [fullscreen, setFullscreen] = useState(false);
  const reduced = useReducedMotion();
  const touchX = useRef<number | null>(null);

  // Jump to the first image of the chosen colour.
  useEffect(() => {
    if (!activeColor) return;
    const i = images.findIndex((im) => im.color === activeColor);
    if (i >= 0 && i !== index) {
      setDir(i > index ? 1 : -1);
      setIndex(i);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeColor]);

  useEffect(() => {
    if (index >= images.length) setIndex(0);
  }, [images.length, index]);

  const go = (next: number) => {
    const n = (next + images.length) % images.length;
    setDir(n > index ? 1 : -1);
    setIndex(n);
  };

  const current = images[index] ?? images[0];
  if (!current) return <div className="aspect-[4/5] bg-sand" />;

  const variants = {
    enter: (d: number) => (reduced ? { opacity: 0 } : { opacity: 0, rotateY: d * 18, x: d * 40, scale: 0.97 }),
    center: { opacity: 1, rotateY: 0, x: 0, scale: 1 },
    exit: (d: number) => (reduced ? { opacity: 0 } : { opacity: 0, rotateY: d * -18, x: d * -40, scale: 0.97 }),
  };

  return (
    <div className="flex flex-col-reverse gap-4 lg:flex-row">
      {images.length > 1 && (
        <ul className="flex gap-3 overflow-x-auto scrollbar-none lg:w-[84px] lg:flex-col lg:overflow-visible" aria-label="Product images">
          {images.map((im, i) => (
            <li key={im.id} className="shrink-0">
              <button type="button" onClick={() => go(i)} aria-label={`Show image ${i + 1} of ${images.length}`} aria-current={i === index} className={cn('block h-[100px] w-[80px] overflow-hidden bg-sand ring-offset-2 ring-offset-ivory transition', i === index ? 'ring-1 ring-ink' : 'opacity-70 hover:opacity-100')}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={imageUrl(im.sm)} alt="" className="h-full w-full object-cover" loading="lazy" />
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="relative flex-1" style={{ perspective: 1400 }}>
        <div
          className={cn('relative aspect-[4/5] overflow-hidden bg-sand', zoom ? 'cursor-zoom-out' : 'cursor-zoom-in')}
          onMouseMove={(e) => {
            if (!zoom) return;
            const r = e.currentTarget.getBoundingClientRect();
            setZoom({ x: ((e.clientX - r.left) / r.width) * 100, y: ((e.clientY - r.top) / r.height) * 100 });
          }}
          onMouseLeave={() => setZoom(null)}
          onClick={(e) => {
            if (window.matchMedia('(pointer: coarse)').matches) return setFullscreen(true);
            const r = e.currentTarget.getBoundingClientRect();
            setZoom(zoom ? null : { x: ((e.clientX - r.left) / r.width) * 100, y: ((e.clientY - r.top) / r.height) * 100 });
          }}
          onTouchStart={(e) => (touchX.current = e.touches[0].clientX)}
          onTouchEnd={(e) => {
            if (touchX.current == null) return;
            const dx = e.changedTouches[0].clientX - touchX.current;
            if (Math.abs(dx) > 40) go(index + (dx < 0 ? 1 : -1));
            touchX.current = null;
          }}
        >
          <AnimatePresence initial={false} custom={dir} mode="popLayout">
            <motion.div
              key={current.id}
              custom={dir}
              variants={variants}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{ duration: 0.7, ease: EASE_LUXE }}
              className="absolute inset-0 will-change-transform"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={imageUrl(current.lg)}
                srcSet={srcSet(current)}
                sizes="(min-width: 1024px) 50vw, 100vw"
                alt={current.alt || name}
                className="h-full w-full object-cover transition-transform duration-500 ease-[var(--ease-luxe)]"
                style={zoom ? { transform: 'scale(2.1)', transformOrigin: `${zoom.x}% ${zoom.y}%` } : { transform: 'scale(1)' }}
                draggable={false}
              />
            </motion.div>
          </AnimatePresence>
          <span className="sr-only" aria-live="polite">
            Image {index + 1} of {images.length}
          </span>
        </div>

        {images.length > 1 && (
          <>
            <button type="button" onClick={() => go(index - 1)} className="absolute left-3 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-ivory/85 backdrop-blur transition hover:bg-ivory" aria-label="Previous image">
              <ChevronLeft className="h-5 w-5" />
            </button>
            <button type="button" onClick={() => go(index + 1)} className="absolute right-3 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-ivory/85 backdrop-blur transition hover:bg-ivory" aria-label="Next image">
              <ChevronRight className="h-5 w-5" />
            </button>
          </>
        )}
        <button type="button" onClick={() => setFullscreen(true)} className="absolute bottom-3 right-3 flex h-11 w-11 items-center justify-center rounded-full bg-ivory/85 backdrop-blur hover:bg-ivory" aria-label="View full screen">
          <Maximize2 className="h-4 w-4" />
        </button>
        <p className="mt-3 hidden text-[12px] text-muted lg:block">Click the image to zoom · move to explore detail</p>
      </div>

      <AnimatePresence>
        {fullscreen && (
          <motion.div role="dialog" aria-modal="true" aria-label={`${name} images`} className="theme-lock fixed inset-0 z-[90] flex items-center justify-center bg-ink/95" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} data-lenis-prevent onKeyDown={(e) => {
            if (e.key === 'Escape') setFullscreen(false);
            if (e.key === 'ArrowRight') go(index + 1);
            if (e.key === 'ArrowLeft') go(index - 1);
          }}>
            <button type="button" autoFocus onClick={() => setFullscreen(false)} className="absolute right-4 top-4 flex h-11 w-11 items-center justify-center text-ivory" aria-label="Close">
              <X className="h-6 w-6" />
            </button>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <motion.img key={current.id} initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.5, ease: EASE_LUXE }} src={imageUrl(current.lg)} alt={current.alt || name} className="max-h-[90vh] max-w-[92vw] object-contain" />
            {images.length > 1 && (
              <>
                <button type="button" onClick={() => go(index - 1)} className="absolute left-4 top-1/2 flex h-12 w-12 -translate-y-1/2 items-center justify-center text-ivory" aria-label="Previous image">
                  <ChevronLeft className="h-7 w-7" />
                </button>
                <button type="button" onClick={() => go(index + 1)} className="absolute right-4 top-1/2 flex h-12 w-12 -translate-y-1/2 items-center justify-center text-ivory" aria-label="Next image">
                  <ChevronRight className="h-7 w-7" />
                </button>
              </>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

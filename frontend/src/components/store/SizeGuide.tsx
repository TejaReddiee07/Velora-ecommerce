'use client';

import { useEffect } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { X } from 'lucide-react';
import { EASE_LUXE } from '@/lib/motion';

const GUIDES: Record<string, { title: string; head: string[]; rows: string[][]; note: string }> = {
  tops: {
    title: 'Tops, knitwear & outerwear',
    head: ['Size', 'UK', 'Chest (cm)', 'Waist (cm)'],
    rows: [
      ['XS', '6–8', '82–86', '66–70'],
      ['S', '8–10', '87–92', '71–76'],
      ['M', '10–12', '93–98', '77–82'],
      ['L', '12–14', '99–104', '83–88'],
      ['XL', '14–16', '105–110', '89–94'],
      ['XXL', '16–18', '111–116', '95–100'],
    ],
    note: 'Measure around the fullest part of the chest, keeping the tape horizontal. Suits use chest size in inches (e.g. 40R = 40" chest, regular length).',
  },
  bottoms: {
    title: 'Jeans & trousers',
    head: ['Waist size', 'Waist (cm)', 'Hip (cm)', 'Inside leg (cm)'],
    rows: [
      ['28', '71', '89', '81'],
      ['30', '76', '94', '81'],
      ['32', '81', '99', '81'],
      ['34', '86', '104', '81'],
      ['36', '91', '109', '81'],
    ],
    note: "Women's jeans use UK dress sizes (6–14). Measure your natural waist and the fullest part of your hips.",
  },
  dresses: {
    title: 'Dresses & womenswear',
    head: ['UK', 'EU', 'US', 'Bust (cm)', 'Waist (cm)', 'Hip (cm)'],
    rows: [
      ['6', '34', '2', '80', '62', '88'],
      ['8', '36', '4', '84', '66', '92'],
      ['10', '38', '6', '88', '70', '96'],
      ['12', '40', '8', '93', '75', '101'],
      ['14', '42', '10', '98', '80', '106'],
    ],
    note: 'If you are between sizes, choose the larger size for a relaxed fit.',
  },
  footwear: {
    title: 'Footwear',
    head: ['UK', 'EU', 'US (men)', 'US (women)', 'Foot length (cm)'],
    rows: [
      ['3', '36', '—', '5', '22.5'],
      ['4', '37', '5', '6', '23.5'],
      ['5', '38', '6', '7', '24'],
      ['6', '39', '7', '8', '24.5'],
      ['7', '40.5', '8', '9', '25.5'],
      ['8', '42', '9', '10', '26.5'],
      ['9', '43', '10', '11', '27'],
      ['10', '44.5', '11', '12', '28'],
      ['11', '45.5', '12', '—', '29'],
    ],
    note: 'Measure your foot from heel to longest toe at the end of the day. Fit notes on each product page indicate whether a style runs large or small.',
  },
};

export function SizeGuideTable({ type }: { type: string }) {
  const g = GUIDES[type];
  if (!g) return null;
  return (
    <div>
      <h3 className="mb-4 font-display text-2xl">{g.title}</h3>
      <div className="overflow-x-auto">
        <table className="tabular w-full min-w-[420px] border-collapse text-[14px]">
          <thead>
            <tr>
              {g.head.map((h) => (
                <th key={h} scope="col" className="border-b border-ink py-3 pr-4 text-left text-[11px] font-medium uppercase tracking-[0.14em] text-graphite">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {g.rows.map((r) => (
              <tr key={r[0]} className="border-b border-line">
                {r.map((c, i) => (
                  <td key={i} className={i === 0 ? 'py-3 pr-4 font-medium' : 'py-3 pr-4 text-graphite'}>
                    {c}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-4 text-[13px] text-muted">{g.note}</p>
    </div>
  );
}

export function SizeGuideModal({ type, open, onClose }: { type: string; open: boolean; onClose: () => void }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div className="theme-lock fixed inset-0 z-[80] bg-ink/50" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} />
          <motion.div role="dialog" aria-modal="true" aria-label="Size guide" className="fixed inset-x-0 bottom-0 z-[81] max-h-[85vh] overflow-y-auto bg-ivory p-6 md:inset-auto md:left-1/2 md:top-1/2 md:w-[640px] md:-translate-x-1/2 md:-translate-y-1/2 md:p-10" initial={{ y: 40, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 30, opacity: 0 }} transition={{ duration: 0.45, ease: EASE_LUXE }} data-lenis-prevent>
            <div className="mb-6 flex items-center justify-between">
              <p className="eyebrow text-muted">Size guide</p>
              <button type="button" autoFocus onClick={onClose} className="-mr-2 flex h-11 w-11 items-center justify-center" aria-label="Close size guide">
                <X className="h-5 w-5" />
              </button>
            </div>
            <SizeGuideTable type={type} />
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

export const SIZE_GUIDE_TYPES = Object.keys(GUIDES);

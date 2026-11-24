'use client';

import { useCallback, useState } from 'react';
import { usePerfTier, type PerfTier } from '@/lib/perf';

/**
 * Pixel density for a 3D scene, matched to the device:
 *  - the device level (lib/perf.ts) sets the ceiling: 'high' keeps the scene's own value, 'mid' caps it at 1.25,
 *    'low' draws at 1 (still sharp on phones, about a third of the pixels of a 2x screen);
 *  - drei's <PerformanceMonitor> lowers it further while the frame rate is short and raises it again when it recovers
 *    (pass `onChange` to it).
 */
export function useAdaptiveDpr(highMax: number): { dpr: [number, number]; tier: PerfTier; onChange: (p: { factor: number }) => void } {
  const tier = usePerfTier();
  const max = tier === 'high' ? highMax : tier === 'mid' ? Math.min(1.25, highMax) : 1;
  const [factor, setFactor] = useState(1);
  const onChange = useCallback(({ factor: f }: { factor: number }) => setFactor(f), []);
  const value = Math.max(1, Math.round((1 + (max - 1) * factor) * 100) / 100);
  return { dpr: [1, value], tier, onChange };
}

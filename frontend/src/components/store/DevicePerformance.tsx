'use client';

import { useEffect } from 'react';
import { watchSmoothness } from '@/lib/perf';

/** Starts the smoothness check (lib/perf.ts) a moment after the page has loaded, so it never slows the first paint. */
export function DevicePerformance() {
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const start = () => {
      timer = setTimeout(watchSmoothness, 1500);
    };
    if (document.readyState === 'complete') start();
    else window.addEventListener('load', start, { once: true });
    return () => {
      window.removeEventListener('load', start);
      if (timer) clearTimeout(timer);
    };
  }, []);
  return null;
}

'use client';

import { useEffect } from 'react';

/**
 * Registers public/sw.js, which shows the branded offline page when the installed app (or the site) has no internet.
 * Production builds only, so local development never keeps anything cached.
 */
export function ServiceWorker() {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production' || !('serviceWorker' in navigator)) return;
    navigator.serviceWorker.register('/sw.js', { scope: '/', updateViaCache: 'none' }).catch(() => {});
  }, []);
  return null;
}

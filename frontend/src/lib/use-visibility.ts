'use client';

import { useCallback, useEffect, useState } from 'react';

/**
 * `near`: element is within `margin` of the viewport (mount heavy content).
 * `visible`: actually on screen (run animation loops).
 * Uses a callback ref so it works for elements rendered conditionally.
 */
export function useVisibility<T extends HTMLElement>(margin = '300px') {
  const [el, setEl] = useState<T | null>(null);
  const [near, setNear] = useState(false);
  const [visible, setVisible] = useState(false);
  const ref = useCallback((node: T | null) => setEl(node), []);
  useEffect(() => {
    if (!el) return;
    const nearObs = new IntersectionObserver(([e]) => e.isIntersecting && setNear(true), { rootMargin: margin });
    const visObs = new IntersectionObserver(([e]) => setVisible(e.isIntersecting), { threshold: 0.01 });
    nearObs.observe(el);
    visObs.observe(el);
    return () => {
      nearObs.disconnect();
      visObs.disconnect();
    };
  }, [el, margin]);
  return { ref, el, near, visible };
}

export function useWebGL() {
  const [ok, setOk] = useState<boolean | null>(null);
  useEffect(() => {
    try {
      const c = document.createElement('canvas');
      setOk(Boolean(c.getContext('webgl2') || c.getContext('webgl')));
    } catch {
      setOk(false);
    }
  }, []);
  return ok;
}

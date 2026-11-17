'use client';

import { useEffect, useLayoutEffect, useState, useSyncExternalStore } from 'react';
import { usePathname } from 'next/navigation';
import { AnimatePresence, motion } from 'framer-motion';
import { Moon, Sun } from 'lucide-react';
import { useUI } from '@/lib/store';
import { cn } from '@/lib/format';

/**
 * Round button on the right side of the screen that switches the storefront between light and dark mode.
 * Light is the default. The choice is remembered in this browser (localStorage) and applied before the first
 * paint by the inline script in app/layout.tsx; the colours themselves live in globals.css.
 */
const KEY = 'velora_theme';
const EVENT = 'velora-theme-change';

type Theme = 'light' | 'dark';

const readTheme = (): Theme => (document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light');

function applyTheme(theme: Theme) {
  const root = document.documentElement;
  root.setAttribute('data-theme-switching', '');
  root.setAttribute('data-theme', theme);
  window.dispatchEvent(new Event(EVENT));
  requestAnimationFrame(() => requestAnimationFrame(() => root.removeAttribute('data-theme-switching')));
}

function subscribe(onChange: () => void) {
  // another tab changed the theme: follow it
  const onStorage = (e: StorageEvent) => {
    if (e.key === KEY) applyTheme(e.newValue === 'dark' ? 'dark' : 'light');
  };
  window.addEventListener(EVENT, onChange);
  window.addEventListener('storage', onStorage);
  return () => {
    window.removeEventListener(EVENT, onChange);
    window.removeEventListener('storage', onStorage);
  };
}

export function ThemeToggle() {
  const pathname = usePathname();
  const theme = useSyncExternalStore<Theme>(subscribe, readTheme, () => 'light');
  const dark = theme === 'dark';
  const menuOpen = useUI((s) => s.menuOpen);
  const [typing, setTyping] = useState(false);

  // On phones the button steps aside while a form field is in use, so it never covers the field or sits over the keyboard.
  useEffect(() => {
    const isField = (el: EventTarget | null) =>
      el instanceof HTMLElement && el.matches('input:not([type=checkbox]):not([type=radio]):not([type=button]):not([type=submit]), textarea, select, [contenteditable="true"]');
    const onIn = (e: FocusEvent) => setTyping(isField(e.target));
    const onOut = (e: FocusEvent) => setTyping(isField(e.relatedTarget));
    document.addEventListener('focusin', onIn);
    document.addEventListener('focusout', onOut);
    return () => {
      document.removeEventListener('focusin', onIn);
      document.removeEventListener('focusout', onOut);
    };
  }, []);

  // In development React clears the attribute the inline script set when it remounts <html>; put it back.
  useLayoutEffect(() => {
    try {
      if (localStorage.getItem(KEY) === 'dark' && readTheme() !== 'dark') applyTheme('dark');
    } catch {}
  }, []);

  const toggle = () => {
    const next: Theme = readTheme() === 'dark' ? 'light' : 'dark';
    try {
      localStorage.setItem(KEY, next);
    } catch {}
    const doc = document as Document & { startViewTransition?: (update: () => void) => unknown };
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    try {
      if (doc.startViewTransition && !reduce) {
        doc.startViewTransition(() => applyTheme(next)); // soft cross-fade where the browser supports it
        return;
      }
    } catch {}
    applyTheme(next);
  };

  // The 3D showroom always stays light, and its own controls sit in this corner.
  if (pathname === '/showroom') return null;

  const label = dark ? 'Switch to light mode' : 'Switch to dark mode';
  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={label}
      title={label}
      className={cn(
        'theme-toggle fixed bottom-[calc(0.75rem+env(safe-area-inset-bottom))] right-3 z-[45] flex h-11 w-11 items-center justify-center overflow-hidden rounded-full border border-ivory/25 bg-ink text-ivory shadow-[0_12px_30px_-10px_rgba(12,10,9,0.55)] transition-[transform,opacity] duration-300 ease-[var(--ease-luxe)] hover:scale-105 active:scale-95 md:bottom-8 md:right-8 md:h-12 md:w-12',
        // the phone menu has its own controls in this corner
        menuOpen && 'max-lg:pointer-events-none max-lg:scale-75 max-lg:opacity-0',
        typing && 'max-md:pointer-events-none max-md:scale-75 max-md:opacity-0',
      )}
    >
      <AnimatePresence mode="wait" initial={false}>
        <motion.span
          key={theme}
          className="flex"
          initial={{ opacity: 0, rotate: -90, scale: 0.6 }}
          animate={{ opacity: 1, rotate: 0, scale: 1 }}
          exit={{ opacity: 0, rotate: 90, scale: 0.6 }}
          transition={{ duration: 0.25 }}
          aria-hidden
        >
          {dark ? <Sun className="h-[19px] w-[19px]" strokeWidth={1.5} /> : <Moon className="h-[19px] w-[19px]" strokeWidth={1.5} />}
        </motion.span>
      </AnimatePresence>
    </button>
  );
}

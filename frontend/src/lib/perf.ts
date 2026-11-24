import { useSyncExternalStore } from 'react';

/**
 * Device performance level for the storefront: 'high' | 'mid' | 'low'.
 *
 * Nothing is removed on any level; weaker devices get the same features drawn more cheaply (lower 3D resolution,
 * no backdrop blur, see globals.css and the 3D scenes). How the level is chosen:
 *  1. First visit: a quick guess from the hardware the browser reports (memory, cores, Data Saver), applied before the
 *     first paint by the inline script in app/layout.tsx.
 *  2. Then the real smoothness is measured for a few seconds of use (how many frames arrive late). A device that drops
 *     frames steps down one level; a device that was only guessed lower but runs smoothly steps up. Saved per browser.
 */
export type PerfTier = 'high' | 'mid' | 'low';

const KEY = 'velora_perf';
const VERSION = 1;
const EVENT = 'velora-perf-change';
const ORDER: PerfTier[] = ['low', 'mid', 'high'];

type Saved = { v: number; tier: PerfTier; measured: boolean; at: number };

/** Same rules as the inline script in app/layout.tsx (keep them in sync). */
export function hardwareGuess(): PerfTier {
  const n = navigator as Navigator & { deviceMemory?: number; connection?: { saveData?: boolean } };
  const memory = n.deviceMemory;
  const cores = n.hardwareConcurrency;
  if (n.connection?.saveData || (memory && memory <= 2) || (cores && cores <= 2)) return 'low';
  if ((memory && memory <= 4) || (cores && cores <= 4)) return 'mid';
  return 'high';
}

function readSaved(): Saved | null {
  try {
    const s = JSON.parse(localStorage.getItem(KEY) || 'null') as Saved | null;
    return s && s.v === VERSION && ORDER.includes(s.tier) ? s : null;
  } catch {
    return null;
  }
}

export function currentTier(): PerfTier {
  const t = document.documentElement.getAttribute('data-perf');
  return t === 'low' || t === 'mid' ? t : 'high';
}

function applyTier(tier: PerfTier, measured: boolean) {
  document.documentElement.setAttribute('data-perf', tier);
  try {
    localStorage.setItem(KEY, JSON.stringify({ v: VERSION, tier, measured, at: Date.now() } satisfies Saved));
  } catch {}
  window.dispatchEvent(new Event(EVENT));
}

function subscribe(onChange: () => void) {
  window.addEventListener(EVENT, onChange);
  return () => window.removeEventListener(EVENT, onChange);
}

/** The current level; 'high' while rendering on the server (the inline script sets the real one before paint). */
export function usePerfTier(): PerfTier {
  return useSyncExternalStore(subscribe, currentTier, () => 'high');
}

let watching = false;

/**
 * Watches real smoothness for up to ~10 s of visible time on this page view and adjusts the level once.
 * Late frame = more than 34 ms since the previous one (a missed frame at 60 Hz).
 */
export function watchSmoothness() {
  if (watching || typeof window === 'undefined') return;
  watching = true;
  if (!document.documentElement.hasAttribute('data-perf')) applyTier(readSaved()?.tier ?? hardwareGuess(), false);

  // Only frames drawn while something is happening count: an idle page is smooth even on a weak phone.
  let activeUntil = 0;
  const markActive = () => {
    activeUntil = performance.now() + 600;
  };
  const events = ['scroll', 'touchmove', 'wheel', 'pointermove'] as const;
  events.forEach((e) => window.addEventListener(e, markActive, { passive: true }));
  const started = performance.now();

  // 3D on screen also counts as "something happening" (checked twice a second, not on every frame)
  let canvasOnScreen = false;
  const look = () => {
    canvasOnScreen = [...document.querySelectorAll('[data-store] canvas')].some((c) => {
      const r = c.getBoundingClientRect();
      return r.bottom > 0 && r.top < window.innerHeight && r.width > 0;
    });
  };
  look();
  const looker = setInterval(look, 500);

  let frames = 0;
  let late = 0;
  let busyMs = 0;
  let last = 0;
  const tick = (t: number) => {
    if (last) {
      const gap = t - last;
      if (gap < 1000 && (t < activeUntil || canvasOnScreen)) {
        // longer pauses (tab hidden, app in the background) are ignored
        frames++;
        busyMs += gap;
        if (gap > 34) late++;
      }
    }
    last = t;
    // enough evidence: 600 frames, or 8 s of activity (a struggling phone draws few frames), or give up after a minute
    const enough = frames >= 600 || (busyMs >= 8000 && frames >= 30);
    if (!enough && t - started < 60_000) requestAnimationFrame(tick);
    else {
      clearInterval(looker);
      events.forEach((e) => window.removeEventListener(e, markActive));
      if (frames >= 30) decide();
    }
  };
  const decide = () => {
    const saved = readSaved();
    const tier = currentTier();
    const lateShare = late / frames;
    const i = ORDER.indexOf(tier);
    if (lateShare > 0.2 && i > 0) applyTier(ORDER[i - 1], true);
    else if (lateShare < 0.03 && i < ORDER.length - 1 && !saved?.measured) applyTier(ORDER[i + 1], true);
    else if (!saved?.measured) applyTier(tier, true);
  };
  requestAnimationFrame(tick);
}

'use client';

import { create } from 'zustand';
import { CURRENCY_COOKIE } from './config';
import type { Currency } from './types';

function readCurrency(): Currency | null {
  if (typeof document === 'undefined') return null;
  const m = document.cookie.match(new RegExp(`(?:^|; )${CURRENCY_COOKIE}=([^;]+)`));
  return m?.[1] === 'USD' || m?.[1] === 'GBP' ? (m[1] as Currency) : null;
}

interface UIState {
  currency: Currency | null;
  setCurrency: (c: Currency) => void;
  cartOpen: boolean;
  setCartOpen: (v: boolean) => void;
  searchOpen: boolean;
  setSearchOpen: (v: boolean) => void;
  menuOpen: boolean;
  setMenuOpen: (v: boolean) => void;
  /** Fly-to-bag animation source rectangle + image. */
  flight: { id: number; src: string; rect: { x: number; y: number; w: number; h: number } } | null;
  launchFlight: (src: string, rect: DOMRect) => void;
  clearFlight: () => void;
  bagPulse: number;
}

export const useUI = create<UIState>((set) => ({
  currency: readCurrency(),
  setCurrency: (c) => {
    document.cookie = `${CURRENCY_COOKIE}=${c}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`;
    set({ currency: c });
  },
  cartOpen: false,
  setCartOpen: (v) => set({ cartOpen: v }),
  searchOpen: false,
  setSearchOpen: (v) => set({ searchOpen: v }),
  menuOpen: false,
  setMenuOpen: (v) => set({ menuOpen: v }),
  flight: null,
  launchFlight: (src, rect) => set((s) => ({ flight: { id: Date.now(), src, rect: { x: rect.left, y: rect.top, w: rect.width, h: rect.height } }, bagPulse: s.bagPulse })),
  clearFlight: () => set((s) => ({ flight: null, bagPulse: s.bagPulse + 1 })),
  bagPulse: 0,
}));

'use client';

import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { api, ApiError } from './api';
import { useUI } from './store';
import type { Cart, Currency, PublicSettings, User } from './types';

export function useSettings(initial?: PublicSettings | null) {
  return useQuery({
    queryKey: ['settings'],
    queryFn: () => api<PublicSettings>('/settings/public'),
    initialData: initial ?? undefined,
    staleTime: 60_000,
  });
}

/** The active display currency (cookie → store base currency). */
export function useCurrency(): Currency {
  const currency = useUI((s) => s.currency);
  const { data } = useSettings();
  if (currency && (!data || data.currency.enabled.includes(currency))) return currency;
  return data?.currency.base ?? 'GBP';
}

export function useMe() {
  return useQuery({
    queryKey: ['me'],
    queryFn: async () => (await api<{ user: User | null }>('/auth/me')).user,
    staleTime: 5 * 60_000,
  });
}

export function useCart() {
  const currency = useCurrency();
  return useQuery({
    queryKey: ['cart', currency],
    queryFn: async () => (await api<{ cart: Cart }>('/cart', { query: { currency } })).cart,
    staleTime: 15_000,
  });
}

export function useCartMutations() {
  const qc = useQueryClient();
  const currency = useCurrency();
  const setCart = (cart: Cart) => {
    qc.setQueryData(['cart', currency], cart);
    // Checkout keeps its own copy keyed by delivery method — refresh it too.
    qc.invalidateQueries({ queryKey: ['cart', currency, 'checkout'] });
  };
  const onError = (err: unknown) => toast.error(err instanceof ApiError ? err.message : 'Something went wrong.');

  const add = useMutation({
    mutationFn: (v: { productId: string; variantId: string; quantity?: number }) =>
      api<{ cart: Cart }>('/cart/items', { body: { ...v, quantity: v.quantity ?? 1, currency } }),
    onSuccess: (d) => setCart(d.cart),
    onError,
  });
  const update = useMutation({
    mutationFn: (v: { itemId: string; quantity: number }) =>
      api<{ cart: Cart }>(`/cart/items/${v.itemId}`, { method: 'PATCH', body: { quantity: v.quantity, currency } }),
    onSuccess: (d) => setCart(d.cart),
    onError,
  });
  const remove = useMutation({
    mutationFn: (itemId: string) => api<{ cart: Cart }>(`/cart/items/${itemId}`, { method: 'DELETE', query: { currency } }),
    onSuccess: (d) => setCart(d.cart),
    onError,
  });
  const applyCoupon = useMutation({
    mutationFn: (code: string) => api<{ cart: Cart }>('/cart/coupon', { body: { code, currency } }),
    onSuccess: (d) => {
      setCart(d.cart);
      toast.success('Code applied');
    },
  });
  const removeCoupon = useMutation({
    mutationFn: () => api<{ cart: Cart }>('/cart/coupon', { method: 'DELETE', query: { currency } }),
    onSuccess: (d) => setCart(d.cart),
    onError,
  });
  return { add, update, remove, applyCoupon, removeCoupon };
}

export function useWishlistIds() {
  const { data: user } = useMe();
  return useQuery({
    queryKey: ['wishlist'],
    enabled: Boolean(user),
    queryFn: async () => (await api<{ wishlist: { productIds: string[] } }>('/wishlist')).wishlist,
    staleTime: 60_000,
  });
}

export function useToggleWishlist() {
  const qc = useQueryClient();
  const { data: user } = useMe();
  return useMutation({
    mutationFn: async ({ productId, saved }: { productId: string; saved: boolean }) => {
      if (!user) throw new ApiError(401, 'UNAUTHORIZED', 'Sign in to save pieces to your wishlist.');
      return api<{ wishlist: { productIds: string[] } }>(`/wishlist/${productId}`, { method: saved ? 'DELETE' : 'POST' });
    },
    onSuccess: (d, v) => {
      qc.setQueryData(['wishlist'], d.wishlist);
      qc.invalidateQueries({ queryKey: ['wishlist-full'] });
      toast.success(v.saved ? 'Removed from wishlist' : 'Saved to wishlist');
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : 'Could not update wishlist.'),
  });
}

export function useReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReduced(mq.matches);
    const on = (e: MediaQueryListEvent) => setReduced(e.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return reduced;
}

export function useDebounced<T>(value: T, ms = 250) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

export function useMediaQuery(query: string) {
  const [match, setMatch] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia(query);
    setMatch(mq.matches);
    const on = (e: MediaQueryListEvent) => setMatch(e.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, [query]);
  return match;
}

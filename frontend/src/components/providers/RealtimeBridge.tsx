'use client';

import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { io, type Socket } from 'socket.io-client';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { API_ORIGIN, API_PROXY } from '@/lib/config';
import { useMe } from '@/lib/hooks';
import type { ProductDetail } from '@/lib/types';

let socket: Socket | null = null;
const listeners = new Set<(event: string, payload: unknown) => void>();

export function getSocket() {
  return socket;
}

/** Subscribe to every realtime event (used by the admin portal). */
export function onRealtime(fn: (event: string, payload: unknown) => void) {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

interface AvailabilityPayload {
  productId: string;
  slug: string;
  totalAvailable: number;
  variants: { _id: string; available: number }[];
}

/**
 * Keeps every open page in sync with the database: Socket.IO only carries
 * "what changed"; data is re-read from the API (MongoDB is the source of truth).
 */
export function RealtimeBridge() {
  const qc = useQueryClient();
  const { data: user } = useMe();

  useEffect(() => {
    if (!socket) {
      socket = io(API_ORIGIN, {
        withCredentials: true,
        transports: ['websocket', 'polling'],
        reconnectionDelayMax: 8000,
        // Behind the same-site proxy the session cookies are not sent to this host: prove the session with a short-lived
        // ticket instead (fetched fresh on every connect and reconnect).
        ...(API_PROXY
          ? {
              auth: (cb: (data: object) => void) => {
                api<{ ticket: string | null }>('/realtime/ticket')
                  .then((r) => cb(r.ticket ? { ticket: r.ticket } : {}))
                  .catch(() => cb({}));
              },
            }
          : {}),
      });
    }
    const s = socket;

    // Bursts of owner changes (e.g. a bulk restock) are merged into one refetch:
    // wait for 1.2 s of quiet, but never longer than 4 s, so pages stay live
    // without flooding the API.
    const pending = new Map<string, unknown[]>();
    let quiet: ReturnType<typeof setTimeout> | null = null;
    let deadline: ReturnType<typeof setTimeout> | null = null;
    const flush = () => {
      if (quiet) clearTimeout(quiet);
      if (deadline) clearTimeout(deadline);
      quiet = deadline = null;
      const keys = [...pending.values()];
      pending.clear();
      for (const queryKey of keys) qc.invalidateQueries({ queryKey });
    };
    const invalidate = (...keys: unknown[][]) => {
      for (const k of keys) pending.set(JSON.stringify(k), k);
      if (quiet) clearTimeout(quiet);
      quiet = setTimeout(flush, 1200);
      if (!deadline) deadline = setTimeout(flush, 4000);
    };

    const onProduct = (p: { productId: string; slug: string }) => {
      invalidate(['products'], ['product', p.slug], ['cart'], ['wishlist-full']);
    };
    const onInventory = (p: AvailabilityPayload) => {
      // Patch product detail in place so size buttons update instantly.
      qc.setQueriesData<{ product: ProductDetail; related: unknown }>({ queryKey: ['product', p.slug] }, (old) => {
        if (!old?.product) return old;
        const avail = new Map(p.variants.map((v) => [v._id, v.available]));
        return {
          ...old,
          product: {
            ...old.product,
            totalAvailable: p.totalAvailable,
            inStock: p.totalAvailable > 0,
            variants: old.product.variants.map((v) => (avail.has(v._id) ? { ...v, available: avail.get(v._id)! } : v)),
          },
        };
      });
      invalidate(['products'], ['cart']);
    };
    const onSettings = () => {
      invalidate(['settings'], ['cart']);
    };
    const onOrder = () => {
      qc.invalidateQueries({ queryKey: ['orders'] });
      qc.invalidateQueries({ queryKey: ['order'] });
    };
    const onNotification = (n: { title: string; message: string; audience?: string }) => {
      qc.invalidateQueries({ queryKey: ['notifications'] });
      if (n.audience === 'user') toast(n.title, { description: n.message });
    };
    const onConnect = () => {
      // Catch up on anything missed while disconnected.
      invalidate(['products'], ['product']);
    };
    const fanOut = (event: string, ...args: unknown[]) => listeners.forEach((fn) => fn(event, args[0]));

    s.on('product:changed', onProduct);
    s.on('product:removed', onProduct);
    s.on('inventory:changed', onInventory);
    s.on('settings:changed', onSettings);
    s.on('order:updated', onOrder);
    s.on('notification', onNotification);
    s.io.on('reconnect', onConnect);
    s.onAny(fanOut);
    return () => {
      if (quiet) clearTimeout(quiet);
      if (deadline) clearTimeout(deadline);
      s.off('product:changed', onProduct);
      s.off('product:removed', onProduct);
      s.off('inventory:changed', onInventory);
      s.off('settings:changed', onSettings);
      s.off('order:updated', onOrder);
      s.off('notification', onNotification);
      s.io.off('reconnect', onConnect);
      s.offAny(fanOut);
    };
  }, [qc]);

  // Rooms are assigned from cookies at handshake — reconnect when the session changes.
  useEffect(() => {
    if (socket?.connected) {
      socket.disconnect();
      socket.connect();
    }
  }, [user?._id]);

  return null;
}

export function reconnectRealtime() {
  if (socket) {
    socket.disconnect();
    socket.connect();
  }
}

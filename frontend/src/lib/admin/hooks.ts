'use client';

import { useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api, ApiError } from '@/lib/api';
import { onRealtime } from '@/components/providers/RealtimeBridge';
import type { AdminUser, Permission } from './types';

export function useAdminMe() {
  return useQuery({
    queryKey: ['admin', 'me'],
    queryFn: async () => {
      try {
        return (await api<{ admin: AdminUser }>('/admin/auth/me')).admin;
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) return null;
        throw err;
      }
    },
    staleTime: 5 * 60_000,
    retry: false,
  });
}

export function useCan(permission: Permission) {
  const { data } = useAdminMe();
  return Boolean(data?.permissions.includes(permission));
}

/**
 * Subscribe to selected realtime events for the lifetime of a component.
 * Handlers that take no arguments only refresh data, so bursts (e.g. a bulk
 * restock) are merged: they run after 1.2 s of quiet, at most every 5 s.
 * Handlers that read the event or payload still receive every event at once.
 */
export function useRealtime(events: string[], handler: (event: string, payload: unknown) => void) {
  const ref = useRef(handler);
  ref.current = handler;
  const key = events.join('|');
  useEffect(() => {
    const set = new Set(key.split('|'));
    let quiet: ReturnType<typeof setTimeout> | null = null;
    let deadline: ReturnType<typeof setTimeout> | null = null;
    let last: [string, unknown] | null = null;
    const run = () => {
      if (quiet) clearTimeout(quiet);
      if (deadline) clearTimeout(deadline);
      quiet = deadline = null;
      if (last) ref.current(last[0], last[1]);
      last = null;
    };
    const off = onRealtime((event, payload) => {
      if (!set.has(event)) return;
      if (ref.current.length > 0) return ref.current(event, payload);
      last = [event, payload];
      if (quiet) clearTimeout(quiet);
      quiet = setTimeout(run, 1200);
      if (!deadline) deadline = setTimeout(run, 5000);
    });
    return () => {
      off();
      if (quiet) clearTimeout(quiet);
      if (deadline) clearTimeout(deadline);
    };
  }, [key]);
}

/** Pounds/dollars typed by a person → integer minor units. */
export function toMinor(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined || value === '') return null;
  const n = typeof value === 'number' ? value : Number(String(value).replace(/[^0-9.-]/g, ''));
  if (!Number.isFinite(n)) return null;
  return Math.round(n * 100);
}

export function toMajor(minor: number | null | undefined): string {
  if (minor === null || minor === undefined) return '';
  return (minor / 100).toFixed(2);
}

export function errorMessage(err: unknown, fallback = 'Something went wrong.') {
  return err instanceof ApiError ? err.message : fallback;
}

export function toLocalInput(value?: string | Date | null) {
  if (!value) return '';
  const d = new Date(value);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function toDateInput(value?: string | Date | null) {
  if (!value) return '';
  const d = new Date(value);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

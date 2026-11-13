import { cookies } from 'next/headers';
import { API_INTERNAL_URL, CURRENCY_COOKIE } from './config';
import { qs } from './api';

/** Server-side fetch for SSR pages. Always fresh: the owner's changes must show immediately. */
export async function serverApi<T>(path: string, query?: Record<string, string | number | boolean | undefined | null>): Promise<T | null> {
  try {
    const res = await fetch(`${API_INTERNAL_URL}/api${path}${qs(query)}`, { cache: 'no-store', headers: { Accept: 'application/json' } });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

export async function currentCurrency() {
  const store = await cookies();
  const c = store.get(CURRENCY_COOKIE)?.value;
  return c === 'USD' || c === 'GBP' ? c : undefined;
}

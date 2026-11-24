import { cookies } from 'next/headers';
import { after } from 'next/server';
import { API_INTERNAL_URL, CURRENCY_COOKIE } from './config';
import { qs } from './api';

/** How long a page waits for fresh data before it uses the saved copy (a sleeping free API takes up to a minute to wake). */
const FRESH_WAIT_MS = 3000;
/** The saved copy of public shop data: refreshed in the background at most every 5 minutes. */
const SAVED_COPY = { next: { revalidate: 300, tags: ['velora-public'] } };

/**
 * Server-side fetch of public shop data (settings, products) for SSR pages.
 * Always fresh when the API answers: the owner's changes must show immediately. Only when the API does not answer
 * within FRESH_WAIT_MS (asleep, or overloaded) is the last saved copy shown instead of keeping the shopper on a blank
 * screen; the browser then loads live data as soon as the API is up. Never used for anything personal (bag, account,
 * checkout): those always go straight to the API from the browser.
 */
export async function serverApi<T>(path: string, query?: Record<string, string | number | boolean | undefined | null>): Promise<T | null> {
  const url = `${API_INTERNAL_URL}/api${path}${qs(query)}`;
  const headers = { Accept: 'application/json' };
  try {
    const res = await fetch(url, { cache: 'no-store', headers, signal: AbortSignal.timeout(FRESH_WAIT_MS) });
    if (!res.ok) return null;
    const data = (await res.json()) as T;
    // keep the saved copy current, after the page has been sent (served from the cache while it is under 5 minutes old)
    after(() =>
      fetch(url, { ...SAVED_COPY, headers })
        .then((r) => r.body?.cancel())
        .catch(() => undefined),
    );
    return data;
  } catch {
    try {
      const res = await fetch(url, { ...SAVED_COPY, headers });
      if (!res.ok) return null;
      return (await res.json()) as T;
    } catch {
      return null;
    }
  }
}

export async function currentCurrency() {
  const store = await cookies();
  const c = store.get(CURRENCY_COOKIE)?.value;
  return c === 'USD' || c === 'GBP' ? c : undefined;
}

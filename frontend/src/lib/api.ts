import { API_ORIGIN, API_URL } from './config';

export class ApiError extends Error {
  status: number;
  code: string;
  fields?: { path: string; message: string }[];
  details?: unknown;
  constructor(status: number, code: string, message: string, fields?: { path: string; message: string }[], details?: unknown) {
    super(message);
    this.status = status;
    this.code = code;
    this.fields = fields;
    this.details = details;
  }
}

type Query = Record<string, string | number | boolean | undefined | null | string[]>;

export function qs(query?: Query) {
  if (!query) return '';
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) {
    if (v === undefined || v === null || v === '' || (Array.isArray(v) && v.length === 0)) continue;
    p.set(k, Array.isArray(v) ? v.join(',') : String(v));
  }
  const s = p.toString();
  return s ? `?${s}` : '';
}

/** Browser API client — always sends cookies; JSON in/out. */
export async function api<T>(
  path: string,
  opts: { method?: string; body?: unknown; query?: Query; form?: FormData; signal?: AbortSignal } = {},
): Promise<T> {
  const headers: Record<string, string> = { Accept: 'application/json' };
  let body: BodyInit | undefined;
  if (opts.form) body = opts.form;
  else if (opts.body !== undefined) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(opts.body);
  }
  let res: Response;
  try {
    res = await fetch(`${API_URL}/api${path}${qs(opts.query)}`, {
      method: opts.method ?? (body ? 'POST' : 'GET'),
      headers,
      body,
      credentials: 'include',
      signal: opts.signal,
    });
  } catch (err) {
    if ((err as Error)?.name === 'AbortError') throw err;
    throw new ApiError(0, 'NETWORK', 'We could not reach the store. Check your connection and try again.');
  }
  if (res.status === 204) return undefined as T;
  const isJson = res.headers.get('content-type')?.includes('application/json');
  const data = isJson ? await res.json().catch(() => null) : null;
  if (!res.ok) {
    const e = data?.error ?? {};
    throw new ApiError(res.status, e.code ?? 'ERROR', e.message ?? 'Something went wrong.', e.fields, e.details);
  }
  return data as T;
}

export function imageUrl(fileId?: string | null) {
  return fileId ? `${API_ORIGIN}/api/images/${fileId}` : '';
}

export function srcSet(img?: { sm: string; md: string; lg: string } | null) {
  if (!img) return undefined;
  return `${imageUrl(img.sm)} 480w, ${imageUrl(img.md)} 960w, ${imageUrl(img.lg)} 1800w`;
}

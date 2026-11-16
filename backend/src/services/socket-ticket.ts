import { createHmac, timingSafeEqual } from 'node:crypto';
import { env } from '../config/env.js';

/**
 * Short-lived, signed "socket tickets".
 *
 * When the storefront reaches the API through its own domain (NEXT_PUBLIC_API_PROXY=1, e.g. the site on Vercel and
 * the API on Render), the session cookies belong to the storefront's domain and are never sent to the realtime socket,
 * which connects to the API host directly. The browser therefore asks `GET /api/realtime/ticket` (over the
 * cookie-authenticated proxy) and shows the result at the Socket.IO handshake. A ticket only decides which rooms the
 * socket may join and it expires after one minute; it is issued only for a currently valid session.
 */
const TTL_MS = 60_000;
const SKEW_MS = 5_000;
const DOMAIN = 'velora-socket-ticket:v1:';
const OBJECT_ID = /^[a-f0-9]{24}$/;

export interface SocketTicket {
  user?: string;
  admin?: string;
}

function sign(body: string) {
  return createHmac('sha256', env.SESSION_SECRET).update(DOMAIN + body).digest('base64url');
}

export function issueSocketTicket(who: SocketTicket, now = Date.now()) {
  const body = Buffer.from(JSON.stringify({ u: who.user, a: who.admin, exp: now + TTL_MS })).toString('base64url');
  return `${body}.${sign(body)}`;
}

export function verifySocketTicket(ticket: unknown, now = Date.now()): SocketTicket | null {
  if (typeof ticket !== 'string' || ticket.length === 0 || ticket.length > 600) return null;
  const parts = ticket.split('.');
  if (parts.length !== 2 || !parts[0] || !parts[1]) return null;
  const [body, signature] = parts;
  const expected = Buffer.from(sign(body));
  const given = Buffer.from(signature);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as { u?: unknown; a?: unknown; exp?: unknown };
    if (typeof payload.exp !== 'number' || payload.exp < now || payload.exp > now + TTL_MS + SKEW_MS) return null;
    const user = typeof payload.u === 'string' && OBJECT_ID.test(payload.u) ? payload.u : undefined;
    const admin = typeof payload.a === 'string' && OBJECT_ID.test(payload.a) ? payload.a : undefined;
    return user || admin ? { user, admin } : null;
  } catch {
    return null;
  }
}

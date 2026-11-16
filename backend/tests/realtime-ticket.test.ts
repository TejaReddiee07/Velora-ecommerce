import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { io as connect, type Socket } from 'socket.io-client';
import { startTestApp, stopTestApp, adminAgent, customerAgent, type TestContext } from './helpers.js';
import { issueSocketTicket, verifySocketTicket } from '../src/services/socket-ticket.js';
import { realtime } from '../src/realtime/socket.js';

/**
 * Socket tickets let the realtime socket authenticate when the storefront talks to the API through its own domain
 * (Vercel + Render): the session cookies live on the storefront's domain and never reach the socket host.
 */
let ctx: TestContext;
let admin: request.Agent;
const sockets: Socket[] = [];
const ID_A = 'a1'.repeat(12);
const ID_B = 'b2'.repeat(12);

beforeAll(async () => {
  ctx = await startTestApp();
  admin = await adminAgent(ctx.app);
});
afterAll(async () => {
  sockets.forEach((s) => s.close());
  await stopTestApp(ctx);
});

/** Connects WITHOUT any cookie: only the ticket (if any) can authenticate it. */
async function ticketSocket(ticket?: string | null) {
  const s = connect(ctx.baseUrl, { transports: ['websocket'], forceNew: true, auth: ticket ? { ticket } : {} });
  sockets.push(s);
  const session = await new Promise<{ user: boolean; admin: boolean }>((resolve, reject) => {
    s.on('session', resolve);
    s.on('connect_error', reject);
  });
  return { s, session };
}

function got(s: Socket, event: string, waitMs = 400) {
  return new Promise<unknown[]>((resolve) => {
    const seen: unknown[] = [];
    s.on(event, (p) => seen.push(p));
    setTimeout(() => resolve(seen), waitMs);
  });
}

describe('socket tickets (signing)', () => {
  it('round-trips a customer and an owner ticket', () => {
    expect(verifySocketTicket(issueSocketTicket({ user: ID_A }))).toEqual({ user: ID_A, admin: undefined });
    expect(verifySocketTicket(issueSocketTicket({ admin: ID_B }))).toEqual({ user: undefined, admin: ID_B });
    expect(verifySocketTicket(issueSocketTicket({ user: ID_A, admin: ID_B }))).toEqual({ user: ID_A, admin: ID_B });
  });

  it('rejects anything that is not exactly what we issued', () => {
    const good = issueSocketTicket({ admin: ID_A });
    const [body, sig] = good.split('.');
    expect(verifySocketTicket(undefined)).toBeNull();
    expect(verifySocketTicket('')).toBeNull();
    expect(verifySocketTicket('garbage')).toBeNull();
    expect(verifySocketTicket(`${body}.${sig}.extra`)).toBeNull();
    expect(verifySocketTicket(`${body}.${sig.slice(0, -2)}xx`)).toBeNull(); // wrong signature
    // Re-using a signature on a different payload (e.g. promoting a customer ticket to owner) fails.
    const other = issueSocketTicket({ user: ID_B }).split('.')[0];
    expect(verifySocketTicket(`${other}.${sig}`)).toBeNull();
    expect(verifySocketTicket('x'.repeat(700))).toBeNull();
    // Valid signature but no usable identity, or a malformed id.
    expect(verifySocketTicket(issueSocketTicket({}))).toBeNull();
    expect(verifySocketTicket(issueSocketTicket({ user: 'not-an-object-id' }))).toBeNull();
  });

  it('expires after a minute and refuses tickets dated far in the future', () => {
    const now = Date.now();
    const t = issueSocketTicket({ user: ID_A }, now);
    expect(verifySocketTicket(t, now + 30_000)).not.toBeNull();
    expect(verifySocketTicket(t, now + 61_000)).toBeNull();
    expect(verifySocketTicket(issueSocketTicket({ user: ID_A }, now + 3_600_000), now)).toBeNull();
  });
});

describe('GET /api/realtime/ticket', () => {
  it('gives visitors no ticket and never allows caching', async () => {
    const res = await request(ctx.app).get('/api/realtime/ticket');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ticket: null });
    expect(res.headers['cache-control']).toBe('no-store');
  });

  it('issues a customer ticket bound to the signed-in customer', async () => {
    const c = await customerAgent(ctx.app);
    const res = await c.agent.get('/api/realtime/ticket');
    expect(res.status).toBe(200);
    expect(verifySocketTicket(res.body.ticket)).toEqual({ user: c.user._id, admin: undefined });
  });

  it('issues an owner ticket bound to the signed-in owner', async () => {
    const me = (await admin.get('/api/admin/auth/me')).body.admin;
    const res = await admin.get('/api/realtime/ticket');
    expect(verifySocketTicket(res.body.ticket)).toEqual({ user: undefined, admin: me._id });
  });

  it('gives nothing to a signed-out visitor, even one carrying a made-up cookie', async () => {
    const res = await request(ctx.app).get('/api/realtime/ticket').set('Cookie', 'velora_sid=nope; velora_admin=nope');
    expect(res.body).toEqual({ ticket: null });
  });
});

describe('socket handshake with a ticket (no cookies at all)', () => {
  it('joins the right rooms and keeps customers and owners apart', async () => {
    const c = await customerAgent(ctx.app);
    const customerTicket = (await c.agent.get('/api/realtime/ticket')).body.ticket as string;
    const ownerTicket = (await admin.get('/api/realtime/ticket')).body.ticket as string;

    const anon = await ticketSocket();
    const customer = await ticketSocket(customerTicket);
    const owner = await ticketSocket(ownerTicket);
    expect(anon.session).toEqual({ user: false, admin: false });
    expect(customer.session).toEqual({ user: true, admin: false });
    expect(owner.session).toEqual({ user: false, admin: true });

    const adminSeenByAnon = got(anon.s, 'test:admin');
    const adminSeenByCustomer = got(customer.s, 'test:admin');
    const adminSeenByOwner = got(owner.s, 'test:admin');
    const customerSeenByOwner = got(owner.s, 'test:user');
    const customerSeenByCustomer = got(customer.s, 'test:user');
    realtime.admin('test:admin', { n: 1 });
    realtime.user(c.user._id, 'test:user', { n: 2 });

    expect(await adminSeenByOwner).toHaveLength(1);
    expect(await adminSeenByAnon).toHaveLength(0);
    expect(await adminSeenByCustomer).toHaveLength(0);
    expect(await customerSeenByCustomer).toHaveLength(1);
    expect(await customerSeenByOwner).toHaveLength(0);
  });

  it('treats a forged, tampered or expired ticket as an anonymous visitor', async () => {
    const good = issueSocketTicket({ admin: ID_A });
    const [body, sig] = good.split('.');
    const forged = (await ticketSocket(`${body}.${sig.slice(0, -2)}xx`)).session;
    const garbage = (await ticketSocket('not.a.ticket')).session;
    const expired = (await ticketSocket(issueSocketTicket({ admin: ID_A }, Date.now() - 120_000))).session;
    expect(forged).toEqual({ user: false, admin: false });
    expect(garbage).toEqual({ user: false, admin: false });
    expect(expired).toEqual({ user: false, admin: false });
  });
});

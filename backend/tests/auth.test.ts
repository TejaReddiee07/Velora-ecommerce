import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { startTestApp, stopTestApp, customerAgent, adminAgent, createStaff, type TestContext } from './helpers.js';
import { testOutbox } from '../src/services/email.service.js';
import { User } from '../src/models/User.js';

let ctx: TestContext;
beforeAll(async () => {
  ctx = await startTestApp();
});
afterAll(async () => stopTestApp(ctx));

const lastEmailTo = (to: string) => [...testOutbox()].reverse().find((m) => m.to === to);
const tokenFrom = (text: string) => /token=([A-Za-z0-9_-]+)/.exec(text)?.[1] ?? '';

describe('customer authentication', () => {
  it('registers, sets an httpOnly session cookie and returns the profile', async () => {
    const res = await request(ctx.app).post('/api/auth/register').send({ name: 'Grace Hopper', email: 'grace@example.test', password: 'Password123' });
    expect(res.status).toBe(201);
    expect(res.body.user.email).toBe('grace@example.test');
    expect(res.body.user).not.toHaveProperty('passwordHash');
    const cookie = res.headers['set-cookie']?.[0] ?? '';
    expect(cookie).toMatch(/velora_sid=/);
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=Lax/i);
    const stored = await User.findOne({ email: 'grace@example.test' }).select('+passwordHash').lean();
    expect(stored!.passwordHash).toMatch(/^\$argon2id\$/);
  });

  it('rejects duplicate registration and weak passwords', async () => {
    const dup = await request(ctx.app).post('/api/auth/register').send({ name: 'Grace', email: 'grace@example.test', password: 'Password123' });
    expect(dup.status).toBe(409);
    const weak = await request(ctx.app).post('/api/auth/register').send({ name: 'Weak', email: 'weak@example.test', password: 'short' });
    expect(weak.status).toBe(400);
    expect(weak.body.error.fields.some((f: { path: string }) => f.path === 'password')).toBe(true);
  });

  it('logs in, reads /me, logs out', async () => {
    const agent = request.agent(ctx.app);
    expect((await agent.post('/api/auth/login').send({ email: 'grace@example.test', password: 'Password123' })).status).toBe(200);
    expect((await agent.get('/api/auth/me')).body.user.email).toBe('grace@example.test');
    expect((await agent.post('/api/auth/logout')).status).toBe(200);
    expect((await agent.get('/api/auth/me')).body.user).toBeNull();
  });

  it('gives the same error for unknown email and wrong password', async () => {
    const a = await request(ctx.app).post('/api/auth/login').send({ email: 'nobody@example.test', password: 'Password123' });
    const b = await request(ctx.app).post('/api/auth/login').send({ email: 'grace@example.test', password: 'WrongPass123' });
    expect(a.status).toBe(401);
    expect(b.status).toBe(401);
    expect(a.body.error.message).toBe(b.body.error.message);
  });

  it('blocks NoSQL operator injection', async () => {
    const res = await request(ctx.app).post('/api/auth/login').send({ email: { $gt: '' }, password: { $gt: '' } });
    expect(res.status).toBe(400);
  });

  it('resets a password with a single-use, expiring token', async () => {
    const forgot = await request(ctx.app).post('/api/auth/forgot-password').send({ email: 'grace@example.test' });
    expect(forgot.status).toBe(200);
    // Unknown emails get the identical response (no enumeration).
    const unknown = await request(ctx.app).post('/api/auth/forgot-password').send({ email: 'ghost@example.test' });
    expect(unknown.body).toEqual(forgot.body);
    await new Promise((r) => setTimeout(r, 50));
    const token = tokenFrom(lastEmailTo('grace@example.test')!.text);
    expect(token.length).toBeGreaterThan(20);
    const reset = await request(ctx.app).post('/api/auth/reset-password').send({ token, password: 'NewPassword456' });
    expect(reset.status).toBe(200);
    const reuse = await request(ctx.app).post('/api/auth/reset-password').send({ token, password: 'Another789' });
    expect(reuse.status).toBe(400);
    expect((await request(ctx.app).post('/api/auth/login').send({ email: 'grace@example.test', password: 'NewPassword456' })).status).toBe(200);
  });

  it('verifies email with the emailed token', async () => {
    const { email } = await customerAgent(ctx.app, 'Verify Me');
    await new Promise((r) => setTimeout(r, 50));
    const token = tokenFrom(lastEmailTo(email)!.text);
    const res = await request(ctx.app).post('/api/auth/verify-email').send({ token });
    expect(res.status).toBe(200);
    expect((await User.findOne({ email }).lean())!.emailVerified).toBe(true);
  });

  it('rejects cross-site state-changing requests (CSRF origin check)', async () => {
    const res = await request(ctx.app).post('/api/auth/login').set('Origin', 'https://evil.example').send({ email: 'grace@example.test', password: 'NewPassword456' });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('CSRF_REJECTED');
    const ok = await request(ctx.app).post('/api/auth/login').set('Origin', 'http://localhost:3000').send({ email: 'grace@example.test', password: 'NewPassword456' });
    expect(ok.status).toBe(200);
  });

  it('manages saved addresses for the owner only', async () => {
    const a = await customerAgent(ctx.app);
    const b = await customerAgent(ctx.app);
    const created = await a.agent.post('/api/account/addresses').send({ fullName: 'Ada A', line1: '1 Road', city: 'London', postalCode: 'E1 1AA', country: 'gb' });
    expect(created.status).toBe(201);
    expect(created.body.address.isDefault).toBe(true);
    expect(created.body.address.country).toBe('GB');
    const steal = await b.agent.delete(`/api/account/addresses/${created.body.address._id}`);
    expect(steal.status).toBe(404);
  });
});

describe('admin authentication and authorisation', () => {
  it('keeps customers and anonymous users out of admin APIs', async () => {
    expect((await request(ctx.app).get('/api/admin/products')).status).toBe(401);
    const { agent } = await customerAgent(ctx.app);
    expect((await agent.get('/api/admin/analytics/overview')).status).toBe(401);
    expect((await agent.post('/api/admin/auth/login').send({ email: 'grace@example.test', password: 'NewPassword456' })).status).toBe(401);
  });

  it('logs the owner in with a strict, httpOnly admin cookie', async () => {
    const res = await request(ctx.app).post('/api/admin/auth/login').send({ email: 'owner@velora.test', password: 'OwnerPass123' });
    expect(res.status).toBe(200);
    expect(res.body.admin.role).toBe('owner');
    const cookie = res.headers['set-cookie']?.[0] ?? '';
    expect(cookie).toMatch(/velora_admin=/);
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=Strict/i);
  });

  it('enforces role permissions (staff cannot change settings or refund)', async () => {
    const staff = await createStaff('staff', 'staff@velora.test');
    const agent = await adminAgent(ctx.app, staff.email, staff.password);
    expect((await agent.get('/api/admin/orders')).status).toBe(200);
    expect((await agent.get('/api/admin/analytics/overview')).status).toBe(403);
    expect((await agent.post('/api/admin/coupons').send({ code: 'NOPE', type: 'percentage', value: 10 })).status).toBe(403);
    expect((await agent.get('/api/admin/staff')).status).toBe(403);
  });

  it('locks an admin account after repeated failures', async () => {
    await createStaff('manager', 'manager@velora.test', 'ManagerPass123');
    for (let i = 0; i < 5; i++) {
      await request(ctx.app).post('/api/admin/auth/login').send({ email: 'manager@velora.test', password: 'wrong-password' });
    }
    const locked = await request(ctx.app).post('/api/admin/auth/login').send({ email: 'manager@velora.test', password: 'ManagerPass123' });
    expect(locked.status).toBe(423);
  });
});

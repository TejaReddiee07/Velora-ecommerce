import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { startTestApp, stopTestApp, createStaff, type TestContext } from './helpers.js';

let ctx: TestContext;
beforeAll(async () => {
  ctx = await startTestApp();
});
afterAll(async () => stopTestApp(ctx));

describe('one sign-in form for owners and customers (/api/auth/login)', () => {
  it('signs the owner into the owner portal with a strict admin cookie', async () => {
    const agent = request.agent(ctx.app);
    const res = await agent.post('/api/auth/login').send({ email: 'owner@velora.test', password: 'OwnerPass123' });
    expect(res.status).toBe(200);
    expect(res.body.role).toBe('admin');
    expect(res.body.admin.role).toBe('owner');
    expect(res.body.admin.permissions.length).toBeGreaterThan(0);
    expect(res.body).not.toHaveProperty('user');
    const cookies = (res.headers['set-cookie'] as unknown as string[]).join('\n');
    expect(cookies).toMatch(/velora_admin=.*HttpOnly/i);
    expect(cookies).toMatch(/velora_admin=.*SameSite=Strict/i);
    expect(cookies).not.toMatch(/velora_sid=/);
    expect((await agent.get('/api/admin/auth/me')).status).toBe(200);
    expect((await agent.get('/api/auth/me')).body.user).toBeNull();
  });

  it('signs customers into their account', async () => {
    await request(ctx.app).post('/api/auth/register').send({ name: 'Ada Lovelace', email: 'ada@example.test', password: 'Password123' });
    const agent = request.agent(ctx.app);
    const res = await agent.post('/api/auth/login').send({ email: 'ada@example.test', password: 'Password123' });
    expect(res.status).toBe(200);
    expect(res.body.role).toBe('customer');
    expect(res.body.user.email).toBe('ada@example.test');
    expect((await agent.get('/api/auth/me')).body.user.email).toBe('ada@example.test');
    expect((await agent.get('/api/admin/auth/me')).status).toBe(401);
  });

  it('rejects wrong passwords with the same generic error', async () => {
    const owner = await request(ctx.app).post('/api/auth/login').send({ email: 'owner@velora.test', password: 'WrongPass123' });
    const nobody = await request(ctx.app).post('/api/auth/login').send({ email: 'nobody@example.test', password: 'WrongPass123' });
    expect(owner.status).toBe(401);
    expect(nobody.status).toBe(401);
    expect(owner.body.error.code).toBe(nobody.body.error.code);
  });

  it('applies the admin lockout to staff accounts signing in from the storefront', async () => {
    await createStaff('staff', 'locked-staff@velora.test', 'StaffPass123');
    for (let i = 0; i < 5; i++) {
      await request(ctx.app).post('/api/auth/login').send({ email: 'locked-staff@velora.test', password: 'wrong-password' });
    }
    const locked = await request(ctx.app).post('/api/auth/login').send({ email: 'locked-staff@velora.test', password: 'StaffPass123' });
    expect(locked.status).toBe(423);
  });
});

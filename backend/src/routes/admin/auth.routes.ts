import { Router } from 'express';
import { z } from 'zod';
import { Admin } from '../../models/Admin.js';
import { validate } from '../../middleware/validate.js';
import { ROLE_PERMISSIONS, requireAdmin } from '../../middleware/auth.js';
import { adminAuthLimiter } from '../../middleware/security.js';
import { createSession, destroySession } from '../../services/session.service.js';
import { logActivity } from '../../services/activity.service.js';
import { hashPassword, randomToken, verifyPassword } from '../../utils/crypto.js';
import { email } from '../../utils/schemas.js';
import { AppError } from '../../utils/errors.js';

const router = Router();
// Made on first use (no top-level await: Vercel loads the API with require()).
let dummyHash: Promise<string> | null = null;
const DUMMY_HASH = () => (dummyHash ??= hashPassword(randomToken(16)));
const MAX_FAILURES = 5;
const LOCK_MS = 15 * 60_000;

router.post('/login', adminAuthLimiter, validate({ body: z.object({ email, password: z.string().min(1).max(128) }) }), async (req, res) => {
  const admin = await Admin.findOne({ email: req.body.email }).select('+passwordHash');
  if (admin?.lockedUntil && admin.lockedUntil > new Date()) {
    throw new AppError(423, 'ACCOUNT_LOCKED', 'Too many failed attempts. This account is locked for 15 minutes.');
  }
  const ok = await verifyPassword(admin?.passwordHash ?? (await DUMMY_HASH()), req.body.password);
  if (!admin || !ok || admin.status !== 'active') {
    if (admin) {
      admin.failedLogins += 1;
      if (admin.failedLogins >= MAX_FAILURES) {
        admin.lockedUntil = new Date(Date.now() + LOCK_MS);
        admin.failedLogins = 0;
      }
      await admin.save();
    }
    throw new AppError(401, 'INVALID_CREDENTIALS', 'Email or password is incorrect.');
  }
  admin.failedLogins = 0;
  admin.lockedUntil = undefined;
  admin.lastLoginAt = new Date();
  await admin.save();
  await createSession(res, req, 'admin', admin._id);
  req.admin = { _id: admin._id, name: admin.name, email: admin.email, role: admin.role, status: admin.status };
  await logActivity(req, 'admin.login', 'admin', String(admin._id), `${admin.name} signed in`);
  res.json({ admin: { _id: String(admin._id), name: admin.name, email: admin.email, role: admin.role, permissions: ROLE_PERMISSIONS[admin.role] } });
});

router.post('/logout', async (req, res) => {
  await destroySession(req, res, 'admin');
  res.json({ ok: true });
});

router.get('/me', requireAdmin, (req, res) => {
  const a = req.admin!;
  res.json({ admin: { _id: String(a._id), name: a.name, email: a.email, role: a.role, permissions: ROLE_PERMISSIONS[a.role] } });
});

export default router;

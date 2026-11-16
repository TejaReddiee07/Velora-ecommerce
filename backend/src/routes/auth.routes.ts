import { Router } from 'express';
import { z } from 'zod';
import { User } from '../models/User.js';
import { Admin } from '../models/Admin.js';
import { ROLE_PERMISSIONS } from '../middleware/auth.js';
import { logActivity } from '../services/activity.service.js';
import { Address } from '../models/Address.js';
import { validate } from '../middleware/validate.js';
import { loadUser, requireUser } from '../middleware/auth.js';
import { authLimiter } from '../middleware/security.js';
import {
  COOKIE_GUEST_CART,
  createSession,
  destroySession,
  revokeAllSessions,
} from '../services/session.service.js';
import { mergeGuestCart } from '../services/cart.service.js';
import { queueEmail } from '../jobs/queue.js';
import { resetPasswordMessage, verifyEmailMessage } from '../services/email.service.js';
import { hashPassword, hashToken, randomToken, verifyPassword } from '../utils/crypto.js';
import { addressInput, email, objectId, password } from '../utils/schemas.js';
import { deliveryProblem } from '../utils/address.js';
import { AppError, badRequest, conflict, notFound } from '../utils/errors.js';

const router = Router();

// A real argon2 hash so failed lookups take as long as wrong passwords.
// Made on first use (no top-level await: Vercel loads the API with require()).
let dummyHash: Promise<string> | null = null;
const DUMMY_HASH = () => (dummyHash ??= hashPassword(randomToken(16)));

function publicUser(u: { _id: unknown; name: string; email: string; emailVerified: boolean; phone?: string; marketingOptIn?: boolean; createdAt?: Date }) {
  return {
    _id: String(u._id),
    name: u.name,
    email: u.email,
    emailVerified: u.emailVerified,
    phone: u.phone ?? null,
    marketingOptIn: u.marketingOptIn ?? false,
    createdAt: u.createdAt,
  };
}

router.post(
  '/auth/register',
  authLimiter,
  validate({ body: z.object({ name: z.string().trim().min(2).max(120), email, password, marketingOptIn: z.boolean().optional() }) }),
  async (req, res) => {
    const { name, email: addr, password: pw, marketingOptIn } = req.body;
    if (await User.exists({ email: addr })) throw conflict('An account with this email already exists. Try signing in.');
    const token = randomToken(32);
    const user = await User.create({
      name,
      email: addr,
      passwordHash: await hashPassword(pw),
      marketingOptIn: Boolean(marketingOptIn),
      emailVerifyTokenHash: hashToken(token),
      emailVerifyExpires: new Date(Date.now() + 24 * 3600_000),
    });
    await createSession(res, req, 'user', user._id);
    await mergeGuestCart(req.cookies?.[COOKIE_GUEST_CART], user._id);
    res.clearCookie(COOKIE_GUEST_CART);
    await queueEmail(verifyEmailMessage(user.email, user.name, token));
    res.status(201).json({ user: publicUser(user) });
  },
);

const ADMIN_MAX_FAILURES = 5;
const ADMIN_LOCK_MS = 15 * 60_000;

/**
 * One sign-in for the whole site: owner/staff credentials open an owner-portal
 * session (role "admin"); customer credentials open a customer session
 * (role "customer"). Admin lockout rules are the same as on /admin/login.
 */
router.post('/auth/login', authLimiter, validate({ body: z.object({ email, password: z.string().min(1).max(128) }) }), async (req, res) => {
  const { email: addr, password: pw } = req.body;

  const admin = await Admin.findOne({ email: addr }).select('+passwordHash');
  const adminLocked = Boolean(admin?.lockedUntil && admin.lockedUntil > new Date());
  // Always run one hash check here so response time doesn't reveal which emails are staff accounts.
  const adminOk = await verifyPassword(admin?.passwordHash ?? (await DUMMY_HASH()), pw);
  if (admin && adminOk && admin.status === 'active' && !adminLocked) {
    admin.failedLogins = 0;
    admin.lockedUntil = undefined;
    admin.lastLoginAt = new Date();
    await admin.save();
    await createSession(res, req, 'admin', admin._id);
    req.admin = { _id: admin._id, name: admin.name, email: admin.email, role: admin.role, status: admin.status };
    await logActivity(req, 'admin.login', 'admin', String(admin._id), `${admin.name} signed in from the storefront`);
    return res.json({
      role: 'admin',
      admin: { _id: String(admin._id), name: admin.name, email: admin.email, role: admin.role, permissions: ROLE_PERMISSIONS[admin.role] },
    });
  }

  const user = await User.findOne({ email: addr }).select('+passwordHash');
  const ok = await verifyPassword(user?.passwordHash ?? (await DUMMY_HASH()), pw);
  if (!user || !ok) {
    if (admin && admin.status === 'active') {
      if (adminLocked) throw new AppError(423, 'ACCOUNT_LOCKED', 'Too many failed attempts. This account is locked for 15 minutes.');
      admin.failedLogins += 1;
      if (admin.failedLogins >= ADMIN_MAX_FAILURES) {
        admin.lockedUntil = new Date(Date.now() + ADMIN_LOCK_MS);
        admin.failedLogins = 0;
      }
      await admin.save();
    }
    throw new AppError(401, 'INVALID_CREDENTIALS', 'Email or password is incorrect.');
  }
  if (user.status !== 'active') throw new AppError(403, 'ACCOUNT_SUSPENDED', 'This account is suspended. Please contact support.');
  user.lastLoginAt = new Date();
  await user.save();
  await createSession(res, req, 'user', user._id);
  await mergeGuestCart(req.cookies?.[COOKIE_GUEST_CART], user._id);
  res.clearCookie(COOKIE_GUEST_CART);
  res.json({ role: 'customer', user: publicUser(user) });
});

router.post('/auth/logout', async (req, res) => {
  await destroySession(req, res, 'user');
  res.json({ ok: true });
});

router.get('/auth/me', loadUser, async (req, res) => {
  if (!req.user) return res.json({ user: null });
  const user = await User.findById(req.user._id).lean();
  res.json({ user: user ? publicUser(user) : null });
});

router.post('/auth/forgot-password', authLimiter, validate({ body: z.object({ email }) }), async (req, res) => {
  const user = await User.findOne({ email: req.body.email, status: 'active' });
  if (user) {
    const token = randomToken(32);
    user.resetTokenHash = hashToken(token);
    user.resetExpires = new Date(Date.now() + 3600_000);
    await user.save();
    await queueEmail(resetPasswordMessage(user.email, user.name, token));
  }
  // Same response either way — no account enumeration.
  res.json({ ok: true, message: 'If an account exists for that email, a reset link is on its way.' });
});

router.post('/auth/reset-password', authLimiter, validate({ body: z.object({ token: z.string().min(20).max(100), password }) }), async (req, res) => {
  const user = await User.findOne({ resetTokenHash: hashToken(req.body.token), resetExpires: { $gt: new Date() } }).select('+resetTokenHash');
  if (!user) throw badRequest('This reset link is invalid or has expired. Please request a new one.');
  user.passwordHash = await hashPassword(req.body.password);
  user.resetTokenHash = undefined;
  user.resetExpires = undefined;
  await user.save();
  await revokeAllSessions('user', user._id);
  res.json({ ok: true, message: 'Password updated. Please sign in with your new password.' });
});

router.post('/auth/verify-email', validate({ body: z.object({ token: z.string().min(20).max(100) }) }), async (req, res) => {
  const user = await User.findOne({ emailVerifyTokenHash: hashToken(req.body.token), emailVerifyExpires: { $gt: new Date() } });
  if (!user) throw badRequest('This verification link is invalid or has expired.');
  user.emailVerified = true;
  user.emailVerifyTokenHash = undefined;
  user.emailVerifyExpires = undefined;
  await user.save();
  res.json({ ok: true, message: 'Email confirmed. Thank you.' });
});

router.post('/auth/resend-verification', authLimiter, requireUser, async (req, res) => {
  const user = await User.findById(req.user!._id);
  if (!user) throw notFound();
  if (user.emailVerified) return res.json({ ok: true, message: 'Your email is already confirmed.' });
  const token = randomToken(32);
  user.emailVerifyTokenHash = hashToken(token);
  user.emailVerifyExpires = new Date(Date.now() + 24 * 3600_000);
  await user.save();
  await queueEmail(verifyEmailMessage(user.email, user.name, token));
  res.json({ ok: true, message: 'Verification email sent.' });
});

// ── Account ────────────────────────────────────────────────────────────────
router.patch(
  '/account/profile',
  requireUser,
  validate({ body: z.object({ name: z.string().trim().min(2).max(120).optional(), phone: z.string().trim().max(30).optional(), marketingOptIn: z.boolean().optional() }) }),
  async (req, res) => {
    const user = await User.findByIdAndUpdate(req.user!._id, { $set: req.body }, { returnDocument: 'after' }).lean();
    res.json({ user: publicUser(user!) });
  },
);

router.post(
  '/account/change-password',
  authLimiter,
  requireUser,
  validate({ body: z.object({ currentPassword: z.string().min(1).max(128), newPassword: password }) }),
  async (req, res) => {
    const user = await User.findById(req.user!._id).select('+passwordHash');
    if (!user || !(await verifyPassword(user.passwordHash, req.body.currentPassword))) {
      throw badRequest('Your current password is incorrect.');
    }
    user.passwordHash = await hashPassword(req.body.newPassword);
    await user.save();
    await revokeAllSessions('user', user._id);
    await createSession(res, req, 'user', user._id);
    res.json({ ok: true, message: 'Password changed. Other devices have been signed out.' });
  },
);

router.get('/account/addresses', requireUser, async (req, res) => {
  const addresses = await Address.find({ user: req.user!._id }).sort({ isDefault: -1, updatedAt: -1 }).lean();
  // Flag saved addresses we can't deliver to (UK only) so checkout can't select them.
  res.json({
    addresses: addresses.map((a) => {
      const problem = deliveryProblem(a);
      return { ...a, deliverable: !problem, deliveryIssue: problem?.message ?? null };
    }),
  });
});

const addressBody = addressInput.extend({ label: z.string().trim().max(40).optional(), isDefault: z.boolean().optional() });

router.post('/account/addresses', requireUser, validate({ body: addressBody }), async (req, res) => {
  const count = await Address.countDocuments({ user: req.user!._id });
  if (count >= 20) throw badRequest('You can save up to 20 addresses.');
  const makeDefault = req.body.isDefault || count === 0;
  if (makeDefault) await Address.updateMany({ user: req.user!._id }, { $set: { isDefault: false } });
  const address = await Address.create({ ...req.body, user: req.user!._id, isDefault: makeDefault });
  res.status(201).json({ address });
});

router.put('/account/addresses/:id', requireUser, validate({ params: z.object({ id: objectId }), body: addressBody }), async (req, res) => {
  const { id } = req.valid.params;
  if (req.body.isDefault) await Address.updateMany({ user: req.user!._id }, { $set: { isDefault: false } });
  const address = await Address.findOneAndUpdate({ _id: id, user: req.user!._id }, { $set: req.body }, { returnDocument: 'after' });
  if (!address) throw notFound('Address not found.');
  res.json({ address });
});

router.delete('/account/addresses/:id', requireUser, validate({ params: z.object({ id: objectId }) }), async (req, res) => {
  const { id } = req.valid.params;
  const removed = await Address.findOneAndDelete({ _id: id, user: req.user!._id });
  if (!removed) throw notFound('Address not found.');
  if (removed.isDefault) {
    const next = await Address.findOne({ user: req.user!._id }).sort({ updatedAt: -1 });
    if (next) await Address.updateOne({ _id: next._id }, { $set: { isDefault: true } });
  }
  res.json({ ok: true });
});

export default router;

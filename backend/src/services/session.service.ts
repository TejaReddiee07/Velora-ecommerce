import type { Request, Response, CookieOptions } from 'express';
import { Types } from 'mongoose';
import { env } from '../config/env.js';
import { Session } from '../models/Session.js';
import { User, type IUser } from '../models/User.js';
import { Admin, type IAdmin } from '../models/Admin.js';
import { hashToken, randomToken } from '../utils/crypto.js';

export const COOKIE_USER = 'velora_sid';
export const COOKIE_ADMIN = 'velora_admin';
export const COOKIE_GUEST_CART = 'velora_cart';

const USER_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const ADMIN_TTL_MS = 12 * 60 * 60 * 1000; // 12 hours

export function cookieOptions(maxAgeMs: number, sameSite?: CookieOptions['sameSite']): CookieOptions {
  return {
    httpOnly: true,
    secure: env.cookieSecure,
    sameSite: sameSite ?? env.COOKIE_SAMESITE,
    domain: env.COOKIE_DOMAIN,
    path: '/',
    maxAge: maxAgeMs,
  };
}

export async function createSession(
  res: Response,
  req: Request,
  subjectType: 'user' | 'admin',
  subject: Types.ObjectId,
) {
  const token = randomToken(32);
  const ttl = subjectType === 'admin' ? ADMIN_TTL_MS : USER_TTL_MS;
  await Session.create({
    tokenHash: hashToken(token),
    subjectType,
    subject,
    expiresAt: new Date(Date.now() + ttl),
    userAgent: req.get('user-agent')?.slice(0, 300),
    ip: req.ip,
  });
  // Admin cookie is strict unless the API must be cross-site (then `none` is required).
  const sameSite = subjectType === 'admin' && env.COOKIE_SAMESITE !== 'none' ? 'strict' : undefined;
  res.cookie(subjectType === 'admin' ? COOKIE_ADMIN : COOKIE_USER, token, cookieOptions(ttl, sameSite));
}

export async function destroySession(req: Request, res: Response, subjectType: 'user' | 'admin') {
  const name = subjectType === 'admin' ? COOKIE_ADMIN : COOKIE_USER;
  const token = req.cookies?.[name];
  if (typeof token === 'string' && token) {
    await Session.deleteOne({ tokenHash: hashToken(token), subjectType });
  }
  res.clearCookie(name, { ...cookieOptions(0), maxAge: undefined });
}

export async function revokeAllSessions(subjectType: 'user' | 'admin', subject: Types.ObjectId) {
  await Session.deleteMany({ subjectType, subject });
}

export type AuthUser = Pick<IUser, 'name' | 'email' | 'emailVerified' | 'status'> & { _id: Types.ObjectId };
export type AuthAdmin = Pick<IAdmin, 'name' | 'email' | 'role' | 'status'> & { _id: Types.ObjectId };

async function resolveSession(token: unknown, subjectType: 'user' | 'admin') {
  if (typeof token !== 'string' || token.length < 20 || token.length > 100) return null;
  const session = await Session.findOne({ tokenHash: hashToken(token), subjectType }).lean();
  if (!session || session.expiresAt.getTime() <= Date.now()) return null;
  // Touch at most every 10 minutes to avoid a write per request.
  if (Date.now() - new Date(session.lastSeenAt).getTime() > 10 * 60 * 1000) {
    void Session.updateOne({ _id: session._id }, { lastSeenAt: new Date() }).exec();
  }
  return session;
}

export async function userFromToken(token: unknown): Promise<AuthUser | null> {
  const session = await resolveSession(token, 'user');
  if (!session) return null;
  const user = await User.findById(session.subject).select('name email emailVerified status').lean();
  if (!user || user.status !== 'active') return null;
  return user as AuthUser;
}

export async function adminFromToken(token: unknown): Promise<AuthAdmin | null> {
  const session = await resolveSession(token, 'admin');
  if (!session) return null;
  const admin = await Admin.findById(session.subject).select('name email role status').lean();
  if (!admin || admin.status !== 'active') return null;
  return admin as AuthAdmin;
}

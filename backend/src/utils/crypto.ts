import crypto from 'node:crypto';
import argon2 from 'argon2';
import { env } from '../config/env.js';

export function randomToken(bytes = 32) {
  return crypto.randomBytes(bytes).toString('base64url');
}

/** Keyed hash for tokens stored in the database (sessions, reset links). */
export function hashToken(token: string) {
  return crypto.createHmac('sha256', env.SESSION_SECRET).update(token).digest('hex');
}

export async function hashPassword(password: string) {
  return argon2.hash(password, { type: argon2.argon2id, memoryCost: 19456, timeCost: 2, parallelism: 1 });
}

export async function verifyPassword(hash: string, password: string) {
  try {
    return await argon2.verify(hash, password);
  } catch {
    return false;
  }
}

export function safeEqual(a: string, b: string) {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && crypto.timingSafeEqual(ab, bb);
}

/** Human-friendly order number, e.g. VEL-7K2M9Q4D. */
export function orderNumber() {
  const alphabet = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  const bytes = crypto.randomBytes(8);
  let out = '';
  for (const b of bytes) out += alphabet[b % alphabet.length];
  return `VEL-${out}`;
}

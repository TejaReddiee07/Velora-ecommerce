import type { NextFunction, Request, Response } from 'express';
import {
  COOKIE_ADMIN,
  COOKIE_USER,
  adminFromToken,
  userFromToken,
  type AuthAdmin,
  type AuthUser,
} from '../services/session.service.js';
import { forbidden, unauthorized } from '../utils/errors.js';
import type { AdminRole } from '../models/Admin.js';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthUser | null;
      admin?: AuthAdmin | null;
    }
  }
}

/** Attaches the signed-in customer (if any). Never fails. */
export async function loadUser(req: Request, _res: Response, next: NextFunction) {
  req.user = await userFromToken(req.cookies?.[COOKIE_USER]);
  next();
}

export async function requireUser(req: Request, _res: Response, next: NextFunction) {
  if (req.user === undefined) req.user = await userFromToken(req.cookies?.[COOKIE_USER]);
  if (!req.user) return next(unauthorized());
  next();
}

export async function requireAdmin(req: Request, _res: Response, next: NextFunction) {
  req.admin = await adminFromToken(req.cookies?.[COOKIE_ADMIN]);
  if (!req.admin) return next(unauthorized('Admin sign-in required.'));
  next();
}

export type Permission =
  | 'products:read'
  | 'products:write'
  | 'inventory:write'
  | 'orders:read'
  | 'orders:write'
  | 'orders:refund'
  | 'customers:read'
  | 'customers:write'
  | 'promotions:write'
  | 'analytics:read'
  | 'settings:write'
  | 'staff:manage'
  | 'audit:read';

const ALL: Permission[] = [
  'products:read',
  'products:write',
  'inventory:write',
  'orders:read',
  'orders:write',
  'orders:refund',
  'customers:read',
  'customers:write',
  'promotions:write',
  'analytics:read',
  'settings:write',
  'staff:manage',
  'audit:read',
];

export const ROLE_PERMISSIONS: Record<AdminRole, Permission[]> = {
  owner: ALL,
  manager: ALL.filter((p) => p !== 'staff:manage' && p !== 'settings:write'),
  staff: ['products:read', 'inventory:write', 'orders:read', 'orders:write', 'customers:read'],
};

export function can(admin: AuthAdmin, permission: Permission) {
  return ROLE_PERMISSIONS[admin.role]?.includes(permission) ?? false;
}

export function requirePermission(permission: Permission) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.admin) return next(unauthorized('Admin sign-in required.'));
    if (!can(req.admin, permission)) return next(forbidden());
    next();
  };
}

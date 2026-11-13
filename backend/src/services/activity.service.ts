import type { Request } from 'express';
import { ActivityLog } from '../models/Misc.js';
import { logger } from '../utils/logger.js';

/** Audit trail for admin actions. Failures are logged but never block the action. */
export async function logActivity(
  req: Request,
  action: string,
  entityType: string,
  entityId: string | undefined,
  summary: string,
  details?: Record<string, unknown>,
) {
  try {
    const admin = req.admin;
    await ActivityLog.create({
      actor: admin
        ? { type: 'admin', id: String(admin._id), name: admin.name, email: admin.email }
        : { type: 'system' },
      action,
      entityType,
      entityId,
      summary,
      details,
      ip: req.ip,
    });
  } catch (err) {
    logger.warn('Failed to write activity log', err);
  }
}

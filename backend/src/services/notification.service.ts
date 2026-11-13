import type { Types } from 'mongoose';
import { Notification } from '../models/Misc.js';
import { realtime } from '../realtime/socket.js';
import { logger } from '../utils/logger.js';

interface NotifyInput {
  type: string;
  title: string;
  message: string;
  link?: string;
  data?: Record<string, unknown>;
}

/** Persist first (so nothing is lost while offline), then push live. */
export async function notifyAdmins(input: NotifyInput) {
  try {
    const n = await Notification.create({ audience: 'admin', ...input });
    realtime.admin('notification', n.toObject());
    return n;
  } catch (err) {
    logger.warn('Failed to create admin notification', err);
    return null;
  }
}

export async function notifyUser(userId: Types.ObjectId | string, input: NotifyInput) {
  try {
    const n = await Notification.create({ audience: 'user', user: userId, ...input });
    realtime.user(String(userId), 'notification', n.toObject());
    return n;
  } catch (err) {
    logger.warn('Failed to create user notification', err);
    return null;
  }
}

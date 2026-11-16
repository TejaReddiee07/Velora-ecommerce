import type { Server as HttpServer } from 'node:http';
import { Server } from 'socket.io';
import { parseCookie } from 'cookie';
import { env } from '../config/env.js';
import { COOKIE_ADMIN, COOKIE_USER, adminFromToken, userFromToken } from '../services/session.service.js';
import { verifySocketTicket } from '../services/socket-ticket.js';
import { logger } from '../utils/logger.js';

/**
 * Socket.IO is a notification channel only — MongoDB stays the source of truth.
 * Rooms:
 *   storefront   every visitor: catalogue/price/stock/settings changes (no private data)
 *   admin        authenticated staff only: orders, notifications, analytics refresh
 *   user:<id>    the signed-in customer only: their order updates & notifications
 */
let io: Server | null = null;

export function initSocket(server: HttpServer) {
  io = new Server(server, {
    cors: { origin: env.corsOrigins, credentials: true },
    path: '/socket.io',
    serveClient: false,
  });

  io.on('connection', async (socket) => {
    socket.join('storefront');
    try {
      // A signed ticket (storefront behind a same-site proxy, where cookies never reach this host) wins;
      // otherwise the session cookies decide, exactly as before.
      const ticket = verifySocketTicket((socket.handshake.auth as { ticket?: unknown } | undefined)?.ticket);
      let user = false;
      let admin = false;
      if (ticket) {
        if (ticket.user) {
          socket.join(`user:${ticket.user}`);
          user = true;
        }
        if (ticket.admin) {
          socket.join('admin');
          admin = true;
        }
      } else {
        const cookies = parseCookie(socket.handshake.headers.cookie ?? '');
        const [u, a] = await Promise.all([userFromToken(cookies[COOKIE_USER]), adminFromToken(cookies[COOKIE_ADMIN])]);
        if (u) socket.join(`user:${String(u._id)}`);
        if (a) socket.join('admin');
        user = Boolean(u);
        admin = Boolean(a);
      }
      socket.emit('session', { user, admin });
    } catch (err) {
      logger.warn('Socket auth failed', err);
    }
    // Clients cannot join rooms themselves; no inbound events are trusted.
  });

  return io;
}

export function getIO() {
  return io;
}

export const realtime = {
  storefront(event: string, payload: unknown) {
    io?.to('storefront').emit(event, payload);
  },
  admin(event: string, payload: unknown) {
    io?.to('admin').emit(event, payload);
  },
  user(userId: string, event: string, payload: unknown) {
    io?.to(`user:${userId}`).emit(event, payload);
  },
};

export async function closeSocket() {
  if (io) {
    await io.close();
    io = null;
  }
}

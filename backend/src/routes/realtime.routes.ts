import { Router } from 'express';
import { COOKIE_ADMIN, COOKIE_USER, adminFromToken, userFromToken } from '../services/session.service.js';
import { issueSocketTicket } from '../services/socket-ticket.js';

const router = Router();

/**
 * Hands the signed-in customer / owner a one-minute ticket for the realtime socket (see services/socket-ticket.ts).
 * Visitors without a session get `{ ticket: null }` and simply join the public storefront room.
 */
router.get('/realtime/ticket', async (req, res) => {
  const [user, admin] = await Promise.all([userFromToken(req.cookies?.[COOKIE_USER]), adminFromToken(req.cookies?.[COOKIE_ADMIN])]);
  res.set('Cache-Control', 'no-store');
  res.json({ ticket: user || admin ? issueSocketTicket({ user: user ? String(user._id) : undefined, admin: admin ? String(admin._id) : undefined }) : null });
});

export default router;

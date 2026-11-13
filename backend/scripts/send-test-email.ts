// Sends one test email to ADMIN_EMAIL using the configured SMTP settings.
// Usage: EMAIL_TRANSPORT=smtp npx tsx scripts/send-test-email.ts
import { env } from '../src/config/env.js';
import { adminAlertMessage, deliverEmail, smtpActive } from '../src/services/email.service.js';

if (!env.ADMIN_EMAIL) throw new Error('ADMIN_EMAIL is not set');
if (!smtpActive()) throw new Error('SMTP is not active (set SMTP_HOST and EMAIL_TRANSPORT=smtp or auto)');
await deliverEmail(
  adminAlertMessage(
    env.ADMIN_EMAIL,
    'Email delivery is working',
    'This is a test message from your VELORA store. Order confirmations, shipping updates, password resets and stock alerts will be sent from this address.',
    `${env.CLIENT_URL}/admin`,
  ),
);
console.log(`Test email sent to ${env.ADMIN_EMAIL} via ${env.SMTP_HOST}`);

import nodemailer, { type Transporter } from 'nodemailer';
import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';
import { escapeHtml, formatMoney } from '../utils/money.js';
import type { IOrder } from '../models/Order.js';

export interface EmailMessage {
  to: string;
  subject: string;
  html: string;
  text: string;
}

let transporter: Transporter | null = null;
const sentInTest: EmailMessage[] = [];

export function smtpActive() {
  return Boolean(env.SMTP_HOST) && env.EMAIL_TRANSPORT !== 'log';
}

function getTransporter() {
  if (transporter) return transporter;
  if (smtpActive()) {
    transporter = nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      secure: env.SMTP_SECURE,
      auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASS } : undefined,
    });
  } else {
    transporter = nodemailer.createTransport({ jsonTransport: true });
  }
  return transporter;
}

/** Sends immediately. Prefer `queueEmail` from jobs/queue for request paths. */
export async function deliverEmail(message: EmailMessage) {
  if (env.isTest) {
    sentInTest.push(message);
    return;
  }
  const info = await getTransporter().sendMail({ from: env.EMAIL_FROM, ...message });
  if (!smtpActive()) {
    logger.info(`[email:dev] To: ${message.to} | ${message.subject}\n${message.text}`);
  } else {
    logger.info(`Email sent to ${message.to}: ${message.subject} (${info.messageId})`);
  }
}

export function testOutbox() {
  return sentInTest;
}

// ── Templates ──────────────────────────────────────────────────────────────

function layout(title: string, bodyHtml: string) {
  return `<!doctype html><html><body style="margin:0;background:#f6f3ee;font-family:Helvetica,Arial,sans-serif;color:#1c1917">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f6f3ee;padding:32px 0"><tr><td align="center">
<table width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border:1px solid #e7e2da">
<tr><td style="padding:28px 32px;border-bottom:1px solid #e7e2da;letter-spacing:.35em;font-size:18px;font-family:Georgia,serif">VELORA</td></tr>
<tr><td style="padding:32px"><h1 style="font-family:Georgia,serif;font-weight:400;font-size:26px;margin:0 0 16px">${escapeHtml(title)}</h1>${bodyHtml}</td></tr>
<tr><td style="padding:20px 32px;border-top:1px solid #e7e2da;font-size:12px;color:#57534e">You are receiving this email because of activity on your VELORA account.</td></tr>
</table></td></tr></table></body></html>`;
}

const button = (href: string, label: string) =>
  `<p style="margin:28px 0"><a href="${escapeHtml(href)}" style="background:#1c1917;color:#fff;text-decoration:none;padding:14px 28px;display:inline-block;letter-spacing:.12em;font-size:12px;text-transform:uppercase">${escapeHtml(label)}</a></p>`;

export function verifyEmailMessage(to: string, name: string, token: string): EmailMessage {
  const link = `${env.CLIENT_URL}/verify-email?token=${encodeURIComponent(token)}`;
  return {
    to,
    subject: 'Confirm your VELORA email address',
    html: layout(
      `Welcome, ${name}`,
      `<p>Please confirm your email address to secure your account.</p>${button(link, 'Confirm email')}<p style="font-size:13px;color:#57534e">This link expires in 24 hours.</p>`,
    ),
    text: `Welcome to VELORA, ${name}. Confirm your email: ${link} (expires in 24 hours)`,
  };
}

export function resetPasswordMessage(to: string, name: string, token: string): EmailMessage {
  const link = `${env.CLIENT_URL}/reset-password?token=${encodeURIComponent(token)}`;
  return {
    to,
    subject: 'Reset your VELORA password',
    html: layout(
      'Reset your password',
      `<p>Hello ${escapeHtml(name)}, we received a request to reset your password.</p>${button(link, 'Choose a new password')}<p style="font-size:13px;color:#57534e">This link expires in 1 hour. If you did not request this, you can ignore this email.</p>`,
    ),
    text: `Reset your VELORA password: ${link} (expires in 1 hour). If you did not request this, ignore this email.`,
  };
}

function itemsTable(order: Pick<IOrder, 'items' | 'currency'>) {
  return `<table width="100%" cellpadding="0" cellspacing="0" style="font-size:14px;margin:16px 0">${order.items
    .map(
      (i) =>
        `<tr><td style="padding:8px 0;border-bottom:1px solid #eee">${escapeHtml(i.name)}<br><span style="color:#57534e;font-size:12px">${escapeHtml(i.color)} · ${escapeHtml(i.size)} · Qty ${i.quantity}</span></td><td align="right" style="padding:8px 0;border-bottom:1px solid #eee">${formatMoney(i.lineTotal, order.currency)}</td></tr>`,
    )
    .join('')}</table>`;
}

function totalsBlock(order: IOrder) {
  const row = (label: string, value: string, bold = false) =>
    `<tr><td style="padding:4px 0;${bold ? 'font-weight:bold' : ''}">${label}</td><td align="right" style="padding:4px 0;${bold ? 'font-weight:bold' : ''}">${value}</td></tr>`;
  return `<table width="100%" style="font-size:14px">${row('Subtotal', formatMoney(order.subtotal, order.currency))}${
    order.discountTotal ? row('Discount', `−${formatMoney(order.discountTotal, order.currency)}`) : ''
  }${row('Delivery', order.shippingTotal ? formatMoney(order.shippingTotal, order.currency) : 'Free')}${
    order.taxTotal ? row(order.taxInclusive ? 'Includes tax' : 'Tax', formatMoney(order.taxTotal, order.currency)) : ''
  }${row('Total paid', formatMoney(order.total, order.currency), true)}</table>`;
}

export function orderConfirmationMessage(order: IOrder): EmailMessage {
  const link = `${env.CLIENT_URL}/account/orders/${order.orderNumber}`;
  return {
    to: order.email,
    subject: `Order confirmed — ${order.orderNumber}`,
    html: layout(
      'Thank you for your order',
      `<p>Hello ${escapeHtml(order.customerName)}, your payment was received and your order <strong>${order.orderNumber}</strong> is confirmed.</p>${itemsTable(order)}${totalsBlock(order)}<p style="margin-top:20px">Delivering to:<br>${escapeHtml(order.shippingAddress.fullName)}<br>${escapeHtml(order.shippingAddress.line1)}, ${escapeHtml(order.shippingAddress.city)} ${escapeHtml(order.shippingAddress.postalCode)}</p>${button(link, 'Track your order')}`,
    ),
    text: `Order ${order.orderNumber} confirmed. Total paid ${formatMoney(order.total, order.currency)}. Track it at ${link}`,
  };
}

const statusCopy: Record<string, { subject: string; title: string; body: string }> = {
  shipped: { subject: 'Your order is on its way', title: 'Shipped', body: 'Good news — your order has left our studio.' },
  out_for_delivery: { subject: 'Out for delivery today', title: 'Out for delivery', body: 'Your order is with the courier and arriving today.' },
  delivered: { subject: 'Your order was delivered', title: 'Delivered', body: 'Your order has been delivered. We hope you love it.' },
  cancelled: { subject: 'Your order was cancelled', title: 'Order cancelled', body: 'Your order has been cancelled. If a payment was taken, a refund has been issued to your original payment method.' },
  refunded: { subject: 'Your refund has been issued', title: 'Refund issued', body: 'A refund has been issued to your original payment method. It can take 5–10 working days to appear.' },
};

export function orderStatusMessage(order: IOrder, status: string): EmailMessage | null {
  const copy = statusCopy[status];
  if (!copy) return null;
  const link = `${env.CLIENT_URL}/account/orders/${order.orderNumber}`;
  const tracking =
    order.tracking?.number
      ? `<p>Tracking: <strong>${escapeHtml(order.tracking.carrier ?? '')} ${escapeHtml(order.tracking.number)}</strong>${
          order.tracking.url ? ` — <a href="${escapeHtml(order.tracking.url)}">track parcel</a>` : ''
        }</p>`
      : '';
  return {
    to: order.email,
    subject: `${copy.subject} — ${order.orderNumber}`,
    html: layout(copy.title, `<p>${copy.body}</p>${tracking}${itemsTable(order)}${button(link, 'View order')}`),
    text: `${copy.body} Order ${order.orderNumber}: ${link}`,
  };
}

export function adminAlertMessage(to: string, subject: string, body: string, link?: string): EmailMessage {
  return {
    to,
    subject: `[VELORA Admin] ${subject}`,
    html: layout(subject, `<p>${escapeHtml(body)}</p>${link ? button(link, 'Open dashboard') : ''}`),
    text: `${body}${link ? ` ${link}` : ''}`,
  };
}

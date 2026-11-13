export function money(minor: number | null | undefined, currency = 'GBP', opts: { compact?: boolean } = {}) {
  if (minor == null) return '—';
  const value = minor / 100;
  return new Intl.NumberFormat(currency === 'GBP' ? 'en-GB' : 'en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: opts.compact || Number.isInteger(value) ? 0 : 2,
    maximumFractionDigits: opts.compact ? 0 : 2,
    notation: opts.compact && Math.abs(value) >= 10000 ? 'compact' : 'standard',
  }).format(value);
}

export function date(value: string | Date | null | undefined, opts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short', year: 'numeric' }) {
  if (!value) return '—';
  return new Intl.DateTimeFormat('en-GB', opts).format(new Date(value));
}

export function dateTime(value: string | Date | null | undefined) {
  return date(value, { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export function relativeTime(value: string | Date) {
  const diff = (Date.now() - new Date(value).getTime()) / 1000;
  const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });
  if (diff < 60) return 'just now';
  if (diff < 3600) return rtf.format(-Math.round(diff / 60), 'minute');
  if (diff < 86400) return rtf.format(-Math.round(diff / 3600), 'hour');
  if (diff < 86400 * 30) return rtf.format(-Math.round(diff / 86400), 'day');
  return date(value);
}

export const STATUS_LABEL: Record<string, string> = {
  pending_payment: 'Awaiting payment',
  paid: 'Paid',
  processing: 'Processing',
  packed: 'Packed',
  shipped: 'Shipped',
  out_for_delivery: 'Out for delivery',
  delivered: 'Delivered',
  cancelled: 'Cancelled',
  refunded: 'Refunded',
  pending: 'Pending',
  failed: 'Failed',
  expired: 'Expired',
  partially_refunded: 'Partially refunded',
  succeeded: 'Succeeded',
};

export function statusLabel(s: string) {
  return STATUS_LABEL[s] ?? s.replace(/_/g, ' ');
}

export function cn(...parts: (string | false | null | undefined)[]) {
  return parts.filter(Boolean).join(' ');
}

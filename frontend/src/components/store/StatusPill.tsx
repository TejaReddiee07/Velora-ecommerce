import { cn, statusLabel } from '@/lib/format';

export function StatusPill({ status }: { status: string }) {
  const tone = ['delivered'].includes(status)
    ? 'bg-success/10 text-success'
    : ['cancelled', 'refunded'].includes(status)
      ? 'bg-danger/10 text-danger'
      : 'bg-sand text-graphite';
  return <span className={cn('inline-block px-2.5 py-1 text-[11px] uppercase tracking-[0.14em]', tone)}>{statusLabel(status)}</span>;
}

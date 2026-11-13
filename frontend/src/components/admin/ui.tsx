'use client';

import Link from 'next/link';
import { useEffect, useId, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, Check, ChevronLeft, ChevronRight, Clock, Search, X, XCircle, CircleDot, Package, Truck, RotateCcw } from 'lucide-react';
import { cn, statusLabel } from '@/lib/format';
import { Button } from '@/components/ui/Button';

// ── Layout primitives ──────────────────────────────────────────────────────

export function PageHeader({ title, description, actions, eyebrow }: { title: string; description?: ReactNode; actions?: ReactNode; eyebrow?: string }) {
  return (
    <header className="mb-6 flex flex-col gap-4 border-b border-line pb-5 md:flex-row md:items-end md:justify-between">
      <div className="min-w-0">
        {eyebrow && <p className="eyebrow mb-2 text-gold-deep">{eyebrow}</p>}
        <h1 className="text-[2rem] leading-tight md:text-[2.4rem]">{title}</h1>
        {description && <p className="mt-1 max-w-2xl text-[14px] text-muted">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}

export function Panel({ title, description, actions, children, className, bodyClassName }: { title?: ReactNode; description?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string; bodyClassName?: string }) {
  return (
    <section className={cn('min-w-0 border border-line bg-paper', className)}>
      {(title || actions) && (
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-line px-5 py-4">
          <div className="min-w-0">
            {title && <h2 className="font-sans text-[13px] font-semibold uppercase tracking-[0.14em] text-ink">{title}</h2>}
            {description && <p className="mt-1 text-[13px] text-muted">{description}</p>}
          </div>
          {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
        </div>
      )}
      <div className={cn('p-5', bodyClassName)}>{children}</div>
    </section>
  );
}

export function KeyValue({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 py-1.5 text-[14px]">
      <dt className="text-muted">{label}</dt>
      <dd className="text-right text-ink">{children}</dd>
    </div>
  );
}

// ── Status chips (text + icon, never colour alone) ─────────────────────────

const STATUS_STYLE: Record<string, { cls: string; Icon: typeof Check }> = {
  pending_payment: { cls: 'border-line-strong text-graphite bg-sand/60', Icon: Clock },
  pending: { cls: 'border-line-strong text-graphite bg-sand/60', Icon: Clock },
  paid: { cls: 'border-[#a7c7ad] text-success bg-[#eef6ef]', Icon: Check },
  succeeded: { cls: 'border-[#a7c7ad] text-success bg-[#eef6ef]', Icon: Check },
  processing: { cls: 'border-[#d9c49a] text-gold-deep bg-[#f8f1e3]', Icon: CircleDot },
  packed: { cls: 'border-[#d9c49a] text-gold-deep bg-[#f8f1e3]', Icon: Package },
  shipped: { cls: 'border-[#b7c4d6] text-[#1e3a5f] bg-[#eef2f7]', Icon: Truck },
  out_for_delivery: { cls: 'border-[#b7c4d6] text-[#1e3a5f] bg-[#eef2f7]', Icon: Truck },
  delivered: { cls: 'border-[#a7c7ad] text-success bg-[#eef6ef]', Icon: Check },
  cancelled: { cls: 'border-line-strong text-muted bg-sand/60', Icon: XCircle },
  expired: { cls: 'border-line-strong text-muted bg-sand/60', Icon: Clock },
  failed: { cls: 'border-[#e3b4b4] text-danger bg-[#fbeeee]', Icon: XCircle },
  refunded: { cls: 'border-[#e3b4b4] text-sale bg-[#fbeeee]', Icon: RotateCcw },
  partially_refunded: { cls: 'border-[#e3b4b4] text-sale bg-[#fbeeee]', Icon: RotateCcw },
  published: { cls: 'border-[#a7c7ad] text-success bg-[#eef6ef]', Icon: Check },
  draft: { cls: 'border-line-strong text-graphite bg-sand/60', Icon: CircleDot },
  archived: { cls: 'border-line-strong text-muted bg-sand/60', Icon: XCircle },
  active: { cls: 'border-[#a7c7ad] text-success bg-[#eef6ef]', Icon: Check },
  suspended: { cls: 'border-[#e3b4b4] text-danger bg-[#fbeeee]', Icon: XCircle },
  disabled: { cls: 'border-line-strong text-muted bg-sand/60', Icon: XCircle },
};

export function StatusChip({ status, label, className }: { status: string; label?: string; className?: string }) {
  const s = STATUS_STYLE[status] ?? { cls: 'border-line-strong text-graphite bg-sand/60', Icon: CircleDot };
  return (
    <span className={cn('inline-flex items-center gap-1.5 whitespace-nowrap border px-2 py-0.5 text-[11px] font-medium uppercase tracking-[0.08em]', s.cls, className)}>
      <s.Icon className="h-3 w-3" aria-hidden />
      {label ?? statusLabel(status)}
    </span>
  );
}

export function StockFlag({ available, threshold }: { available: number; threshold: number }) {
  if (available <= 0)
    return (
      <span className="inline-flex items-center gap-1 text-[12px] font-medium text-danger">
        <XCircle className="h-3.5 w-3.5" aria-hidden /> Out of stock
      </span>
    );
  if (available <= threshold)
    return (
      <span className="inline-flex items-center gap-1 text-[12px] font-medium text-warning">
        <AlertTriangle className="h-3.5 w-3.5" aria-hidden /> Low · {available}
      </span>
    );
  return <span className="tabular text-[12px] text-graphite">{available} available</span>;
}

// ── Tables ─────────────────────────────────────────────────────────────────

export function TableWrap({ children, className }: { children: ReactNode; className?: string }) {
  return (
    // `relative` keeps absolutely-positioned descendants (e.g. sr-only labels) inside the scroll box.
    <div className={cn('relative w-full overflow-x-auto border border-line bg-paper', className)} tabIndex={0} role="region" aria-label="Scrollable table">
      <table className="w-full min-w-[720px] border-collapse text-left text-[14px]">{children}</table>
    </div>
  );
}

export function Th({ children, className, align = 'left' }: { children?: ReactNode; className?: string; align?: 'left' | 'right' | 'center' }) {
  return (
    <th scope="col" className={cn('border-b border-line bg-sand/40 px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-graphite', align === 'right' && 'text-right', align === 'center' && 'text-center', className)}>
      {children}
    </th>
  );
}

export function Td({ children, className, align = 'left', colSpan }: { children?: ReactNode; className?: string; align?: 'left' | 'right' | 'center'; colSpan?: number }) {
  return (
    <td colSpan={colSpan} className={cn('border-b border-line px-4 py-3 align-middle', align === 'right' && 'text-right tabular', align === 'center' && 'text-center', className)}>
      {children}
    </td>
  );
}

export function TableEmpty({ colSpan, title, body }: { colSpan: number; title: string; body?: string }) {
  return (
    <tr>
      <td colSpan={colSpan} className="px-4 py-14 text-center">
        <p className="font-display text-2xl">{title}</p>
        {body && <p className="mt-1 text-[14px] text-muted">{body}</p>}
      </td>
    </tr>
  );
}

export function TableSkeleton({ rows = 6, cols = 5 }: { rows?: number; cols?: number }) {
  return (
    <>
      {Array.from({ length: rows }).map((_, r) => (
        <tr key={r}>
          {Array.from({ length: cols }).map((__, c) => (
            <td key={c} className="border-b border-line px-4 py-4">
              <div className="skeleton h-4 w-full max-w-[160px]" />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}

export function Pagination({ page, totalPages, total, onPage, label = 'results' }: { page: number; totalPages: number; total: number; onPage: (p: number) => void; label?: string }) {
  return (
    <nav className="mt-4 flex flex-wrap items-center justify-between gap-3 text-[13px] text-muted" aria-label="Pagination">
      <p className="tabular">
        {total.toLocaleString('en-GB')} {label} · page {page} of {Math.max(1, totalPages)}
      </p>
      <div className="flex items-center gap-2">
        <button type="button" onClick={() => onPage(page - 1)} disabled={page <= 1} className="inline-flex h-9 w-9 items-center justify-center border border-line-strong bg-paper text-ink transition-colors hover:border-ink disabled:opacity-40" aria-label="Previous page">
          <ChevronLeft className="h-4 w-4" />
        </button>
        <button type="button" onClick={() => onPage(page + 1)} disabled={page >= totalPages} className="inline-flex h-9 w-9 items-center justify-center border border-line-strong bg-paper text-ink transition-colors hover:border-ink disabled:opacity-40" aria-label="Next page">
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
    </nav>
  );
}

// ── Compact filter controls ────────────────────────────────────────────────

const compact = 'h-10 border border-line-strong bg-paper px-3 text-[14px] text-ink transition-colors hover:border-graphite focus:border-ink focus:outline-none';

export function SearchBox({ value, onChange, placeholder = 'Search…', label = 'Search', className }: { value: string; onChange: (v: string) => void; placeholder?: string; label?: string; className?: string }) {
  const id = useId();
  return (
    <div className={cn('relative min-w-[200px] flex-1', className)}>
      <label htmlFor={id} className="sr-only">
        {label}
      </label>
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden />
      <input id={id} type="search" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className={cn(compact, 'w-full pl-9')} />
    </div>
  );
}

export function FilterSelect<T extends string>({ label, value, onChange, options, className }: { label: string; value: T; onChange: (v: T) => void; options: { value: T; label: string }[]; className?: string }) {
  const id = useId();
  return (
    <div className={cn('flex flex-col gap-1', className)}>
      <label htmlFor={id} className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted">
        {label}
      </label>
      <select id={id} value={value} onChange={(e) => onChange(e.target.value as T)} className={cn(compact, 'pr-8')}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}

export function FilterInput({ label, className, ...rest }: React.InputHTMLAttributes<HTMLInputElement> & { label: string }) {
  const id = useId();
  return (
    <div className={cn('flex flex-col gap-1', className)}>
      <label htmlFor={id} className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted">
        {label}
      </label>
      <input id={id} className={compact} {...rest} />
    </div>
  );
}

export function Switch({ checked, onChange, label, description, disabled }: { checked: boolean; onChange: (v: boolean) => void; label: string; description?: string; disabled?: boolean }) {
  const id = useId();
  return (
    <div className="flex items-start justify-between gap-4 py-2">
      <div>
        <label htmlFor={id} className="text-[14px] text-ink">
          {label}
        </label>
        {description && <p className="text-[12px] text-muted">{description}</p>}
      </div>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cn('relative h-6 w-11 shrink-0 border transition-colors duration-200', checked ? 'border-charcoal bg-charcoal' : 'border-line-strong bg-sand')}
      >
        <span className={cn('absolute left-0 top-[2px] h-[18px] w-[18px] shadow-sm transition-transform duration-200', checked ? 'translate-x-[22px] bg-ivory' : 'translate-x-[2px] bg-paper border border-line-strong')} aria-hidden />
        <span className="sr-only">{checked ? 'On' : 'Off'}</span>
      </button>
    </div>
  );
}

export function Tabs<T extends string>({ tabs, value, onChange }: { tabs: { value: T; label: string }[]; value: T; onChange: (v: T) => void }) {
  return (
    <div role="tablist" aria-label="Sections" className="scrollbar-none mb-6 flex gap-1 overflow-x-auto border-b border-line">
      {tabs.map((t) => (
        <button
          key={t.value}
          role="tab"
          type="button"
          aria-selected={value === t.value}
          onClick={() => onChange(t.value)}
          className={cn('-mb-px whitespace-nowrap border-b-2 px-4 py-3 text-[12px] font-medium uppercase tracking-[0.14em] transition-colors', value === t.value ? 'border-ink text-ink' : 'border-transparent text-muted hover:text-ink')}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

// ── Overlays ───────────────────────────────────────────────────────────────

function useOverlay(open: boolean, onClose: () => void, panelRef: React.RefObject<HTMLDivElement | null>) {
  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    const node = panelRef.current;
    const focusable = () =>
      Array.from(node?.querySelectorAll<HTMLElement>('button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])') ?? []);
    const first = focusable()[0];
    (node?.querySelector<HTMLElement>('[data-autofocus]') ?? first ?? node)?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
      if (e.key === 'Tab') {
        const els = focusable();
        if (!els.length) return;
        const [a, b] = [els[0], els[els.length - 1]];
        if (e.shiftKey && document.activeElement === a) {
          e.preventDefault();
          b.focus();
        } else if (!e.shiftKey && document.activeElement === b) {
          e.preventDefault();
          a.focus();
        }
      }
    };
    document.addEventListener('keydown', onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = overflow;
      prev?.focus?.();
    };
  }, [open, onClose, panelRef]);
}

export function Dialog({ open, onClose, title, children, footer, size = 'md' }: { open: boolean; onClose: () => void; title: string; children: ReactNode; footer?: ReactNode; size?: 'sm' | 'md' | 'lg' }) {
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useId();
  useOverlay(open, onClose, ref);
  if (!open || typeof document === 'undefined') return null;
  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-end justify-center p-0 sm:items-center sm:p-6">
      <div className="absolute inset-0 bg-ink/50 backdrop-blur-[2px]" onClick={onClose} aria-hidden />
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={cn('relative flex max-h-[92dvh] w-full flex-col border border-line bg-paper shadow-2xl outline-none', size === 'sm' ? 'sm:max-w-md' : size === 'lg' ? 'sm:max-w-3xl' : 'sm:max-w-xl')}
      >
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <h2 id={titleId} className="text-2xl">
            {title}
          </h2>
          <button type="button" onClick={onClose} className="inline-flex h-10 w-10 items-center justify-center text-muted hover:text-ink" aria-label="Close dialog">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="overflow-y-auto px-5 py-5" data-lenis-prevent>
          {children}
        </div>
        {footer && <div className="flex flex-wrap justify-end gap-2 border-t border-line px-5 py-4">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}

export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  body,
  confirmLabel = 'Confirm',
  destructive,
  loading,
  children,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  body?: ReactNode;
  confirmLabel?: string;
  destructive?: boolean;
  loading?: boolean;
  children?: ReactNode;
}) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={title}
      size="sm"
      footer={
        <>
          <Button variant="ghost" size="sm" onClick={onClose} data-autofocus>
            Cancel
          </Button>
          <Button variant={destructive ? 'danger' : 'primary'} size="sm" onClick={onConfirm} loading={loading}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      {body && <div className="text-[15px] text-graphite">{body}</div>}
      {children}
    </Dialog>
  );
}

export function Drawer({ open, onClose, title, children, footer, width = 'md' }: { open: boolean; onClose: () => void; title: string; children: ReactNode; footer?: ReactNode; width?: 'md' | 'lg' }) {
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useId();
  useOverlay(open, onClose, ref);
  if (!open || typeof document === 'undefined') return null;
  return createPortal(
    <div className="fixed inset-0 z-[100] flex justify-end">
      <div className="absolute inset-0 bg-ink/45 backdrop-blur-[2px]" onClick={onClose} aria-hidden />
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={cn('relative flex h-full w-full flex-col border-l border-line bg-paper shadow-2xl outline-none', width === 'lg' ? 'sm:max-w-2xl' : 'sm:max-w-lg')}
      >
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <h2 id={titleId} className="text-2xl">
            {title}
          </h2>
          <button type="button" onClick={onClose} className="inline-flex h-10 w-10 items-center justify-center text-muted hover:text-ink" aria-label="Close panel">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-5" data-lenis-prevent>
          {children}
        </div>
        {footer && <div className="flex flex-wrap justify-end gap-2 border-t border-line px-5 py-4">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}

// ── Stat tile (proportional figures, sans — never the display serif) ──────

export function StatTile({ label, value, hint, tone, href }: { label: string; value: ReactNode; hint?: ReactNode; tone?: 'warning' | 'danger'; href?: string }) {
  const body = (
    <>
      <p className="text-[12px] font-medium text-muted">{label}</p>
      <p className="mt-2 font-sans text-[1.6rem] font-semibold leading-none text-ink md:text-[1.75rem]">{value}</p>
      {hint && (
        <p className={cn('mt-2 flex items-center gap-1 text-[12px]', tone === 'danger' ? 'text-danger' : tone === 'warning' ? 'text-warning' : 'text-muted')}>
          {tone && <AlertTriangle className="h-3.5 w-3.5" aria-hidden />}
          {hint}
        </p>
      )}
    </>
  );
  const cls = 'block min-w-0 border border-line bg-paper px-4 py-4 transition-colors';
  if (href)
    return (
      <Link href={href} className={cn(cls, 'hover:border-graphite')}>
        {body}
      </Link>
    );
  return <div className={cls}>{body}</div>;
}

export function Banner({ tone = 'warning', children }: { tone?: 'warning' | 'danger' | 'info'; children: ReactNode }) {
  return (
    <div
      role="status"
      className={cn(
        'mb-5 flex items-start gap-3 border px-4 py-3 text-[14px]',
        tone === 'danger' ? 'border-[#e3b4b4] bg-[#fbeeee] text-danger' : tone === 'info' ? 'border-line-strong bg-sand/50 text-graphite' : 'border-[#e6cf9f] bg-[#fbf3e2] text-warning',
      )}
    >
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
      <div>{children}</div>
    </div>
  );
}

export function useClientPortalReady() {
  return typeof document !== 'undefined';
}

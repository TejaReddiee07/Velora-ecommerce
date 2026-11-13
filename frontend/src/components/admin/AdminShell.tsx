'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  Activity,
  Bell,
  Boxes,
  ExternalLink,
  LayoutDashboard,
  LogOut,
  Menu,
  Package,
  Settings,
  ShoppingBag,
  Tag,
  Users,
  X,
} from 'lucide-react';
import { api } from '@/lib/api';
import { cn, relativeTime } from '@/lib/format';
import { Logo, Spinner } from '@/components/ui/Media';
import { reconnectRealtime } from '@/components/providers/RealtimeBridge';
import { useAdminMe, useRealtime } from '@/lib/admin/hooks';
import type { AdminNotification, Permission } from '@/lib/admin/types';

const NAV: { href: string; label: string; icon: typeof Activity; permission?: Permission }[] = [
  { href: '/admin', label: 'Dashboard', icon: LayoutDashboard, permission: 'analytics:read' },
  { href: '/admin/orders', label: 'Orders', icon: ShoppingBag, permission: 'orders:read' },
  { href: '/admin/products', label: 'Products', icon: Package, permission: 'products:read' },
  { href: '/admin/inventory', label: 'Inventory', icon: Boxes, permission: 'products:read' },
  { href: '/admin/customers', label: 'Customers', icon: Users, permission: 'customers:read' },
  { href: '/admin/promotions', label: 'Promotions', icon: Tag, permission: 'promotions:write' },
  { href: '/admin/settings', label: 'Settings', icon: Settings, permission: 'products:read' },
  { href: '/admin/activity', label: 'Activity', icon: Activity, permission: 'audit:read' },
];

function isActive(pathname: string, href: string) {
  return href === '/admin' ? pathname === '/admin' : pathname === href || pathname.startsWith(`${href}/`);
}

export function AdminShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const qc = useQueryClient();
  const { data: admin, isLoading } = useAdminMe();
  const [drawer, setDrawer] = useState(false);
  const isLogin = pathname === '/admin/login';

  useEffect(() => {
    if (!isLogin && !isLoading && admin === null) router.replace(`/admin/login?next=${encodeURIComponent(pathname)}`);
  }, [isLogin, isLoading, admin, router, pathname]);

  useEffect(() => setDrawer(false), [pathname]);

  useRealtime(['order:created'], (_e, payload) => {
    const o = payload as { orderNumber?: string; customerName?: string; _id?: string };
    toast.success(`New order ${o.orderNumber ?? ''}`, {
      description: o.customerName ? `from ${o.customerName}` : undefined,
      action: o._id ? { label: 'View', onClick: () => router.push(`/admin/orders/${o._id}`) } : undefined,
    });
    qc.invalidateQueries({ queryKey: ['admin'] });
  });

  const logout = useMutation({
    mutationFn: () => api('/admin/auth/logout', { method: 'POST' }),
    onSettled: () => {
      qc.setQueryData(['admin', 'me'], null);
      qc.removeQueries({ queryKey: ['admin'], predicate: (q) => q.queryKey[1] !== 'me' });
      reconnectRealtime();
      router.replace('/admin/login');
    },
  });

  if (isLogin) return <div className="min-h-dvh bg-ivory">{children}</div>;

  if (isLoading || !admin) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-ivory">
        <Spinner />
      </div>
    );
  }

  const nav = NAV.filter((n) => !n.permission || admin.permissions.includes(n.permission));
  const allowedHere = nav.some((n) => isActive(pathname, n.href)) || pathname === '/admin';

  const sidebar = (
    <nav aria-label="Admin" className="flex h-full flex-col">
      <div className="flex h-16 items-center justify-between border-b border-white/10 px-6">
        <Link href="/admin" className="flex items-baseline gap-2" aria-label="VELORA admin home">
          <Logo light className="text-[1.25rem]" />
        </Link>
        <span className="hidden text-[10px] uppercase tracking-[0.2em] text-ivory/50 lg:inline">Admin</span>
      </div>
      <ul className="flex-1 space-y-0.5 overflow-y-auto px-3 py-5">
        {nav.map((item) => {
          const active = isActive(pathname, item.href);
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'group flex h-11 items-center gap-3 px-3 text-[13px] tracking-[0.06em] transition-colors',
                  active ? 'bg-ivory/10 text-ivory' : 'text-ivory/65 hover:bg-ivory/5 hover:text-ivory',
                )}
              >
                <span className={cn('h-4 w-0.5 transition-colors', active ? 'bg-gold' : 'bg-transparent')} aria-hidden />
                <item.icon className="h-[18px] w-[18px]" aria-hidden />
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
      <div className="border-t border-white/10 px-3 py-4">
        <a href="/" target="_blank" rel="noreferrer" className="flex h-10 items-center gap-3 px-3 text-[13px] text-ivory/65 hover:text-ivory">
          <ExternalLink className="h-4 w-4" aria-hidden /> View storefront
        </a>
      </div>
    </nav>
  );

  return (
    <div className="min-h-dvh bg-ivory">
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 bg-ink lg:block">{sidebar}</aside>

      {drawer && (
        <div className="fixed inset-0 z-[90] lg:hidden">
          <div className="absolute inset-0 bg-ink/50" onClick={() => setDrawer(false)} aria-hidden />
          <aside className="relative h-full w-72 max-w-[85vw] bg-ink" role="dialog" aria-modal="true" aria-label="Admin navigation">
            <button type="button" onClick={() => setDrawer(false)} className="absolute right-2 top-3 z-10 inline-flex h-10 w-10 items-center justify-center text-ivory/70 hover:text-ivory" aria-label="Close navigation">
              <X className="h-5 w-5" />
            </button>
            {sidebar}
          </aside>
        </div>
      )}

      <div className="lg:pl-64">
        <header className="sticky top-0 z-30 flex h-16 items-center justify-between gap-3 border-b border-line bg-ivory/90 px-4 backdrop-blur md:px-8">
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => setDrawer(true)} className="inline-flex h-10 w-10 items-center justify-center text-ink lg:hidden" aria-label="Open navigation">
              <Menu className="h-5 w-5" />
            </button>
            <span className="eyebrow hidden text-muted sm:inline">Owner portal</span>
          </div>
          <div className="flex items-center gap-1 sm:gap-3">
            <NotificationBell />
            <div className="hidden text-right sm:block">
              <p className="text-[13px] leading-tight text-ink">{admin.name}</p>
              <p className="text-[11px] uppercase tracking-[0.12em] text-muted">{admin.role}</p>
            </div>
            <button
              type="button"
              onClick={() => logout.mutate()}
              disabled={logout.isPending}
              className="inline-flex h-10 items-center gap-2 border border-line-strong px-3 text-[12px] uppercase tracking-[0.12em] text-ink transition-colors hover:border-ink"
            >
              <LogOut className="h-4 w-4" aria-hidden />
              <span className="hidden sm:inline">Sign out</span>
            </button>
          </div>
        </header>
        <main id="main" className="mx-auto w-full max-w-[1400px] px-4 py-6 md:px-8 md:py-8">
          {allowedHere ? children : <p className="py-20 text-center text-muted">Your role does not have access to this area.</p>}
        </main>
      </div>
    </div>
  );
}

function NotificationBell() {
  const qc = useQueryClient();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const { data } = useQuery({
    queryKey: ['admin', 'notifications'],
    queryFn: () => api<{ notifications: AdminNotification[]; unread: number }>('/admin/notifications'),
    refetchInterval: 120_000,
  });
  useRealtime(['notification'], () => qc.invalidateQueries({ queryKey: ['admin', 'notifications'] }));

  const markRead = useMutation({
    mutationFn: (ids?: string[]) => api('/admin/notifications/read', { body: { ids } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'notifications'] }),
  });

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const unread = data?.unread ?? 0;
  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="relative inline-flex h-10 w-10 items-center justify-center text-ink hover:bg-sand"
        aria-label={unread ? `Notifications, ${unread} unread` : 'Notifications'}
        aria-expanded={open}
      >
        <Bell className="h-5 w-5" />
        {unread > 0 && (
          <span className="absolute right-1 top-1 min-w-[18px] bg-sale px-1 text-center text-[10px] font-semibold leading-[18px] text-white" aria-hidden>
            {unread > 99 ? '99+' : unread}
          </span>
        )}
      </button>
      {open && (
        <div className="fixed inset-x-3 top-16 z-50 border border-line bg-paper shadow-xl sm:absolute sm:inset-x-auto sm:right-0 sm:top-12 sm:w-[380px]">
          <div className="flex items-center justify-between border-b border-line px-4 py-3">
            <p className="text-[12px] font-semibold uppercase tracking-[0.14em]">Notifications</p>
            {unread > 0 && (
              <button type="button" onClick={() => markRead.mutate(undefined)} className="text-[12px] text-gold-deep underline-offset-2 hover:underline">
                Mark all read
              </button>
            )}
          </div>
          <ul className="max-h-[60vh] overflow-y-auto" data-lenis-prevent>
            {!data?.notifications.length && <li className="px-4 py-10 text-center text-[14px] text-muted">You are all caught up.</li>}
            {data?.notifications.map((n) => (
              <li key={n._id} className="border-b border-line last:border-0">
                <button
                  type="button"
                  onClick={() => {
                    if (!n.readAt) markRead.mutate([n._id]);
                    setOpen(false);
                    if (n.link) router.push(n.link);
                  }}
                  className={cn('flex w-full gap-3 px-4 py-3 text-left transition-colors hover:bg-sand/50', !n.readAt && 'bg-[#fbf5ea]')}
                >
                  <span className={cn('mt-1.5 h-2 w-2 shrink-0 rounded-full', n.readAt ? 'bg-transparent' : 'bg-gold-deep')} aria-hidden />
                  <span className="min-w-0">
                    <span className="block text-[14px] font-medium text-ink">
                      {!n.readAt && <span className="sr-only">Unread: </span>}
                      {n.title}
                    </span>
                    <span className="block text-[13px] text-graphite">{n.message}</span>
                    <span className="mt-1 block text-[12px] text-muted">{relativeTime(n.createdAt)}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

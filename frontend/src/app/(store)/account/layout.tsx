'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { useMe } from '@/lib/hooks';
import { cn } from '@/lib/format';
import { Spinner } from '@/components/ui/Media';
import { reconnectRealtime } from '@/components/providers/RealtimeBridge';

const NAV = [
  { href: '/account', label: 'Overview' },
  { href: '/account/orders', label: 'Orders' },
  { href: '/account/addresses', label: 'Addresses' },
  { href: '/wishlist', label: 'Wishlist' },
  { href: '/account/settings', label: 'Settings' },
];

export default function AccountLayout({ children }: { children: React.ReactNode }) {
  const { data: me, isLoading } = useMe();
  const router = useRouter();
  const pathname = usePathname();
  const qc = useQueryClient();

  useEffect(() => {
    if (!isLoading && !me) router.replace(`/login?next=${encodeURIComponent(pathname)}`);
  }, [isLoading, me, router, pathname]);

  const logout = useMutation({
    mutationFn: () => api('/auth/logout', { method: 'POST' }),
    onSuccess: () => {
      qc.setQueryData(['me'], null);
      qc.removeQueries({ queryKey: ['orders'] });
      qc.invalidateQueries({ queryKey: ['cart'] });
      qc.removeQueries({ queryKey: ['wishlist'] });
      reconnectRealtime();
      toast.success('You have been signed out.');
      router.push('/');
    },
  });

  if (isLoading || !me) return <div className="flex justify-center pt-[200px]"><Spinner /></div>;

  return (
    <div className="container-luxe pt-[140px]">
      <p className="eyebrow text-muted">My account</p>
      <h1 className="mt-3 text-[clamp(2.4rem,5vw,4rem)] leading-none">Hello, {me.name.split(' ')[0]}</h1>
      <div className="mt-10 grid gap-10 lg:grid-cols-[220px_1fr]">
        <nav aria-label="Account" className="flex gap-1 overflow-x-auto border-b border-line pb-2 scrollbar-none lg:flex-col lg:border-b-0 lg:border-r lg:pb-0 lg:pr-6">
          {NAV.map((n) => {
            const active = n.href === '/account' ? pathname === '/account' : pathname.startsWith(n.href);
            return (
              <Link key={n.href} href={n.href} aria-current={active ? 'page' : undefined} className={cn('whitespace-nowrap px-3 py-2.5 text-[14px] transition-colors lg:px-0', active ? 'text-ink lg:font-medium' : 'text-muted hover:text-ink')}>
                {n.label}
              </Link>
            );
          })}
          <button type="button" onClick={() => logout.mutate()} className="mt-0 whitespace-nowrap px-3 py-2.5 text-left text-[14px] text-muted hover:text-danger lg:mt-6 lg:border-t lg:border-line lg:px-0 lg:pt-6">
            Sign out
          </button>
        </nav>
        <div className="min-w-0">{children}</div>
      </div>
    </div>
  );
}

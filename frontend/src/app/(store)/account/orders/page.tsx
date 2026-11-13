'use client';

import Link from 'next/link';
import { useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { api, imageUrl } from '@/lib/api';
import { cn, date, money } from '@/lib/format';
import { ButtonLink } from '@/components/ui/Button';
import { EmptyState, Skeleton } from '@/components/ui/Media';
import type { CustomerOrder } from '@/lib/types';
import { StatusPill } from '@/components/store/StatusPill';

export default function OrdersPage() {
  const [page, setPage] = useState(1);
  const { data, isLoading } = useQuery({
    queryKey: ['orders', 'list', page],
    queryFn: () => api<{ orders: CustomerOrder[]; totalPages: number; total: number }>('/orders', { query: { page, limit: 10 } }),
    placeholderData: keepPreviousData,
  });
  if (isLoading) return <Skeleton className="h-72" />;
  if (!data?.orders.length) return <EmptyState title="No orders yet" body="When you place an order it will appear here with live tracking." action={<ButtonLink href="/new-arrivals">Start shopping</ButtonLink>} />;
  return (
    <div>
      <h2 className="mb-6 font-display text-3xl">Order history</h2>
      <ul className="space-y-4">
        {data.orders.map((o) => (
          <li key={o._id} className="border border-line bg-paper">
            <Link href={`/account/orders/${o.orderNumber}`} className="block p-5 transition-colors hover:bg-ivory">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="font-medium">{o.orderNumber}</p>
                  <p className="text-[13px] text-muted">Placed {date(o.createdAt)} · {o.items.reduce((s, i) => s + i.quantity, 0)} item(s)</p>
                </div>
                <div className="flex items-center gap-4">
                  <StatusPill status={o.status} />
                  <span className="tabular">{money(o.total, o.currency)}</span>
                </div>
              </div>
              <div className="mt-4 flex gap-2">
                {o.items.slice(0, 5).map((i) => (
                  <div key={i._id} className="h-16 w-12 bg-sand">
                    {i.image && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={imageUrl(i.image)} alt={i.name} className="h-full w-full object-cover" />
                    )}
                  </div>
                ))}
              </div>
            </Link>
          </li>
        ))}
      </ul>
      {data.totalPages > 1 && (
        <nav className="mt-8 flex gap-2" aria-label="Pagination">
          {Array.from({ length: data.totalPages }, (_, i) => i + 1).map((p) => (
            <button key={p} type="button" onClick={() => setPage(p)} aria-current={p === page ? 'page' : undefined} className={cn('h-10 w-10 border text-sm', p === page ? 'border-ink bg-ink text-ivory' : 'border-line-strong')}>
              {p}
            </button>
          ))}
        </nav>
      )}
    </div>
  );
}

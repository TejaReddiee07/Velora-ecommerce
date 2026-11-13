'use client';

import Link from 'next/link';
import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle } from 'lucide-react';
import { api } from '@/lib/api';
import { dateTime, money } from '@/lib/format';
import { useDebounced } from '@/lib/hooks';
import { useRealtime } from '@/lib/admin/hooks';
import type { OrderListItem, Paged } from '@/lib/admin/types';
import { FilterInput, FilterSelect, PageHeader, Pagination, SearchBox, StatusChip, Switch, TableEmpty, TableSkeleton, TableWrap, Td, Th } from '@/components/admin/ui';

const STATUSES = ['', 'pending_payment', 'paid', 'processing', 'packed', 'shipped', 'out_for_delivery', 'delivered', 'cancelled', 'refunded'] as const;
const PAYMENTS = ['', 'pending', 'paid', 'failed', 'expired', 'cancelled', 'partially_refunded', 'refunded'] as const;
const LABEL: Record<string, string> = {
  '': 'All',
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
};

function OrdersInner() {
  const params = useSearchParams();
  const router = useRouter();
  const qc = useQueryClient();
  const [q, setQ] = useState(params.get('q') ?? '');
  const [status, setStatus] = useState<string>(params.get('status') ?? '');
  const [payment, setPayment] = useState<string>('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [includePending, setIncludePending] = useState(false);
  const [page, setPage] = useState(1);
  const dq = useDebounced(q, 300);

  useEffect(() => setPage(1), [dq, status, payment, from, to, includePending]);

  const query = useQuery({
    queryKey: ['admin', 'orders', { dq, status, payment, from, to, includePending, page }],
    queryFn: () =>
      api<Paged<OrderListItem>>('/admin/orders', {
        query: {
          q: dq || undefined,
          status: status || undefined,
          paymentStatus: payment || undefined,
          from: from ? new Date(`${from}T00:00:00`).toISOString() : undefined,
          to: to ? new Date(`${to}T23:59:59`).toISOString() : undefined,
          includePending: includePending ? 'true' : undefined,
          page,
        },
      }),
    placeholderData: keepPreviousData,
  });

  useRealtime(['order:created', 'order:updated'], () => qc.invalidateQueries({ queryKey: ['admin', 'orders'] }));

  const data = query.data;
  return (
    <>
      <PageHeader eyebrow="Sales" title="Orders" description="Every paid order, its payment and fulfilment status. Abandoned checkouts are hidden unless you include them." />

      <div className="mb-4 flex flex-wrap items-end gap-3">
        <SearchBox value={q} onChange={setQ} placeholder="Order number, customer, email, SKU, tracking…" label="Search orders" className="basis-full sm:basis-auto" />
        <FilterSelect label="Status" value={status} onChange={setStatus} options={STATUSES.map((s) => ({ value: s, label: LABEL[s] }))} />
        <FilterSelect label="Payment" value={payment} onChange={setPayment} options={PAYMENTS.map((s) => ({ value: s, label: LABEL[s] }))} />
        <FilterInput label="From" type="date" value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} />
        <FilterInput label="To" type="date" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} />
      </div>
      <div className="mb-4 max-w-sm">
        <Switch checked={includePending} onChange={setIncludePending} label="Include abandoned checkouts" description="Show unpaid, expired and cancelled checkout attempts" />
      </div>

      <TableWrap className={query.isFetching && data ? 'opacity-70 transition-opacity' : ''}>
        <thead>
          <tr>
            <Th>Order</Th>
            <Th>Customer</Th>
            <Th>Status</Th>
            <Th>Payment</Th>
            <Th align="right">Items</Th>
            <Th align="right">Total</Th>
            <Th>Placed</Th>
          </tr>
        </thead>
        <tbody>
          {query.isLoading && <TableSkeleton cols={7} />}
          {data?.items.map((o) => (
            <tr key={o._id} className="cursor-pointer transition-colors hover:bg-sand/40" onClick={() => router.push(`/admin/orders/${o._id}`)}>
              <Td>
                <Link href={`/admin/orders/${o._id}`} className="font-medium text-ink hover:underline" onClick={(e) => e.stopPropagation()}>
                  {o.orderNumber}
                </Link>
                {o.stockConflict && (
                  <span className="ml-2 inline-flex items-center gap-1 text-[11px] font-medium text-danger">
                    <AlertTriangle className="h-3 w-3" aria-hidden /> Review
                  </span>
                )}
              </Td>
              <Td>
                <span className="block text-ink">{o.customerName}</span>
                <span className="block text-[12px] text-muted">{o.email}</span>
              </Td>
              <Td>
                <StatusChip status={o.status} />
              </Td>
              <Td>
                <StatusChip status={o.paymentStatus} />
              </Td>
              <Td align="right">{o.itemCount}</Td>
              <Td align="right">
                {money(o.total, o.currency)}
                {o.refundedTotal > 0 && <span className="block text-[12px] text-sale">−{money(o.refundedTotal, o.currency)} refunded</span>}
              </Td>
              <Td className="whitespace-nowrap text-[13px] text-muted">{dateTime(o.createdAt)}</Td>
            </tr>
          ))}
          {data && data.items.length === 0 && <TableEmpty colSpan={7} title="No orders found" body={dq || status || payment || from || to ? 'Try clearing a filter.' : 'Paid orders will appear here the moment Stripe confirms payment.'} />}
        </tbody>
      </TableWrap>
      {data && <Pagination page={data.page} totalPages={data.totalPages} total={data.total} onPage={setPage} label="orders" />}
    </>
  );
}

export default function OrdersPage() {
  return (
    <Suspense>
      <OrdersInner />
    </Suspense>
  );
}

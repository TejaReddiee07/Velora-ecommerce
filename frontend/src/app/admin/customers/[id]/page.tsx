'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ArrowLeft, BadgeCheck } from 'lucide-react';
import { api } from '@/lib/api';
import { date, dateTime, money } from '@/lib/format';
import { Button } from '@/components/ui/Button';
import { Spinner } from '@/components/ui/Media';
import { ConfirmDialog, KeyValue, Panel, StatTile, StatusChip } from '@/components/admin/ui';
import { errorMessage, useCan } from '@/lib/admin/hooks';
import type { Currency } from '@/lib/types';

interface CustomerDetail {
  customer: { _id: string; name: string; email: string; phone?: string; status: 'active' | 'suspended'; emailVerified: boolean; marketingOptIn: boolean; createdAt: string; lastLoginAt?: string };
  stats: { orders: number; totalSpent: number };
  orders: { _id: string; orderNumber: string; status: string; paymentStatus: string; total: number; currency: Currency; createdAt: string }[];
  addresses: { _id: string; label?: string; fullName: string; line1: string; line2?: string; city: string; postalCode: string; country: string; isDefault: boolean; phone?: string }[];
}

export default function CustomerDetailPage() {
  const { id } = useParams<{ id: string }>();
  const qc = useQueryClient();
  const canWrite = useCan('customers:write');
  const [confirm, setConfirm] = useState(false);
  const { data, isLoading, isError } = useQuery({ queryKey: ['admin', 'customer', id], queryFn: () => api<CustomerDetail>(`/admin/customers/${id}`) });

  const toggle = useMutation({
    mutationFn: (status: 'active' | 'suspended') => api(`/admin/customers/${id}/status`, { method: 'PATCH', body: { status } }),
    onSuccess: (_d, status) => {
      toast.success(status === 'suspended' ? 'Account suspended and signed out everywhere' : 'Account reactivated');
      setConfirm(false);
      qc.invalidateQueries({ queryKey: ['admin', 'customer', id] });
      qc.invalidateQueries({ queryKey: ['admin', 'customers'] });
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  if (isLoading)
    return (
      <div className="flex justify-center py-24">
        <Spinner />
      </div>
    );
  if (isError || !data) return <p className="py-24 text-center text-muted">Customer not found.</p>;
  const { customer: c, stats, orders, addresses } = data;
  const suspend = c.status === 'active';

  return (
    <>
      <Link href="/admin/customers" className="mb-4 inline-flex items-center gap-2 text-[13px] text-muted hover:text-ink">
        <ArrowLeft className="h-4 w-4" aria-hidden /> All customers
      </Link>
      <header className="mb-6 flex flex-col gap-4 border-b border-line pb-5 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="eyebrow mb-2 text-gold-deep">Customer</p>
          <h1 className="text-[2.2rem] leading-tight">{c.name}</h1>
          <p className="mt-1 flex flex-wrap items-center gap-2 text-[14px] text-muted">
            {c.email}
            {c.emailVerified ? (
              <span className="inline-flex items-center gap-1 text-success">
                <BadgeCheck className="h-4 w-4" aria-hidden /> Verified
              </span>
            ) : (
              <span>· email not verified</span>
            )}
            <StatusChip status={c.status} />
          </p>
        </div>
        {canWrite && (
          <Button variant={suspend ? 'ghost' : 'secondary'} size="sm" className={suspend ? 'text-danger' : ''} onClick={() => setConfirm(true)}>
            {suspend ? 'Suspend account' : 'Reactivate account'}
          </Button>
        )}
      </header>

      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatTile label="Paid orders" value={stats.orders} />
        <StatTile label="Total spent" value={money(stats.totalSpent)} hint="Net of refunds" />
        <StatTile label="Customer since" value={date(c.createdAt, { month: 'short', year: 'numeric' })} />
        <StatTile label="Last sign-in" value={c.lastLoginAt ? date(c.lastLoginAt, { day: 'numeric', month: 'short' }) : '—'} />
      </div>

      <div className="grid gap-6 xl:grid-cols-[1fr_360px]">
        <Panel title="Orders" bodyClassName="p-0">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-[14px]">
              <thead>
                <tr className="text-left">
                  {['Order', 'Status', 'Payment', 'Total', 'Placed'].map((h, i) => (
                    <th key={h} scope="col" className={`border-b border-line bg-sand/40 px-4 py-2.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-graphite ${i === 3 ? 'text-right' : ''}`}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {orders.map((o) => (
                  <tr key={o._id}>
                    <td className="border-b border-line px-4 py-3">
                      <Link href={`/admin/orders/${o._id}`} className="font-medium hover:underline">
                        {o.orderNumber}
                      </Link>
                    </td>
                    <td className="border-b border-line px-4 py-3">
                      <StatusChip status={o.status} />
                    </td>
                    <td className="border-b border-line px-4 py-3">
                      <StatusChip status={o.paymentStatus} />
                    </td>
                    <td className="tabular border-b border-line px-4 py-3 text-right">{money(o.total, o.currency)}</td>
                    <td className="border-b border-line px-4 py-3 text-[13px] text-muted">{dateTime(o.createdAt)}</td>
                  </tr>
                ))}
                {orders.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-4 py-10 text-center text-muted">
                      No orders yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Panel>

        <div className="space-y-6">
          <Panel title="Profile">
            <dl>
              <KeyValue label="Phone">{c.phone || '—'}</KeyValue>
              <KeyValue label="Marketing emails">{c.marketingOptIn ? 'Opted in' : 'Not opted in'}</KeyValue>
              <KeyValue label="Registered">{dateTime(c.createdAt)}</KeyValue>
            </dl>
          </Panel>
          <Panel title={`Addresses (${addresses.length})`}>
            {addresses.length ? (
              <ul className="space-y-4">
                {addresses.map((a) => (
                  <li key={a._id} className="text-[14px] leading-relaxed">
                    {a.isDefault && <span className="mb-1 inline-block text-[11px] uppercase tracking-[0.12em] text-gold-deep">Default</span>}
                    <address className="not-italic text-ink">
                      {a.fullName}
                      <br />
                      {a.line1}
                      {a.line2 ? `, ${a.line2}` : ''}
                      <br />
                      {a.city} {a.postalCode} · {a.country}
                    </address>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-[14px] text-muted">No saved addresses.</p>
            )}
          </Panel>
        </div>
      </div>

      <ConfirmDialog
        open={confirm}
        onClose={() => setConfirm(false)}
        onConfirm={() => toggle.mutate(suspend ? 'suspended' : 'active')}
        loading={toggle.isPending}
        destructive={suspend}
        title={suspend ? 'Suspend this account?' : 'Reactivate this account?'}
        confirmLabel={suspend ? 'Suspend' : 'Reactivate'}
        body={suspend ? `${c.name} will be signed out on every device and cannot sign in or check out until reactivated. Existing orders are unaffected.` : `${c.name} will be able to sign in and shop again.`}
      />
    </>
  );
}

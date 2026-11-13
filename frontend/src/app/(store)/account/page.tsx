'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { api, ApiError } from '@/lib/api';
import { useMe } from '@/lib/hooks';
import { date, money, statusLabel } from '@/lib/format';
import { Button } from '@/components/ui/Button';
import { Checkbox, Input, fieldErrors } from '@/components/ui/Field';
import type { CustomerOrder, User } from '@/lib/types';

export default function AccountOverview() {
  const { data: me } = useMe();
  const qc = useQueryClient();
  const [form, setForm] = useState<{ name: string; phone: string; marketingOptIn: boolean } | null>(null);
  const values = form ?? { name: me?.name ?? '', phone: me?.phone ?? '', marketingOptIn: me?.marketingOptIn ?? false };
  const { data: orders } = useQuery({
    queryKey: ['orders', 'recent'],
    queryFn: async () => (await api<{ orders: CustomerOrder[] }>('/orders', { query: { limit: 3 } })).orders,
  });
  const save = useMutation({
    mutationFn: () => api<{ user: User }>('/account/profile', { method: 'PATCH', body: { name: values.name, phone: values.phone || undefined, marketingOptIn: values.marketingOptIn } }),
    onSuccess: (d) => {
      qc.setQueryData(['me'], d.user);
      setForm(null);
      toast.success('Profile updated');
    },
  });
  const resend = useMutation({
    mutationFn: () => api<{ message: string }>('/auth/resend-verification', { method: 'POST' }),
    onSuccess: (d) => toast.success(d.message),
    onError: (e) => toast.error(e instanceof ApiError ? e.message : 'Please try again later.'),
  });
  const fe = fieldErrors(save.error instanceof ApiError ? save.error.fields : undefined);
  if (!me) return null;

  return (
    <div className="space-y-14">
      {!me.emailVerified && (
        <div className="flex flex-col gap-3 border border-gold/50 bg-champagne/30 p-5 sm:flex-row sm:items-center sm:justify-between" role="status">
          <p className="text-[14px]">Please confirm your email address ({me.email}) to secure your account.</p>
          <Button size="sm" variant="secondary" loading={resend.isPending} onClick={() => resend.mutate()}>
            Resend email
          </Button>
        </div>
      )}

      <section aria-labelledby="recent-orders">
        <div className="mb-6 flex items-end justify-between">
          <h2 id="recent-orders" className="font-display text-3xl">Recent orders</h2>
          <Link href="/account/orders" className="link-underline text-[13px] uppercase tracking-[0.16em]">All orders</Link>
        </div>
        {orders && orders.length === 0 ? (
          <p className="border border-line p-6 text-muted">You have not placed any orders yet.</p>
        ) : (
          <ul className="divide-y divide-line border-y border-line">
            {orders?.map((o) => (
              <li key={o._id}>
                <Link href={`/account/orders/${o.orderNumber}`} className="flex flex-wrap items-center justify-between gap-3 py-4 hover:bg-paper">
                  <span className="font-medium">{o.orderNumber}</span>
                  <span className="text-[14px] text-muted">{date(o.createdAt)}</span>
                  <span className="text-[14px]">{statusLabel(o.status)}</span>
                  <span className="tabular">{money(o.total, o.currency)}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="profile-heading">
        <h2 id="profile-heading" className="mb-6 font-display text-3xl">Personal information</h2>
        <form
          className="grid max-w-2xl gap-5 sm:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault();
            save.mutate();
          }}
        >
          <Input label="Full name" value={values.name} onChange={(e) => setForm({ ...values, name: e.target.value })} required error={fe.name} />
          <Input label="Phone" type="tel" value={values.phone} onChange={(e) => setForm({ ...values, phone: e.target.value })} error={fe.phone} />
          <Input label="Email" value={me.email} disabled readOnly hint={me.emailVerified ? 'Verified' : 'Not yet verified'} wrapperClassName="sm:col-span-2" />
          <div className="sm:col-span-2">
            <Checkbox label="Email me about new collections and private sales" checked={values.marketingOptIn} onChange={(v) => setForm({ ...values, marketingOptIn: v })} />
          </div>
          <div>
            <Button type="submit" loading={save.isPending} disabled={!form}>
              Save changes
            </Button>
          </div>
        </form>
        <p className="mt-6 text-[13px] text-muted">Member since {date(me.createdAt)}</p>
      </section>
    </div>
  );
}

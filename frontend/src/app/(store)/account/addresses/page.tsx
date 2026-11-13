'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { api, ApiError } from '@/lib/api';
import { Button } from '@/components/ui/Button';
import { Checkbox, Input, Select, fieldErrors } from '@/components/ui/Field';
import { Skeleton } from '@/components/ui/Media';
import type { Address } from '@/lib/types';
import { DELIVERY_COUNTRY_OPTIONS, UK_ONLY_NOTE, normalizeUkPostcode } from '@/lib/address';

// UK delivery only — the API enforces the same rule.
const COUNTRIES = DELIVERY_COUNTRY_OPTIONS;
type Form = Omit<Address, '_id'>;
const blank: Form = { label: '', fullName: '', phone: '', line1: '', line2: '', city: '', state: '', postalCode: '', country: 'GB', isDefault: false };

export default function AddressesPage() {
  const qc = useQueryClient();
  const [editing, setEditing] = useState<{ id: string | null; form: Form } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const { data, isLoading } = useQuery({ queryKey: ['addresses'], queryFn: async () => (await api<{ addresses: Address[] }>('/account/addresses')).addresses });
  const save = useMutation({
    mutationFn: () => {
      const f = editing!.form;
      const body = { ...f, label: f.label || undefined, phone: f.phone || undefined, line2: f.line2 || undefined, state: f.state || undefined };
      return editing!.id ? api(`/account/addresses/${editing!.id}`, { method: 'PUT', body }) : api('/account/addresses', { body });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['addresses'] });
      setEditing(null);
      toast.success('Address saved');
    },
  });
  const remove = useMutation({
    mutationFn: (id: string) => api(`/account/addresses/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['addresses'] });
      setConfirmDelete(null);
      toast.success('Address removed');
    },
  });
  const fe = fieldErrors(save.error instanceof ApiError ? save.error.fields : undefined);
  const set = (k: keyof Form, v: string | boolean) => setEditing((e) => (e ? { ...e, form: { ...e.form, [k]: v } } : e));

  return (
    <div>
      <div className="mb-6 flex items-end justify-between">
        <h2 className="font-display text-3xl">Saved addresses</h2>
        {!editing && <Button size="sm" variant="secondary" onClick={() => setEditing({ id: null, form: blank })}>Add address</Button>}
      </div>
      <p className="-mt-2 mb-6 text-[14px] text-muted">{UK_ONLY_NOTE}</p>
      {editing && (
        <form className="mb-10 grid gap-5 border border-line bg-paper p-6 sm:grid-cols-2" onSubmit={(e) => { e.preventDefault(); save.mutate(); }}>
          <Input label="Label" placeholder="Home, Office…" value={editing.form.label ?? ''} onChange={(e) => set('label', e.target.value)} />
          <Input label="Full name" required value={editing.form.fullName} onChange={(e) => set('fullName', e.target.value)} error={fe.fullName} />
          <Input wrapperClassName="sm:col-span-2" label="Address line 1" required autoComplete="address-line1" value={editing.form.line1} onChange={(e) => set('line1', e.target.value)} error={fe.line1} />
          <Input wrapperClassName="sm:col-span-2" label="Address line 2" autoComplete="address-line2" value={editing.form.line2 ?? ''} onChange={(e) => set('line2', e.target.value)} />
          <Input label="Town / City" required value={editing.form.city} onChange={(e) => set('city', e.target.value)} error={fe.city} />
          <Input label="County / State" value={editing.form.state ?? ''} onChange={(e) => set('state', e.target.value)} />
          <Input label="Postcode" required value={editing.form.postalCode} onChange={(e) => set('postalCode', e.target.value)} onBlur={() => { const pc = normalizeUkPostcode(editing.form.postalCode); if (pc) set('postalCode', pc); }} error={fe.postalCode} hint="UK postcode, e.g. SW1A 1AA" />
          <Select label="Country" value={editing.form.country} onChange={(e) => set('country', e.target.value)} options={COUNTRIES} hint="UK delivery only" error={fe.country} />
          <Input label="Phone" type="tel" value={editing.form.phone ?? ''} onChange={(e) => set('phone', e.target.value)} />
          <div className="flex items-end"><Checkbox label="Make this my default address" checked={editing.form.isDefault} onChange={(v) => set('isDefault', v)} /></div>
          <div className="flex gap-3 sm:col-span-2">
            <Button type="submit" loading={save.isPending}>Save address</Button>
            <Button type="button" variant="ghost" onClick={() => setEditing(null)}>Cancel</Button>
          </div>
        </form>
      )}
      {isLoading ? (
        <Skeleton className="h-40" />
      ) : !data?.length ? (
        <p className="border border-line p-6 text-muted">No saved addresses yet. Addresses you use at checkout can be saved here.</p>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2">
          {data.map((a) => (
            <li key={a._id} className="border border-line bg-paper p-5 text-[14px]">
              <p className="flex items-center justify-between font-medium">
                {a.label || a.fullName}
                {a.isDefault && <span className="text-[11px] uppercase tracking-[0.14em] text-muted">Default</span>}
              </p>
              <p className="mt-2 text-graphite">{a.fullName}</p>
              <p className="text-graphite">{a.line1}{a.line2 ? `, ${a.line2}` : ''}</p>
              <p className="text-graphite">{a.city} {a.postalCode} · {a.country}</p>
              {a.deliverable === false && (
                <p className="mt-2 text-[13px] text-danger">We can&apos;t deliver here: {a.deliveryIssue ?? 'UK addresses only.'} Edit it with a UK address or remove it.</p>
              )}
              <div className="mt-4 flex gap-4">
                <button type="button" className="link-underline text-[13px]" onClick={() => setEditing({ id: a._id, form: { ...blank, ...a, country: 'GB' } })}>Edit</button>
                {confirmDelete === a._id ? (
                  <span className="flex items-center gap-3 text-[13px]">
                    Remove this address?
                    <button type="button" className="text-danger underline" onClick={() => remove.mutate(a._id)}>Yes, remove</button>
                    <button type="button" className="underline" onClick={() => setConfirmDelete(null)}>Keep</button>
                  </span>
                ) : (
                  <button type="button" className="link-underline text-[13px] text-danger" onClick={() => setConfirmDelete(a._id)}>Remove</button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

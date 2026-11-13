'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { api, ApiError } from '@/lib/api';
import { dateTime, money } from '@/lib/format';
import { Button } from '@/components/ui/Button';
import { Input, Select, fieldErrors } from '@/components/ui/Field';
import { ConfirmDialog, Drawer, PageHeader, StatusChip, Switch, TableEmpty, TableSkeleton, TableWrap, Td, Th } from '@/components/admin/ui';
import { errorMessage, toLocalInput, toMajor, toMinor } from '@/lib/admin/hooks';
import type { Coupon } from '@/lib/admin/types';

interface FormState {
  code: string;
  description: string;
  kind: 'code' | 'automatic';
  type: 'percentage' | 'fixed';
  value: string;
  minOrderValue: string;
  startsAt: string;
  expiresAt: string;
  usageLimit: string;
  perUserLimit: string;
  isActive: boolean;
}

const EMPTY: FormState = { code: '', description: '', kind: 'code', type: 'percentage', value: '10', minOrderValue: '', startsAt: '', expiresAt: '', usageLimit: '', perUserLimit: '', isActive: true };

function liveState(c: Coupon) {
  const now = Date.now();
  if (!c.isActive) return { status: 'disabled', label: 'Inactive' };
  if (c.startsAt && new Date(c.startsAt).getTime() > now) return { status: 'pending', label: 'Scheduled' };
  if (c.expiresAt && new Date(c.expiresAt).getTime() <= now) return { status: 'expired', label: 'Expired' };
  if (c.usageLimit != null && c.usageCount >= c.usageLimit) return { status: 'expired', label: 'Used up' };
  return { status: 'active', label: 'Live' };
}

export default function PromotionsPage() {
  const qc = useQueryClient();
  const [editing, setEditing] = useState<Coupon | 'new' | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [confirmDelete, setConfirmDelete] = useState<Coupon | null>(null);

  const { data, isLoading } = useQuery({ queryKey: ['admin', 'coupons'], queryFn: async () => (await api<{ coupons: Coupon[] }>('/admin/coupons')).coupons });

  function openForm(c: Coupon | 'new') {
    setErrors({});
    setEditing(c);
    setForm(
      c === 'new'
        ? EMPTY
        : {
            code: c.code,
            description: c.description ?? '',
            kind: c.kind,
            type: c.type,
            value: c.type === 'fixed' ? toMajor(c.value) : String(c.value),
            minOrderValue: c.minOrderValue ? toMajor(c.minOrderValue) : '',
            startsAt: toLocalInput(c.startsAt),
            expiresAt: toLocalInput(c.expiresAt),
            usageLimit: c.usageLimit != null ? String(c.usageLimit) : '',
            perUserLimit: c.perUserLimit != null ? String(c.perUserLimit) : '',
            isActive: c.isActive,
          },
    );
  }

  const save = useMutation({
    mutationFn: async () => {
      const body = {
        code: form.code.trim().toUpperCase(),
        description: form.description.trim() || undefined,
        kind: form.kind,
        type: form.type,
        value: form.type === 'fixed' ? toMinor(form.value) ?? 0 : Number.parseInt(form.value, 10) || 0,
        minOrderValue: toMinor(form.minOrderValue) ?? 0,
        startsAt: form.startsAt ? new Date(form.startsAt).toISOString() : null,
        expiresAt: form.expiresAt ? new Date(form.expiresAt).toISOString() : null,
        usageLimit: form.usageLimit ? Number.parseInt(form.usageLimit, 10) : null,
        perUserLimit: form.perUserLimit ? Number.parseInt(form.perUserLimit, 10) : null,
        isActive: form.isActive,
      };
      if (editing && editing !== 'new') return api(`/admin/coupons/${editing._id}`, { method: 'PUT', body });
      return api('/admin/coupons', { body });
    },
    onSuccess: () => {
      toast.success(editing === 'new' ? 'Promotion created' : 'Promotion saved');
      setEditing(null);
      qc.invalidateQueries({ queryKey: ['admin', 'coupons'] });
    },
    onError: (e) => {
      if (e instanceof ApiError) setErrors(fieldErrors(e.fields));
      toast.error(errorMessage(e));
    },
  });

  const remove = useMutation({
    mutationFn: (id: string) => api(`/admin/coupons/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      toast.success('Promotion deleted');
      setConfirmDelete(null);
      qc.invalidateQueries({ queryKey: ['admin', 'coupons'] });
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setForm((f) => ({ ...f, [k]: v }));

  return (
    <>
      <PageHeader
        eyebrow="Marketing"
        title="Promotions"
        description="Discount codes customers enter at checkout, and automatic seasonal sales applied to every eligible bag. Discounts never stack — the better one wins."
        actions={
          <Button size="sm" onClick={() => openForm('new')} icon={<Plus className="h-4 w-4" aria-hidden />}>
            New promotion
          </Button>
        }
      />

      <TableWrap>
        <thead>
          <tr>
            <Th>Code</Th>
            <Th>Type</Th>
            <Th>Discount</Th>
            <Th align="right">Min. order</Th>
            <Th>Window</Th>
            <Th align="right">Used</Th>
            <Th>Status</Th>
            <Th align="right">
              <span className="sr-only">Actions</span>
            </Th>
          </tr>
        </thead>
        <tbody>
          {isLoading && <TableSkeleton cols={8} />}
          {data?.map((c) => {
            const s = liveState(c);
            return (
              <tr key={c._id}>
                <Td>
                  <span className="font-mono text-[13px] font-semibold">{c.code}</span>
                  {c.description && <span className="block text-[12px] text-muted">{c.description}</span>}
                </Td>
                <Td>{c.kind === 'automatic' ? 'Seasonal sale (automatic)' : 'Code'}</Td>
                <Td className="tabular">{c.type === 'percentage' ? `${c.value}% off` : `${money(c.value)} off`}</Td>
                <Td align="right">{c.minOrderValue ? money(c.minOrderValue) : '—'}</Td>
                <Td className="text-[12px] text-muted">
                  {c.startsAt ? dateTime(c.startsAt) : 'Now'} → {c.expiresAt ? dateTime(c.expiresAt) : 'No end'}
                </Td>
                <Td align="right">
                  {c.usageCount}
                  {c.usageLimit != null ? ` / ${c.usageLimit}` : ''}
                </Td>
                <Td>
                  <StatusChip status={s.status} label={s.label} />
                </Td>
                <Td align="right">
                  <div className="flex justify-end gap-1">
                    <button type="button" onClick={() => openForm(c)} className="inline-flex h-9 w-9 items-center justify-center text-graphite hover:bg-sand hover:text-ink" aria-label={`Edit ${c.code}`}>
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button type="button" onClick={() => setConfirmDelete(c)} className="inline-flex h-9 w-9 items-center justify-center text-graphite hover:bg-[#fbeeee] hover:text-danger" aria-label={`Delete ${c.code}`}>
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </Td>
              </tr>
            );
          })}
          {data && data.length === 0 && <TableEmpty colSpan={8} title="No promotions" body="Create a discount code or a seasonal sale." />}
        </tbody>
      </TableWrap>

      <Drawer
        open={editing !== null}
        onClose={() => setEditing(null)}
        title={editing === 'new' ? 'New promotion' : 'Edit promotion'}
        footer={
          <>
            <Button variant="ghost" size="sm" onClick={() => setEditing(null)}>
              Cancel
            </Button>
            <Button size="sm" loading={save.isPending} onClick={() => save.mutate()} disabled={form.code.trim().length < 3 || !form.value}>
              Save
            </Button>
          </>
        }
      >
        <form
          className="space-y-5"
          onSubmit={(e) => {
            e.preventDefault();
            save.mutate();
          }}
        >
          <Select
            label="Kind"
            value={form.kind}
            onChange={(e) => set('kind', e.target.value as FormState['kind'])}
            options={[
              { value: 'code', label: 'Discount code — customer enters it' },
              { value: 'automatic', label: 'Seasonal sale — applied automatically' },
            ]}
            hint={form.kind === 'automatic' ? 'Applies to every bag that meets the minimum spend during the window. The code is used as an internal name.' : undefined}
          />
          <Input label={form.kind === 'automatic' ? 'Internal name' : 'Code'} required value={form.code} onChange={(e) => set('code', e.target.value.toUpperCase().replace(/[^A-Z0-9_-]/g, ''))} error={errors.code} data-autofocus maxLength={40} />
          <Input label="Description" value={form.description} onChange={(e) => set('description', e.target.value)} hint="Shown to customers in the bag" maxLength={200} />
          <div className="grid gap-4 sm:grid-cols-2">
            <Select
              label="Discount type"
              value={form.type}
              onChange={(e) => set('type', e.target.value as FormState['type'])}
              options={[
                { value: 'percentage', label: 'Percentage' },
                { value: 'fixed', label: 'Fixed amount (£)' },
              ]}
            />
            <Input label={form.type === 'percentage' ? 'Percent off (1–90)' : 'Amount off (£)'} required inputMode="decimal" value={form.value} onChange={(e) => set('value', e.target.value)} error={errors.value} />
          </div>
          <Input label="Minimum order (£)" inputMode="decimal" value={form.minOrderValue} onChange={(e) => set('minOrderValue', e.target.value)} hint="Leave blank for no minimum" />
          <div className="grid gap-4 sm:grid-cols-2">
            <Input label="Starts" type="datetime-local" value={form.startsAt} onChange={(e) => set('startsAt', e.target.value)} hint="Blank = immediately" />
            <Input label="Expires" type="datetime-local" value={form.expiresAt} onChange={(e) => set('expiresAt', e.target.value)} error={errors.expiresAt} hint="Blank = never" />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Input label="Total uses" inputMode="numeric" value={form.usageLimit} onChange={(e) => set('usageLimit', e.target.value.replace(/[^0-9]/g, ''))} hint="Blank = unlimited" />
            <Input label="Uses per customer" inputMode="numeric" value={form.perUserLimit} onChange={(e) => set('perUserLimit', e.target.value.replace(/[^0-9]/g, ''))} hint="Blank = unlimited" />
          </div>
          <Switch checked={form.isActive} onChange={(v) => set('isActive', v)} label="Active" description="Inactive promotions are never applied" />
        </form>
      </Drawer>

      <ConfirmDialog
        open={Boolean(confirmDelete)}
        onClose={() => setConfirmDelete(null)}
        onConfirm={() => confirmDelete && remove.mutate(confirmDelete._id)}
        loading={remove.isPending}
        destructive
        title="Delete promotion?"
        confirmLabel="Delete"
        body={`${confirmDelete?.code} will stop working immediately. Past orders keep their discount records.`}
      />
    </>
  );
}

'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { UserPlus } from 'lucide-react';
import { api, ApiError } from '@/lib/api';
import { dateTime } from '@/lib/format';
import { Button } from '@/components/ui/Button';
import { Input, Select, fieldErrors } from '@/components/ui/Field';
import { errorMessage, useAdminMe } from '@/lib/admin/hooks';
import type { StaffMember } from '@/lib/admin/types';
import { ConfirmDialog, Dialog, Panel, StatusChip } from './ui';

const ROLE_HELP: Record<StaffMember['role'], string> = {
  owner: 'Everything, including settings and staff',
  manager: 'Everything except settings and staff',
  staff: 'Orders, stock and read-only products & customers',
};

export function StaffManager() {
  const qc = useQueryClient();
  const { data: me } = useAdminMe();
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ name: '', email: '', password: '', role: 'staff' as StaffMember['role'] });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [confirm, setConfirm] = useState<{ member: StaffMember; patch: { role?: StaffMember['role']; status?: 'active' | 'disabled' } } | null>(null);

  const { data, isLoading } = useQuery({ queryKey: ['admin', 'staff'], queryFn: async () => (await api<{ staff: StaffMember[] }>('/admin/staff')).staff });

  const add = useMutation({
    mutationFn: () => api('/admin/staff', { body: form }),
    onSuccess: () => {
      toast.success('Team member added');
      setAdding(false);
      setForm({ name: '', email: '', password: '', role: 'staff' });
      qc.invalidateQueries({ queryKey: ['admin', 'staff'] });
    },
    onError: (e) => {
      if (e instanceof ApiError) setErrors(fieldErrors(e.fields));
      toast.error(errorMessage(e));
    },
  });

  const update = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: { role?: string; status?: string } }) => api(`/admin/staff/${id}`, { method: 'PATCH', body: patch }),
    onSuccess: () => {
      toast.success('Team member updated');
      setConfirm(null);
      qc.invalidateQueries({ queryKey: ['admin', 'staff'] });
    },
    onError: (e) => {
      setConfirm(null);
      toast.error(errorMessage(e));
    },
  });

  return (
    <Panel
      title="Team"
      description="Staff sign in at /admin with their own credentials. Every action is recorded in the activity log."
      actions={
        <Button size="sm" onClick={() => setAdding(true)} icon={<UserPlus className="h-4 w-4" aria-hidden />}>
          Add member
        </Button>
      }
      bodyClassName="p-0"
    >
      <div className="relative overflow-x-auto">
        <table className="w-full min-w-[680px] text-[14px]">
          <thead>
            <tr className="text-left">
              {['Name', 'Role', 'Status', 'Last sign-in', ''].map((h) => (
                <th key={h || 'actions'} scope="col" className="border-b border-line bg-sand/40 px-4 py-2.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-graphite">
                  {h || <span className="sr-only">Actions</span>}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr>
                <td colSpan={5} className="px-4 py-6">
                  <div className="skeleton h-5" />
                </td>
              </tr>
            )}
            {data?.map((m) => {
              const self = m._id === me?._id;
              return (
                <tr key={m._id}>
                  <td className="border-b border-line px-4 py-3">
                    <span className="block text-ink">
                      {m.name} {self && <span className="text-[12px] text-muted">(you)</span>}
                    </span>
                    <span className="text-[12px] text-muted">{m.email}</span>
                  </td>
                  <td className="border-b border-line px-4 py-3">
                    {self ? (
                      <span className="capitalize">{m.role}</span>
                    ) : (
                      <label className="sr-only" htmlFor={`role-${m._id}`}>
                        Role for {m.name}
                      </label>
                    )}
                    {!self && (
                      <select id={`role-${m._id}`} value={m.role} onChange={(e) => setConfirm({ member: m, patch: { role: e.target.value as StaffMember['role'] } })} className="h-9 border border-line-strong bg-paper px-2 text-[14px] capitalize">
                        <option value="owner">Owner</option>
                        <option value="manager">Manager</option>
                        <option value="staff">Staff</option>
                      </select>
                    )}
                  </td>
                  <td className="border-b border-line px-4 py-3">
                    <StatusChip status={m.status} />
                  </td>
                  <td className="border-b border-line px-4 py-3 text-[13px] text-muted">{m.lastLoginAt ? dateTime(m.lastLoginAt) : 'Never'}</td>
                  <td className="border-b border-line px-4 py-3 text-right">
                    {!self && (
                      <button type="button" onClick={() => setConfirm({ member: m, patch: { status: m.status === 'active' ? 'disabled' : 'active' } })} className="h-9 border border-line-strong px-3 text-[11px] uppercase tracking-[0.1em] hover:border-ink">
                        {m.status === 'active' ? 'Disable' : 'Enable'}
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <Dialog
        open={adding}
        onClose={() => setAdding(false)}
        title="Add team member"
        footer={
          <>
            <Button variant="ghost" size="sm" onClick={() => setAdding(false)}>
              Cancel
            </Button>
            <Button size="sm" loading={add.isPending} onClick={() => add.mutate()} disabled={!form.name || !form.email || form.password.length < 8}>
              Add member
            </Button>
          </>
        }
      >
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            add.mutate();
          }}
        >
          <Input label="Full name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} error={errors.name} data-autofocus />
          <Input label="Email" type="email" autoComplete="off" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} error={errors.email} />
          <Input label="Temporary password" type="password" autoComplete="new-password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} error={errors.password} hint="8+ characters with a letter and a number" />
          <Select label="Role" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as StaffMember['role'] })} options={(['staff', 'manager', 'owner'] as const).map((r) => ({ value: r, label: `${r[0].toUpperCase()}${r.slice(1)} — ${ROLE_HELP[r]}` }))} />
        </form>
      </Dialog>

      <ConfirmDialog
        open={Boolean(confirm)}
        onClose={() => setConfirm(null)}
        onConfirm={() => confirm && update.mutate({ id: confirm.member._id, patch: confirm.patch })}
        loading={update.isPending}
        destructive={confirm?.patch.status === 'disabled'}
        title={confirm?.patch.status ? (confirm.patch.status === 'disabled' ? 'Disable access?' : 'Restore access?') : 'Change role?'}
        confirmLabel="Confirm"
        body={
          confirm?.patch.status === 'disabled'
            ? `${confirm.member.name} will be signed out immediately and cannot sign in.`
            : confirm?.patch.role
              ? `${confirm.member.name} will become ${confirm.patch.role}: ${ROLE_HELP[confirm.patch.role]}.`
              : `${confirm?.member.name} will be able to sign in again.`
        }
      />
    </Panel>
  );
}

'use client';

import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { toast } from 'sonner';
import { api, ApiError } from '@/lib/api';
import { Button } from '@/components/ui/Button';
import { Input, fieldErrors } from '@/components/ui/Field';

export default function AccountSettingsPage() {
  const [currentPassword, setCurrent] = useState('');
  const [newPassword, setNew] = useState('');
  const m = useMutation({
    mutationFn: () => api<{ message: string }>('/account/change-password', { body: { currentPassword, newPassword } }),
    onSuccess: (d) => {
      toast.success(d.message);
      setCurrent('');
      setNew('');
    },
  });
  const err = m.error instanceof ApiError ? m.error : null;
  const fe = fieldErrors(err?.fields);
  return (
    <div className="max-w-md">
      <h2 className="mb-6 font-display text-3xl">Change password</h2>
      <form className="space-y-5" onSubmit={(e) => { e.preventDefault(); m.mutate(); }}>
        {err && !err.fields && <p role="alert" className="text-[14px] text-danger">{err.message}</p>}
        <Input label="Current password" type="password" autoComplete="current-password" value={currentPassword} onChange={(e) => setCurrent(e.target.value)} required />
        <Input label="New password" type="password" autoComplete="new-password" value={newPassword} onChange={(e) => setNew(e.target.value)} required error={fe.newPassword} hint="At least 8 characters, including a letter and a number." />
        <Button type="submit" loading={m.isPending}>Update password</Button>
      </form>
      <p className="mt-8 text-[13px] text-muted">Changing your password signs you out of every other device.</p>
    </div>
  );
}

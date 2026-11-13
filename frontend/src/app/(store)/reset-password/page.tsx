'use client';

import Link from 'next/link';
import { Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useMutation } from '@tanstack/react-query';
import { api, ApiError } from '@/lib/api';
import { Button } from '@/components/ui/Button';
import { Input, fieldErrors } from '@/components/ui/Field';
import { AuthShell, FormError } from '@/components/store/AuthShell';

function ResetForm() {
  const token = useSearchParams().get('token') ?? '';
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [mismatch, setMismatch] = useState(false);
  const m = useMutation({ mutationFn: () => api<{ message: string }>('/auth/reset-password', { body: { token, password } }) });
  const err = m.error instanceof ApiError ? m.error : null;
  if (!token) return <FormError message="This reset link is incomplete. Please request a new one." />;
  if (m.isSuccess)
    return (
      <div className="space-y-6">
        <p className="border border-line bg-paper p-5 text-graphite" role="status">{m.data.message}</p>
        <Link href="/login" className="link-underline">Sign in</Link>
      </div>
    );
  return (
    <form
      className="space-y-5"
      onSubmit={(e) => {
        e.preventDefault();
        if (password !== confirm) return setMismatch(true);
        setMismatch(false);
        m.mutate();
      }}
    >
      <FormError message={err && !err.fields ? err.message : null} />
      <Input label="New password" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} required error={fieldErrors(err?.fields).password} hint="At least 8 characters, including a letter and a number." />
      <Input label="Confirm password" type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required error={mismatch ? 'Passwords do not match.' : undefined} />
      <Button type="submit" full size="lg" loading={m.isPending}>Update password</Button>
    </form>
  );
}

export default function ResetPasswordPage() {
  return (
    <AuthShell title="Choose a new password">
      <Suspense>
        <ResetForm />
      </Suspense>
    </AuthShell>
  );
}

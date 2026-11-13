'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { api, ApiError } from '@/lib/api';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Field';
import { AuthShell, FormError } from '@/components/store/AuthShell';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const m = useMutation({ mutationFn: () => api<{ message: string }>('/auth/forgot-password', { body: { email } }) });
  return (
    <AuthShell title="Reset your password" subtitle="Enter your email and we will send you a secure link to choose a new password.">
      {m.isSuccess ? (
        <div className="space-y-6">
          <p className="border border-line bg-paper p-5 text-graphite" role="status">
            {m.data.message}
          </p>
          <Link href="/login" className="link-underline text-[14px]">
            Return to sign in
          </Link>
        </div>
      ) : (
        <form
          className="space-y-5"
          onSubmit={(e) => {
            e.preventDefault();
            m.mutate();
          }}
        >
          <FormError message={m.error instanceof ApiError ? (m.error.fields?.[0]?.message ?? m.error.message) : null} />
          <Input label="Email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          <Button type="submit" full size="lg" loading={m.isPending}>
            Send reset link
          </Button>
          <p className="text-center text-[14px]">
            <Link href="/login" className="link-underline text-muted">
              Back to sign in
            </Link>
          </p>
        </form>
      )}
    </AuthShell>
  );
}

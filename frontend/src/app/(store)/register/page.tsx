'use client';

import Link from 'next/link';
import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { api, ApiError } from '@/lib/api';
import { Button } from '@/components/ui/Button';
import { Checkbox, Input, fieldErrors } from '@/components/ui/Field';
import { AuthShell, FormError, safeNext } from '@/components/store/AuthShell';
import { reconnectRealtime } from '@/components/providers/RealtimeBridge';
import type { User } from '@/lib/types';

function RegisterForm() {
  const router = useRouter();
  const params = useSearchParams();
  const qc = useQueryClient();
  const [form, setForm] = useState({ name: '', email: '', password: '', marketingOptIn: false });
  const reg = useMutation({
    mutationFn: () => api<{ user: User }>('/auth/register', { body: form }),
    onSuccess: (d) => {
      qc.setQueryData(['me'], d.user);
      qc.invalidateQueries({ queryKey: ['cart'] });
      reconnectRealtime();
      toast.success('Welcome to VELORA. Please check your email to confirm your address.');
      router.push(safeNext(params.get('next')));
    },
  });
  const err = reg.error instanceof ApiError ? reg.error : null;
  const fields = fieldErrors(err?.fields);
  return (
    <form
      className="space-y-5"
      onSubmit={(e) => {
        e.preventDefault();
        reg.mutate();
      }}
      noValidate
    >
      <FormError message={err && !err.fields ? err.message : null} />
      <Input label="Full name" autoComplete="name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required error={fields.name} />
      <Input label="Email" type="email" autoComplete="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required error={fields.email} />
      <Input label="Password" type="password" autoComplete="new-password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required error={fields.password} hint="At least 8 characters, including a letter and a number." />
      <Checkbox label="Send me news about collections and private sales" checked={form.marketingOptIn} onChange={(v) => setForm({ ...form, marketingOptIn: v })} />
      <Button type="submit" full size="lg" loading={reg.isPending}>
        Create account
      </Button>
      <p className="text-center text-[12px] text-muted">By creating an account you agree to our terms and privacy policy.</p>
      <p className="pt-2 text-center text-[14px] text-muted">
        Already have an account?{' '}
        <Link href="/login" className="link-underline text-ink">
          Sign in
        </Link>
      </p>
    </form>
  );
}

export default function RegisterPage() {
  return (
    <AuthShell title="Create your account" subtitle="Faster checkout, order tracking and a wishlist that follows you.">
      <Suspense>
        <RegisterForm />
      </Suspense>
    </AuthShell>
  );
}

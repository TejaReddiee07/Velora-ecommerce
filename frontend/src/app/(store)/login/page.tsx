'use client';

import Link from 'next/link';
import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '@/lib/api';
import { Button } from '@/components/ui/Button';
import { Input, fieldErrors } from '@/components/ui/Field';
import { AuthShell, FormError, safeNext } from '@/components/store/AuthShell';
import { reconnectRealtime } from '@/components/providers/RealtimeBridge';
import type { User } from '@/lib/types';
import type { AdminUser } from '@/lib/admin/types';

type LoginResult = { role: 'admin'; admin: AdminUser } | { role?: 'customer'; user: User };

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const qc = useQueryClient();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const login = useMutation({
    mutationFn: () => api<LoginResult>('/auth/login', { body: { email, password } }),
    onSuccess: (d) => {
      if (d.role === 'admin') {
        // Owner / staff credentials: straight into the owner portal.
        qc.setQueryData(['admin', 'me'], d.admin);
        reconnectRealtime();
        const next = params.get('next');
        router.push(next && next.startsWith('/admin') && !next.startsWith('/admin/login') ? next : '/admin');
        return;
      }
      qc.setQueryData(['me'], d.user);
      qc.invalidateQueries({ queryKey: ['cart'] });
      qc.invalidateQueries({ queryKey: ['wishlist'] });
      reconnectRealtime();
      router.push(safeNext(params.get('next')));
    },
  });
  const err = login.error instanceof ApiError ? login.error : null;
  const fields = fieldErrors(err?.fields);
  return (
    <form
      className="space-y-5"
      onSubmit={(e) => {
        e.preventDefault();
        login.mutate();
      }}
      noValidate
    >
      <FormError message={err && !err.fields ? err.message : null} />
      <Input label="Email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required error={fields.email} />
      <Input label="Password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required error={fields.password} />
      <div className="flex justify-end">
        <Link href="/forgot-password" className="link-underline text-[13px] text-graphite">
          Forgotten your password?
        </Link>
      </div>
      <Button type="submit" full size="lg" loading={login.isPending}>
        Sign in
      </Button>
      <p className="pt-4 text-center text-[14px] text-muted">
        New to VELORA?{' '}
        <Link href={`/register${params.get('next') ? `?next=${encodeURIComponent(params.get('next')!)}` : ''}`} className="link-underline text-ink">
          Create an account
        </Link>
      </p>
    </form>
  );
}

export default function LoginPage() {
  return (
    <AuthShell title="Welcome back" subtitle="Sign in to track orders, save your wishlist and check out faster.">
      <Suspense>
        <LoginForm />
      </Suspense>
    </AuthShell>
  );
}

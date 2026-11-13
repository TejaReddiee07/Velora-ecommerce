'use client';

import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { Lock } from 'lucide-react';
import { api, ApiError } from '@/lib/api';
import { Button } from '@/components/ui/Button';
import { Input, fieldErrors } from '@/components/ui/Field';
import { Logo } from '@/components/ui/Media';
import { reconnectRealtime } from '@/components/providers/RealtimeBridge';
import type { AdminUser } from '@/lib/admin/types';

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const qc = useQueryClient();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setFields({});
    setLoading(true);
    try {
      const { admin } = await api<{ admin: AdminUser }>('/admin/auth/login', { body: { email, password } });
      qc.setQueryData(['admin', 'me'], admin);
      reconnectRealtime();
      const next = params.get('next');
      router.replace(next && next.startsWith('/admin') && !next.startsWith('/admin/login') ? next : '/admin');
    } catch (err) {
      if (err instanceof ApiError) {
        setFields(fieldErrors(err.fields));
        setError(
          err.status === 423
            ? 'This account is temporarily locked after too many failed attempts. Try again in 15 minutes.'
            : err.status === 429
              ? 'Too many sign-in attempts. Please wait a few minutes.'
              : err.message,
        );
      } else setError('Something went wrong. Please try again.');
      setLoading(false);
    }
  }

  return (
    <div className="grid min-h-dvh lg:grid-cols-[1.1fr_1fr]">
      <div className="relative hidden overflow-hidden bg-ink lg:block">
        <div className="grain absolute inset-0" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_30%_20%,rgba(176,141,87,0.22),transparent_55%),radial-gradient(ellipse_at_80%_90%,rgba(233,220,196,0.10),transparent_50%)]" />
        <div className="relative flex h-full flex-col justify-between p-14">
          <Logo light />
          <div>
            <p className="eyebrow mb-5 text-gold">Owner portal</p>
            <h1 className="max-w-md text-6xl leading-[1.02] text-ivory">
              Run the house,
              <br />
              <em className="text-champagne">beautifully.</em>
            </h1>
            <p className="mt-6 max-w-sm text-[15px] text-ivory/60">Products, inventory, orders and revenue — every change you make appears on the storefront in real time.</p>
          </div>
          <p className="text-[12px] text-ivory/40">Authorised staff only. All actions are recorded in the audit log.</p>
        </div>
      </div>

      <div className="flex items-center justify-center px-4 py-16 sm:px-10">
        <form onSubmit={submit} className="w-full max-w-sm" noValidate>
          <div className="mb-10 lg:hidden">
            <Logo />
          </div>
          <p className="eyebrow mb-3 flex items-center gap-2 text-gold-deep">
            <Lock className="h-3.5 w-3.5" aria-hidden /> Secure sign in
          </p>
          <h2 className="mb-8 text-4xl">Welcome back</h2>
          {error && (
            <p role="alert" className="mb-6 border border-[#e3b4b4] bg-[#fbeeee] px-4 py-3 text-[14px] text-danger">
              {error}
            </p>
          )}
          <div className="space-y-5">
            <Input label="Email" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required error={fields.email} autoFocus />
            <Input label="Password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required error={fields.password} />
          </div>
          <Button type="submit" full size="lg" className="mt-8" loading={loading} disabled={!email || !password}>
            Sign in
          </Button>
        </form>
      </div>
    </div>
  );
}

export default function AdminLoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}

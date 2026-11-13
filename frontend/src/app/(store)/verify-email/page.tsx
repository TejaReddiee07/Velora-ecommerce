'use client';

import Link from 'next/link';
import { Suspense, useEffect, useRef } from 'react';
import { useSearchParams } from 'next/navigation';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '@/lib/api';
import { AuthShell, FormError } from '@/components/store/AuthShell';
import { Spinner } from '@/components/ui/Media';

function Verify() {
  const token = useSearchParams().get('token') ?? '';
  const qc = useQueryClient();
  const started = useRef(false);
  const m = useMutation({
    mutationFn: () => api<{ message: string }>('/auth/verify-email', { body: { token } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['me'] }),
  });
  useEffect(() => {
    if (token && !started.current) {
      started.current = true;
      m.mutate();
    }
  }, [token, m]);
  if (!token) return <FormError message="This verification link is incomplete." />;
  if (m.isPending || m.isIdle) return <Spinner />;
  if (m.isError) return <FormError message={m.error instanceof ApiError ? m.error.message : 'Verification failed.'} />;
  return (
    <div className="space-y-6">
      <p className="border border-line bg-paper p-5" role="status">{m.data?.message}</p>
      <Link href="/account" className="link-underline">Go to your account</Link>
    </div>
  );
}

export default function VerifyEmailPage() {
  return (
    <AuthShell title="Confirming your email">
      <Suspense>
        <Verify />
      </Suspense>
    </AuthShell>
  );
}

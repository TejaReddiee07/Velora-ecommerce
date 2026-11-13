'use client';

import { useState, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'sonner';
import { RealtimeBridge } from './RealtimeBridge';

export function Providers({ children }: { children: ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { retry: (count, err) => count < 2 && (err as { status?: number })?.status !== 404 && (err as { status?: number })?.status !== 401, refetchOnWindowFocus: true },
          mutations: { retry: false },
        },
      }),
  );
  return (
    <QueryClientProvider client={client}>
      <RealtimeBridge />
      {children}
      <Toaster
        position="bottom-center"
        toastOptions={{
          style: { borderRadius: 0, background: '#1c1917', color: '#f6f3ee', border: '1px solid #44403c', fontFamily: 'var(--font-jost)' },
        }}
      />
    </QueryClientProvider>
  );
}

'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AnimatePresence, motion } from 'framer-motion';
import { Lock, X } from 'lucide-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { api, ApiError } from '@/lib/api';
import { cn } from '@/lib/format';
import { EASE_LUXE } from '@/lib/motion';
import { Button } from '@/components/ui/Button';
import { Checkbox, Input, fieldErrors } from '@/components/ui/Field';
import { reconnectRealtime } from '@/components/providers/RealtimeBridge';
import { FormError } from './AuthShell';
import { getLenis } from './SmoothScroll';
import type { User } from '@/lib/types';
import type { AdminUser } from '@/lib/admin/types';

type Mode = 'register' | 'login';
type LoginResult = { role: 'admin'; admin: AdminUser } | { role?: 'customer'; user: User };

interface Props {
  open: boolean;
  onClose: () => void;
  /** Prefilled from the checkout form. */
  defaults: { name: string; email: string };
  /** Called once the shopper has an account session; checkout then continues to payment. */
  onAuthenticated: (mode: Mode) => void;
}

/**
 * Shown when a guest presses Pay: create an account (or sign in) without
 * leaving checkout. The guest bag is merged into the account server-side.
 */
export function CheckoutAuthModal({ open, onClose, defaults, onAuthenticated }: Props) {
  return (
    <AnimatePresence>
      {open && <Panel key="checkout-auth" onClose={onClose} defaults={defaults} onAuthenticated={onAuthenticated} />}
    </AnimatePresence>
  );
}

function Panel({ onClose, defaults, onAuthenticated }: Omit<Props, 'open'>) {
  const router = useRouter();
  const qc = useQueryClient();
  const [mode, setMode] = useState<Mode>('register');
  const [name, setName] = useState(defaults.name);
  const [email, setEmail] = useState(defaults.email);
  const [password, setPassword] = useState('');
  const [marketingOptIn, setMarketingOptIn] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);
  const firstRef = useRef<HTMLInputElement>(null);

  const register = useMutation({
    mutationFn: () => api<{ user: User }>('/auth/register', { body: { name, email, password, marketingOptIn } }),
    onSuccess: (d) => {
      qc.setQueryData(['me'], d.user);
      reconnectRealtime();
      toast.success('Account created.');
      onAuthenticated('register');
    },
  });
  const login = useMutation({
    mutationFn: () => api<LoginResult>('/auth/login', { body: { email, password } }),
    onSuccess: (d) => {
      if (d.role === 'admin') {
        qc.setQueryData(['admin', 'me'], d.admin);
        reconnectRealtime();
        toast.success('Signed in to the owner portal.');
        router.push('/admin');
        return;
      }
      qc.setQueryData(['me'], d.user);
      qc.invalidateQueries({ queryKey: ['wishlist'] });
      reconnectRealtime();
      onAuthenticated('login');
    },
  });
  const active = mode === 'register' ? register : login;
  const err = active.error instanceof ApiError ? active.error : null;
  const fields = fieldErrors(err?.fields);
  const exists = mode === 'register' && err?.status === 409;

  // Modal behaviour: pause smooth scroll, lock the page, Esc closes, keep Tab inside, restore focus.
  useEffect(() => {
    getLenis()?.stop();
    const prev = document.activeElement as HTMLElement | null;
    document.body.style.overflow = 'hidden';
    const t = setTimeout(() => firstRef.current?.focus(), 60);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key !== 'Tab' || !dialogRef.current) return;
      const els = [...dialogRef.current.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), a[href]')].filter((el) => el.offsetParent !== null);
      if (!els.length) return;
      const first = els[0];
      const last = els[els.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => {
      clearTimeout(t);
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
      getLenis()?.start();
      prev?.focus?.();
    };
  }, [onClose]);

  const switchMode = (m: Mode) => {
    setMode(m);
    register.reset();
    login.reset();
    setTimeout(() => firstRef.current?.focus(), 30);
  };

  return (
    <>
      <motion.div className="fixed inset-0 z-[70] bg-ink/50 backdrop-blur-[2px]" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} />
      <div className="pointer-events-none fixed inset-0 z-[71] flex items-end justify-center sm:items-center sm:p-6">
        <motion.div
          ref={dialogRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby="checkout-auth-title"
          className="pointer-events-auto relative max-h-[92svh] w-full max-w-[480px] overflow-y-auto bg-ivory px-6 pb-8 pt-7 shadow-2xl sm:px-9"
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 30, transition: { duration: 0.25, ease: EASE_LUXE } }}
          transition={{ duration: 0.5, ease: EASE_LUXE }}
          data-lenis-prevent
        >
          <button type="button" onClick={onClose} className="absolute right-3 top-3 flex h-11 w-11 items-center justify-center text-graphite hover:text-ink" aria-label="Close">
            <X className="h-5 w-5" />
          </button>

          <p className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.18em] text-muted">
            <Lock className="h-3.5 w-3.5" /> One last step before payment
          </p>
          <h2 id="checkout-auth-title" className="mt-3 font-display text-[2.1rem] leading-none">
            {mode === 'register' ? 'Create your account' : 'Sign in to pay'}
          </h2>
          <p className="mt-3 text-[14px] text-muted">
            {mode === 'register'
              ? 'Your bag and delivery details are kept. An account lets you track this order and check out faster next time.'
              : 'Your bag is kept and added to your account.'}
          </p>

          <div className="mt-6 grid grid-cols-2 border border-line-strong p-1 text-[13px]" role="tablist" aria-label="Account">
            {(['register', 'login'] as const).map((m) => (
              <button
                key={m}
                type="button"
                role="tab"
                aria-selected={mode === m}
                onClick={() => switchMode(m)}
                className={cn('relative h-10 text-[12px] uppercase tracking-[0.1em] transition-colors sm:text-[13px] sm:tracking-[0.14em]', mode === m ? 'text-ivory' : 'text-graphite hover:text-ink')}
              >
                {mode === m && <motion.span layoutId="checkout-auth-tab" className="absolute inset-0 bg-ink" transition={{ duration: 0.35, ease: EASE_LUXE }} />}
                <span className="relative">{m === 'register' ? 'New customer' : 'I have an account'}</span>
              </button>
            ))}
          </div>

          <form
            className="mt-6 space-y-5"
            onSubmit={(e) => {
              e.preventDefault();
              active.mutate();
            }}
            noValidate
          >
            {exists ? (
              <div role="alert" className="border border-danger/40 bg-danger/5 px-4 py-3 text-[14px] text-danger">
                An account with this email already exists.{' '}
                <button type="button" className="link-underline text-ink" onClick={() => switchMode('login')}>
                  Sign in instead
                </button>
              </div>
            ) : (
              <FormError message={err && !err.fields ? err.message : null} />
            )}
            {mode === 'register' && (
              <Input ref={firstRef} label="Full name" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} required error={fields.name} />
            )}
            <Input
              ref={mode === 'login' ? firstRef : undefined}
              label="Email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              error={fields.email}
            />
            <Input
              label="Password"
              type="password"
              autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              error={fields.password}
              hint={mode === 'register' ? 'At least 8 characters, including a letter and a number.' : undefined}
            />
            {mode === 'register' && <Checkbox label="Send me news about collections and private sales" checked={marketingOptIn} onChange={setMarketingOptIn} />}
            <Button type="submit" full size="lg" loading={active.isPending} icon={<Lock className="h-4 w-4" />}>
              {mode === 'register' ? 'Create account & pay' : 'Sign in & pay'}
            </Button>
            {mode === 'register' && <p className="text-center text-[12px] text-muted">By creating an account you agree to our terms and privacy policy.</p>}
          </form>
        </motion.div>
      </div>
    </>
  );
}

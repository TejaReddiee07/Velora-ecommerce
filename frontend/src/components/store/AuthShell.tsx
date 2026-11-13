'use client';

import { motion } from 'framer-motion';
import { useSettings } from '@/lib/hooks';
import { imageUrl } from '@/lib/api';
import { EASE_LUXE } from '@/lib/motion';

/** Split-screen editorial layout for authentication pages. */
export function AuthShell({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  const { data: settings } = useSettings();
  const img = settings?.banners.find((b) => b.placement === 'collection' && b.title === 'Womenswear')?.image ?? settings?.banners[0]?.image;
  return (
    <div className="grid min-h-[100svh] lg:grid-cols-2">
      <div className="relative hidden overflow-hidden bg-ink lg:block">
        {img && (
          // eslint-disable-next-line @next/next/no-img-element
          <motion.img initial={{ scale: 1.1, opacity: 0 }} animate={{ scale: 1, opacity: 0.85 }} transition={{ duration: 1.6, ease: EASE_LUXE }} src={imageUrl(img.lg)} alt="" className="absolute inset-0 h-full w-full object-cover" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-ink/80 to-transparent" />
        <p className="absolute bottom-12 left-12 max-w-sm font-display text-4xl leading-tight text-ivory">Considered pieces, made to be worn for years.</p>
      </div>
      <div className="flex items-center justify-center px-4 pb-16 pt-[140px] sm:px-8">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8, ease: EASE_LUXE }} className="w-full max-w-md">
          <h1 className="text-[clamp(2.4rem,5vw,3.6rem)] leading-none">{title}</h1>
          {subtitle && <p className="mt-4 text-muted">{subtitle}</p>}
          <div className="mt-10">{children}</div>
        </motion.div>
      </div>
    </div>
  );
}

export function FormError({ message }: { message?: string | null }) {
  if (!message) return null;
  return (
    <div role="alert" className="border border-danger/40 bg-danger/5 px-4 py-3 text-[14px] text-danger">
      {message}
    </div>
  );
}

export function safeNext(next: string | null | undefined) {
  return next && next.startsWith('/') && !next.startsWith('//') && !next.startsWith('/admin') ? next : '/account';
}

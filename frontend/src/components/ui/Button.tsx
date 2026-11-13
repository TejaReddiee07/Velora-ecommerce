'use client';

import Link from 'next/link';
import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/format';

type Variant = 'primary' | 'secondary' | 'ghost' | 'gold' | 'danger' | 'light';
type Size = 'sm' | 'md' | 'lg';

const base =
  'relative inline-flex items-center justify-center gap-2 overflow-hidden whitespace-nowrap font-sans uppercase tracking-[0.18em] transition-[background-color,color,border-color,transform] duration-300 ease-[var(--ease-luxe)] active:scale-[0.98] disabled:opacity-45 disabled:pointer-events-none select-none';

const variants: Record<Variant, string> = {
  primary: 'bg-charcoal text-ivory hover:bg-ink border border-charcoal',
  secondary: 'bg-transparent text-ink border border-ink hover:bg-ink hover:text-ivory',
  ghost: 'bg-transparent text-ink border border-transparent hover:border-line-strong',
  gold: 'bg-gold text-ink border border-gold hover:bg-champagne',
  danger: 'bg-danger text-white border border-danger hover:bg-[#991b1b]',
  light: 'bg-ivory text-ink border border-ivory hover:bg-transparent hover:text-ivory',
};

const sizes: Record<Size, string> = {
  sm: 'h-9 px-4 text-[0.68rem]',
  md: 'h-12 px-6 text-[0.72rem]',
  lg: 'h-14 px-9 text-[0.76rem]',
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  icon?: ReactNode;
  full?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', size = 'md', loading, icon, full, className, children, disabled, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      className={cn(base, variants[variant], sizes[size], full && 'w-full', className)}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      {loading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : icon}
      <span>{children}</span>
    </button>
  );
});

export function ButtonLink({
  href,
  variant = 'primary',
  size = 'md',
  className,
  children,
  icon,
  full,
}: {
  href: string;
  variant?: Variant;
  size?: Size;
  className?: string;
  children: ReactNode;
  icon?: ReactNode;
  full?: boolean;
}) {
  return (
    <Link href={href} className={cn(base, variants[variant], sizes[size], full && 'w-full', className)}>
      <span>{children}</span>
      {icon}
    </Link>
  );
}

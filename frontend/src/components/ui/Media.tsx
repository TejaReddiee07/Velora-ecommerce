'use client';

import { useState } from 'react';
import { imageUrl, srcSet } from '@/lib/api';
import { cn, money } from '@/lib/format';
import type { Rendition } from '@/lib/types';

/** GridFS-backed responsive image with a reserved aspect ratio (no layout shift). */
export function GridImage({
  image,
  alt,
  sizes = '(min-width: 1024px) 25vw, 50vw',
  className,
  imgClassName,
  priority,
  ratio = '4 / 5',
}: {
  image: Rendition | null | undefined;
  alt: string;
  sizes?: string;
  className?: string;
  imgClassName?: string;
  priority?: boolean;
  ratio?: string | null;
}) {
  const [loaded, setLoaded] = useState(false);
  return (
    <div className={cn('relative overflow-hidden bg-sand', className)} style={ratio ? { aspectRatio: ratio } : undefined}>
      {!loaded && <div className="skeleton absolute inset-0" aria-hidden />}
      {image && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={imageUrl(image.md)}
          srcSet={srcSet(image)}
          sizes={sizes}
          alt={alt}
          loading={priority ? 'eager' : 'lazy'}
          decoding="async"
          fetchPriority={priority ? 'high' : 'auto'}
          onLoad={() => setLoaded(true)}
          ref={(el) => {
            if (el?.complete && el.naturalWidth) setLoaded(true);
          }}
          className={cn('absolute inset-0 h-full w-full object-cover transition-opacity duration-700', loaded ? 'opacity-100' : 'opacity-0', imgClassName)}
        />
      )}
    </div>
  );
}

export function Price({ price, compareAt, currency, className, size = 'md' }: { price: number; compareAt?: number | null; currency: string; className?: string; size?: 'sm' | 'md' | 'lg' }) {
  const text = size === 'lg' ? 'text-2xl' : size === 'sm' ? 'text-[13px]' : 'text-[15px]';
  return (
    <p className={cn('tabular flex items-baseline gap-2', text, className)}>
      {compareAt ? (
        <>
          <span className="text-sale">
            <span className="sr-only">Sale price </span>
            {money(price, currency)}
          </span>
          <s className="text-muted text-[0.85em]">
            <span className="sr-only">Was </span>
            {money(compareAt, currency)}
          </s>
        </>
      ) : (
        <span>{money(price, currency)}</span>
      )}
    </p>
  );
}

export function Logo({ className, light }: { className?: string; light?: boolean }) {
  return (
    <span className={cn('font-display select-none text-[1.65rem] leading-none tracking-[0.42em] pl-[0.42em]', light ? 'text-ivory' : 'text-ink', className)} aria-label="VELORA">
      VELORA
    </span>
  );
}

export function Stars({ value, count, className }: { value: number; count?: number; className?: string }) {
  const pct = Math.max(0, Math.min(100, (value / 5) * 100));
  return (
    <span className={cn('inline-flex items-center gap-1.5', className)}>
      <span className="relative inline-block text-[13px] leading-none tracking-[2px] text-line-strong" aria-hidden>
        ★★★★★
        <span className="absolute inset-0 overflow-hidden text-gold-deep" style={{ width: `${pct}%` }}>
          ★★★★★
        </span>
      </span>
      <span className="sr-only">Rated {value.toFixed(1)} out of 5</span>
      {count != null && <span className="text-[12px] text-muted">({count})</span>}
    </span>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('skeleton', className)} aria-hidden />;
}

export function Spinner({ className }: { className?: string }) {
  return <span className={cn('inline-block h-5 w-5 animate-spin rounded-full border-2 border-line-strong border-t-ink', className)} role="status" aria-label="Loading" />;
}

export function EmptyState({ title, body, action }: { title: string; body?: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-4 border border-line px-6 py-20 text-center">
      <h2 className="text-3xl">{title}</h2>
      {body && <p className="max-w-md text-muted">{body}</p>}
      {action}
    </div>
  );
}

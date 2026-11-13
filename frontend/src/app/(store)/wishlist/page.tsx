'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { X } from 'lucide-react';
import { toast } from 'sonner';
import { api, ApiError, imageUrl } from '@/lib/api';
import { useCurrency, useMe } from '@/lib/hooks';
import { cn } from '@/lib/format';
import { Button, ButtonLink } from '@/components/ui/Button';
import { EmptyState, Price, Skeleton } from '@/components/ui/Media';
import type { ProductCard } from '@/lib/types';

type WishItem = ProductCard & { purchasable: boolean; variants: { _id: string; size: string; color: string; colorHex: string; available: number }[] };

function WishCard({ item }: { item: WishItem }) {
  const qc = useQueryClient();
  const [variant, setVariant] = useState('');
  const move = useMutation({
    mutationFn: () => api(`/wishlist/${item._id}/move-to-cart`, { body: { variantId: variant } }),
    onSuccess: () => {
      toast.success(`${item.name} moved to your bag`);
      qc.invalidateQueries({ queryKey: ['wishlist-full'] });
      qc.invalidateQueries({ queryKey: ['wishlist'] });
      qc.invalidateQueries({ queryKey: ['cart'] });
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : 'Could not move to bag.'),
  });
  const remove = useMutation({
    mutationFn: () => api(`/wishlist/${item._id}`, { method: 'DELETE' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['wishlist-full'] });
      qc.invalidateQueries({ queryKey: ['wishlist'] });
    },
  });
  return (
    <li className="relative">
      <Link href={`/product/${item.slug}`} className="block aspect-[4/5] overflow-hidden bg-sand">
        {item.images[0] && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={imageUrl(item.images[0].md)} alt={item.name} className={cn('h-full w-full object-cover', !item.purchasable && 'opacity-60 grayscale')} loading="lazy" />
        )}
      </Link>
      <button type="button" onClick={() => remove.mutate()} className="absolute right-2 top-2 flex h-10 w-10 items-center justify-center rounded-full bg-ivory/90" aria-label={`Remove ${item.name} from wishlist`}>
        <X className="h-4 w-4" />
      </button>
      <div className="mt-4 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="eyebrow text-[0.62rem] text-muted">{item.brandName}</p>
          <Link href={`/product/${item.slug}`} className="link-underline mt-1 block truncate text-[15px]">
            {item.name}
          </Link>
        </div>
        <Price price={item.price} compareAt={item.compareAtPrice} currency={item.currency} className="shrink-0 flex-col items-end gap-0" />
      </div>
      <p className={cn('mt-2 text-[13px]', item.purchasable ? 'text-success' : 'text-danger')}>{item.purchasable ? 'In stock' : 'Currently unavailable'}</p>
      {item.purchasable && (
        <div className="mt-3 flex gap-2">
          <label className="flex-1">
            <span className="sr-only">Choose size and colour for {item.name}</span>
            <select value={variant} onChange={(e) => setVariant(e.target.value)} className="h-11 w-full border border-line-strong bg-paper px-3 text-[14px] focus:border-ink focus:outline-none">
              <option value="">Select size</option>
              {item.variants.map((v) => (
                <option key={v._id} value={v._id} disabled={v.available <= 0}>
                  {v.color} / {v.size}
                  {v.available <= 0 ? ' — sold out' : ''}
                </option>
              ))}
            </select>
          </label>
          <Button size="sm" className="h-11" disabled={!variant} loading={move.isPending} onClick={() => move.mutate()}>
            Move to bag
          </Button>
        </div>
      )}
    </li>
  );
}

export default function WishlistPage() {
  const { data: me, isLoading: meLoading } = useMe();
  const currency = useCurrency();
  const { data, isLoading } = useQuery({
    queryKey: ['wishlist-full', currency],
    enabled: Boolean(me),
    queryFn: async () => (await api<{ wishlist: { items: WishItem[] } }>('/wishlist', { query: { currency } })).wishlist.items,
  });

  return (
    <div className="container-luxe pt-[150px]">
      <h1 className="text-[clamp(2.6rem,6vw,4.5rem)] leading-none">Wishlist</h1>
      <div className="mt-12">
        {meLoading ? (
          <Skeleton className="h-64" />
        ) : !me ? (
          <EmptyState title="Save the pieces you love" body="Sign in to keep a wishlist across devices and hear when items return." action={<ButtonLink href="/login?next=/wishlist">Sign in</ButtonLink>} />
        ) : isLoading ? (
          <Skeleton className="h-64" />
        ) : !data?.length ? (
          <EmptyState title="Your wishlist is empty" body="Tap the heart on any piece to save it here." action={<ButtonLink href="/new-arrivals" variant="secondary">Explore new arrivals</ButtonLink>} />
        ) : (
          <ul className="grid grid-cols-2 gap-x-4 gap-y-12 md:grid-cols-3 md:gap-x-6 xl:grid-cols-4">
            {data.map((item) => (
              <WishCard key={item._id} item={item} />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

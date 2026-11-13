'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Heart, Menu, Search, ShoppingBag, User, X } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useCart, useCurrency, useMe, useSettings } from '@/lib/hooks';
import { useUI } from '@/lib/store';
import { cn } from '@/lib/format';
import { EASE_LUXE } from '@/lib/motion';
import { GridImage, Logo } from '@/components/ui/Media';
import type { Category, Currency, PublicSettings } from '@/lib/types';

type MenuKey = 'clothing' | 'footwear' | 'accessories';

const MENUS: { key: MenuKey; label: string; href: string; shopBy: { label: string; href: string }[]; styles?: { label: string; href: string }[]; banner: string }[] = [
  {
    key: 'clothing',
    label: 'Clothing',
    href: '/clothing',
    shopBy: [
      { label: 'Womenswear', href: '/clothing?gender=women,unisex' },
      { label: 'Menswear', href: '/clothing?gender=men,unisex' },
      { label: 'Unisex', href: '/clothing?gender=unisex' },
      { label: 'New arrivals', href: '/new-arrivals?department=clothing' },
    ],
    styles: [
      { label: 'Casual wear', href: '/clothing?style=casual' },
      { label: 'Formal wear', href: '/clothing?style=formal' },
      { label: 'Streetwear', href: '/clothing?style=streetwear' },
      { label: 'Sportswear', href: '/clothing?style=sportswear' },
    ],
    banner: 'Womenswear',
  },
  {
    key: 'footwear',
    label: 'Footwear',
    href: '/footwear',
    shopBy: [
      { label: "Women's footwear", href: '/footwear?gender=women,unisex' },
      { label: "Men's footwear", href: '/footwear?gender=men,unisex' },
      { label: 'New arrivals', href: '/new-arrivals?department=footwear' },
      { label: 'Footwear sale', href: '/sale?department=footwear' },
    ],
    banner: 'Footwear',
  },
  {
    key: 'accessories',
    label: 'Accessories',
    href: '/accessories',
    shopBy: [
      { label: 'All accessories', href: '/accessories' },
      { label: 'Best sellers', href: '/accessories?sort=best_selling' },
    ],
    banner: 'Accessories',
  },
];

export function useCategories() {
  return useQuery({
    queryKey: ['categories'],
    queryFn: async () => (await api<{ categories: Category[] }>('/catalog/categories')).categories,
    staleTime: 5 * 60_000,
  });
}

function CurrencySwitch({ settings, className, tone }: { settings?: PublicSettings; className?: string; tone: 'light' | 'dark' }) {
  const currency = useCurrency();
  const setCurrency = useUI((s) => s.setCurrency);
  const enabled = settings?.currency.enabled ?? ['GBP'];
  if (enabled.length < 2) return null;
  return (
    <label className={cn('relative inline-flex items-center', className)}>
      <span className="sr-only">Currency</span>
      <select
        value={currency}
        onChange={(e) => setCurrency(e.target.value as Currency)}
        className={cn('h-10 cursor-pointer appearance-none bg-transparent px-2 text-[12px] font-medium tracking-[0.16em] focus:outline-none', tone === 'light' ? 'text-ivory [&>option]:text-ink' : 'text-ink')}
      >
        {enabled.map((c) => (
          <option key={c} value={c}>
            {c === 'GBP' ? '£ GBP' : '$ USD'}
          </option>
        ))}
      </select>
    </label>
  );
}

export function Header({ initialSettings }: { initialSettings?: PublicSettings | null }) {
  const pathname = usePathname();
  const isHome = pathname === '/';
  const { data: settings } = useSettings(initialSettings);
  const { data: me } = useMe();
  const { data: cart } = useCart();
  const { data: categories } = useCategories();
  const { setCartOpen, setSearchOpen, menuOpen, setMenuOpen, bagPulse } = useUI();
  const [scrolled, setScrolled] = useState(false);
  const [hidden, setHidden] = useState(false);
  const [open, setOpen] = useState<MenuKey | null>(null);
  const lastY = useRef(0);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const onScroll = () => {
      const y = window.scrollY;
      setScrolled(y > 24);
      setHidden(y > 240 && y > lastY.current && !open);
      lastY.current = y;
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, [open]);

  useEffect(() => {
    setOpen(null);
    setMenuOpen(false);
  }, [pathname, setMenuOpen]);

  const transparent = isHome && !scrolled && !open;
  const tone = transparent ? 'light' : 'dark';
  const count = cart?.itemCount ?? 0;
  const announcement = settings?.announcement;

  const openMenu = (k: MenuKey) => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    setOpen(k);
  };
  const scheduleClose = () => {
    closeTimer.current = setTimeout(() => setOpen(null), 140);
  };

  const iconBtn = cn('relative inline-flex h-11 w-11 items-center justify-center transition-colors', tone === 'light' ? 'text-ivory hover:text-champagne' : 'text-ink hover:text-gold-deep');

  return (
    <>
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100] focus:bg-ink focus:px-4 focus:py-2 focus:text-ivory">
        Skip to content
      </a>
      <header
        className={cn(
          'fixed inset-x-0 top-0 z-50 transition-[transform,background-color,box-shadow] duration-500 ease-[var(--ease-luxe)]',
          hidden && !menuOpen ? '-translate-y-full' : 'translate-y-0',
          transparent ? 'bg-transparent' : 'bg-ivory/92 backdrop-blur-md shadow-[0_1px_0_var(--color-line)]',
        )}
        onMouseLeave={scheduleClose}
      >
        {announcement?.enabled && announcement.text && (
          <div className={cn('flex h-9 items-center justify-center px-4 text-center text-[11px] tracking-[0.2em] uppercase', transparent ? 'bg-ink/40 text-ivory' : 'bg-ink text-ivory')}>
            {announcement.link ? (
              <Link href={announcement.link} className="link-underline truncate">
                {announcement.text}
              </Link>
            ) : (
              <span className="truncate">{announcement.text}</span>
            )}
          </div>
        )}
        <div className="container-luxe grid h-[68px] grid-cols-[1fr_auto_1fr] items-center">
          <div className="flex items-center">
            <button className={cn(iconBtn, '-ml-2 lg:hidden')} onClick={() => setMenuOpen(!menuOpen)} aria-label={menuOpen ? 'Close menu' : 'Open menu'} aria-expanded={menuOpen}>
              {menuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
            <nav aria-label="Primary" className="hidden lg:block">
              <ul className="flex items-center gap-1">
                {MENUS.map((m) => (
                  <li key={m.key} onMouseEnter={() => openMenu(m.key)}>
                    <Link
                      href={m.href}
                      onFocus={() => openMenu(m.key)}
                      aria-expanded={open === m.key}
                      className={cn('relative block px-3 py-3 text-[12px] font-medium uppercase tracking-[0.2em] transition-colors', tone === 'light' ? 'text-ivory' : 'text-ink', pathname.startsWith(m.href) && 'after:absolute after:inset-x-3 after:bottom-1.5 after:h-px after:bg-current')}
                    >
                      {m.label}
                    </Link>
                  </li>
                ))}
                <li onMouseEnter={() => setOpen(null)}>
                  <Link href="/new-arrivals" className={cn('block px-3 py-3 text-[12px] font-medium uppercase tracking-[0.2em]', tone === 'light' ? 'text-ivory' : 'text-ink')}>
                    New in
                  </Link>
                </li>
                <li onMouseEnter={() => setOpen(null)}>
                  <Link href="/sale" className={cn('block px-3 py-3 text-[12px] font-medium uppercase tracking-[0.2em]', tone === 'light' ? 'text-champagne' : 'text-sale')}>
                    Sale
                  </Link>
                </li>
              </ul>
            </nav>
          </div>

          <Link href="/" aria-label="VELORA home" className="justify-self-center">
            <Logo light={tone === 'light'} className="text-[1.45rem] md:text-[1.7rem]" />
          </Link>

          <div className="flex items-center justify-end">
            <CurrencySwitch settings={settings} tone={tone} className="mr-1 max-md:hidden" />
            <button className={iconBtn} onClick={() => setSearchOpen(true)} aria-label="Search">
              <Search className="h-[19px] w-[19px]" strokeWidth={1.5} />
            </button>
            <Link href={me ? '/account' : '/login'} className={cn(iconBtn, 'max-sm:hidden')} aria-label={me ? 'Your account' : 'Sign in'}>
              <User className="h-[19px] w-[19px]" strokeWidth={1.5} />
            </Link>
            <Link href="/wishlist" className={cn(iconBtn, 'max-sm:hidden')} aria-label="Wishlist">
              <Heart className="h-[19px] w-[19px]" strokeWidth={1.5} />
            </Link>
            <motion.button
              key={bagPulse}
              initial={bagPulse ? { scale: 1.25 } : false}
              animate={{ scale: 1 }}
              transition={{ type: 'spring', stiffness: 400, damping: 12 }}
              id="bag-button"
              className={cn(iconBtn, '-mr-2')}
              onClick={() => setCartOpen(true)}
              aria-label={`Shopping bag, ${count} item${count === 1 ? '' : 's'}`}
            >
              <ShoppingBag className="h-[19px] w-[19px]" strokeWidth={1.5} />
              {count > 0 && (
                <span className={cn('tabular absolute right-1 top-1.5 flex h-[17px] min-w-[17px] items-center justify-center rounded-full px-1 text-[10px] font-semibold', tone === 'light' ? 'bg-ivory text-ink' : 'bg-ink text-ivory')}>
                  {count}
                </span>
              )}
            </motion.button>
          </div>
        </div>

        {/* Desktop mega menu */}
        <AnimatePresence>
          {open && (
            <motion.div
              key={open}
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6, transition: { duration: 0.18 } }}
              transition={{ duration: 0.35, ease: EASE_LUXE }}
              className="absolute inset-x-0 top-full hidden border-t border-line bg-ivory shadow-[0_24px_48px_-24px_rgba(12,10,9,0.25)] lg:block"
              onMouseEnter={() => openMenu(open)}
              onMouseLeave={scheduleClose}
            >
              {(() => {
                const m = MENUS.find((x) => x.key === open)!;
                const cats = (categories ?? []).filter((c) => c.department === m.key && c.productCount > 0);
                const banner = settings?.banners.find((b) => b.placement === 'collection' && b.title === m.banner);
                const cols = [
                  { title: 'Shop by', links: m.shopBy },
                  { title: 'Categories', links: cats.map((c) => ({ label: c.name, href: `${m.href}?category=${c.slug}` })) },
                  ...(m.styles ? [{ title: 'Style', links: m.styles }] : []),
                ];
                return (
                  <div className="container-luxe grid grid-cols-[1fr_1fr_1fr_340px] gap-10 py-10">
                    {cols.map((col, ci) => (
                      <div key={col.title}>
                        <p className="eyebrow mb-5 text-muted">{col.title}</p>
                        <ul className="space-y-2.5">
                          {col.links.map((l, i) => (
                            <motion.li key={l.href} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.04 * i + ci * 0.05, duration: 0.4, ease: EASE_LUXE }}>
                              <Link href={l.href} className="link-underline font-display text-[1.35rem] leading-tight text-ink" onClick={() => setOpen(null)}>
                                {l.label}
                              </Link>
                            </motion.li>
                          ))}
                        </ul>
                      </div>
                    ))}
                    {cols.length === 2 && <div />}
                    <Link href={m.href} className="group relative block overflow-hidden" onClick={() => setOpen(null)}>
                      <GridImage image={banner?.image} alt={banner?.title ?? m.label} ratio="4 / 3" sizes="340px" imgClassName="transition-transform duration-[1.4s] ease-[var(--ease-luxe)] group-hover:scale-105" />
                      <div className="absolute inset-0 bg-gradient-to-t from-ink/60 to-transparent" />
                      <div className="absolute bottom-4 left-4 text-ivory">
                        <p className="eyebrow">Explore</p>
                        <p className="font-display text-2xl">{m.label}</p>
                      </div>
                    </Link>
                  </div>
                );
              })()}
            </motion.div>
          )}
        </AnimatePresence>
      </header>

      {/* Mobile menu */}
      <AnimatePresence>
        {menuOpen && (
          <motion.div
            initial={{ clipPath: 'inset(0 0 100% 0)' }}
            animate={{ clipPath: 'inset(0 0 0% 0)' }}
            exit={{ clipPath: 'inset(0 0 100% 0)', transition: { duration: 0.35, ease: EASE_LUXE } }}
            transition={{ duration: 0.6, ease: EASE_LUXE }}
            className="fixed inset-0 z-40 overflow-y-auto bg-ivory pt-[120px] lg:hidden"
            data-lenis-prevent
          >
            <nav aria-label="Mobile" className="container-luxe pb-12">
              <ul className="divide-y divide-line border-y border-line">
                {[...MENUS.map((m) => ({ label: m.label, href: m.href })), { label: 'New in', href: '/new-arrivals' }, { label: 'Sale', href: '/sale' }, { label: 'Wishlist', href: '/wishlist' }, { label: me ? 'Account' : 'Sign in', href: me ? '/account' : '/login' }].map((l, i) => (
                  <motion.li key={l.href} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 + i * 0.05, duration: 0.5, ease: EASE_LUXE }}>
                    <Link href={l.href} className="flex items-center justify-between py-4 font-display text-[2rem] leading-none">
                      {l.label}
                      <span aria-hidden className="text-base text-muted">→</span>
                    </Link>
                  </motion.li>
                ))}
              </ul>
              <div className="mt-8 flex items-center justify-between">
                <span className="eyebrow text-muted">Currency</span>
                <CurrencySwitch settings={settings} tone="dark" />
              </div>
            </nav>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

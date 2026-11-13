'use client';

import { useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ImagePlus, Plus, Trash2, X } from 'lucide-react';
import { api, ApiError, imageUrl } from '@/lib/api';
import { Button } from '@/components/ui/Button';
import { Input, Select, Textarea, fieldErrors } from '@/components/ui/Field';
import { errorMessage, toMajor, toMinor } from '@/lib/admin/hooks';
import { uploadForm } from '@/lib/admin/upload';
import type { StoreSettingsDoc } from '@/lib/admin/types';
import type { Currency } from '@/lib/types';
import { ConfirmDialog, Panel, Switch } from './ui';

type Section = 'store' | 'commerce' | 'content';

interface DeliveryRow {
  id: string;
  name: string;
  description: string;
  price: string;
  freeOver: string;
  etaDays: string;
  isActive: boolean;
}

export function StoreSettingsForm({ settings, section, canWrite }: { settings: StoreSettingsDoc; section: Section; canWrite: boolean }) {
  const qc = useQueryClient();
  const [s, setS] = useState(() => ({
    storeName: settings.storeName,
    tagline: settings.tagline ?? '',
    contact: { ...settings.contact },
    base: settings.currency.base,
    enabled: settings.currency.enabled?.length ? settings.currency.enabled : [settings.currency.base],
    usdRate: String(settings.currency.rates?.USD ?? 1.27),
    gbpRate: String(settings.currency.rates?.GBP ?? 0.79),
    rounding: settings.currency.rounding ?? 'none',
    tax: { ...settings.tax, rate: String(settings.tax.rate) },
    returnPolicy: settings.returnPolicy ?? '',
    announcement: { enabled: settings.announcement?.enabled ?? false, text: settings.announcement?.text ?? '', link: settings.announcement?.link ?? '' },
    social: { instagram: '', tiktok: '', x: '', facebook: '', pinterest: '', youtube: '', ...settings.social },
    lowStockThreshold: String(settings.lowStockThreshold ?? 5),
  }));
  const [delivery, setDelivery] = useState<DeliveryRow[]>(() =>
    settings.delivery.map((d) => ({ id: d.id, name: d.name, description: d.description ?? '', price: toMajor(d.price), freeOver: d.freeOver != null ? toMajor(d.freeOver) : '', etaDays: d.etaDays, isActive: d.isActive })),
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const logoInput = useRef<HTMLInputElement>(null);
  const [logoBusy, setLogoBusy] = useState(false);
  const [confirmLogo, setConfirmLogo] = useState(false);

  const refresh = () => qc.invalidateQueries({ queryKey: ['admin', 'settings'] });

  const save = useMutation({
    mutationFn: () => {
      const rates: Record<string, number> = {};
      if (s.base !== 'USD') rates.USD = Number(s.usdRate);
      if (s.base !== 'GBP') rates.GBP = Number(s.gbpRate);
      const clean = (v?: string) => (v ?? '').trim();
      return api('/admin/settings', {
        method: 'PUT',
        body: {
          storeName: s.storeName.trim(),
          tagline: s.tagline.trim(),
          contact: { email: s.contact.email.trim(), phone: s.contact.phone.trim(), address: s.contact.address.trim() },
          currency: { base: s.base, enabled: s.enabled, rates, rounding: s.rounding },
          tax: { enabled: s.tax.enabled, rate: Number(s.tax.rate) || 0, inclusive: s.tax.inclusive, label: s.tax.label.trim() || 'VAT' },
          delivery: delivery.map((d) => ({
            id: d.id.trim(),
            name: d.name.trim(),
            description: d.description.trim() || undefined,
            price: toMinor(d.price) ?? 0,
            freeOver: toMinor(d.freeOver),
            etaDays: d.etaDays.trim(),
            isActive: d.isActive,
          })),
          returnPolicy: s.returnPolicy,
          announcement: { enabled: s.announcement.enabled, text: s.announcement.text.trim(), link: s.announcement.link.trim() || undefined },
          social: {
            instagram: clean(s.social.instagram),
            tiktok: clean(s.social.tiktok),
            x: clean(s.social.x),
            facebook: clean(s.social.facebook),
            pinterest: clean(s.social.pinterest),
            youtube: clean(s.social.youtube),
          },
          lowStockThreshold: Number.parseInt(s.lowStockThreshold, 10) || 0,
        },
      });
    },
    onSuccess: () => {
      setErrors({});
      toast.success('Settings saved — storefront updated');
      refresh();
    },
    onError: (e) => {
      if (e instanceof ApiError) setErrors(fieldErrors(e.fields));
      toast.error(errorMessage(e));
    },
  });

  async function uploadLogo(file: File) {
    const form = new FormData();
    form.append('image', file);
    setLogoBusy(true);
    try {
      await uploadForm('/admin/settings/logo', form);
      toast.success('Logo updated');
      refresh();
    } catch (err) {
      toast.error(errorMessage(err, 'Logo upload failed.'));
    } finally {
      setLogoBusy(false);
      if (logoInput.current) logoInput.current.value = '';
    }
  }

  const removeLogo = useMutation({
    mutationFn: () => api('/admin/settings/logo', { method: 'DELETE' }),
    onSuccess: () => {
      toast.success('Logo removed — the VELORA wordmark is shown instead');
      setConfirmLogo(false);
      refresh();
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const toggleCurrency = (c: Currency, on: boolean) => setS((x) => ({ ...x, enabled: on ? [...new Set([...x.enabled, c])] : x.enabled.filter((y) => y !== c && true) }));
  const errorList = Object.entries(errors);

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        save.mutate();
      }}
      className="space-y-6"
      noValidate
    >
      {errorList.length > 0 && (
        <div role="alert" className="border border-[#e3b4b4] bg-[#fbeeee] px-4 py-3 text-[14px] text-danger">
          <p className="font-medium">Please fix:</p>
          <ul className="mt-1 list-disc pl-5">
            {errorList.map(([k, v]) => (
              <li key={k}>
                {k}: {v}
              </li>
            ))}
          </ul>
        </div>
      )}

      {section === 'store' && (
        <>
          <Panel title="Brand">
            <div className="grid gap-5 md:grid-cols-2">
              <Input label="Store name" required value={s.storeName} onChange={(e) => setS({ ...s, storeName: e.target.value })} error={errors.storeName} maxLength={60} />
              <Input label="Tagline" value={s.tagline} onChange={(e) => setS({ ...s, tagline: e.target.value })} maxLength={140} />
            </div>
            <div className="mt-6 flex flex-wrap items-center gap-5 border-t border-line pt-5">
              <div className="flex h-20 w-48 items-center justify-center border border-line bg-ivory">
                {settings.logo ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={imageUrl(settings.logo.md)} alt="Current store logo" className="max-h-16 max-w-[180px] object-contain" />
                ) : (
                  <span className="font-display text-xl tracking-[0.35em]">{s.storeName.toUpperCase()}</span>
                )}
              </div>
              <div className="space-y-2">
                <p className="text-[13px] text-muted">{settings.logo ? 'Custom logo (stored in GridFS)' : 'No logo uploaded — the wordmark is used.'}</p>
                {canWrite && (
                  <div className="flex gap-2">
                    <Button type="button" variant="secondary" size="sm" loading={logoBusy} onClick={() => logoInput.current?.click()} icon={<ImagePlus className="h-4 w-4" aria-hidden />}>
                      {settings.logo ? 'Replace logo' : 'Upload logo'}
                    </Button>
                    {settings.logo && (
                      <Button type="button" variant="ghost" size="sm" onClick={() => setConfirmLogo(true)}>
                        Remove
                      </Button>
                    )}
                  </div>
                )}
                <input ref={logoInput} type="file" accept="image/png,image/jpeg,image/webp,image/avif" className="sr-only" aria-label="Upload logo" onChange={(e) => e.target.files?.[0] && uploadLogo(e.target.files[0])} />
              </div>
            </div>
          </Panel>
          <Panel title="Contact">
            <div className="grid gap-5 md:grid-cols-3">
              <Input label="Email" type="email" value={s.contact.email} onChange={(e) => setS({ ...s, contact: { ...s.contact, email: e.target.value } })} error={errors['contact.email']} />
              <Input label="Phone" value={s.contact.phone} onChange={(e) => setS({ ...s, contact: { ...s.contact, phone: e.target.value } })} />
              <Input label="Address" value={s.contact.address} onChange={(e) => setS({ ...s, contact: { ...s.contact, address: e.target.value } })} />
            </div>
          </Panel>
          <Panel title="Stock alerts">
            <Input label="Default low-stock threshold" inputMode="numeric" value={s.lowStockThreshold} onChange={(e) => setS({ ...s, lowStockThreshold: e.target.value.replace(/[^0-9]/g, '') })} hint="Each product can override this" wrapperClassName="max-w-xs" />
          </Panel>
        </>
      )}

      {section === 'commerce' && (
        <>
          <Panel title="Currencies" description="Prices are entered in the base currency. Other currencies are converted at the rate below; each order saves the rate it was charged at.">
            <div className="grid gap-5 md:grid-cols-3">
              <Select
                label="Base currency"
                value={s.base}
                onChange={(e) => {
                  const base = e.target.value as Currency;
                  setS({ ...s, base, enabled: [...new Set([...s.enabled, base])] });
                }}
                options={[
                  { value: 'GBP', label: 'GBP — British pound' },
                  { value: 'USD', label: 'USD — US dollar' },
                ]}
              />
              {s.base === 'GBP' ? (
                <Input label="USD per 1 GBP" inputMode="decimal" value={s.usdRate} onChange={(e) => setS({ ...s, usdRate: e.target.value })} error={errors['currency.rates.USD']} />
              ) : (
                <Input label="GBP per 1 USD" inputMode="decimal" value={s.gbpRate} onChange={(e) => setS({ ...s, gbpRate: e.target.value })} error={errors['currency.rates.GBP']} />
              )}
              <Select
                label="Converted price rounding"
                value={s.rounding}
                onChange={(e) => setS({ ...s, rounding: e.target.value as 'none' | 'whole' })}
                options={[
                  { value: 'none', label: 'Exact (e.g. $158.75)' },
                  { value: 'whole', label: 'Whole units (e.g. $159)' },
                ]}
              />
            </div>
            <fieldset className="mt-5">
              <legend className="mb-2 text-[0.72rem] font-medium uppercase tracking-[0.16em] text-graphite">Enabled at checkout</legend>
              <div className="flex gap-6">
                {(['GBP', 'USD'] as Currency[]).map((c) => (
                  <label key={c} className="flex items-center gap-2 text-[15px]">
                    <input type="checkbox" checked={s.enabled.includes(c)} disabled={c === s.base} onChange={(e) => toggleCurrency(c, e.target.checked)} className="h-4 w-4 accent-[var(--color-charcoal)]" />
                    {c}
                    {c === s.base && <span className="text-[12px] text-muted">(base)</span>}
                  </label>
                ))}
              </div>
            </fieldset>
          </Panel>

          <Panel title="Tax">
            <Switch checked={s.tax.enabled} onChange={(v) => setS({ ...s, tax: { ...s.tax, enabled: v } })} label="Charge tax" />
            <div className="mt-3 grid gap-5 md:grid-cols-3">
              <Input label="Label" value={s.tax.label} onChange={(e) => setS({ ...s, tax: { ...s.tax, label: e.target.value } })} maxLength={20} />
              <Input label="Rate (%)" inputMode="decimal" value={s.tax.rate} onChange={(e) => setS({ ...s, tax: { ...s.tax, rate: e.target.value } })} error={errors['tax.rate']} />
              <Select
                label="Prices"
                value={s.tax.inclusive ? 'inclusive' : 'exclusive'}
                onChange={(e) => setS({ ...s, tax: { ...s.tax, inclusive: e.target.value === 'inclusive' } })}
                options={[
                  { value: 'inclusive', label: 'Include tax (UK style)' },
                  { value: 'exclusive', label: 'Tax added at checkout' },
                ]}
              />
            </div>
          </Panel>

          <Panel title="Delivery methods" description="Prices in the base currency. “Free over” applies after discounts.">
            <div className="space-y-4">
              {delivery.map((d, i) => (
                <div key={i} className="grid gap-3 border border-line p-4 md:grid-cols-[110px_1fr_1fr_110px_110px_auto] md:items-end">
                  <Input label="ID" value={d.id} onChange={(e) => setDelivery(delivery.map((x, j) => (j === i ? { ...x, id: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '') } : x)))} error={errors[`delivery.${i}.id`]} />
                  <Input label="Name" value={d.name} onChange={(e) => setDelivery(delivery.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} error={errors[`delivery.${i}.name`]} />
                  <Input label="Estimate" value={d.etaDays} onChange={(e) => setDelivery(delivery.map((x, j) => (j === i ? { ...x, etaDays: e.target.value } : x)))} placeholder="3–5 working days" />
                  <Input label="Price" inputMode="decimal" value={d.price} onChange={(e) => setDelivery(delivery.map((x, j) => (j === i ? { ...x, price: e.target.value } : x)))} />
                  <Input label="Free over" inputMode="decimal" value={d.freeOver} onChange={(e) => setDelivery(delivery.map((x, j) => (j === i ? { ...x, freeOver: e.target.value } : x)))} placeholder="Never" />
                  <div className="flex items-center gap-2 pb-1">
                    <label className="flex items-center gap-2 text-[13px]">
                      <input type="checkbox" checked={d.isActive} onChange={(e) => setDelivery(delivery.map((x, j) => (j === i ? { ...x, isActive: e.target.checked } : x)))} className="h-4 w-4 accent-[var(--color-charcoal)]" />
                      Active
                    </label>
                    <button type="button" onClick={() => setDelivery(delivery.filter((_, j) => j !== i))} disabled={delivery.length <= 1} className="inline-flex h-10 w-10 items-center justify-center text-muted hover:text-danger disabled:opacity-30" aria-label={`Remove ${d.name || 'delivery method'}`}>
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                  <Input label="Description" value={d.description} onChange={(e) => setDelivery(delivery.map((x, j) => (j === i ? { ...x, description: e.target.value } : x)))} wrapperClassName="md:col-span-6" />
                </div>
              ))}
              <button type="button" onClick={() => setDelivery([...delivery, { id: `method-${delivery.length + 1}`, name: '', description: '', price: '0.00', freeOver: '', etaDays: '', isActive: true }])} className="inline-flex items-center gap-1 text-[13px] text-gold-deep hover:underline">
                <Plus className="h-3.5 w-3.5" aria-hidden /> Add delivery method
              </button>
            </div>
          </Panel>
        </>
      )}

      {section === 'content' && (
        <>
          <Panel title="Announcement bar">
            <Switch checked={s.announcement.enabled} onChange={(v) => setS({ ...s, announcement: { ...s.announcement, enabled: v } })} label="Show announcement" description="The thin bar above the storefront header" />
            <div className="mt-3 grid gap-5 md:grid-cols-[2fr_1fr]">
              <Input label="Text" value={s.announcement.text} onChange={(e) => setS({ ...s, announcement: { ...s.announcement, text: e.target.value } })} maxLength={160} />
              <Input label="Link" value={s.announcement.link} onChange={(e) => setS({ ...s, announcement: { ...s.announcement, link: e.target.value } })} placeholder="/clothing" />
            </div>
          </Panel>
          <Panel title="Return policy">
            <Textarea label="Policy text" value={s.returnPolicy} onChange={(e) => setS({ ...s, returnPolicy: e.target.value })} className="min-h-40" maxLength={5000} hint="Shown on product pages and the returns page" />
          </Panel>
          <Panel title="Social links">
            <div className="grid gap-5 md:grid-cols-2">
              {(['instagram', 'tiktok', 'x', 'facebook', 'pinterest', 'youtube'] as const).map((k) => (
                <div key={k} className="relative">
                  <Input label={k === 'x' ? 'X (Twitter)' : k[0].toUpperCase() + k.slice(1)} type="url" value={s.social[k] ?? ''} onChange={(e) => setS({ ...s, social: { ...s.social, [k]: e.target.value } })} placeholder="https://" error={errors[`social.${k}`]} />
                  {s.social[k] && (
                    <button type="button" onClick={() => setS({ ...s, social: { ...s.social, [k]: '' } })} className="absolute right-2 top-[34px] inline-flex h-8 w-8 items-center justify-center text-muted hover:text-ink" aria-label={`Clear ${k}`}>
                      <X className="h-4 w-4" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </Panel>
        </>
      )}

      {canWrite ? (
        <div className="sticky bottom-0 z-20 -mx-4 flex justify-end border-t border-line bg-ivory/95 px-4 py-3 backdrop-blur md:-mx-8 md:px-8">
          <Button type="submit" loading={save.isPending}>
            Save settings
          </Button>
        </div>
      ) : (
        <p className="text-[13px] text-muted">Only the owner can change store settings.</p>
      )}

      <ConfirmDialog open={confirmLogo} onClose={() => setConfirmLogo(false)} onConfirm={() => removeLogo.mutate()} loading={removeLogo.isPending} destructive title="Remove logo?" confirmLabel="Remove" body="The storefront will show the text wordmark instead." />
    </form>
  );
}

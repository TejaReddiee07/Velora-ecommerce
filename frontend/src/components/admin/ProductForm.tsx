'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Plus, Trash2, Wand2, X } from 'lucide-react';
import { api, ApiError } from '@/lib/api';
import { cn } from '@/lib/format';
import { Button } from '@/components/ui/Button';
import { Input, Select, Textarea, fieldErrors } from '@/components/ui/Field';
import { errorMessage, toMajor, toMinor } from '@/lib/admin/hooks';
import type { AdminBrand, AdminCategory, AdminProduct } from '@/lib/admin/types';
import { Dialog, Panel, Switch } from './ui';

type Dept = 'clothing' | 'footwear' | 'accessories';
const STYLES = ['casual', 'formal', 'streetwear', 'sportswear'] as const;
const SIZE_PRESETS: Record<string, string[]> = {
  'Tops XS–XL': ['XS', 'S', 'M', 'L', 'XL'],
  'Waist 28–36': ['28', '30', '32', '34', '36'],
  'Women UK 6–14': ['6', '8', '10', '12', '14'],
  'Shoes UK 6–11': ['UK 6', 'UK 7', 'UK 8', 'UK 9', 'UK 10', 'UK 11'],
  'Shoes UK 3–8': ['UK 3', 'UK 4', 'UK 5', 'UK 6', 'UK 7', 'UK 8'],
  'One size': ['One Size'],
};

interface VariantRow {
  key: string;
  _id?: string;
  sku: string;
  size: string;
  color: string;
  colorHex: string;
  /** null = untouched (server value is kept); string = owner typed a new absolute stock. */
  stockInput: string | null;
  serverStock: number;
  reserved: number;
  available: number;
  isActive: boolean;
}

const code = (s: string) =>
  s
    .toUpperCase()
    .replace(/^UK /, '')
    .replace(/[^A-Z0-9]+/g, '')
    .slice(0, 4) || 'X';

function skuPrefix(name: string) {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 3)
    .map((w) => w[0]!.toUpperCase())
    .join('')
    .replace(/[^A-Z0-9]/g, '');
  return `${initials || 'VL'}${Math.random().toString(36).slice(2, 5).toUpperCase()}`;
}

let keySeq = 0;
const nextKey = () => `v${++keySeq}`;

export function ProductForm({ product }: { product?: AdminProduct }) {
  const router = useRouter();
  const qc = useQueryClient();
  const editing = Boolean(product);

  const [name, setName] = useState(product?.name ?? '');
  const [slug, setSlug] = useState(product?.slug ?? '');
  const [shortDescription, setShortDescription] = useState(product?.shortDescription ?? '');
  const [description, setDescription] = useState(product?.description ?? '');
  const [department, setDepartment] = useState<Dept>(product?.department ?? 'footwear');
  const [gender, setGender] = useState(product?.gender ?? 'unisex');
  const [categoryId, setCategoryId] = useState(product?.category ?? '');
  const [brandId, setBrandId] = useState(product?.brand ?? '');
  const [styles, setStyles] = useState<string[]>(product?.styles ?? []);
  const [tags, setTags] = useState((product?.tags ?? []).join(', '));
  const [price, setPrice] = useState(toMajor(product?.price));
  const [salePrice, setSalePrice] = useState(toMajor(product?.salePrice));
  const [costPrice, setCostPrice] = useState(toMajor(product?.costPrice));
  const [specs, setSpecs] = useState<{ label: string; value: string }[]>(product?.specifications ?? []);
  const [sizeGuide, setSizeGuide] = useState(product?.sizeGuide ?? 'footwear');
  const [status, setStatus] = useState(product?.status ?? 'draft');
  const [flags, setFlags] = useState({ isFeatured: product?.isFeatured ?? false, isNewArrival: product?.isNewArrival ?? true, isBestSeller: product?.isBestSeller ?? false, showroom: product?.showroom ?? false });
  const [lowStock, setLowStock] = useState(String(product?.lowStockThreshold ?? 5));
  const [variants, setVariants] = useState<VariantRow[]>(
    () =>
      product?.variants.map((v) => ({
        key: nextKey(),
        _id: v._id,
        sku: v.sku,
        size: v.size,
        color: v.color,
        colorHex: v.colorHex,
        stockInput: null,
        serverStock: v.stock,
        reserved: v.reserved,
        available: v.available,
        isActive: v.isActive,
      })) ?? [],
  );
  const [sizesText, setSizesText] = useState('');
  const [newColors, setNewColors] = useState<{ name: string; hex: string }[]>([{ name: '', hex: '#111111' }]);
  const [defaultStock, setDefaultStock] = useState('10');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [newTaxonomy, setNewTaxonomy] = useState<null | 'category' | 'brand'>(null);
  const [taxonomyName, setTaxonomyName] = useState('');
  // SKU prefix: reuse the existing one when editing, otherwise derive from the name at first generation.
  const [prefix, setPrefix] = useState<string | null>(() => product?.variants[0]?.sku.split('-')[0] ?? null);

  // Keep live stock figures (updated in realtime by the parent query) without clobbering edits.
  const liveById = useMemo(() => new Map((product?.variants ?? []).map((v) => [v._id, v])), [product]);
  // Status can change from the page header (Publish/Unpublish) — never save a stale one.
  const productStatus = product?.status;
  useEffect(() => {
    if (productStatus) setStatus(productStatus);
  }, [productStatus]);
  const summaryRef = useRef<HTMLDivElement>(null);

  const categories = useQuery({ queryKey: ['admin', 'categories'], queryFn: async () => (await api<{ categories: AdminCategory[] }>('/admin/categories')).categories });
  const brands = useQuery({ queryKey: ['admin', 'brands'], queryFn: async () => (await api<{ brands: AdminBrand[] }>('/admin/brands')).brands });
  const deptCategories = (categories.data ?? []).filter((c) => c.department === department);

  const createTaxonomy = useMutation({
    mutationFn: async () => {
      if (newTaxonomy === 'category') return (await api<{ category: AdminCategory }>('/admin/categories', { body: { name: taxonomyName, department } })).category;
      return (await api<{ brand: AdminBrand }>('/admin/brands', { body: { name: taxonomyName } })).brand;
    },
    onSuccess: (doc) => {
      if (newTaxonomy === 'category') {
        qc.invalidateQueries({ queryKey: ['admin', 'categories'] });
        setCategoryId(doc._id);
      } else {
        qc.invalidateQueries({ queryKey: ['admin', 'brands'] });
        setBrandId(doc._id);
      }
      toast.success(`${newTaxonomy === 'category' ? 'Category' : 'Brand'} “${doc.name}” created`);
      setNewTaxonomy(null);
      setTaxonomyName('');
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  function generateVariants() {
    const sizes = sizesText
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    const colors = newColors.filter((c) => c.name.trim());
    if (!sizes.length || !colors.length) {
      toast.error('Enter at least one size and one colour name.');
      return;
    }
    const stock = Math.max(0, Number.parseInt(defaultStock, 10) || 0);
    const p = prefix ?? skuPrefix(name || 'Velora');
    if (!prefix) setPrefix(p);
    const existing = new Set(variants.map((v) => `${v.color.toLowerCase()}|${v.size.toLowerCase()}`));
    const added: VariantRow[] = [];
    for (const c of colors)
      for (const s of sizes) {
        if (existing.has(`${c.name.trim().toLowerCase()}|${s.toLowerCase()}`)) continue;
        added.push({ key: nextKey(), sku: `${p}-${code(c.name)}-${code(s)}`, size: s, color: c.name.trim(), colorHex: c.hex, stockInput: String(stock), serverStock: 0, reserved: 0, available: 0, isActive: true });
      }
    if (!added.length) toast.message('Those size and colour combinations already exist.');
    else toast.success(`${added.length} variant${added.length === 1 ? '' : 's'} added`);
    setVariants((v) => [...v, ...added]);
  }

  const updateVariant = (key: string, patch: Partial<VariantRow>) => setVariants((vs) => vs.map((v) => (v.key === key ? { ...v, ...patch } : v)));

  const save = useMutation({
    mutationFn: async () => {
      const body = {
        name: name.trim(),
        slug: slug.trim() || undefined,
        description: description.trim(),
        shortDescription: shortDescription.trim() || undefined,
        department,
        gender,
        categoryId,
        brandId,
        styles,
        tags: tags
          .split(',')
          .map((t) => t.trim().toLowerCase())
          .filter(Boolean),
        price: toMinor(price) ?? 0,
        salePrice: toMinor(salePrice),
        costPrice: toMinor(costPrice),
        specifications: specs.filter((s) => s.label.trim() && s.value.trim()),
        sizeGuide,
        status: editing ? status : 'draft',
        ...flags,
        lowStockThreshold: Math.max(0, Number.parseInt(lowStock, 10) || 0),
        variants: variants.map((v) => ({
          _id: v._id,
          sku: v.sku.trim().toUpperCase(),
          size: v.size.trim(),
          color: v.color.trim(),
          colorHex: v.colorHex,
          isActive: v.isActive,
          // Only send stock that was actually edited — never overwrite live sales with a stale number.
          ...(v.stockInput !== null ? { stock: Math.max(0, Number.parseInt(v.stockInput, 10) || 0) } : v._id ? {} : { stock: 0 }),
        })),
      };
      if (editing) return (await api<{ product: AdminProduct }>(`/admin/products/${product!._id}`, { method: 'PUT', body })).product;
      return (await api<{ product: AdminProduct }>('/admin/products', { body })).product;
    },
    onSuccess: (saved) => {
      setErrors({});
      qc.invalidateQueries({ queryKey: ['admin', 'products'] });
      qc.setQueryData(['admin', 'product', saved._id], saved);
      if (editing) {
        toast.success('Product saved — storefront updated');
        setVariants(
          saved.variants.map((v) => ({ key: nextKey(), _id: v._id, sku: v.sku, size: v.size, color: v.color, colorHex: v.colorHex, stockInput: null, serverStock: v.stock, reserved: v.reserved, available: v.available, isActive: v.isActive })),
        );
      } else {
        toast.success('Draft created — now add images, then publish');
        router.push(`/admin/products/${saved._id}?created=1`);
      }
    },
    onError: (e) => {
      if (e instanceof ApiError) {
        setErrors(fieldErrors(e.fields));
        if (e.fields?.length) setTimeout(() => summaryRef.current?.focus(), 0);
      }
      toast.error(errorMessage(e));
    },
  });

  const errorList = Object.entries(errors);

  const colorsInUse = [...new Map(variants.map((v) => [v.color, v.colorHex])).entries()];

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
        <div ref={summaryRef} tabIndex={-1} role="alert" className="border border-[#e3b4b4] bg-[#fbeeee] px-4 py-3 text-[14px] text-danger outline-none">
          <p className="font-medium">Please fix the following:</p>
          <ul className="mt-1 list-disc pl-5">
            {errorList.map(([path, msg]) => (
              <li key={path}>
                {path.replace(/^variants\.(\d+)\./, (_m, n) => `Variant ${Number(n) + 1} `)}: {msg}
              </li>
            ))}
          </ul>
        </div>
      )}
      <Panel title="Details">
        <div className="grid gap-5 md:grid-cols-2">
          <Input label="Name" required value={name} onChange={(e) => setName(e.target.value)} error={errors.name} maxLength={140} />
          <Input label="URL slug" value={slug} onChange={(e) => setSlug(e.target.value)} hint="Leave blank to generate from the name" error={errors.slug} maxLength={90} />
          <Textarea label="Short description" value={shortDescription} onChange={(e) => setShortDescription(e.target.value)} wrapperClassName="md:col-span-2" className="min-h-16" maxLength={300} error={errors.shortDescription} />
          <Textarea label="Full description" required value={description} onChange={(e) => setDescription(e.target.value)} wrapperClassName="md:col-span-2" className="min-h-36" maxLength={5000} error={errors.description} hint="At least 10 characters" />
        </div>
      </Panel>

      <Panel title="Organisation">
        <div className="grid gap-5 md:grid-cols-3">
          <Select
            label="Department"
            required
            value={department}
            onChange={(e) => {
              setDepartment(e.target.value as Dept);
              setCategoryId('');
              setSizeGuide(e.target.value === 'footwear' ? 'footwear' : e.target.value === 'accessories' ? 'none' : 'tops');
            }}
            options={[
              { value: 'clothing', label: 'Clothing' },
              { value: 'footwear', label: 'Footwear' },
              { value: 'accessories', label: 'Accessories' },
            ]}
          />
          <div>
            <Select label="Category" required value={categoryId} onChange={(e) => setCategoryId(e.target.value)} error={errors.categoryId} options={[{ value: '', label: categories.isLoading ? 'Loading…' : 'Choose a category' }, ...deptCategories.map((c) => ({ value: c._id, label: c.name }))]} />
            <button type="button" onClick={() => setNewTaxonomy('category')} className="mt-1.5 inline-flex items-center gap-1 text-[12px] text-gold-deep hover:underline">
              <Plus className="h-3 w-3" aria-hidden /> New category
            </button>
          </div>
          <div>
            <Select label="Brand" required value={brandId} onChange={(e) => setBrandId(e.target.value)} error={errors.brandId} options={[{ value: '', label: brands.isLoading ? 'Loading…' : 'Choose a brand' }, ...(brands.data ?? []).map((b) => ({ value: b._id, label: b.name }))]} />
            <button type="button" onClick={() => setNewTaxonomy('brand')} className="mt-1.5 inline-flex items-center gap-1 text-[12px] text-gold-deep hover:underline">
              <Plus className="h-3 w-3" aria-hidden /> New brand
            </button>
          </div>
          <Select
            label="Gender"
            value={gender}
            onChange={(e) => setGender(e.target.value as typeof gender)}
            options={[
              { value: 'women', label: 'Women' },
              { value: 'men', label: 'Men' },
              { value: 'unisex', label: 'Unisex' },
            ]}
          />
          <Select
            label="Size guide"
            value={sizeGuide}
            onChange={(e) => setSizeGuide(e.target.value as typeof sizeGuide)}
            options={[
              { value: 'tops', label: 'Tops & outerwear' },
              { value: 'bottoms', label: 'Bottoms' },
              { value: 'dresses', label: 'Dresses' },
              { value: 'footwear', label: 'Footwear' },
              { value: 'none', label: 'None' },
            ]}
          />
          <Input label="Tags" value={tags} onChange={(e) => setTags(e.target.value)} hint="Comma separated — used by search" />
          <fieldset className="md:col-span-3">
            <legend className="mb-2 text-[0.72rem] font-medium uppercase tracking-[0.16em] text-graphite">Style</legend>
            <div className="flex flex-wrap gap-2">
              {STYLES.map((s) => {
                const on = styles.includes(s);
                return (
                  <button key={s} type="button" aria-pressed={on} onClick={() => setStyles(on ? styles.filter((x) => x !== s) : [...styles, s])} className={cn('h-9 border px-4 text-[12px] uppercase tracking-[0.12em] transition-colors', on ? 'border-ink bg-ink text-ivory' : 'border-line-strong text-graphite hover:border-ink')}>
                    {s}
                  </button>
                );
              })}
            </div>
          </fieldset>
        </div>
      </Panel>

      <Panel title="Pricing" description="Enter amounts in pounds (£). Other currencies are converted using the rates in Settings.">
        <div className="grid gap-5 md:grid-cols-3">
          <Input label="Price (£)" required inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} error={errors.price} />
          <Input label="Discount price (£)" inputMode="decimal" value={salePrice} onChange={(e) => setSalePrice(e.target.value)} hint="Optional — must be lower than the price" error={errors.salePrice} />
          <Input label="Unit cost (£)" inputMode="decimal" value={costPrice} onChange={(e) => setCostPrice(e.target.value)} hint="Private — used for profit reporting" error={errors.costPrice} />
        </div>
        {toMinor(salePrice) != null && toMinor(price) != null && (toMinor(salePrice) ?? 0) < (toMinor(price) ?? 0) && (
          <p className="mt-3 text-[13px] text-gold-deep">Shown as {Math.round((1 - (toMinor(salePrice) ?? 0) / (toMinor(price) ?? 1)) * 100)}% off on the storefront.</p>
        )}
      </Panel>

      <Panel
        title="Variants & stock"
        description="One variant per size and colour, each with its own SKU and stock. Editing a stock number sets the on-hand quantity and is recorded in the stock ledger."
      >
        <div className="mb-6 grid grid-cols-1 gap-4 border border-dashed border-line-strong p-4 lg:grid-cols-[1fr_1.2fr_140px_auto] lg:items-end">
          <div>
            <Input label="Sizes" value={sizesText} onChange={(e) => setSizesText(e.target.value)} placeholder="e.g. UK 7, UK 8, UK 9" hint="Comma separated" />
            <div className="mt-2 flex flex-wrap gap-1.5">
              {Object.entries(SIZE_PRESETS).map(([label, sizes]) => (
                <button key={label} type="button" onClick={() => setSizesText(sizes.join(', '))} className="border border-line px-2 py-1 text-[11px] text-graphite hover:border-ink">
                  {label}
                </button>
              ))}
            </div>
          </div>
          <div className="space-y-2">
            <p className="text-[0.72rem] font-medium uppercase tracking-[0.16em] text-graphite">Colours</p>
            {newColors.map((c, i) => (
              <div key={i} className="flex gap-2">
                <label className="sr-only" htmlFor={`colour-hex-${i}`}>
                  Colour swatch {i + 1}
                </label>
                <input id={`colour-hex-${i}`} type="color" value={c.hex} onChange={(e) => setNewColors(newColors.map((x, j) => (j === i ? { ...x, hex: e.target.value } : x)))} className="h-12 w-12 shrink-0 cursor-pointer border border-line-strong bg-paper p-1" />
                <label className="sr-only" htmlFor={`colour-name-${i}`}>
                  Colour name {i + 1}
                </label>
                <input id={`colour-name-${i}`} value={c.name} onChange={(e) => setNewColors(newColors.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} placeholder="Colour name, e.g. Ivory" className="h-12 min-w-0 flex-1 border border-line-strong bg-paper px-3 text-[15px]" />
                {newColors.length > 1 && (
                  <button type="button" onClick={() => setNewColors(newColors.filter((_, j) => j !== i))} className="inline-flex h-12 w-10 items-center justify-center text-muted hover:text-danger" aria-label={`Remove colour ${i + 1}`}>
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>
            ))}
            <button type="button" onClick={() => setNewColors([...newColors, { name: '', hex: '#111111' }])} className="inline-flex items-center gap-1 text-[12px] text-gold-deep hover:underline">
              <Plus className="h-3 w-3" aria-hidden /> Add colour
            </button>
          </div>
          <Input label="Stock each" inputMode="numeric" value={defaultStock} onChange={(e) => setDefaultStock(e.target.value.replace(/[^0-9]/g, ''))} />
          <Button type="button" variant="secondary" onClick={generateVariants} icon={<Wand2 className="h-4 w-4" aria-hidden />}>
            Generate
          </Button>
        </div>

        {errors.variants && <p className="mb-3 text-[13px] text-danger" role="alert">{errors.variants}</p>}
        {variants.length === 0 ? (
          <p className="py-6 text-center text-[14px] text-muted">No variants yet. Enter sizes and colours above, then Generate.</p>
        ) : (
          <div className="overflow-x-auto border border-line" tabIndex={0} role="region" aria-label="Variants">
            <table className="w-full min-w-[820px] text-[14px]">
              <thead>
                <tr className="text-left">
                  {['Colour', 'Size', 'SKU', 'On hand', 'Reserved', 'Available', 'Active', ''].map((h) => (
                    <th key={h} scope="col" className="border-b border-line bg-sand/40 px-3 py-2.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-graphite">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {variants.map((v) => {
                  const live = v._id ? liveById.get(v._id) : undefined;
                  const serverStock = live?.stock ?? v.serverStock;
                  return (
                    <tr key={v.key}>
                      <td className="border-b border-line px-3 py-2">
                        <span className="flex items-center gap-2">
                          <input type="color" value={v.colorHex} onChange={(e) => updateVariant(v.key, { colorHex: e.target.value })} aria-label={`Swatch for ${v.color}`} className="h-8 w-8 cursor-pointer border border-line-strong p-0.5" />
                          <input value={v.color} onChange={(e) => updateVariant(v.key, { color: e.target.value })} aria-label="Colour name" className="h-9 w-40 border border-line-strong bg-paper px-2" />
                        </span>
                      </td>
                      <td className="border-b border-line px-3 py-2">
                        <input value={v.size} onChange={(e) => updateVariant(v.key, { size: e.target.value })} aria-label="Size" className="h-9 w-20 border border-line-strong bg-paper px-2" />
                      </td>
                      <td className="border-b border-line px-3 py-2">
                        <input value={v.sku} onChange={(e) => updateVariant(v.key, { sku: e.target.value.toUpperCase() })} aria-label="SKU" className="h-9 w-44 border border-line-strong bg-paper px-2 font-mono text-[12px]" />
                      </td>
                      <td className="border-b border-line px-3 py-2">
                        <input
                          inputMode="numeric"
                          value={v.stockInput ?? String(serverStock)}
                          onChange={(e) => updateVariant(v.key, { stockInput: e.target.value.replace(/[^0-9]/g, '') })}
                          aria-label={`On-hand stock for ${v.sku}`}
                          className={cn('tabular h-9 w-20 border bg-paper px-2', v.stockInput !== null && v._id ? 'border-gold-deep' : 'border-line-strong')}
                        />
                        {v.stockInput !== null && v._id && (
                          <button type="button" onClick={() => updateVariant(v.key, { stockInput: null })} className="ml-1 text-[11px] text-muted hover:text-ink">
                            undo
                          </button>
                        )}
                      </td>
                      <td className="tabular border-b border-line px-3 py-2 text-graphite">{live?.reserved ?? v.reserved}</td>
                      <td className="tabular border-b border-line px-3 py-2">{v._id ? live?.available ?? v.available : '—'}</td>
                      <td className="border-b border-line px-3 py-2">
                        <input type="checkbox" checked={v.isActive} onChange={(e) => updateVariant(v.key, { isActive: e.target.checked })} aria-label={`${v.sku} active`} className="h-4 w-4 accent-[var(--color-charcoal)]" />
                      </td>
                      <td className="border-b border-line px-3 py-2 text-right">
                        <button type="button" onClick={() => setVariants((vs) => vs.filter((x) => x.key !== v.key))} disabled={(live?.reserved ?? v.reserved) > 0} title={(live?.reserved ?? v.reserved) > 0 ? 'Units are reserved in open checkouts' : 'Remove variant'} className="inline-flex h-9 w-9 items-center justify-center text-muted hover:text-danger disabled:opacity-30" aria-label={`Remove variant ${v.sku}`}>
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {colorsInUse.length > 0 && (
          <p className="mt-3 flex flex-wrap items-center gap-3 text-[12px] text-muted">
            Colours:
            {colorsInUse.map(([c, hex]) => (
              <span key={c} className="inline-flex items-center gap-1.5">
                <span className="h-3 w-3 border border-line-strong" style={{ background: hex }} aria-hidden /> {c}
              </span>
            ))}
          </p>
        )}
      </Panel>

      <Panel title="Specifications">
        <div className="space-y-2">
          {specs.map((s, i) => (
            <div key={i} className="flex gap-2">
              <input value={s.label} onChange={(e) => setSpecs(specs.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))} placeholder="Label (e.g. Upper)" aria-label={`Specification ${i + 1} label`} className="h-11 w-40 shrink-0 border border-line-strong bg-paper px-3 sm:w-56" />
              <input value={s.value} onChange={(e) => setSpecs(specs.map((x, j) => (j === i ? { ...x, value: e.target.value } : x)))} placeholder="Value (e.g. Full-grain leather)" aria-label={`Specification ${i + 1} value`} className="h-11 min-w-0 flex-1 border border-line-strong bg-paper px-3" />
              <button type="button" onClick={() => setSpecs(specs.filter((_, j) => j !== i))} className="inline-flex h-11 w-10 items-center justify-center text-muted hover:text-danger" aria-label={`Remove specification ${i + 1}`}>
                <X className="h-4 w-4" />
              </button>
            </div>
          ))}
          <button type="button" onClick={() => setSpecs([...specs, { label: '', value: '' }])} className="inline-flex items-center gap-1 text-[13px] text-gold-deep hover:underline">
            <Plus className="h-3.5 w-3.5" aria-hidden /> Add specification
          </button>
        </div>
      </Panel>

      <Panel title="Merchandising">
        <div className="grid gap-x-10 md:grid-cols-2">
          <div>
            <Switch checked={flags.isFeatured} onChange={(v) => setFlags({ ...flags, isFeatured: v })} label="Featured" description="Shown in featured collections" />
            <Switch checked={flags.isNewArrival} onChange={(v) => setFlags({ ...flags, isNewArrival: v })} label="New arrival" description="Shown in New Arrivals" />
            <Switch checked={flags.isBestSeller} onChange={(v) => setFlags({ ...flags, isBestSeller: v })} label="Best seller" description="Shown in Best Sellers" />
            <Switch checked={flags.showroom} onChange={(v) => setFlags({ ...flags, showroom: v })} label="3D showroom" description="Hangs on the rack at /showroom (garments only)" />
          </div>
          <div className="space-y-5">
            <Input label="Low-stock alert at" inputMode="numeric" value={lowStock} onChange={(e) => setLowStock(e.target.value.replace(/[^0-9]/g, ''))} hint="Owner is notified when a variant drops to this many units" />
            {editing ? (
              <Select
                label="Status"
                value={status}
                onChange={(e) => setStatus(e.target.value as typeof status)}
                options={[
                  { value: 'draft', label: 'Draft — hidden from customers' },
                  { value: 'published', label: 'Published — live on the storefront' },
                  { value: 'archived', label: 'Archived' },
                ]}
              />
            ) : (
              <p className="border border-line bg-sand/40 px-4 py-3 text-[13px] text-graphite">New products are saved as drafts. Add images on the next screen, then publish.</p>
            )}
          </div>
        </div>
      </Panel>

      <div className="sticky bottom-0 z-20 -mx-4 flex items-center justify-end gap-3 border-t border-line bg-ivory/95 px-4 py-3 backdrop-blur md:-mx-8 md:px-8">
        <Button type="button" variant="ghost" onClick={() => router.push('/admin/products')}>
          Cancel
        </Button>
        <Button type="submit" loading={save.isPending} disabled={!name.trim() || !categoryId || !brandId || !price || variants.length === 0}>
          {editing ? 'Save changes' : 'Create draft'}
        </Button>
      </div>

      <Dialog
        open={newTaxonomy !== null}
        onClose={() => setNewTaxonomy(null)}
        title={newTaxonomy === 'category' ? `New ${department} category` : 'New brand'}
        size="sm"
        footer={
          <>
            <Button type="button" variant="ghost" size="sm" onClick={() => setNewTaxonomy(null)}>
              Cancel
            </Button>
            <Button type="button" size="sm" loading={createTaxonomy.isPending} disabled={taxonomyName.trim().length < 2} onClick={() => createTaxonomy.mutate()}>
              Create
            </Button>
          </>
        }
      >
        <Input label="Name" value={taxonomyName} onChange={(e) => setTaxonomyName(e.target.value)} data-autofocus maxLength={80} />
      </Dialog>
    </form>
  );
}

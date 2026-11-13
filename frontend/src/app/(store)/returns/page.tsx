import type { Metadata } from 'next';
import { serverApi } from '@/lib/server-api';
import { money } from '@/lib/format';
import type { PublicSettings } from '@/lib/types';

export const metadata: Metadata = { title: 'Delivery & returns' };

export default async function ReturnsPage() {
  const s = await serverApi<PublicSettings>('/settings/public');
  return (
    <div className="container-luxe max-w-4xl pt-[150px]">
      <h1 className="text-[clamp(2.6rem,6vw,4.5rem)] leading-none">Delivery & returns</h1>
      <section className="mt-12">
        <h2 className="mb-6 text-3xl">Delivery options</h2>
        <table className="tabular w-full border-collapse text-[15px]">
          <thead>
            <tr className="border-b border-ink text-left text-[11px] uppercase tracking-[0.14em] text-graphite">
              <th scope="col" className="py-3 pr-4 font-medium">Service</th>
              <th scope="col" className="py-3 pr-4 font-medium">Timing</th>
              <th scope="col" className="py-3 font-medium">Price</th>
            </tr>
          </thead>
          <tbody>
            {s?.delivery.map((d) => (
              <tr key={d.id} className="border-b border-line">
                <td className="py-4 pr-4">{d.name}<span className="block text-[13px] text-muted">{d.description}</span></td>
                <td className="py-4 pr-4 text-graphite">{d.etaDays}</td>
                <td className="py-4">{money(d.price, s.currency.base)}{d.freeOver != null && <span className="block text-[13px] text-muted">Free over {money(d.freeOver, s.currency.base)}</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      <section className="mt-16">
        <h2 className="mb-4 text-3xl">Returns</h2>
        <p className="whitespace-pre-line leading-relaxed text-graphite">{s?.returnPolicy}</p>
      </section>
    </div>
  );
}

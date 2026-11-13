import type { Metadata } from 'next';
import { SizeGuideTable } from '@/components/store/SizeGuide';

export const metadata: Metadata = { title: 'Size guide' };

export default function SizeGuidePage() {
  return (
    <div className="container-luxe max-w-4xl pt-[150px]">
      <h1 className="text-[clamp(2.6rem,6vw,4.5rem)] leading-none">Size guide</h1>
      <p className="mt-6 max-w-xl text-graphite">Measurements are body measurements. Each product page also includes fit notes — for example whether a style runs large or small.</p>
      <div className="mt-14 space-y-16">
        {['tops', 'bottoms', 'dresses', 'footwear'].map((t) => (
          <SizeGuideTable key={t} type={t} />
        ))}
      </div>
    </div>
  );
}

import fs from 'node:fs/promises';
import path from 'node:path';
import { Suspense } from 'react';
import type { Metadata } from 'next';
import { Showroom } from '@/components/showroom/Showroom';

export const metadata: Metadata = {
  title: '3D Showroom',
  description: 'Browse shirts, tees, outerwear, dresses, tailoring and knitwear on the rails of the VELORA 3D showroom.',
};

/**
 * Lists the transparent cut-outs present in /public/showroom so the 3D scene
 * knows which pieces have a real PNG and which use a photo placeholder.
 * Returns null when the folder can't be read (the client then checks itself).
 */
async function availableCutouts(): Promise<string[] | null> {
  try {
    const files = await fs.readdir(path.join(process.cwd(), 'public', 'showroom'));
    return files.filter((f) => f.toLowerCase().endsWith('.png')).map((f) => f.slice(0, -4));
  } catch {
    return null;
  }
}

export default async function ShowroomPage() {
  const cutouts = await availableCutouts();
  return (
    <Suspense>
      <Showroom cutoutSlugs={cutouts} />
    </Suspense>
  );
}

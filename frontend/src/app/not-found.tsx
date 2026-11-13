import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="flex min-h-[100svh] flex-col items-center justify-center bg-ivory px-4 text-center">
      <p className="font-display text-[clamp(5rem,18vw,12rem)] leading-none text-line-strong">404</p>
      <h1 className="mt-4 text-4xl">This page has moved on</h1>
      <p className="mt-4 max-w-md text-muted">The piece or page you were looking for is no longer here. Let us take you somewhere beautiful instead.</p>
      <div className="mt-10 flex gap-6 text-[13px] uppercase tracking-[0.18em]">
        <Link href="/" className="link-underline">Home</Link>
        <Link href="/new-arrivals" className="link-underline">New arrivals</Link>
        <Link href="/clothing" className="link-underline">Clothing</Link>
      </div>
    </div>
  );
}

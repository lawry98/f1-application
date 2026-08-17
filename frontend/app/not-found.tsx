import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-950">
      <div className="max-w-md px-4 text-center">
        <h1 className="mb-4 text-8xl font-bold text-f1-red">404</h1>
        <h2 className="mb-4 text-2xl font-bold text-ink">Page not found</h2>
        <p className="mb-8 text-zinc-400">The page you&apos;re looking for doesn&apos;t exist.</p>
        <Link
          href="/"
          className="inline-block rounded-lg bg-f1-red px-6 py-3 font-semibold text-white transition-colors hover:bg-red-700"
        >
          ← Back to Briefing Agent
        </Link>
      </div>
    </div>
  );
}

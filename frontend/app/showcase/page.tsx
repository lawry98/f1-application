import type { Metadata } from 'next';
import dynamic from 'next/dynamic';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'F1 Car Showcase | F1 Briefing Agent',
  description: 'Explore all 10 F1 team liveries in interactive 3D.',
};

const F1CarShowcase = dynamic(() => import('@/components/3d/f1-car-showcase'), {
  ssr: false,
  loading: () => (
    <div className="flex min-h-screen items-center justify-center bg-zinc-950">
      <div className="text-center">
        <div className="mx-auto mb-4 h-16 w-16 animate-spin rounded-full border-4 border-f1-red border-t-transparent" />
        <p className="text-zinc-400">Loading 3D showcase...</p>
      </div>
    </div>
  ),
});

export default function ShowcasePage() {
  return (
    <>
      <F1CarShowcase />

      {/* Credits Footer */}
      <div className="fixed bottom-4 right-4 z-10">
        <Link
          href="/credits"
          className="rounded-lg border border-zinc-700 bg-zinc-900/90 px-4 py-2 text-sm text-white backdrop-blur-sm transition-colors hover:bg-zinc-800"
        >
          📝 Credits
        </Link>
      </div>
    </>
  );
}

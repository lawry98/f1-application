import type { Metadata } from 'next';
import dynamic from 'next/dynamic';

export const metadata: Metadata = {
  title: 'Anatomy of an F1 Car',
  description:
    'A scroll-driven teardown that reveals the engineering hidden inside an F1 car — from carbon bodywork to the V6 turbo-hybrid power unit.',
};

const TeardownScene = dynamic(
  () =>
    import('@/components/teardown/teardown-scene').then((mod) => ({
      default: mod.TeardownScene,
    })),
  {
    ssr: false,
    loading: () => (
      <div className="flex min-h-screen items-center justify-center bg-zinc-950">
        <p className="text-sm text-zinc-600">Initialising…</p>
      </div>
    ),
  },
);

export default function TeardownPage() {
  return <TeardownScene />;
}

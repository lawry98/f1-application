import dynamic from 'next/dynamic';
import { BriefingChat } from '@/components/briefing/briefing-chat';
import { DotPattern } from '@/components/ui/dot-pattern';

const F1HeroScene = dynamic(() => import('@/components/3d/F1HeroScene'), {
  ssr: false,
  loading: () => (
    <div className="flex h-[500px] w-full animate-pulse items-center justify-center bg-zinc-900">
      <p className="text-zinc-500">Loading 3D scene...</p>
    </div>
  ),
});

export default function Home() {
  return (
    <main className="min-h-screen bg-zinc-950">
      <F1HeroScene teamColor="#dc2626" />

      <div className="relative">
        <DotPattern className="text-zinc-800/40" />
        <div className="container relative mx-auto px-4 py-8">
          <BriefingChat />
        </div>
      </div>
    </main>
  );
}

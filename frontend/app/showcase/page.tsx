import dynamic from 'next/dynamic';
import Link from 'next/link';

const F1CarShowcase = dynamic(() => import('@/components/3d/F1CarShowcase'), {
  ssr: false,
  loading: () => (
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
      <div className="text-center">
        <div className="w-16 h-16 border-4 border-f1-red border-t-transparent rounded-full animate-spin mx-auto mb-4" />
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
          className="px-4 py-2 bg-zinc-900/90 hover:bg-zinc-800 border border-zinc-700 rounded-lg text-white text-sm transition-colors backdrop-blur-sm"
        >
          📝 Credits
        </Link>
      </div>
    </>
  );
}

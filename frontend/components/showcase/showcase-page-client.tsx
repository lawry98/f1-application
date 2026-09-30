'use client';

import dynamic from 'next/dynamic';

/**
 * The `/showcase` scene, client-only. Three.js throws when server-rendered, and since Next 15
 * `ssr: false` is refused outside a Client Component, so the `dynamic()` call lives here rather
 * than in `app/showcase/page.tsx`, which stays a Server Component for its `metadata`.
 */
export const ShowcasePageClient = dynamic(() => import('@/components/3d/f1-car-showcase'), {
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

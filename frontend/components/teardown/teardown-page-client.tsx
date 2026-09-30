'use client';

import dynamic from 'next/dynamic';

/**
 * The `/teardown` scrubber, client-only: it draws on a canvas from `Image` objects and never had
 * anything to server-render. Since Next 15 `ssr: false` is refused outside a Client Component, so
 * the `dynamic()` call lives here rather than in `app/teardown/page.tsx`, which stays a Server
 * Component for its `metadata`.
 */
export const TeardownPageClient = dynamic(
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

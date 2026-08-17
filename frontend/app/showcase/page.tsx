import type { Metadata } from 'next';
import dynamic from 'next/dynamic';
import Link from 'next/link';

import { focusRingOffsetBase } from '@/lib/focus';
import { cn } from '@/lib/utils';

export const metadata: Metadata = {
  title: 'F1 Car Showcase',
  description: 'Explore all 11 F1 team liveries in interactive 3D.',
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
    /*
      One `<main>` around the whole route, matching `/teams` and `/credits`. There is no nav here,
      so *every* visible element was outside any landmark: axe reported `landmark-one-main` plus
      seven orphaned `region` nodes. The floating link is inside it too — `region` is a
      DOM-ancestry rule, and a `position: fixed` element is laid out against the viewport whatever
      non-transformed ancestor it hangs off, so the wrapper costs no layout.

      Nothing else about this route changes. It is a spec non-goal — "no content rewrites on
      /showcase or /credits; they inherit tokens only" — and a landmark, a heading level and a
      focus ring are not content rewrites.
    */
    <main>
      <F1CarShowcase />

      <div className="fixed bottom-4 right-4 z-10">
        <Link
          href="/credits"
          className={cn(
            'rounded-lg border border-zinc-700 bg-zinc-900/90 px-4 py-2 text-sm text-white backdrop-blur-sm transition-colors hover:bg-zinc-800',
            /*
             * A filled, non-red control on a page whose backdrop really is `base` — this route
             * carries no `TopoBackground`, so the offset band is the colour actually behind the
             * chip and disappears into it rather than painting the dark halo `lib/focus.ts`
             * describes on the topo routes. The shared token replaces the browser default, which
             * this link relied on and which no other control on the branch still uses.
             */
            focusRingOffsetBase,
          )}
        >
          📝 Credits
        </Link>
      </div>
    </main>
  );
}

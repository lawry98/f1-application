import type { Metadata } from 'next';
import Link from 'next/link';

import { LandingNav } from '@/components/landing/landing-nav';
import { ShowcasePageClient } from '@/components/showcase/showcase-page-client';
import { focusRingOffsetBase } from '@/lib/focus';
import { cn } from '@/lib/utils';

export const metadata: Metadata = {
  title: 'F1 Car Showcase',
  description: 'Explore all 11 F1 team liveries in interactive 3D.',
};

export default function ShowcasePage() {
  return (
    <>
      <LandingNav />
      {/*
        One `<main>` around everything below the nav, matching `/teams` and `/credits`. Before the
        route had a nav, *every* visible element was outside any landmark: axe reported
        `landmark-one-main` plus seven orphaned `region` nodes. The floating link is inside it too
        — `region` is a DOM-ancestry rule, and a `position: fixed` element is laid out against the
        viewport whatever non-transformed ancestor it hangs off, so the wrapper costs no layout.

        `pt-14` clears the fixed 56 px nav. The canvas below is `h-[70vh]` at the container's width
        whatever sits above it, so the camera's fit is unchanged by it.

        Nothing else about this route changes. It is a spec non-goal — "no content rewrites on
        /showcase or /credits; they inherit tokens only" — and a landmark, a heading level and a
        focus ring are not content rewrites.
      */}
      <main className="min-h-screen bg-zinc-950 pt-14">
        <ShowcasePageClient />

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
    </>
  );
}

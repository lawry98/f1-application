'use client';

import { useEffect, useRef } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { focusRing, focusRingOffsetBase } from '@/lib/focus';
import { cn } from '@/lib/utils';
import { NAV_LINKS } from './links';

export function LandingNav() {
  const pathname = usePathname();
  const currentRef = useRef<HTMLAnchorElement | null>(null);

  /*
   * Bring the current page's link into view in the scrolling row.
   *
   * Six links overflow a phone, so the row scrolls — and the link for the page you are on can
   * start off screen, leaving the nav showing no sign of where you are. `teams-chip-strip.tsx`
   * has the same problem and the same fix.
   *
   * `block: 'nearest'` matters: without it this also scrolls the *page* vertically, so arriving
   * on a route would silently jump you past the top of it. `behavior: 'auto'` because this is an
   * arrival, not a transition — there is nothing for a smooth scroll to explain.
   */
  useEffect(() => {
    currentRef.current?.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'auto' });
  }, [pathname]);

  return (
    <header className="fixed top-0 z-50 w-full border-b border-zinc-800/60 bg-zinc-950/90 backdrop-blur-md">
      <nav
        className="container mx-auto flex h-14 max-w-7xl items-center justify-between gap-3 px-4"
        aria-label="Main navigation"
      >
        {/* `flex-shrink-0`: the wordmark is the one thing in this bar that must never be squeezed.
            Without it the brand and the link row shared the shortfall at 390 and both lost — the
            wordmark wrapped to two lines inside a 56 px bar. */}
        <Link
          href="/"
          className={cn(
            'flex flex-shrink-0 items-center gap-2 text-sm font-semibold tracking-tight text-ink transition-opacity hover:opacity-80',
            // Not a filled control — it is text on the header's own near-black. `focusRing` is the
            // flush red ring; the whole rule and its measurements live in `lib/focus.ts`.
            focusRing,
          )}
        >
          <span className="h-2 w-2 rounded-full bg-f1-red" aria-hidden="true" />
          F1 Briefing Agent
        </Link>

        {/*
         * The link row scrolls horizontally when it does not fit, rather than being clipped.
         *
         * Measured at a 390 viewport before this change: the `ul` was **393.3 px wide inside a
         * 390 px viewport**, `Showcase` ended at x=400.6 and `Credits` at x=475.8 — both entirely
         * past the right edge — while `document.documentElement.scrollWidth` stayed at 390, so the
         * page did not scroll to reach them. Two of the then-five destinations were simply
         * unreachable on a phone, and `/tyres` has since made it a six-link row.
         *
         * Why scroll and not a smaller type ramp: the labels plus their gaps measure 432.6 px
         * at their natural size (measured at 1440, before `Tyres`), and after the wordmark and the
         * `px-4` gutters there are ~212 px to put them in. That is a 51% reduction — unreachable by
         * type or spacing without going to ~7 px text. Why scroll and not a disclosure:
         * `SHARED-P7.md` requires every link to survive, and a scroller keeps them all reachable
         * with no new state, no focus trap and no second rendering of the same list. It is also the
         * pattern this branch already chose for the same problem on `/teams`
         * (`teams-chip-strip.tsx`).
         *
         * `min-w-0` is what actually permits the shrink — a flex item's automatic minimum size is
         * its content, so without it the row keeps its 432.6 px and overflows the *header* again
         * instead of scrolling inside itself. On desktop the row is narrower than the space
         * available, so nothing shrinks and nothing scrolls: the 1440 layout is unchanged, pinned
         * by the test below.
         *
         * `py-1.5` is not spacing, it is the focus ring's clearance. `overflow-x: auto` forces
         * `overflow-y` to compute to `auto` as well, and a ring drawn at `ring-offset-2` is a
         * box-shadow painted 4 px outside the link — which a scroll container clips. 6 px of
         * padding keeps every ring inside the box.
         *
         * `overscroll-x-contain` stops a horizontal swipe on the bar from chaining into the
         * browser's back gesture. The scrollbar is hidden with the same pair of arbitrary
         * properties `teams-chip-strip.tsx` uses, so the bar does not gain a grey rail on the
         * platforms that reserve space for one.
         */}
        <ul
          className="flex min-w-0 items-center gap-1 overflow-x-auto overscroll-x-contain py-1.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          role="list"
        >
          {NAV_LINKS.map(({ href, label }) => (
            // `flex-shrink-0` per item: inside the scroller the labels must keep their natural
            // width. Without it flex shrinks them again and "Car Anatomy" wraps to two lines,
            // which is how the row lost 39 px of its own width before this change.
            <li key={href} className="flex-shrink-0">
              <Link
                href={href}
                ref={pathname === href ? currentRef : undefined}
                // Exact match, not `startsWith`: `/` would otherwise mark every route.
                aria-current={pathname === href ? 'page' : undefined}
                className={cn(
                  'block whitespace-nowrap rounded-md px-3 py-1.5 text-sm transition-colors',
                  // The active row is a *filled* control (`bg-zinc-800`), where a flush red ring
                  // measures 3.00:1 — exactly at the bar. The offset band separates the ring from
                  // that fill and is painted in the header's own colour; see `lib/focus.ts`.
                  focusRingOffsetBase,
                  pathname === href
                    ? 'bg-zinc-800 text-white'
                    : 'text-zinc-400 hover:bg-zinc-800/60 hover:text-white',
                )}
              >
                {label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </header>
  );
}

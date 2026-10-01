'use client';

import { useEffect, useRef, type FocusEvent } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useScrollEdges } from '@/hooks/use-scroll-edges';
import { focusRing, focusRingOffsetBase } from '@/lib/focus';
import { cn } from '@/lib/utils';
import { NAV_LINKS } from './links';

/** Each overflow fade's width. Also the clearance the focus handler keeps a ring out of it by. */
const FADE_PX = 24;
/** How far a focus ring paints outside its link: `ring-offset-2` plus `ring-2` (`lib/focus.ts`). */
const RING_REACH_PX = 4;
/** A Tabbed-to link's distance from a row edge: past the fade and its ring, plus 2 px of air. */
const FOCUS_CLEARANCE_PX = FADE_PX + RING_REACH_PX + 2;

/**
 * Scrolls a keyboard-focused link far enough in from either edge of the row that its ring clears
 * the fade there.
 *
 * The browser does not do this itself. Measured in Chromium at 375: Tab to a link that is only
 * partly scrolled out of the row and focus scrolls nothing, so the link stays flush with the edge,
 * its ring clipped by the scroller and painted over by the fade. Only a link entirely out of view
 * gets scrolled to. Moving by the shortfall, not centring, keeps each Tab to the smallest jump.
 *
 * Keyboard focus only. A mouse focuses a link on `mousedown`, and scrolling the row then would slide
 * the link out from under the pointer before `mouseup`, so the click would land on whatever took
 * its place. At the row's two ends the browser clamps the scroll, and there the fade on that side
 * is gone and `px-1.5` is the ring's room.
 */
function keepFocusedLinkClear(event: FocusEvent<HTMLUListElement>) {
  const row = event.currentTarget;
  const link = event.target;
  if (link === row || !link.matches(':focus-visible')) return;

  const rowBox = row.getBoundingClientRect();
  const linkBox = link.getBoundingClientRect();
  const overStart = rowBox.left + FOCUS_CLEARANCE_PX - linkBox.left;
  const overEnd = linkBox.right + FOCUS_CLEARANCE_PX - rowBox.right;
  if (overStart > 0) row.scrollLeft -= overStart;
  else if (overEnd > 0) row.scrollLeft += overEnd;
}

export function LandingNav() {
  const pathname = usePathname();
  const currentRef = useRef<HTMLAnchorElement | null>(null);
  const rowRef = useRef<HTMLUListElement | null>(null);

  /*
   * Bring the current page's link into view in the scrolling row.
   *
   * Seven links overflow a phone, so the row scrolls — and the link for the page you are on can
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

  // Called after the effect above on purpose: its first measurement then reads the row already
  // scrolled to the current link, so the fades are right on arrival rather than one scroll event
  // later. On `/credits` the row arrives at its end, with the start fade up and the end fade gone.
  const edges = useScrollEdges(rowRef);

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
         * unreachable on a phone, and `/tyres` and `/standings` have since made it a seven-link row.
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
         * instead of scrolling inside itself. It sits on the wrapper, which is the bar's flex item
         * now that it also positions the fades. On desktop the row is narrower than the space
         * available, so nothing shrinks and nothing scrolls: the 1440 layout is unchanged, pinned
         * by the test below.
         *
         * `py-1.5` is not spacing, it is the focus ring's clearance. `overflow-x: auto` forces
         * `overflow-y` to compute to `auto` as well, and a ring drawn at `ring-offset-2` is a
         * box-shadow painted 4 px outside the link — which a scroll container clips. 6 px of
         * padding keeps every ring inside the box. `px-1.5` is the same clearance at the row's two
         * ends: without it the first link sat flush with the left edge and lost the left 4 px of
         * its ring, at 375 and at 1440 alike, and the last link its right side at the end.
         *
         * `overscroll-x-contain` stops a horizontal swipe on the bar from chaining into the
         * browser's back gesture. The scrollbar is hidden with the same pair of arbitrary
         * properties `teams-chip-strip.tsx` uses, so the bar does not gain a grey rail on the
         * platforms that reserve space for one.
         *
         * Hiding the scrollbar hid the only sign the row scrolls: at 375 it shows about two of its
         * eight links and nothing said there were six more. The two fades below are that sign — one
         * at each edge that has links past it, set from the scroll position by `useScrollEdges`,
         * so a row where everything fits gets neither. They switch rather than animate, so there
         * is nothing for reduced motion to take away, and there is no nudge: a row that moves by
         * itself on arrival is motion the reader did not ask for. `keepFocusedLinkClear` keeps a
         * Tabbed-to ring out from under them.
         */}
        <div className="relative min-w-0">
          <ul
            ref={rowRef}
            onFocus={keepFocusedLinkClear}
            className="flex items-center gap-1 overflow-x-auto overscroll-x-contain px-1.5 py-1.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
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
          {/* Painted over the row's edges in the header's own colour, so a link running under one
            dissolves into the bar. Out of the accessibility tree, and out of the pointer's way so
            a tap on a half-hidden link still reaches it. */}
          <span
            aria-hidden="true"
            data-testid="nav-fade-start"
            className={cn(
              'pointer-events-none absolute inset-y-0 left-0 bg-gradient-to-r from-zinc-950 to-transparent',
              edges.start ? 'opacity-100' : 'opacity-0',
            )}
            style={{ width: FADE_PX }}
          />
          <span
            aria-hidden="true"
            data-testid="nav-fade-end"
            className={cn(
              'pointer-events-none absolute inset-y-0 right-0 bg-gradient-to-l from-zinc-950 to-transparent',
              edges.end ? 'opacity-100' : 'opacity-0',
            )}
            style={{ width: FADE_PX }}
          />
        </div>
      </nav>
    </header>
  );
}

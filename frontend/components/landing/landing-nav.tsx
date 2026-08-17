'use client';

import { useEffect, useRef } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
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
        // `gap-3` rather than relying on `justify-between`: once the link row fills the
        // remaining width there is no free space left for `justify-between` to distribute, so
        // the first link butts straight against the wordmark and reads as an overlap.
        className="container mx-auto flex h-14 max-w-7xl items-center justify-between gap-3 px-4"
        aria-label="Main navigation"
      >
        {/* `shrink-0` so the brand keeps its width when the link row beside it is full;
            without it flexbox steals space from here first and the wordmark wraps to two
            lines inside a 56px-tall bar. `whitespace-nowrap` for the same reason. */}
        <Link
          href="/"
          className="flex shrink-0 items-center gap-2 whitespace-nowrap text-sm font-semibold tracking-tight text-white transition-opacity hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-f1-red focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950"
        >
          <span className="h-2 w-2 rounded-full bg-f1-red" aria-hidden="true" />
          F1 Briefing Agent
        </Link>

        {/*
         * The link row scrolls rather than overflowing the page.
         *
         * Measured at a 390px viewport before `/tyres` was added: the row was already 393px
         * wide starting at x=82, so it ran 86px past the right edge — `Showcase` was clipped
         * mid-word and `Credits` could not be reached at all, on every phone. A sixth link
         * makes that strictly worse, so it is fixed here rather than inherited.
         *
         * `min-w-0` is what actually allows the shrink: a flex item's default `min-width:auto`
         * refuses to go below its content's width, so `overflow-x-auto` alone would never
         * engage and the row would keep pushing past the viewport. Scrollbar hiding uses the
         * same pair of arbitrary variants as `teams-chip-strip.tsx` and `teams-nav-rail.tsx`.
         */}
        <ul
          className="flex min-w-0 items-center gap-1 overflow-x-auto px-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          role="list"
        >
          {NAV_LINKS.map(({ href, label }) => (
            <li key={href} className="shrink-0">
              <Link
                href={href}
                ref={pathname === href ? currentRef : undefined}
                // Exact match, not `startsWith`: `/` would otherwise mark every route.
                aria-current={pathname === href ? 'page' : undefined}
                className={cn(
                  'block rounded-md px-3 py-1.5 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-f1-red focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950',
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

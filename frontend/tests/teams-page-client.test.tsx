import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

import { TeamsPageClient } from '@/components/teams/teams-page-client';
import { TEAMS } from '@/data/teams-data';

const originalMatchMedia = window.matchMedia;
const originalIntersectionObserver = globalThis.IntersectionObserver;

/** Force every media query to a fixed answer, so the mount decision is testable. */
function setViewportMatches(matches: boolean) {
  window.matchMedia = ((query: string) =>
    ({
      matches,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }) as MediaQueryList) as typeof window.matchMedia;
}

/**
 * The global stub in `tests/setup.ts` reports entries with `isIntersecting` only — enough
 * for framer-motion's `useInView`, but `useScrollSpy` also reads `entry.intersectionRect.height`
 * to decide which section covers the activation band, and the global stub never sets it,
 * which throws the moment this page mounts. Every id is reported as covering the band
 * equally here, so `pickActive`'s document-order tiebreak (already covered by
 * `use-scroll-spy.test.ts`) is what decides the default winner in these tests, not this stub.
 */
class StubIntersectionObserver implements IntersectionObserver {
  readonly root = null;
  readonly rootMargin = '';
  readonly thresholds: ReadonlyArray<number> = [];

  constructor(private readonly callback: IntersectionObserverCallback) {}

  observe(target: Element): void {
    this.callback(
      [
        {
          isIntersecting: true,
          target,
          intersectionRect: { height: 1 } as DOMRectReadOnly,
        } as unknown as IntersectionObserverEntry,
      ],
      this as IntersectionObserver,
    );
  }

  unobserve(): void {}
  disconnect(): void {}
  takeRecords(): IntersectionObserverEntry[] {
    return [];
  }
}

beforeEach(() => {
  globalThis.IntersectionObserver =
    StubIntersectionObserver as unknown as typeof IntersectionObserver;
});

afterEach(() => {
  window.matchMedia = originalMatchMedia;
  globalThis.IntersectionObserver = originalIntersectionObserver;
  window.location.hash = '';
  vi.restoreAllMocks();
});

describe('TeamsPageClient', () => {
  it('renders a section per team, each with an anchor target', () => {
    setViewportMatches(false);
    render(<TeamsPageClient />);
    for (const team of TEAMS) {
      expect(document.getElementById(`team-${team.id}`)).toBeInTheDocument();
    }
  });

  // Brief item 3 plus item 15's "no needless canvas or component remounts". A dossier
  // inside a `display: none` wrapper still runs AnimatePresence and instantiates images
  // on every team change, for a column nobody can see.
  it('does not mount the dossier at narrow viewports', () => {
    setViewportMatches(false);
    render(<TeamsPageClient />);
    expect(screen.queryByRole('complementary', { name: /dossier/i })).not.toBeInTheDocument();
  });

  it('mounts the dossier once the viewport is wide enough', async () => {
    setViewportMatches(true);
    render(<TeamsPageClient />);
    expect(await screen.findByRole('complementary', { name: /dossier/i })).toBeInTheDocument();
  });

  // The nav rail and the chip strip are separate components now, and both are always in
  // the DOM under jsdom where no media query applies. Two navigations is correct; what
  // must not happen is 22 links with the same accessible name in one of them.
  it('renders the rail and the chip strip as distinct navigations', () => {
    setViewportMatches(false);
    render(<TeamsPageClient />);
    const navs = screen.getAllByRole('navigation');
    expect(navs.length).toBeGreaterThanOrEqual(2);
  });

  it('restores the team named in the URL hash', () => {
    setViewportMatches(false);
    window.location.hash = '#team-cadillac';
    render(<TeamsPageClient />);
    const current = screen
      .getAllByRole('link', { current: 'location' })
      .map((el) => el.getAttribute('href'));
    expect(current).toContain('#team-cadillac');
  });

  it('defaults to the first team with no hash', () => {
    setViewportMatches(false);
    render(<TeamsPageClient />);
    const current = screen
      .getAllByRole('link', { current: 'location' })
      .map((el) => el.getAttribute('href'));
    expect(current).toContain(`#team-${TEAMS[0]!.id}`);
  });

  // The hero's livery columns are still buttons — teams-hero.tsx belongs to Plan B — so
  // they cannot rely on the browser to scroll the way the anchors do. Passing bare `claim`
  // to the hero would move the rail highlight and go nowhere.
  //
  // Exact string, not the brief's `/jump to ferrari/i`: `TeamsComparisonGrid`'s rows are
  // also buttons labelled "Jump to Ferrari, N of 11, …", which that regex matches too, so
  // it throws on multiple elements the moment both components are mounted together — the
  // first time in this plan they have been. An exact match is unambiguous because only the
  // hero's aria-label is the bare "Jump to Ferrari" with nothing appended.
  it('navigates as well as claims when the hero picks a team', () => {
    setViewportMatches(false);
    render(<TeamsPageClient />);
    fireEvent.click(screen.getByRole('button', { name: 'Jump to Ferrari' }));
    expect(window.location.hash).toBe('#team-ferrari');
  });

  // Regression. Assigning `location.hash` is a specified no-op when the fragment is
  // unchanged — the setter returns early — whereas activating a real anchor re-scrolls.
  // Because `useTeamNavigation` replaceStates the hash as the user scrolls, the hash
  // routinely already names the team the hero is about to be clicked for: scroll to
  // Ferrari, scroll back up to the hero, click the Ferrari column, nothing moves.
  // `claim` no-ops too, for the same reason. The test above passes only because it
  // starts from an empty hash.
  it('re-scrolls when the hash already names the team the hero picks', () => {
    setViewportMatches(false);
    window.location.hash = '#team-ferrari';
    render(<TeamsPageClient />);

    const section = document.getElementById('team-ferrari')!;
    const scrollIntoView = vi.spyOn(section, 'scrollIntoView');

    fireEvent.click(screen.getByRole('button', { name: 'Jump to Ferrari' }));

    expect(scrollIntoView).toHaveBeenCalled();
    expect(window.location.hash).toBe('#team-ferrari');
  });
});

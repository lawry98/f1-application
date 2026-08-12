import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

import { TeamsPageClient } from '@/components/teams/teams-page-client';
import { TEAMS } from '@/data/teams-data';

const originalMatchMedia = window.matchMedia;

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

/*
 * There is no local `IntersectionObserver` stub here any more. One used to be needed
 * because `useScrollSpy` read `entry.intersectionRect.height`, which the global stub in
 * `tests/setup.ts` never sets — it threw the moment this page mounted. The spy measures
 * rects now and constructs no observer at all, so the global stub, which exists for
 * framer-motion's `useInView`, is the only one this page needs.
 *
 * jsdom lays nothing out, so every rect is zero, nothing covers the activation band, and
 * the spy holds its initial id: the first team in document order.
 */

afterEach(() => {
  window.matchMedia = originalMatchMedia;
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

  // The rail's wrapper used to be an `<aside aria-label="Constructor navigation">` around
  // `<nav aria-label="Constructors">` — two landmarks for one rail, and a name that read as
  // a near-duplicate of the chip strip's "Constructor navigation, compact". The dossier is
  // the page's only complementary landmark now.
  it('gives the rail exactly one landmark', () => {
    setViewportMatches(false);
    render(<TeamsPageClient />);
    expect(
      screen.queryByRole('complementary', { name: /constructor navigation/i }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: 'Constructors' })).toBeInTheDocument();
  });

  it('leaves the dossier as the only complementary landmark', async () => {
    setViewportMatches(true);
    render(<TeamsPageClient />);
    await screen.findByRole('complementary', { name: /dossier/i });
    expect(screen.getAllByRole('complementary')).toHaveLength(1);
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

  /** True when `a` comes before `b` in document order. */
  function precedes(a: Element, b: Element): boolean {
    return Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
  }

  // The dossier's "Inspect in 3D" is permanently on screen at xl, but it used to be the
  // *last* tab stop on the page — after all eleven sections and the comparison grid,
  // roughly 38 stops in. Tab order follows the DOM, so the DOM is what moved.
  it('puts the dossier ahead of the sections in tab order, with the rail still first', async () => {
    setViewportMatches(true);
    render(<TeamsPageClient />);

    const rail = screen.getByRole('navigation', { name: 'Constructors' });
    const dossier = await screen.findByRole('complementary', { name: /dossier/i });
    const firstSection = document.getElementById(`team-${TEAMS[0]!.id}`)!;
    const lastSection = document.getElementById(`team-${TEAMS[TEAMS.length - 1]!.id}`)!;

    expect(precedes(rail, dossier)).toBe(true);
    expect(precedes(dossier, firstSection)).toBe(true);
    expect(precedes(firstSection, lastSection)).toBe(true);
  });

  // …and the screen must not notice. `order-*` puts the columns back where they were:
  // rail left, centre middle, dossier right.
  it('keeps the visual column order with order utilities', async () => {
    setViewportMatches(true);
    render(<TeamsPageClient />);

    const dossier = await screen.findByRole('complementary', { name: /dossier/i });
    const railColumn = screen.getByRole('navigation', { name: 'Constructors' }).parentElement!;
    const centreColumn = document.getElementById(`team-${TEAMS[0]!.id}`)!.parentElement!;

    expect(railColumn.className).toMatch(/(^|\s)order-1(\s|$)/);
    expect(centreColumn.className).toMatch(/(^|\s)order-2(\s|$)/);
    expect(dossier.className).toMatch(/(^|\s)order-3(\s|$)/);

    // `order` only applies between flex items of the same container, so the three columns
    // being siblings of one flex row is what makes those classes mean anything.
    const row = railColumn.parentElement!;
    expect(row.className).toMatch(/(^|\s)flex(\s|$)/);
    expect(centreColumn.parentElement).toBe(row);
    expect(dossier.parentElement).toBe(row);
  });
});

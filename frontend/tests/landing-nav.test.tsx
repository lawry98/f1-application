import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';

import { LandingNav } from '@/components/landing/landing-nav';
import { NAV_LINKS } from '@/components/landing/links';
import { contrastRatio, DARK_BG, MIN_CONTRAST } from '@/lib/team-utils';
import { restingTextNeutrals } from './zinc';

const pathname = vi.hoisted(() => ({ current: '/' }));

vi.mock('next/navigation', () => ({
  usePathname: () => pathname.current,
}));

function renderNav(at = '/') {
  pathname.current = at;
  return render(<LandingNav />);
}

beforeEach(() => {
  pathname.current = '/';
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('NAV_LINKS', () => {
  it('includes /tyres', () => {
    expect(NAV_LINKS.map((l) => l.href)).toContain('/tyres');
  });

  it('labels it with one word', () => {
    const tyres = NAV_LINKS.find((l) => l.href === '/tyres');
    expect(tyres?.label).toBe('Tyres');
  });

  // The two "how the machine works" experiences belong next to each other, and Briefing —
  // the thing the app is named for — stays first.
  it('places Tyres directly after Car Anatomy', () => {
    const hrefs = NAV_LINKS.map((l) => l.href);
    expect(hrefs.indexOf('/tyres')).toBe(hrefs.indexOf('/teardown') + 1);
  });
});

describe('LandingNav', () => {
  it('renders one link per entry, plus the home brand link', () => {
    renderNav();
    expect(screen.getAllByRole('link')).toHaveLength(NAV_LINKS.length + 1);
  });

  it('links Tyres to /tyres', () => {
    renderNav();
    expect(screen.getByRole('link', { name: 'Tyres' })).toHaveAttribute('href', '/tyres');
  });

  /*
   * The nav had no test at all before /tyres was added, so the highlight was only ever
   * verified by eye. `pathname === href` is an exact match on purpose — `startsWith` would
   * light up `/teams` while on a hypothetical `/teams/x`, but it would also light up
   * nothing else here, so the property worth pinning is that exactly one link is marked.
   */
  it('marks exactly one link as the current page', () => {
    renderNav('/tyres');
    const current = screen.getAllByRole('link', { current: 'page' });
    expect(current).toHaveLength(1);
    expect(current[0]).toHaveAccessibleName('Tyres');
  });

  it('marks nothing as current on a route that is not in the nav', () => {
    renderNav('/somewhere-else');
    expect(screen.queryAllByRole('link', { current: 'page' })).toHaveLength(0);
  });

  /*
   * Measured in a real browser before this test existed: at a 390px viewport the link row
   * was 393px wide starting at x=82, so it ran 86px past the edge — `Showcase` was clipped
   * mid-word and `Credits` could not be reached at all. jsdom lays nothing out, so the only
   * honest assertion here is that the row is a scroll container rather than a row that
   * overflows the page; the pixels are checked in a browser.
   */
  it('makes the link row scrollable rather than letting it overflow the page', () => {
    const { container } = renderNav();
    const list = container.querySelector('ul');
    expect(list?.className).toContain('overflow-x-auto');
  });

  it('stops the links being squeezed instead of scrolled', () => {
    const { container } = renderNav();
    for (const item of Array.from(container.querySelectorAll('li'))) {
      expect(item.className).toContain('shrink-0');
    }
  });

  it('keeps the brand from being shrunk by the scrolling row', () => {
    renderNav();
    expect(screen.getByRole('link', { name: /F1 Briefing/ }).className).toContain('shrink-0');
  });

  /*
   * Six links do not fit a 390px viewport, so the row scrolls — which means the link for the
   * page you are actually on can start off screen, and the nav then shows no sign of where you
   * are. `teams-chip-strip.tsx` solves the identical problem the identical way.
   */
  it('brings the current page into view in the scrolling row', () => {
    const scrollIntoView = vi.spyOn(Element.prototype, 'scrollIntoView');
    renderNav('/credits');
    expect(scrollIntoView).toHaveBeenCalledWith(
      expect.objectContaining({ inline: 'center', block: 'nearest' }),
    );
  });

  it('does not scroll when no nav link is current', () => {
    const scrollIntoView = vi.spyOn(Element.prototype, 'scrollIntoView');
    renderNav('/somewhere-else');
    expect(scrollIntoView).not.toHaveBeenCalled();
  });

  it('holds every resting neutral above AA on the page background', () => {
    const { container } = renderNav();
    const neutrals = restingTextNeutrals(container);
    expect(neutrals.length).toBeGreaterThan(0);
    for (const { hex, text } of neutrals) {
      expect(contrastRatio(hex, DARK_BG), `${hex} on "${text}"`).toBeGreaterThanOrEqual(
        MIN_CONTRAST,
      );
    }
  });
});

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

import { TeamsHero } from '@/components/teams/teams-hero';
import { TEAMS } from '@/data/teams-data';
import { monogram } from '@/components/teams/team-monogram-tile';

/**
 * The livery wall's interactive layer. Identified by its `lg:flex` column layout rather than a
 * test id because these assertions are about the layout classes themselves.
 */
function columnLayer(container: HTMLElement): HTMLElement {
  const el = container.querySelector('div.lg\\:flex.lg\\:gap-0');
  if (!el) throw new Error('column layer not found');
  return el as HTMLElement;
}

describe('TeamsHero', () => {
  it('renders one column per constructor', () => {
    render(<TeamsHero onSelectTeam={vi.fn()} />);
    expect(screen.getAllByRole('button', { name: /jump to /i })).toHaveLength(TEAMS.length);
  });

  it('keeps the title', () => {
    render(<TeamsHero onSelectTeam={vi.fn()} />);
    expect(screen.getByText(/the grid/i)).toBeInTheDocument();
  });

  it('scrolls to the team whose column is clicked', () => {
    const onSelectTeam = vi.fn();
    render(<TeamsHero onSelectTeam={onSelectTeam} />);
    fireEvent.click(screen.getByRole('button', { name: /jump to Ferrari/i }));
    expect(onSelectTeam).toHaveBeenCalledWith('ferrari');
  });

  it('exposes columns as real buttons so they are keyboard reachable', () => {
    render(<TeamsHero onSelectTeam={vi.fn()} />);
    for (const button of screen.getAllByRole('button', { name: /jump to /i })) {
      expect(button.tagName).toBe('BUTTON');
    }
  });

  it('reaches the Explore Constructors CTA before any livery column in tab order', () => {
    render(<TeamsHero onSelectTeam={vi.fn()} />);
    const cta = screen.getByRole('button', { name: /explore constructors/i });
    const firstColumn = screen.getAllByRole('button', { name: /jump to /i })[0]!;

    // DOCUMENT_POSITION_FOLLOWING (4) means firstColumn comes after cta in the DOM,
    // which is what puts it later in the natural tab order.
    expect(cta.compareDocumentPosition(firstColumn) & Node.DOCUMENT_POSITION_FOLLOWING).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
  });

  // jsdom performs no layout, so nothing here can measure a height. What it *can* do is
  // reject the cascade that produced the 0px wall: `lg:inset-0` pins all four edges, and any
  // `lg:` token that unsets one of the block edges is emitted inside the same media block
  // afterwards, wins, and collapses the flex line — leaving eleven zero-size buttons in the
  // tab order and a wall that cannot be hovered or clicked on any desktop viewport.
  it('does not unset a block edge that lg:inset-0 pins on the column layer', () => {
    const { container } = render(<TeamsHero onSelectTeam={vi.fn()} />);
    const tokens = columnLayer(container).className.split(/\s+/);

    expect(tokens).toContain('lg:inset-0');
    const unsetsBlockEdge = tokens.filter((t) => /^lg:(top|bottom|inset-y)-auto$/.test(t));
    expect(unsetsBlockEdge).toEqual([]);
  });

  // The 3.5rem site nav sits above the hero in normal flow, so a 100vh hero overflows the
  // viewport by exactly the nav's height and everything anchored to its bottom edge goes with
  // it. The hover wordmark is at `bottom-5` and 30px tall, so it sat 6px below the fold at
  // every window height — the wall had its height back but the reveal still could not be seen.
  it('subtracts the site nav from the hero height rather than claiming a full 100vh', () => {
    const { container } = render(<TeamsHero onSelectTeam={vi.fn()} />);
    const section = container.querySelector('section');
    expect(section).not.toBeNull();
    expect(section!.className).not.toMatch(/\bmin-h-screen\b/);
    expect(section!.className).toMatch(/min-h-\[calc\(100vh-3\.5rem\)\]/);
  });

  it('gives the column layer a full-height flex layout at lg and up', () => {
    const { container } = render(<TeamsHero onSelectTeam={vi.fn()} />);
    const tokens = columnLayer(container).className.split(/\s+/);
    expect(tokens).toContain('lg:flex');

    // Columns are `lg:h-full lg:flex-1`; `height: 100%` only resolves against a container
    // whose own height is definite, which is what `lg:inset-0` with both edges pinned gives.
    for (const button of screen.getAllByRole('button', { name: /jump to /i })) {
      expect(button.className).toMatch(/\blg:h-full\b/);
      expect(button.className).toMatch(/\blg:flex-1\b/);
    }
  });

  // Task 8 removed the aspect disparity from the nav rail; the hero's below-lg grid shows all
  // eleven marks at once, four across, so it must not reintroduce it. `object-contain`
  // letterboxing is scale-invariant — Aston Martin draws at 42% of its box height next to
  // McLaren's 59% at every `size` — so the mobile grid uses uniform monogram tiles instead.
  it('uses uniform monogram tiles for the below-lg grid', () => {
    render(<TeamsHero onSelectTeam={vi.fn()} />);
    for (const team of TEAMS) {
      const button = screen.getByRole('button', { name: `Jump to ${team.shortName}` });
      expect(button.querySelector('.lg\\:hidden')?.textContent).toBe(monogram(team.shortName));
    }
  });

  it('keeps the real wordmark for the lg hover reveal, one team at a time', () => {
    render(<TeamsHero onSelectTeam={vi.fn()} />);
    const ferrari = screen.getByRole('button', { name: 'Jump to Ferrari' });
    const reveal = ferrari.querySelector('span.lg\\:flex');
    expect(reveal).not.toBeNull();
    expect(reveal!.querySelector('img')).toHaveAttribute('alt', 'Ferrari logo');
    // Hidden below lg so the two marks never both show.
    expect(reveal!.className).toMatch(/\bhidden\b/);
  });

  /*
   * The content block sits `z-10` over the `z-0` livery columns, and "THE GRID" at
   * `clamp(3.5rem,12vw,9rem)` is wide enough that the block covered seven of the eleven. Verified
   * by hit-testing every column's centre with `document.elementsFromPoint` in Chromium at
   * 1440x1000: McLaren, Red Bull, Haas, Racing Bulls, Audi, Alpine and Williams all resolved to
   * this wrapper rather than to their own button, before and only before the fix.
   *
   * **jsdom cannot reproduce that** — it lays nothing out, so `elementFromPoint` is meaningless
   * here and no test in this file could have caught the original bug. What this pins instead is
   * the *mechanism*: `pointer-events` is inherited, so the whole block being `none` with exactly
   * the CTA opting back in is the shape of the fix, and either half going missing is a regression
   * that puts the hero back to seven dead columns (or, if the `auto` is lost, to a dead CTA).
   */
  it('lets pointer events through the headline block while keeping the CTA clickable', () => {
    render(<TeamsHero onSelectTeam={vi.fn()} />);

    const cta = screen.getByRole('button', { name: /explore constructors/i });
    const content = cta.closest('div.z-10');
    expect(content, 'the CTA must still live inside the z-10 content block').not.toBeNull();

    expect(content!.className).toMatch(/\bpointer-events-none\b/);
    expect(cta.className).toMatch(/\bpointer-events-auto\b/);

    // Non-vacuity: the block really does contain the wide headline the columns were losing to.
    expect(content!.querySelector('h1')).not.toBeNull();
  });
});

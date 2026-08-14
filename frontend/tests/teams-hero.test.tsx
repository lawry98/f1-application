import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { renderToString } from 'react-dom/server';

import { TeamsHero } from '@/components/teams/teams-hero';
import { TEAMS } from '@/data/teams-data';
import { monogram } from '@/components/teams/team-monogram-tile';

/**
 * The reduced-motion recipe, verbatim: `useReducedMotion()` cannot be driven through
 * `window.matchMedia` — motion caches the preference in a module global on the first call and
 * queries `(prefers-reduced-motion)` rather than `(prefers-reduced-motion: reduce)`. Spreading
 * `actual` keeps the real `motion` elements the livery wall and the scroll cue are built from.
 */
let reduceMotion = false;

vi.mock('motion/react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('motion/react')>();
  return { ...actual, useReducedMotion: () => reduceMotion };
});

beforeEach(() => {
  reduceMotion = false;
});

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
  /**
   * The regression guard for a **confirmed** hydration error, reproduced in Chromium on `/teams`
   * with reduced motion emulated:
   *
   *     Warning: Prop `style` did not match.
   *       Server: "…;opacity:0;transform:scaleY(0)"  Client: "…;opacity:1"
   *         at MotionDOMComponent … at TeamsHero
   *
   * motion's own `useReducedMotion()` answers `null` during SSR and the user's *real* preference on
   * the client's first render, and this hero feeds that answer straight into `initial` — so the
   * server seeded the livery columns from the un-reduced initial while the client's hydrating pass
   * seeded them from `animate`. `useReducedMotionSafe` fixes it by contract: `false` on the server
   * and on the first client render whatever the preference says, then a layout effect flips it
   * before paint.
   *
   * This hero calls the hook **itself** — it is not fed by `TeamsPageClient` — so fixing the parent
   * alone leaves the error exactly where the console found it, which is why this test renders the
   * component in isolation.
   *
   * The server string is the only place jsdom can observe the contract: a client `render()` runs
   * the layout effect inside `act`, so the flipped value is all it can ever see.
   */
  it('seeds the livery columns from the un-reduced initial on the server, whatever the preference', () => {
    reduceMotion = true;
    // React logs "useLayoutEffect does nothing on the server" for the hook's isomorphic effect.
    // That is the deliberate cost of committing the flip before paint — see
    // `hooks/use-reduced-motion-safe.ts` — not something this test should fail on.
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const html = renderToString(<TeamsHero onSelectTeam={vi.fn()} />);

      // The un-reduced `initial`, which is what the client's first render will also produce.
      // Under motion's own hook the server emitted this and the client emitted `opacity:1`.
      expect(html).toMatch(/scaleY\(0\)/);
      // The scroll cue is the structural half of the same branch — `{!reducedMotion && …}` — so a
      // server tree that has dropped it is the element-level version of the same mismatch.
      // `bottom-10` is the cue's own wrapper class; nothing else in the hero uses it.
      expect(html).toContain('bottom-10');
    } finally {
      consoleError.mockRestore();
    }
  });

  /**
   * The below-`lg` ambient glow was a hardcoded `#dc2626` — the pre-spec red, from before the
   * branch moved `f1-red` to `#E10600`. It stayed decorative (a 600px blob at 7% behind a 120px
   * blur, so no contrast rule reaches it); what changed is that it is now the *same* red as
   * everything else on the page instead of a near-miss nobody would spot side by side.
   *
   * Asserted as the class rather than as a hex, because `bg-f1-red` is the branch's canonical
   * token — `tailwind.config.ts` says so explicitly, and one grep for `f1-red` finding every red on
   * the site is the point of it. jsdom applies no stylesheet, so the class can only be named, never
   * measured.
   *
   * The "no inline background at all" half is the assertion that actually holds the line, and the
   * literal-hex check alone would not: React normalises `style={{ background: '#dc2626' }}` to
   * `rgb(220, 38, 38)`, so a grep of the markup for `dc2626` passes with the old value still
   * painted. Requiring the token to arrive through a class is what makes it greppable.
   */
  it('paints the ambient glow in the branch red rather than the pre-spec #dc2626', () => {
    const { container } = render(<TeamsHero onSelectTeam={vi.fn()} />);
    const glow = container.querySelector<HTMLElement>('div.rounded-full.lg\\:hidden');

    expect(glow, 'the below-lg ambient glow is no longer identifiable').not.toBeNull();
    expect(glow!.classList.contains('bg-f1-red')).toBe(true);
    expect(glow!.style.background, 'the glow paints its own background again').toBe('');
    expect(glow!.style.backgroundColor).toBe('');
    // Catches the other way a stale literal comes back — an arbitrary `bg-[#dc2626]` class.
    expect(container.innerHTML, 'a pre-spec #dc2626 survives in the hero').not.toMatch(/dc2626/i);
    // Still a blurred blob and still decorative — the fix is the colour token and nothing else.
    expect(glow!.style.filter).toBe('blur(120px)');
    expect(glow).toHaveAttribute('aria-hidden', 'true');
  });

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

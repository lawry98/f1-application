import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

import { StickyTeamPanel } from '@/components/teams/sticky-team-panel';
import { TEAM_MAP, TEAMS } from '@/data/teams-data';
import {
  contrastRatio,
  DARK_BG,
  MIN_CONTRAST,
  MIN_RING_CONTRAST,
  RAIL_ACTIVE_ALPHA,
  RAIL_ACTIVE_FILL,
  railStandingBackdrop,
  readableOnDark,
  teamColorButtonStyle,
} from '@/lib/team-utils';
import { detach, inlineColouredText, restingTextNeutrals } from './zinc';

const ferrari = TEAM_MAP['ferrari']!;

/**
 * The reduced-motion recipe, verbatim: `useReducedMotion()` cannot be driven through
 * `window.matchMedia` — motion caches the preference in a module global on the first call and
 * queries `(prefers-reduced-motion)` rather than `(prefers-reduced-motion: reduce)`. `MegaStat`
 * reads it through `useReducedMotionSafe`, which wraps motion's hook, so this mock reaches it.
 */
let reduceMotion = false;

vi.mock('motion/react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('motion/react')>();
  return { ...actual, useReducedMotion: () => reduceMotion };
});

beforeEach(() => {
  reduceMotion = false;
});

function rgbToHex(value: string): string {
  const parts = value.match(/\d+/g);
  if (!parts || parts.length < 3) throw new Error(`not an rgb() colour: ${value}`);
  return `#${parts
    .slice(0, 3)
    .map((n) => Number(n).toString(16).padStart(2, '0'))
    .join('')}`;
}

/**
 * The two halves of an `rgba()` declaration, so the chip's fill can be checked against the *pair*
 * of constants the contrast maths uses rather than against a pre-composited string. Splitting them
 * is the point: a fill at the right colour and the wrong alpha composites to a different backdrop,
 * which is the "right colour, wrong background" failure this page has shipped twice.
 */
function parseRgba(value: string): { hex: string; alpha: number } {
  const match = /^rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)$/.exec(value);
  if (!match) throw new Error(`not an rgba() colour: ${value}`);
  return {
    hex: rgbToHex(value),
    alpha: match[4] === undefined ? 1 : Number(match[4]),
  };
}

/**
 * `Scribble`'s `p1` viewBox, which is what identifies that mark in a rendered tree — the panel
 * holds several other SVGs (the CTA's lucide icon, the logo lockup) and the scribble carries no
 * accessible name of its own, being `aria-hidden` decoration.
 */
const P1_SCRIBBLE_VIEWBOX = '0 0 110 106';

/**
 * The ordinal rule restated as a flat lookup rather than as arithmetic.
 *
 * Deliberately not `n % 10` again: reproducing the component's own expression here would make the
 * test agree with any bug in it, including the one this table exists to catch — P11 rendering as
 * `11ST`, which is a live case because there are exactly eleven constructors.
 */
const SUFFIX_BY_POSITION: Record<number, string> = {
  1: 'ST',
  2: 'ND',
  3: 'RD',
  4: 'TH',
  5: 'TH',
  6: 'TH',
  7: 'TH',
  8: 'TH',
  9: 'TH',
  10: 'TH',
  11: 'TH',
};

describe('StickyTeamPanel', () => {
  it('shows the team logo', () => {
    render(<StickyTeamPanel activeTeam={ferrari} onInspect={vi.fn()} />);
    // Scoped to the logo's own accessible name — a bare getByText('Ferrari') is satisfied
    // by the Power-unit MetaCell (Ferrari supplies its own engine).
    expect(screen.getByRole('img', { name: /ferrari logo/i })).toBeInTheDocument();
  });

  // Brief item 1. DriverPortrait used to render here *and* in team-section.tsx, so at lg
  // and up the same two faces were on screen twice. The centre column owns the drivers.
  it('renders no driver portraits — the centre section owns those', () => {
    render(<StickyTeamPanel activeTeam={ferrari} onInspect={vi.fn()} />);
    expect(screen.queryByAltText('Charles Leclerc')).not.toBeInTheDocument();
    expect(screen.queryByAltText('Lewis Hamilton')).not.toBeInTheDocument();
  });

  // Brief item 10, restated for the candy pass. The `P2` numeral and the `307 PTS` run are both
  // gone: the position is the ordinal chip and the points are a MegaStat whose `label` carries
  // the unit. What must survive is that the panel still states both out loud, so this asserts the
  // *accessible* names rather than the old text runs — `role="img"` + `aria-label` is how both the
  // chip and MegaStat's counting box name themselves (ARIA 1.2 prohibits `aria-label` on the
  // implicit `generic` role of a bare span, so the role is load-bearing, not decoration).
  it('shows the championship position and points', () => {
    render(<StickyTeamPanel activeTeam={ferrari} onInspect={vi.fn()} />);
    expect(screen.getByRole('img', { name: 'Championship position 2' })).toBeInTheDocument();
    expect(screen.getByTestId('position-chip')).toHaveTextContent('2ND');
    expect(screen.getByRole('img', { name: '307' })).toBeInTheDocument();
    expect(screen.getByText('Points')).toBeInTheDocument();
  });

  it('renders the points as a MegaStat carrying the real total', () => {
    render(<StickyTeamPanel activeTeam={ferrari} onInspect={vi.fn()} />);
    // MegaStat renders the final value twice — an `invisible` width-reserving twin and the
    // painted numeral — so `getByText` throws on multiple matches. Mid-count the painted copy
    // reads whatever the spring has reached, so the *count* of matches is only stable under
    // reduced motion (pinned at 2 in the reduced-motion test below). What is stable here is that
    // the final value is in the DOM from the first frame, which is the CLS guarantee, and that it
    // is the stat's accessible name while the digits are transiently wrong.
    expect(screen.getAllByText('307').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByRole('img', { name: '307' })).toBeInTheDocument();
  });

  it('renders a pointless team’s zero as a real stat rather than an empty one', () => {
    const cadillac = TEAM_MAP['cadillac']!;
    render(<StickyTeamPanel activeTeam={cadillac} onInspect={vi.fn()} />);
    // Cadillac is the reason the seeded-from-the-roster rule exists on the backend too: a team on
    // zero must render its zero, not vanish or fall back to a placeholder.
    expect(screen.getByRole('img', { name: '0' })).toBeInTheDocument();
    expect(screen.getByTestId('position-chip')).toHaveTextContent('11TH');
  });

  it('gives every team the right ordinal suffix', () => {
    expect(TEAMS).toHaveLength(11);
    for (const team of TEAMS) {
      const expected = SUFFIX_BY_POSITION[team.position];
      // A position with no entry in the table above is a grid change the test has not been told
      // about, and would otherwise silently assert `${position}undefined`.
      expect(expected, `no expected suffix for P${team.position}`).toBeDefined();

      const { unmount } = render(<StickyTeamPanel activeTeam={team} onInspect={vi.fn()} />);
      expect(screen.getByTestId('position-chip'), team.shortName).toHaveTextContent(
        `${team.position}${expected}`,
      );
      unmount();
    }
  });

  it('spells the position out for a screen reader instead of leaving it as “1ST”', () => {
    render(<StickyTeamPanel activeTeam={TEAM_MAP['mercedes']!} onInspect={vi.fn()} />);
    // `1ST` announced beside a points total is the same rank-or-sequence ambiguity the
    // "Team N of 11" counter had to be spelled out to avoid.
    expect(screen.getByRole('img', { name: 'Championship position 1' })).toBeInTheDocument();
  });

  // "the championship leader alone gets Scribble type='p1'". The failure this catches is the mark
  // becoming unconditional, which reads as every team being P1 and is invisible in a single-team
  // test — so it iterates the grid and counts.
  it('draws the P1 scribble for the championship leader and for nobody else', () => {
    let marked = 0;
    for (const team of TEAMS) {
      const { container, unmount } = render(
        <StickyTeamPanel activeTeam={team} onInspect={vi.fn()} />,
      );
      const marks = container.querySelectorAll(`svg[viewBox="${P1_SCRIBBLE_VIEWBOX}"]`);
      expect(marks.length, `${team.shortName} (P${team.position})`).toBe(
        team.position === 1 ? 1 : 0,
      );
      marked += marks.length;
      unmount();
    }
    expect(marked, 'exactly one constructor leads the championship').toBe(1);
  });

  /**
   * The chip's text is *not* on bare `zinc-950` — it sits on its own translucent fill — so
   * `readableOnDark`, which clears 4.5:1 on the page by construction and therefore has zero
   * headroom above it, is the wrong helper. This measures the colour the chip actually paints
   * against the colour the chip actually composites to.
   */
  it('keeps the ordinal chip readable on its own fill for every team', () => {
    const backdrop = railStandingBackdrop();

    // The premise, asserted rather than assumed: the chip's fill really is the rail's active-row
    // composite, so `railStandingBackdrop()` above describes it. Colour and alpha are checked
    // separately because the right colour at the wrong alpha is a different backdrop.
    for (const team of TEAMS) {
      const { unmount } = render(<StickyTeamPanel activeTeam={team} onInspect={vi.fn()} />);
      const chip = screen.getByTestId('position-chip');
      const fill = parseRgba(chip.style.backgroundColor);
      expect(fill.hex, `${team.shortName} chip fill`).toBe(RAIL_ACTIVE_FILL);
      expect(fill.alpha, `${team.shortName} chip alpha`).toBe(RAIL_ACTIVE_ALPHA);

      expect(
        contrastRatio(rgbToHex(chip.style.color), backdrop),
        `${team.shortName} ordinal chip text`,
      ).toBeGreaterThanOrEqual(MIN_CONTRAST);

      // The keyline is non-text and held to WCAG's 3:1 bar rather than 4.5:1 — lifting a border
      // to the text bar washes the darker liveries out for no legibility gain. Measured against
      // the page, which is what is on the *outside* of the edge.
      expect(
        contrastRatio(rgbToHex(chip.style.borderColor), DARK_BG),
        `${team.shortName} ordinal chip border`,
      ).toBeGreaterThanOrEqual(MIN_RING_CONTRAST);
      unmount();
    }

    // Non-vacuity for the *choice* of helper: on this backdrop the obvious pick genuinely fails
    // for part of the grid, so the assertion above is doing work rather than passing by luck.
    const wouldFail = TEAMS.filter(
      (t) => contrastRatio(readableOnDark(t.color), backdrop) < MIN_CONTRAST,
    );
    expect(
      wouldFail.length,
      'readableOnDark would be safe here, so this test proves nothing',
    ).toBeGreaterThan(0);
  });

  /**
   * `restingTextNeutrals` reads `text-zinc-N` classes and so sees none of this panel's livery
   * text, which arrives as an inline `style={{ color }}`. This is its counterpart, and it is
   * partitioned by the surface each run really sits on: the page, the chip's fill, or the CTA's
   * team-colour fill. Measuring all three against `DARK_BG` would report the two surfaces
   * optimistically and pass while the rendered page fails.
   */
  it('keeps every inline-coloured run readable on the surface it actually sits on', () => {
    for (const team of TEAMS) {
      const { container, unmount } = render(
        <StickyTeamPanel activeTeam={team} onInspect={vi.fn()} />,
      );

      // Counted before detaching, so the partition below can be proved exhaustive.
      const total = inlineColouredText(container).length;

      const chipRuns = inlineColouredText(detach([screen.getByTestId('position-chip')]));
      const ctaRuns = inlineColouredText(
        detach([screen.getByRole('button', { name: /inspect/i })]),
      );
      const pageRuns = inlineColouredText(container);

      // Pinned: the chip's numeral, the chip's raised suffix, and the CTA's label. A fourth
      // inline-coloured run is a new surface this test has not been told the background of, and
      // it fails here rather than being measured against the wrong one.
      expect(total, `${team.shortName} inline-coloured runs`).toBe(3);
      expect(chipRuns.length).toBe(2);
      expect(ctaRuns.length).toBe(1);
      expect(chipRuns.length + ctaRuns.length + pageRuns.length).toBe(total);

      const backdrop = railStandingBackdrop();
      for (const run of chipRuns) {
        expect(
          contrastRatio(run.hex, backdrop),
          `${team.shortName} chip "${run.text}"`,
        ).toBeGreaterThanOrEqual(MIN_CONTRAST);
      }

      // The CTA's label is `onColor(fill)` over the fill `teamColorButtonStyle` chose, which is a
      // damped neutral for a livery too bright to be a surface — so the fill has to come from the
      // helper, not from `team.color`.
      const ctaFill = teamColorButtonStyle(team).style.backgroundColor;
      for (const run of ctaRuns) {
        expect(
          contrastRatio(run.hex, ctaFill),
          `${team.shortName} CTA "${run.text}"`,
        ).toBeGreaterThanOrEqual(MIN_CONTRAST);
      }

      for (const run of pageRuns) {
        expect(
          contrastRatio(run.hex, DARK_BG),
          `${team.shortName} page "${run.text}"`,
        ).toBeGreaterThanOrEqual(MIN_CONTRAST);
      }
      unmount();
    }
  });

  // Brief item 2: a spelled-out sequence cannot be mistaken for a standing. It used to
  // read "Constructor 05 / 11" for a team standing P7.
  it('spells out its position in the running order', () => {
    render(<StickyTeamPanel activeTeam={ferrari} onInspect={vi.fn()} />);
    expect(screen.getByText(/team 2 of 11/i)).toBeInTheDocument();
  });

  it('does not render a bare two-digit sequence numeral', () => {
    const { container } = render(<StickyTeamPanel activeTeam={ferrari} onInspect={vi.fn()} />);
    expect(container.textContent).not.toMatch(/\b02\s*\/\s*11\b/);
  });

  it('keeps the all-time stats', () => {
    render(<StickyTeamPanel activeTeam={ferrari} onInspect={vi.fn()} />);
    expect(screen.getByTestId('championship-count')).toHaveTextContent('16');
    expect(screen.getByText('Maranello, Italy')).toBeInTheDocument();
    expect(screen.getByText('Power unit').nextElementSibling).toHaveTextContent('Ferrari');
    expect(screen.getByText('1950')).toBeInTheDocument();
    expect(screen.getByText('76')).toBeInTheDocument();
  });

  it('calls onInspect when the CTA is pressed', () => {
    const onInspect = vi.fn();
    render(<StickyTeamPanel activeTeam={ferrari} onInspect={onInspect} />);
    fireEvent.click(screen.getByRole('button', { name: /inspect/i }));
    expect(onInspect).toHaveBeenCalledOnce();
  });

  it('renders a team with no championships without claiming a bar', () => {
    const cadillac = TEAM_MAP['cadillac']!;
    render(<StickyTeamPanel activeTeam={cadillac} onInspect={vi.fn()} />);
    expect(screen.getByTestId('championship-count')).toHaveTextContent('—');
  });

  // "All-time bar and stat labels take MegaStat red tick marks." Pinned by count so an extra mark
  // or a dropped one fails.
  //
  // **Two, not three.** This was three — a mark above `All-time`, a mark above
  // `Championship · …`, and MegaStat's own — and the middle one was removed after seeing it
  // rendered: MegaStat's tick sits 12px below it with a single line of 9px caps between, and the
  // pair reads as a doubled rule rather than as two labelled stats. The spec is still satisfied,
  // because the mark belongs to a *stat*: the points stat has MegaStat's, the all-time stat has
  // the authored one, and `Championship · …` is the date on the stat beneath it. The four MetaCell
  // labels were likewise left bare — four more ticks in a 300px column is clutter.
  //
  // Both surviving marks are still asserted by the label they head, so a future edit that keeps
  // the count by moving a tick somewhere else fails here too.
  it('carries exactly two red tick marks', () => {
    const { container } = render(<StickyTeamPanel activeTeam={ferrari} onInspect={vi.fn()} />);
    expect(container.querySelectorAll('.bg-f1-red')).toHaveLength(2);
    expect(screen.getByText('All-time')).toBeInTheDocument();
    expect(screen.getByText('Points')).toBeInTheDocument();
    // The date line survives; it just no longer wears a mark of its own.
    expect(screen.getByText(/^Championship ·/)).toBeInTheDocument();
  });

  it('marks the tick bars as decoration', () => {
    const { container } = render(<StickyTeamPanel activeTeam={ferrari} onInspect={vi.fn()} />);
    for (const tick of Array.from(container.querySelectorAll('.bg-f1-red'))) {
      expect(tick).toHaveAttribute('aria-hidden', 'true');
      expect(tick.className).toContain('pointer-events-none');
    }
  });

  // The dossier's own labels — "Team N of 11", the standing caption, the meta cells — were all
  // `zinc-500` at 4.12:1. Same class as the rail's inherited rows, same fix. `DARK_BG` is the
  // right background here and `sectionSurfaceBackdrop` is not: the dossier is outside the team
  // sections and paints on plain `zinc-950`, so the branch's normal `zinc-400` floor applies.
  it('holds every resting neutral label above AA on the page background', () => {
    const { container } = render(<StickyTeamPanel activeTeam={ferrari} onInspect={vi.fn()} />);
    const neutrals = restingTextNeutrals(container);
    expect(neutrals.length).toBeGreaterThan(0);
    for (const { hex, text } of neutrals) {
      expect(contrastRatio(hex, DARK_BG), `${hex} on "${text}"`).toBeGreaterThanOrEqual(
        MIN_CONTRAST,
      );
    }
  });

  it('renders the final points with no count-up under reduced motion', () => {
    reduceMotion = true;
    render(<StickyTeamPanel activeTeam={ferrari} onInspect={vi.fn()} />);

    // Both copies of the numeral — the invisible width-reserving twin and the painted one — hold
    // the final value, because no spring ever runs. Two is therefore the *stable* count that the
    // animated path cannot assert.
    expect(screen.getAllByText('307')).toHaveLength(2);
    // No counting box means no `role="img"` naming a numeral that is transiently wrong: under
    // reduced motion the painted digits are the accessible ones.
    expect(screen.queryByRole('img', { name: '307' })).not.toBeInTheDocument();
    // The static branch must never drop content: the chip is still there.
    expect(screen.getByTestId('position-chip')).toHaveTextContent('2ND');
  });
});

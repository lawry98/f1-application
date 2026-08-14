import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

import { RAIL_ROW_STAGGER_S, railRowDelay, TeamsNavRail } from '@/components/teams/teams-nav-rail';
import { monogram } from '@/components/teams/team-monogram-tile';
import {
  contrastRatio,
  DARK_BG,
  MIN_CONTRAST,
  MIN_RING_CONTRAST,
  RAIL_ACTIVE_ALPHA,
  RAIL_ACTIVE_FILL,
  railStandingBackdrop,
  railStandingColor,
} from '@/lib/team-utils';
import { TEAMS } from '@/data/teams-data';
import { detach, inlineColouredText, restingTextNeutrals } from './zinc';

/** jsdom normalises any inline colour to `rgb(r, g, b)`; contrastRatio wants hex. */
function rgbToHex(value: string): string {
  const parts = value.match(/\d+/g);
  if (!parts || parts.length < 3) throw new Error(`not an rgb() colour: ${value}`);
  return `#${parts
    .slice(0, 3)
    .map((n) => Number(n).toString(16).padStart(2, '0'))
    .join('')}`;
}

function renderRail({
  activeTeamId = 'ferrari',
  onSelectTeam = vi.fn(),
  reducedMotion = false,
}: {
  activeTeamId?: string;
  onSelectTeam?: (id: string) => void;
  reducedMotion?: boolean;
} = {}) {
  return render(
    <TeamsNavRail
      activeTeamId={activeTeamId}
      onSelectTeam={onSelectTeam}
      reducedMotion={reducedMotion}
    />,
  );
}

/** Every row's left selection rule, in document order. */
function selectionRules(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>('a > span.bg-f1-red'));
}

/** The progress track's fill — the element whose transform the active index drives. */
function progressFill(container: HTMLElement): HTMLElement {
  const el = container.querySelector('.origin-top');
  if (!el) throw new Error('progress fill not found');
  return el as HTMLElement;
}

describe('TeamsNavRail', () => {
  it('shows position and points for each team', () => {
    renderRail();
    expect(screen.getByText('P1 · 379 PTS')).toBeInTheDocument();
    expect(screen.getByText('P2 · 307 PTS')).toBeInTheDocument();
  });

  // Brief item 2. The rail used to render a document-order 01–11 alongside P#, and because
  // TEAMS order is 1,2,3,4,7,5,8,6,9,11,10 the two disagreed from the fifth row down —
  // Haas showed "05" next to "P7 · 21 PTS". The sequence numeral is gone; what remains is
  // labelled.
  it('shows no bare document-order numeral beside the standing', () => {
    const { container } = renderRail();
    const haasStanding = screen.getByText('P7 · 21 PTS');
    const row = haasStanding.closest('a');
    expect(row).not.toBeNull();
    expect(row!.textContent).not.toMatch(/\b0[1-9]\b|\b1[01]\b/);
    // And nowhere else in the rail either.
    expect(container.textContent).not.toMatch(/\b0[1-9]\b/);
  });

  it('names what the standings line is, so the numbers are not unexplained', () => {
    renderRail();
    expect(screen.getByText(/championship/i)).toBeInTheDocument();
  });

  // Brief items 4 and 14: real links to real fragments, so middle-click and
  // open-in-new-tab work, and no scroll arithmetic is needed.
  it('renders every team as an anchor to its section', () => {
    renderRail();
    for (const team of TEAMS) {
      const link = screen.getByRole('link', { name: new RegExp(team.shortName, 'i') });
      expect(link).toHaveAttribute('href', `#team-${team.id}`);
    }
  });

  it('claims the clicked team without preventing the browser’s own navigation', () => {
    const onSelectTeam = vi.fn();
    renderRail({ onSelectTeam });
    const link = screen.getByRole('link', { name: /mclaren/i });
    const event = new MouseEvent('click', { bubbles: true, cancelable: true });
    link.dispatchEvent(event);
    expect(onSelectTeam).toHaveBeenCalledWith('mclaren');
    // The anchor must be left to do its own job — that is what pushes the history entry.
    expect(event.defaultPrevented).toBe(false);
  });

  // aria-current="true" is valid but says nothing about *why*. "location" is the token for
  // "this is the current place in a set of navigation links".
  it('marks the active team with aria-current="location"', () => {
    renderRail();
    const current = screen.getAllByRole('link', { current: 'location' });
    expect(current).toHaveLength(1);
    expect(current[0]).toHaveAccessibleName(/ferrari/i);
    expect(current[0]).toHaveAttribute('aria-current', 'location');
  });

  it('renders a uniform monogram tile for every team, including racing-bulls', () => {
    renderRail();
    expect(TEAMS).toHaveLength(11);
    for (const team of TEAMS) {
      expect(screen.getByText(monogram(team.shortName))).toBeInTheDocument();
    }
  });

  // Brief item 13 names focus indicators specifically. Tailwind's ring is a box-shadow that
  // reads --tw-ring-color, so a team-derived ring has to set that property — an outlineColor
  // would silently do nothing and leave the ring at Tailwind's default translucent blue.
  it('gives every row a team-derived focus ring that clears non-text contrast', () => {
    expect(TEAMS).toHaveLength(11);
    renderRail();
    for (const team of TEAMS) {
      const link = screen.getByRole('link', { name: new RegExp(team.shortName, 'i') });
      const ring = link.style.getPropertyValue('--tw-ring-color');
      expect(ring, `${team.shortName} has no --tw-ring-color`).not.toBe('');
      expect(contrastRatio(ring, DARK_BG), `${team.shortName} ring ${ring}`).toBeGreaterThanOrEqual(
        MIN_RING_CONTRAST,
      );
    }
  });

  // This assertion used to read `contrastRatio(..., DARK_BG)` and passed for all eleven teams
  // while the rendered page failed — the active row is the one place in the rail that is *not*
  // on the page background. It sits on the `bg-zinc-800/60` highlight, and a browser measured
  // Ferrari's line at 4.02:1 there against the 4.66:1 this test certified. The background is
  // the only thing that was wrong with it.
  it('keeps the active row’s standings line above AA against its own highlight', () => {
    expect(TEAMS).toHaveLength(11);
    for (const team of TEAMS) {
      const { unmount } = renderRail({ activeTeamId: team.id });
      const line = screen.getByText(`P${team.position} · ${team.points} PTS`);
      expect(
        contrastRatio(rgbToHex(line.style.color), railStandingBackdrop()),
        `${team.shortName} standings ${line.style.color}`,
      ).toBeGreaterThanOrEqual(MIN_CONTRAST);
      unmount();
    }
  });

  it('colours the active row’s standings line for the highlight, not for the page', () => {
    const { unmount } = renderRail({ activeTeamId: 'ferrari' });
    const line = screen.getByText('P2 · 307 PTS');
    expect(rgbToHex(line.style.color)).toBe(railStandingColor('#dc0000'));
    unmount();
  });

  // The maths above is only right while the highlight really is zinc-800 at 60%. Tailwind class
  // names cannot be built from a runtime constant — the JIT scans source text — so the component
  // keeps the literal and this pins the two together, the same way the seam's wash is pinned.
  it('paints the highlight at the opacity the contrast maths assumes', () => {
    const { container } = renderRail({ activeTeamId: 'ferrari' });
    const highlight = container.querySelector('.bg-zinc-800\\/60');
    expect(highlight, 'active highlight is no longer bg-zinc-800/60').not.toBeNull();
    expect(RAIL_ACTIVE_FILL).toBe('#27272a'); // Tailwind zinc-800
    expect(RAIL_ACTIVE_ALPHA).toBe(0.6);
  });

  // The rail's own neutrals. Both header lines and every inactive row label are judged here,
  // so the 2.57:1 subheader this branch introduced and the inherited 4.12:1 rows are one test.
  it('holds every resting neutral in the rail above AA on the page background', () => {
    const { container } = renderRail();
    const neutrals = restingTextNeutrals(container);
    // Guards the guard: if the classes move to inline styles this test would silently pass.
    expect(neutrals.length).toBeGreaterThan(0);
    for (const { hex, text } of neutrals) {
      expect(contrastRatio(hex, DARK_BG), `${hex} on "${text}"`).toBeGreaterThanOrEqual(
        MIN_CONTRAST,
      );
    }
  });

  it('holds the inactive rows’ standings lines above AA', () => {
    renderRail({ activeTeamId: 'ferrari' });
    for (const team of TEAMS) {
      if (team.id === 'ferrari') continue;
      const line = screen.getByText(`P${team.position} · ${team.points} PTS`);
      expect(
        contrastRatio(rgbToHex(line.style.color), DARK_BG),
        `${team.shortName} inactive standings ${line.style.color}`,
      ).toBeGreaterThanOrEqual(MIN_CONTRAST);
    }
  });

  it('sets the progress track to a sliver on the first team and full on the last', () => {
    const first = TEAMS.at(0);
    const last = TEAMS.at(-1);
    if (!first || !last) throw new Error('TEAMS must not be empty');

    const { container: firstContainer } = renderRail({ activeTeamId: first.id });
    expect(progressFill(firstContainer).style.transform).toBe(`scaleY(${1 / TEAMS.length})`);

    const { container: lastContainer } = renderRail({ activeTeamId: last.id });
    expect(progressFill(lastContainer).style.transform).toBe('scaleY(1)');
  });

  it('animates the progress track only when motion is allowed', () => {
    const { container } = renderRail();
    expect(progressFill(container).className).toMatch(/transition-transform/);
  });

  it('drops the progress track transition under reduced motion', () => {
    const { container } = renderRail({ reducedMotion: true });
    const fill = progressFill(container);
    expect(fill.className).not.toMatch(/transition-transform/);
    expect(fill.style.transform).toBe(`scaleY(${2 / TEAMS.length})`);
  });

  // The rule used to be `backgroundColor: team.color`, which lit eleven liveries at once and made
  // the active row hard to pick out — the thing the rule exists to do. One red rule per row, and
  // the count is pinned so a rule that stopped rendering (or started rendering twice, once per
  // state) fails here rather than in a screenshot nobody takes.
  it('gives every row exactly one red selection rule', () => {
    const { container } = renderRail();
    const rules = selectionRules(container);
    expect(rules).toHaveLength(TEAMS.length);
    for (const rule of rules) {
      // Red is a *fill*, so it is outside the 4.5:1 text bar that `f1-red`'s 4.01:1 fails.
      expect(rule.className).toMatch(/\bbg-f1-red\b/);
      // `\b` cannot follow a `]` — both sides are non-word characters — so arbitrary-value
      // Tailwind classes have to be bounded by whitespace instead.
      expect(rule.className).toMatch(/(^|\s)w-\[2px\](\s|$)/);
      // Decoration duplicating `aria-current`; a screen reader must not meet it twice.
      expect(rule).toHaveAttribute('aria-hidden', 'true');
      // The livery must not come back on this element — that is the regression, and an inline
      // backgroundColor is the exact shape it had.
      expect(rule.style.backgroundColor).toBe('');
    }
  });

  // jsdom applies no stylesheet and cannot evaluate `:hover`, so there is no computed style to
  // read and `fireEvent.mouseOver` changes nothing observable. The class string is therefore the
  // strongest available proof that the rule reveals on hover: `group` on the anchor is what makes
  // `group-hover:` on the child resolve at all, and asserting one without the other passes while
  // the pair is broken. The parent verifies the rendered hover in a browser.
  it('reveals the rule on hover as well as on selection', () => {
    const { container } = renderRail({ activeTeamId: 'ferrari' });
    const anchors = Array.from(container.querySelectorAll('a'));
    expect(anchors).toHaveLength(TEAMS.length);
    for (const anchor of anchors) {
      expect(anchor.className).toMatch(/(^|\s)group(\s|$)/);
    }
    for (const rule of selectionRules(container)) {
      expect(rule.className).toMatch(/\bgroup-hover:opacity-100\b/);
    }
  });

  // `cn` merges through tailwind-merge: `opacity-0` and `opacity-100` are the same key, so the
  // active row must end up with 100 and only 100. A version that emitted both would render at
  // whichever Tailwind ordered last and look correct exactly half the time.
  it('rests the rule hidden and shows it on the selected row', () => {
    const { container } = renderRail({ activeTeamId: 'ferrari' });
    const active = screen.getByRole('link', { current: 'location' });
    const activeRule = active.querySelector('span.bg-f1-red');
    expect(activeRule).not.toBeNull();
    expect(activeRule!.className).toMatch(/\bopacity-100\b/);
    expect(activeRule!.className).not.toMatch(/\bopacity-0\b/);

    const inactive = selectionRules(container).filter((r) => r !== activeRule);
    expect(inactive).toHaveLength(TEAMS.length - 1);
    for (const rule of inactive) {
      expect(rule.className).toMatch(/\bopacity-0\b/);
      // …but not the resting `opacity-100`; only the hover variant of it.
      expect(rule.className).not.toMatch(/(^|\s)opacity-100(\s|$)/);
    }
  });

  // The spec asks for "points in mono" and the rail already shipped that way, so this pins the
  // existing state rather than recording a change. It is worth pinning because tabular-looking
  // numbers in a proportional face is the kind of regression that reads as "slightly off" for
  // months before anyone names it.
  it('sets the standings line in mono', () => {
    const { container } = renderRail();
    const lines = Array.from(container.querySelectorAll('a span.font-mono'));
    expect(lines).toHaveLength(TEAMS.length);
    for (const line of lines) {
      expect(line.className).toMatch(/(^|\s)text-\[9px\](\s|$)/);
    }
  });

  // The spec's 40ms overrides the branch-wide 80–120ms child stagger, and this pins the number
  // rather than the shape: eleven rows at 120ms would take 1.32s to finish assembling a
  // navigation control. Asserted on the pure function because reading the delay back off a
  // rendered motion element would need a stub for `motion.a` and would then be testing the stub.
  it('staggers the rows 40ms apart, in a ramp', () => {
    expect(RAIL_ROW_STAGGER_S).toBe(0.04);
    // The eleventh row — the last one — waits ten steps.
    expect(railRowDelay(TEAMS.length - 1, false)).toBe(10 * RAIL_ROW_STAGGER_S);
    expect(railRowDelay(0, false)).toBe(0);
    for (let i = 1; i < TEAMS.length; i += 1) {
      expect(railRowDelay(i, false)).toBeGreaterThan(railRowDelay(i - 1, false));
    }
  });

  // Reduced motion means *no* cascade, not a faster one — a stagger that still staggers is still
  // the motion the preference asked to be spared.
  it('flattens the stagger to zero under reduced motion', () => {
    for (let i = 0; i < TEAMS.length; i += 1) {
      expect(railRowDelay(i, true), `row ${i}`).toBe(0);
    }
  });

  // The assertion that catches an entrance animation that gates its own content. The rail is the
  // page's primary navigation: whatever the observer or the motion preference says, all eleven
  // rows must be real links, with their fragment and their accessible name, from first render.
  it.each([false, true])(
    'renders all eleven rows as named links with reducedMotion=%s',
    (reducedMotion) => {
      renderRail({ reducedMotion });
      expect(TEAMS).toHaveLength(11);
      for (const team of TEAMS) {
        const link = screen.getByRole('link', { name: new RegExp(team.shortName, 'i') });
        expect(link).toHaveAttribute('href', `#team-${team.id}`);
      }
      expect(screen.getAllByRole('link')).toHaveLength(TEAMS.length);
    },
  );

  // `restingTextNeutrals` reads `text-zinc-N` classes and so sees *none* of this rail's
  // livery-coloured text, which arrives inline from `lib/team-utils.ts`. The two helpers
  // partition the tree; this is the half the class-reading test above cannot reach, and without
  // it the rail's most contrast-sensitive runs go unmeasured for all eleven teams.
  it('holds every inline-coloured run above AA against the background it really has', () => {
    expect(TEAMS).toHaveLength(11);
    for (const team of TEAMS) {
      const { container, unmount } = renderRail({ activeTeamId: team.id });

      // The monogram tiles are inline-coloured text too, but they sit on their *own* livery
      // fill, not on the page — `onColor` derives their foreground and `tests/team-utils.test.ts`
      // measures it there. Excluded by property (`role="img"`) with a pinned count, so this hole
      // is exactly eleven wide and cannot widen without this number changing.
      const tiles = Array.from(container.querySelectorAll<HTMLElement>('[role="img"]'));
      expect(tiles).toHaveLength(TEAMS.length);
      detach(tiles);

      const runs = inlineColouredText(container);
      // Non-vacuity, and a pin: eleven standings lines and nothing else. An inline colour that
      // stopped being applied would otherwise make the loop below pass over an empty list.
      expect(runs, `${team.shortName} inline runs`).toHaveLength(TEAMS.length);

      const activeText = `P${team.position} · ${team.points} PTS`;
      const onHighlight = runs.filter((r) => r.text === activeText);
      // Exactly one row is on the `bg-zinc-800/60` highlight; the other ten are on the page.
      expect(onHighlight, `${team.shortName} active run`).toHaveLength(1);

      for (const { hex, text } of runs) {
        const isActiveRun = text === activeText;
        const backdrop = isActiveRun ? railStandingBackdrop() : DARK_BG;
        expect(
          contrastRatio(hex, backdrop),
          `${team.shortName}: "${text}" at ${hex} on ${backdrop}`,
        ).toBeGreaterThanOrEqual(MIN_CONTRAST);
      }

      unmount();
    }
  });

  // The premise the test above rests on, asserted rather than assumed. `railStandingBackdrop()`
  // is only the *right* background to judge the active line against if it is also the *stricter*
  // one — zinc-800 at 60% over the page is lighter than the page, so a light glyph scores lower
  // there. If that ever inverted (a darker highlight), measuring against it would be the
  // optimistic choice and this suite would be certifying the wrong number, which is precisely the
  // failure CLAUDE.md records shipping twice on this page.
  it('measures the active line against the stricter of its two candidate backgrounds', () => {
    expect(TEAMS).toHaveLength(11);
    for (const team of TEAMS) {
      const { unmount } = renderRail({ activeTeamId: team.id });
      const hex = rgbToHex(screen.getByText(`P${team.position} · ${team.points} PTS`).style.color);
      expect(
        contrastRatio(hex, railStandingBackdrop()),
        `${team.shortName} ${hex}`,
      ).toBeLessThanOrEqual(contrastRatio(hex, DARK_BG));
      unmount();
    }
  });
});

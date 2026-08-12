import { describe, it, expect, vi } from 'vitest';
import { render, screen, within, fireEvent } from '@testing-library/react';

import {
  TeamsCompareTray,
  COMPARE_FIELDS,
  leaderIndex,
} from '@/components/teams/teams-compare-tray';
import { TEAM_MAP, type Team } from '@/data/teams-data';
import {
  contrastRatio,
  trayValueBackdrop,
  trayValueColor,
  DARK_BG,
  MIN_CONTRAST,
} from '@/lib/team-utils';
import { restingTextNeutrals } from './zinc';

const ferrari = TEAM_MAP['ferrari']!;
const mercedes = TEAM_MAP['mercedes']!;
const cadillac = TEAM_MAP['cadillac']!;
const audi = TEAM_MAP['audi']!;

/** jsdom normalises any inline colour to `rgb(r, g, b)`; contrastRatio wants hex. */
function rgbToHex(value: string): string {
  const parts = value.match(/\d+/g);
  if (!parts || parts.length < 3) throw new Error(`not an rgb() colour: ${value}`);
  return `#${parts
    .slice(0, 3)
    .map((n) => Number(n).toString(16).padStart(2, '0'))
    .join('')}`;
}

function renderTray(teams: [Team, Team] = [mercedes, ferrari], onClear = vi.fn()) {
  return render(<TeamsCompareTray teams={teams} reducedMotion={false} onClear={onClear} />);
}

function field(label: string) {
  return COMPARE_FIELDS.find((f) => f.label === label)!;
}

describe('leaderIndex', () => {
  it('gives a numeric field to whichever team is ahead', () => {
    // Mercedes 379 points, Ferrari 307.
    expect(leaderIndex(field('Championship'), mercedes, ferrari)).toBe(0);
    expect(leaderIndex(field('Championship'), ferrari, mercedes)).toBe(1);
  });

  // Nothing wins a power unit. The spec is explicit about this and it is the difference between
  // a comparison and a scoreboard.
  it('gives no leader to a non-numeric field', () => {
    expect(leaderIndex(field('Power Unit'), mercedes, ferrari)).toBeNull();
    expect(leaderIndex(field('Base'), mercedes, ferrari)).toBeNull();
    expect(leaderIndex(field('Drivers'), mercedes, ferrari)).toBeNull();
  });

  // Two teams on zero championships is a real pairing on the 2026 grid, not a hypothetical.
  it('gives no leader when a numeric field is tied', () => {
    expect(cadillac.championships).toBe(audi.championships);
    expect(leaderIndex(field('Titles'), cadillac, audi)).toBeNull();
  });

  // "Since" sorts ascending — oldest first — so the older constructor leads. Inverting this is
  // the easy mistake: the raw number is smaller for the winner.
  it('gives First Entry to the earlier debut, matching the Since tab', () => {
    expect(ferrari.firstEntry).toBeLessThan(mercedes.firstEntry);
    expect(leaderIndex(field('First Entry'), ferrari, mercedes)).toBe(0);
  });
});

describe('TeamsCompareTray', () => {
  it('lays both constructors out over all six fields the spec names', () => {
    renderTray();
    for (const label of [
      'Championship',
      'Titles',
      'Power Unit',
      'Base',
      'First Entry',
      'Drivers',
    ]) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
  });

  it('names both constructors', () => {
    // Not getByText: the component's own doc comment is explicit that the same team name is
    // rendered twice on purpose — once in the desktop header, once per row as the stacked
    // layout's mobile label — so CSS, not the DOM, is what makes only one visible at a time.
    // jsdom applies no media query, so both copies exist and getByText correctly throws on the
    // ambiguity; getAllByText proves presence without assuming a count CSS alone controls.
    renderTray();
    expect(screen.getAllByText('Mercedes').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Ferrari').length).toBeGreaterThan(0);
  });

  it('shows each team’s own value for a field', () => {
    // mercedes.powerUnit is the literal string "Mercedes", which is also the team's own name —
    // a real coincidence of the 2026 grid, not a test bug — so it collides with the same
    // desktop-header/mobile-label duplication as above and needs the same getAllByText.
    renderTray();
    expect(screen.getAllByText(mercedes.powerUnit).length).toBeGreaterThan(0);
    expect(screen.getByText(ferrari.base)).toBeInTheDocument();
  });

  it('marks the leading value of a numeric row for screen readers, not by colour alone', () => {
    renderTray();
    const row = screen.getByTestId('compare-row-championship');
    // Mercedes leads on points and is the left column.
    expect(within(row).getByTestId('compare-value-0')).toHaveTextContent(/leads/i);
    expect(within(row).getByTestId('compare-value-1')).not.toHaveTextContent(/leads/i);
  });

  it('marks nothing on a non-numeric row', () => {
    renderTray();
    const row = screen.getByTestId('compare-row-power-unit');
    expect(within(row).getByTestId('compare-value-0')).not.toHaveTextContent(/leads/i);
    expect(within(row).getByTestId('compare-value-1')).not.toHaveTextContent(/leads/i);
  });

  it('marks nothing on a tied numeric row', () => {
    renderTray([cadillac, audi]);
    const row = screen.getByTestId('compare-row-titles');
    expect(within(row).getByTestId('compare-value-0')).not.toHaveTextContent(/leads/i);
    expect(within(row).getByTestId('compare-value-1')).not.toHaveTextContent(/leads/i);
  });

  // The whole reason Task 1 exists. The leading value is the only team-coloured text in the tray
  // and it sits on the tray's card, not on the page.
  it('colours the leading value through the tray’s own contrast variant', () => {
    renderTray();
    const leader = within(screen.getByTestId('compare-row-championship')).getByTestId(
      'compare-value-0',
    );
    expect(rgbToHex(leader.style.color)).toBe(trayValueColor(mercedes.color));
  });

  it('holds the leading value above AA on the background it actually has', () => {
    renderTray();
    const leader = within(screen.getByTestId('compare-row-championship')).getByTestId(
      'compare-value-0',
    );
    expect(
      contrastRatio(rgbToHex(leader.style.color), trayValueBackdrop()),
    ).toBeGreaterThanOrEqual(MIN_CONTRAST);
  });

  // The class and the constants are two halves of one number. team-utils.test.ts pins the
  // constants; this pins the class to them.
  it('is authored at the fill the contrast maths assumes', () => {
    renderTray();
    expect(screen.getByTestId('compare-tray').className).toMatch(/\bbg-zinc-900\/60\b/);
  });

  it('holds every resting neutral above AA on the page background', () => {
    const { container } = renderTray();
    const neutrals = restingTextNeutrals(container);
    expect(neutrals.length).toBeGreaterThan(0);
    for (const { hex, text } of neutrals) {
      expect(contrastRatio(hex, DARK_BG), `${hex} on "${text}"`).toBeGreaterThanOrEqual(
        MIN_CONTRAST,
      );
    }
    // Stricter: the tray's real composite (`trayValueBackdrop()`) is lighter than the page
    // background, so this is a harder bar than the one above, not a redundant one.
    for (const { hex, text } of neutrals) {
      expect(
        contrastRatio(hex, trayValueBackdrop()),
        `${hex} on "${text}"`,
      ).toBeGreaterThanOrEqual(MIN_CONTRAST);
    }
  });

  it('offers a way out', () => {
    const onClear = vi.fn();
    renderTray([mercedes, ferrari], onClear);
    fireEvent.click(screen.getByRole('button', { name: /clear comparison/i }));
    expect(onClear).toHaveBeenCalled();
  });

  // Below lg the two values stack under a shared label, so each one has to say whose it is.
  // At lg and up the column headers carry that and these are hidden.
  it('labels each value with its team for the stacked layout', () => {
    renderTray();
    const row = screen.getByTestId('compare-row-base');
    expect(within(row).getByTestId('compare-value-0').textContent).toMatch(/Mercedes/);
    expect(within(row).getByTestId('compare-value-1').textContent).toMatch(/Ferrari/);
  });
});

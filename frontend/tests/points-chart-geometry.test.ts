import { describe, expect, it } from 'vitest';

import { TEAM_MAP } from '@/data/teams-data';
import {
  HIGHLIGHTED,
  MUTED_LINE,
  UNMATCHED_LINE,
  chartSeries,
  niceTicks,
  spreadLabels,
  type ChartRow,
} from '@/lib/points-chart';
import { contrastRatio, DARK_BG, MIN_CONTRAST, MIN_RING_CONTRAST } from '@/lib/team-utils';
import standings2026 from './fixtures/standings-2026.json';

const DRIVERS_2026: ChartRow[] = standings2026.drivers.map((row) => ({
  key: row.driver_code,
  label: row.driver_code,
  team: row.team,
  points_by_round: row.points_by_round,
}));

const CONSTRUCTORS_2026: ChartRow[] = standings2026.constructors.map((row) => ({
  key: row.team,
  label: row.team,
  team: row.team,
  points_by_round: row.points_by_round,
}));

describe('niceTicks', () => {
  it('steps in 1, 2 or 5 times a power of ten, topping out at or above the maximum', () => {
    expect(niceTicks(292)).toEqual([0, 100, 200, 300]);
    expect(niceTicks(437)).toEqual([0, 100, 200, 300, 400, 500]);
    expect(niceTicks(75)).toEqual([0, 20, 40, 60, 80]);
  });

  it('does not add an empty step above a maximum that lands on a tick', () => {
    expect(niceTicks(300)).toEqual([0, 100, 200, 300]);
  });

  it('gives an all-zero season an axis with height', () => {
    expect(niceTicks(0)).toEqual([0, 1]);
  });
});

describe('spreadLabels', () => {
  it('leaves labels that already clear the gap where they are', () => {
    expect(spreadLabels([10, 50, 90], 12, 0, 200)).toEqual([10, 50, 90]);
  });

  it('pushes a label that crowds the one above it down to the gap', () => {
    expect(spreadLabels([100, 102], 12, 0, 200)).toEqual([100, 112]);
  });

  it('answers in the order it was asked, whatever order the labels sit in', () => {
    expect(spreadLabels([102, 100], 12, 0, 200)).toEqual([112, 100]);
  });

  it('pulls a stack that would run off the bottom back up inside it', () => {
    expect(spreadLabels([195, 198], 12, 0, 200)).toEqual([188, 200]);
  });
});

describe('chartSeries', () => {
  it('colours the first rows, in the order they arrive, and mutes the rest', () => {
    const series = chartSeries(DRIVERS_2026);

    expect(series.filter((s) => s.highlighted).map((s) => s.key)).toEqual(
      DRIVERS_2026.slice(0, HIGHLIGHTED).map((row) => row.key),
    );
    for (const muted of series.filter((s) => !s.highlighted)) {
      expect(muted.line).toBe(MUTED_LINE);
      expect(muted.text).toBeNull();
      expect(muted.dashed).toBe(false);
    }
  });

  it("dashes a highlighted driver whose teammate is already drawn in the team's colour", () => {
    // 2026's top five: ANT, RUS (Mercedes); HAM, LEC (Ferrari); NOR.
    const dashed = chartSeries(DRIVERS_2026)
      .filter((s) => s.dashed)
      .map((s) => s.key);

    expect(dashed).toEqual(['RUS', 'LEC']);
  });

  it('draws teammates in one colour, so the dash is the only thing telling them apart', () => {
    const byKey = Object.fromEntries(chartSeries(DRIVERS_2026).map((s) => [s.key, s]));

    expect(byKey.RUS?.line).toBe(byKey.ANT?.line);
    expect(byKey.LEC?.line).toBe(byKey.HAM?.line);
  });

  it("lifts every highlighted line to WCAG's 3:1 non-text bar against the page", () => {
    // Racing Bulls, fifth in 2026's constructors, is navy at 2.02:1 in its true hex.
    const racingBulls = TEAM_MAP['racing-bulls'];
    expect(racingBulls).toBeDefined();
    expect(contrastRatio(racingBulls?.color ?? '', DARK_BG)).toBeLessThan(MIN_RING_CONTRAST);

    for (const s of chartSeries(CONSTRUCTORS_2026).filter((row) => row.highlighted)) {
      expect(contrastRatio(s.line, DARK_BG), s.key).toBeGreaterThanOrEqual(MIN_RING_CONTRAST);
    }
  });

  it('gives every highlighted label a colour readable as small text on the page', () => {
    for (const s of chartSeries(DRIVERS_2026).filter((row) => row.highlighted)) {
      expect(contrastRatio(s.text ?? '', DARK_BG), s.key).toBeGreaterThanOrEqual(MIN_CONTRAST);
    }
  });

  it('draws a team TEAMS does not know in a neutral, never a guessed livery', () => {
    const rows: ChartRow[] = [
      { key: 'BOT', label: 'BOT', team: 'Kick Sauber', points_by_round: [0, 4] },
      { key: 'ZHO', label: 'ZHO', team: 'Kick Sauber', points_by_round: [0, 0] },
    ];

    const [first, second] = chartSeries(rows);

    expect(first?.line).toBe(UNMATCHED_LINE);
    expect(contrastRatio(first?.text ?? '', DARK_BG)).toBeGreaterThanOrEqual(MIN_CONTRAST);
    // Two cars of one unmatched team still share a colour, so the second is still dashed.
    expect(second?.dashed).toBe(true);
  });
});

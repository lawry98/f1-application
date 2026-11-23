import { teamForStanding } from '@/lib/standings';
import { readableOnDark, ringOnDark } from '@/lib/team-utils';

/**
 * The geometry behind `/standings`' points-by-round charts: which lines get colour, what colour,
 * the y-axis ticks, and where the end-of-line labels go. Pure, so it is tested without a DOM.
 */

/** How many rows get colour and a label. The rest are context: a thin neutral line each. */
export const HIGHLIGHTED = 5;

/** zinc-700. A muted line is context the table states in full, so it is not held to 3:1. */
export const MUTED_LINE = '#3f3f46';

/** zinc-400, for a highlighted team `TEAMS` does not know — never a guessed livery. */
export const UNMATCHED_LINE = '#a1a1aa';

/** zinc-300, the label beside an `UNMATCHED_LINE`. */
const UNMATCHED_TEXT = '#d4d4d8';

/** One row of either table, reduced to what a chart line needs. */
export interface ChartRow {
  /** Unique within the chart: the driver code, or the team name. */
  key: string;
  /** The end-of-line label. */
  label: string;
  /** OpenF1's team spelling, as the tables receive it. */
  team: string;
  /** Running total after each round. */
  points_by_round: number[];
}

export interface ChartSeries {
  key: string;
  label: string;
  values: number[];
  highlighted: boolean;
  /** Stroke colour. */
  line: string;
  /** Label colour, or `null` for a muted line, which carries no label. */
  text: string | null;
  /** A highlighted line whose team colour an earlier highlighted line already uses. */
  dashed: boolean;
}

/**
 * Each row's line, in the order the rows arrive — ranked by the backend, so the first
 * `HIGHLIGHTED` are the leaders and no client-side sort can disagree with the table.
 *
 * A highlighted line is the livery lifted to WCAG's 3:1 non-text bar (`ringOnDark`): unlike the
 * tables' 4px bar, the line *is* the information, and Racing Bulls' navy reads at 2.02:1 in its
 * true hex. Its label is the livery lifted to 4.5:1 (`readableOnDark`), which is right only
 * because the chart sits on the bare `zinc-950` page with no card behind it. Teammates share a
 * colour, so the second of a pair is dashed.
 */
export function chartSeries(rows: ChartRow[]): ChartSeries[] {
  const drawn = new Set<string>();
  return rows.map((row, index) => {
    const highlighted = index < HIGHLIGHTED;
    if (!highlighted) {
      return {
        key: row.key,
        label: row.label,
        values: row.points_by_round,
        highlighted,
        line: MUTED_LINE,
        text: null,
        dashed: false,
      };
    }
    const team = teamForStanding(row.team);
    const colourKey = team?.id ?? `unmatched:${row.team}`;
    const dashed = drawn.has(colourKey);
    drawn.add(colourKey);
    return {
      key: row.key,
      label: row.label,
      values: row.points_by_round,
      highlighted,
      line: team ? ringOnDark(team.color) : UNMATCHED_LINE,
      text: team ? readableOnDark(team.color) : UNMATCHED_TEXT,
      dashed,
    };
  });
}

/**
 * Y-axis ticks from zero: steps of 1, 2 or 5 times a power of ten, about five of them, the top
 * one at or above `max`. An all-zero season still gets an axis with height.
 */
export function niceTicks(max: number, intervals = 5): number[] {
  if (max <= 0) return [0, 1];
  const raw = max / intervals;
  const magnitude = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 5, 10].map((m) => m * magnitude).find((s) => s >= raw) ?? 10 * magnitude;
  const top = Math.ceil(max / step) * step;
  const ticks: number[] = [];
  for (let tick = 0; tick <= top; tick += step) ticks.push(tick);
  return ticks;
}

/**
 * End-of-line label positions that keep at least `gap` between neighbours, inside `[min, max]`.
 * Labels move as little as they can: down from the top first, then the whole stack back up if it
 * ran off the bottom. Returned in the order asked, so each stays paired with its line.
 */
export function spreadLabels(ys: number[], gap: number, min: number, max: number): number[] {
  const order = ys.map((y, index) => ({ y, index })).sort((a, b) => a.y - b.y);
  for (let i = 0; i < order.length; i += 1) {
    const entry = order[i];
    if (!entry) continue;
    const above = order[i - 1];
    entry.y = Math.max(entry.y, min, above ? above.y + gap : min);
  }
  for (let i = order.length - 1; i >= 0; i -= 1) {
    const entry = order[i];
    if (!entry) continue;
    const below = order[i + 1];
    entry.y = Math.min(entry.y, below ? below.y - gap : max);
  }
  const out = new Array<number>(ys.length);
  for (const { y, index } of order) out[index] = y;
  return out;
}

'use client';

import { useEffect, useRef, useState } from 'react';

import { chartSeries, niceTicks, spreadLabels, type ChartRow } from '@/lib/points-chart';
import type { StandingsRound } from '@/types';

/**
 * A season's running points totals, one line per row, drawn above each table on `/standings`.
 *
 * Hand-drawn SVG, as the circuit outlines are: a chart library would be the page's heaviest
 * dependency for nine path elements' worth of work. Static on purpose — the table beneath it
 * states every number, so the chart is one `role="img"` with a name that says what it shows and
 * who leads, not a second, keyboard-driven copy of the table.
 *
 * Sized in real pixels, not by scaling a fixed viewBox, so the 10px labels stay 10px on a phone.
 * The first render (server and client alike) uses `DEFAULT_WIDTH`, scaled down by CSS to fit, and
 * the measured width replaces it once mounted — so a narrow screen never scrolls sideways.
 *
 * Every glyph sits on the bare `zinc-950` page, which is the only backdrop `chartSeries`' label
 * colours are judged against. Put a card or a tint behind this and they need a backdrop variant.
 */

/** `max-w-3xl` less the page's `px-4` gutters: the chart's width on any desktop. */
const DEFAULT_WIDTH = 736;
const MARGIN = { top: 10, bottom: 24, left: 34 };
/** Space between the plot and its end-of-line labels. */
const LABEL_OFFSET = 8;
/** Approximate advance of one 10px monospace glyph, for sizing the label gutter. */
const GLYPH_WIDTH = 6.1;
/** Minimum vertical distance between two end-of-line labels. */
const LABEL_GAP = 12;
const GRID_LINE = '#27272a';

const formatPoints = new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 }).format;

interface PointsChartProps {
  /** The chart's accessible name, e.g. "Drivers' points by round". */
  title: string;
  /** Ranked, as the table serves them; the first five are coloured. */
  rows: ChartRow[];
  rounds: StandingsRound[];
}

export function PointsChart({ title, rows, rounds }: PointsChartProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(DEFAULT_WIDTH);

  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const measure = () => {
      const next = el.clientWidth;
      if (next > 0) setWidth(next);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  if (rounds.length < 2 || rows.length === 0) return null;

  const series = chartSeries(rows);
  const highlighted = series.filter((s) => s.highlighted);
  const leader = series[0];
  const longestLabel = Math.max(...highlighted.map((s) => s.label.length));
  const right = LABEL_OFFSET + Math.ceil(longestLabel * GLYPH_WIDTH) + 4;

  const height = Math.round(Math.min(300, Math.max(200, width * 0.42)));
  const plotWidth = width - MARGIN.left - right;
  const plotHeight = height - MARGIN.top - MARGIN.bottom;
  const max = Math.max(0, ...series.flatMap((s) => s.values));
  const ticks = niceTicks(max);
  const top = ticks[ticks.length - 1] ?? 1;

  const x = (index: number) => MARGIN.left + (index / (rounds.length - 1)) * plotWidth;
  const y = (value: number) => MARGIN.top + plotHeight * (1 - value / top);
  const pathFor = (values: number[]) =>
    values.map((v, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(' ');

  const labelYs = spreadLabels(
    highlighted.map((s) => y(s.values[s.values.length - 1] ?? 0)),
    LABEL_GAP,
    MARGIN.top,
    MARGIN.top + plotHeight,
  );

  // Muted context first, then the leaders from fifth up, so the leader is drawn on top.
  const drawOrder = [...series.filter((s) => !s.highlighted), ...[...highlighted].reverse()];
  const roundTicks = rounds.filter(
    (r, i) =>
      i === 0 || i === rounds.length - 1 || (r.round % 5 === 0 && rounds.length - 1 - i >= 2),
  );

  const name =
    `${title}: running totals after each of ${rounds.length} rounds.` +
    (leader ? ` ${leader.label} leads on ${formatPoints(leader.values.at(-1) ?? 0)}.` : '');

  return (
    <figure className="mb-8">
      <div ref={ref}>
        <svg
          role="img"
          aria-label={name}
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          className="block h-auto w-full font-mono text-[10px]"
        >
          {ticks.map((tick) => (
            <g key={tick}>
              <line
                x1={MARGIN.left}
                x2={MARGIN.left + plotWidth}
                y1={y(tick)}
                y2={y(tick)}
                stroke={GRID_LINE}
                strokeWidth={1}
              />
              <text
                x={MARGIN.left - 6}
                y={y(tick)}
                textAnchor="end"
                dominantBaseline="middle"
                fill="currentColor"
                className="text-zinc-400"
              >
                {tick}
              </text>
            </g>
          ))}
          {roundTicks.map((r) => (
            <text
              key={r.round}
              x={x(rounds.indexOf(r))}
              y={height - 6}
              textAnchor="middle"
              fill="currentColor"
              className="text-zinc-400"
            >
              R{r.round}
            </text>
          ))}
          {drawOrder.map((s) => (
            <path
              key={s.key}
              data-series={s.key}
              d={pathFor(s.values)}
              fill="none"
              stroke={s.line}
              strokeWidth={s.highlighted ? 2 : 1}
              strokeDasharray={s.dashed ? '5 4' : undefined}
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          ))}
          {highlighted.map((s, i) => (
            <g key={s.key}>
              <circle
                cx={x(s.values.length - 1)}
                cy={y(s.values[s.values.length - 1] ?? 0)}
                r={2.5}
                fill={s.line}
              />
              <text
                data-label={s.key}
                x={MARGIN.left + plotWidth + LABEL_OFFSET}
                y={labelYs[i]}
                dominantBaseline="middle"
                fill="currentColor"
                style={{ color: s.text ?? undefined }}
                className="font-semibold"
              >
                {s.label}
              </text>
            </g>
          ))}
        </svg>
      </div>
      <figcaption className="mt-2 text-xs text-zinc-400">
        Points after each round · top five in colour
      </figcaption>
    </figure>
  );
}

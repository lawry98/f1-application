'use client';

import { useId } from 'react';
import { motion } from 'motion/react';

import { useReducedMotionSafe } from '@/hooks/use-reduced-motion-safe';

import type { DirectionProps } from './direction-spotlight';
import { TyreBody } from './tyre-body';
import { TyreDefs, makeIdFor } from './tyre-defs';
import { CX, CY, R, THERMAL, polar } from './tyre-geometry';

/**
 * Direction B — thermal / wind-tunnel telemetry.
 *
 * The tyre as a scanned specimen. A measurement grid runs under everything, isotherm bands read
 * across the tread, and the composition is dominated by instrumentation rather than by light:
 * a temperature scale, numbered callouts on leader lines, and dense monospace microcopy.
 *
 * The register is deliberately cold. Where the spotlight direction asks "how does this look",
 * this one asks "what is this doing" — so there is no floor, no vignette and no key light, and
 * the compound colour arrives through the heat map rather than through a lamp.
 */
export function DirectionThermal({ compound, thermal = 'hot', wear = 0.45 }: DirectionProps) {
  const uid = useId();
  const idFor = makeIdFor(uid);
  const reduced = useReducedMotionSafe();
  const { color } = compound;
  const heat = THERMAL[thermal];

  return (
    <div className="relative isolate w-full overflow-hidden bg-base">
      <svg
        viewBox="0 0 900 620"
        aria-hidden="true"
        className="h-auto w-full"
        preserveAspectRatio="xMidYMid meet"
      >
        <TyreDefs idFor={idFor} color={color} thermal={thermal} wet={0} />
        <defs>
          {/* Measurement grid. Two tiles rather than one so the 100-unit majors read over the
              20-unit minors without a second full-canvas rect. */}
          <pattern id={idFor('minor')} width="20" height="20" patternUnits="userSpaceOnUse">
            <path d="M20 0H0V20" fill="none" stroke="#ffffff" strokeOpacity="0.05" strokeWidth="1" />
          </pattern>
          <pattern id={idFor('major')} width="100" height="100" patternUnits="userSpaceOnUse">
            <path
              d="M100 0H0V100"
              fill="none"
              stroke={color}
              strokeOpacity="0.14"
              strokeWidth="1"
            />
          </pattern>
          {/* The scale bar's ramp, built from the same three stops the heat map uses so the
              legend genuinely describes the image. */}
          <linearGradient id={idFor('scale')} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor={THERMAL.cold.core} />
            <stop offset="45%" stopColor={THERMAL.optimal.core} />
            <stop offset="78%" stopColor={THERMAL.hot.mid} />
            <stop offset="100%" stopColor={THERMAL.hot.core} />
          </linearGradient>
        </defs>

        <rect width="900" height="620" fill="#09090b" />
        <rect width="900" height="620" fill={`url(#${idFor('minor')})`} />
        <rect width="900" height="620" fill={`url(#${idFor('major')})`} />

        {/* Frame rule — a scan window rather than a picture edge. */}
        <rect
          x="28"
          y="28"
          width="844"
          height="564"
          fill="none"
          stroke={color}
          strokeOpacity="0.3"
          strokeWidth="1"
        />
        {(
          [
            [28, 28, 1, 1],
            [872, 28, -1, 1],
            [28, 592, 1, -1],
            [872, 592, -1, -1],
          ] as const
        ).map(([x, y, sx, sy]) => (
          <g key={`${x}-${y}`} stroke={color} strokeOpacity="0.8" strokeWidth="2">
            <line x1={x} y1={y} x2={x + 18 * sx} y2={y} />
            <line x1={x} y1={y} x2={x} y2={y + 18 * sy} />
          </g>
        ))}

        {/* Isotherm contour rings, expanding outward. Under the tyre so it sits *in* the field. */}
        <motion.g
          animate={reduced ? undefined : { opacity: [0.5, 0.15, 0.5] }}
          transition={reduced ? undefined : { duration: 5.5, repeat: Infinity, ease: 'easeInOut' }}
        >
          {[268, 312, 356, 400].map((r, i) => (
            <circle
              key={r}
              cx="420"
              cy="310"
              r={r}
              fill="none"
              stroke={i < 2 ? heat.core : heat.mid}
              strokeOpacity={0.16 - i * 0.03}
              strokeWidth="1"
              strokeDasharray={i % 2 ? '4 8' : undefined}
            />
          ))}
        </motion.g>

        <g transform="translate(420 310) scale(0.82) translate(-200 -200)">
          <g filter={`url(#${idFor('haze')})`}>
            <TyreBody
              idFor={idFor}
              color={color}
              tread={compound.tread}
              wear={wear}
              thermal={thermal}
              wet={0}
              contactPatch={false}
            />
          </g>

          {/* Numbered callouts on leader lines. The three numbers are the three properties the
              data model actually carries, so the diagram cannot drift from the content. */}
          {(
            [
              [1, 38, R.carcass - 8, 'TREAD'],
              [2, 148, R.band, 'COMPOUND'],
              [3, 262, R.rim - 10, 'RIM 18in'],
            ] as const
          ).map(([n, angle, radius, text]) => {
            const anchor = polar(angle, radius);
            const elbow = polar(angle, 250);
            const dir = elbow.x >= CX ? 1 : -1;
            const end = { x: elbow.x + 54 * dir, y: elbow.y };
            return (
              <g key={n}>
                <line
                  x1={anchor.x}
                  y1={anchor.y}
                  x2={elbow.x}
                  y2={elbow.y}
                  stroke={heat.core}
                  strokeOpacity="0.75"
                  strokeWidth="1"
                />
                <line
                  x1={elbow.x}
                  y1={elbow.y}
                  x2={end.x}
                  y2={end.y}
                  stroke={heat.core}
                  strokeOpacity="0.75"
                  strokeWidth="1"
                />
                <circle cx={anchor.x} cy={anchor.y} r="3.2" fill={heat.core} />
                <circle
                  cx={end.x + 11 * dir}
                  cy={end.y}
                  r="9"
                  fill="none"
                  stroke={heat.core}
                  strokeOpacity="0.9"
                />
                <text
                  x={end.x + 11 * dir}
                  y={end.y + 3.6}
                  textAnchor="middle"
                  className="font-mono"
                  fontSize="10"
                  fill={heat.core}
                >
                  {n}
                </text>
                <text
                  x={end.x + (dir > 0 ? 26 : -26)}
                  y={end.y + 3.6}
                  textAnchor={dir > 0 ? 'start' : 'end'}
                  className="font-mono"
                  fontSize="9"
                  letterSpacing="0.18em"
                  fill="#a1a1aa"
                >
                  {text}
                </text>
              </g>
            );
          })}

          {/* Scan sweep — one line crossing the specimen, the only motion in the scene. */}
          {!reduced && (
            <motion.line
              x1={CX - 230}
              x2={CX + 230}
              stroke={heat.core}
              strokeOpacity="0.5"
              strokeWidth="1.5"
              initial={{ y1: CY - 230, y2: CY - 230 }}
              animate={{ y1: [CY - 230, CY + 230], y2: [CY - 230, CY + 230] }}
              transition={{ duration: 4.2, repeat: Infinity, ease: 'linear' }}
            />
          )}
        </g>

        {/* Temperature scale. A legend that is genuinely the image's own ramp. */}
        <g transform="translate(700 470)">
          <text
            x="0"
            y="-12"
            className="font-mono"
            fontSize="9"
            letterSpacing="0.2em"
            fill="#a1a1aa"
          >
            SURFACE
          </text>
          <rect width="150" height="9" fill={`url(#${idFor('scale')})`} />
          <rect
            width="150"
            height="9"
            fill="none"
            stroke="#ffffff"
            strokeOpacity="0.2"
            strokeWidth="0.5"
          />
          {['COLD', 'WINDOW', 'OVER'].map((t, i) => (
            <text
              key={t}
              x={i * 62}
              y="24"
              className="font-mono"
              fontSize="8"
              letterSpacing="0.16em"
              fill="#71717a"
            >
              {t}
            </text>
          ))}
          {/* The marker sits where the current state is on the ramp. */}
          <g transform={`translate(${thermal === 'cold' ? 16 : thermal === 'optimal' ? 70 : 132} 0)`}>
            <path d="M0 -4 L4 -10 L-4 -10 Z" fill={heat.core} />
            <line x1="0" y1="-4" x2="0" y2="13" stroke={heat.core} strokeWidth="1.5" />
          </g>
        </g>
      </svg>

      <div className="pointer-events-none absolute inset-0 flex flex-col justify-between p-5 sm:p-9">
        <div className="flex items-start justify-between gap-4">
          <p className="font-mono text-[10px] uppercase tracking-[0.24em] text-zinc-400">
            SPEC <span className="text-zinc-600">·</span> {compound.name}
          </p>
          <p className="font-mono text-[10px] uppercase tracking-[0.24em] text-zinc-400">
            {heat.label}
          </p>
        </div>
        <div className="max-w-[24ch]">
          <p className="font-mono text-[10px] uppercase leading-relaxed tracking-[0.2em] text-zinc-400">
            WARM-UP {compound.warmUp}/5
            <br />
            GRIP {compound.grip}/5
            <br />
            LIFE {compound.durability}/5
          </p>
        </div>
      </div>
    </div>
  );
}

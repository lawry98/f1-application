'use client';

import { useId } from 'react';
import { motion } from 'motion/react';

import { useReducedMotionSafe } from '@/hooks/use-reduced-motion-safe';

import type { DirectionProps } from './direction-spotlight';
import { TyreDefs, makeIdFor } from './tyre-defs';
import { R, TREAD_PATTERN } from './tyre-geometry';

const EASE_OUT_EXPO = [0.16, 1, 0.3, 1] as const;

/**
 * Direction C — Swiss blueprint / exploded diagram.
 *
 * The tyre taken apart along its axis: tread band, carcass wall, compound band and rim drawn as
 * four separated rings with leader lines and numbered plates. Flat strokes, no light source, hard
 * grid discipline, type doing most of the work.
 *
 * Drawing the rings *separately* rather than fading a solid tyre is the whole point — an exploded
 * view is a different drawing, and a translucent photograph reads as a rendering bug. Each ring
 * is therefore an independent ellipse pair squashed on y, which is what sells the axis as
 * receding rather than as four flat circles stacked up the page.
 */
export function DirectionBlueprint({ compound }: DirectionProps) {
  const uid = useId();
  const idFor = makeIdFor(uid);
  const reduced = useReducedMotionSafe();
  const { color } = compound;
  const pattern = compound.tread === 'slick' ? null : TREAD_PATTERN[compound.tread];

  /** The four plates, top to bottom, with the radius each one describes. */
  const PLATES = [
    { n: '01', title: 'TREAD BAND', radius: R.carcass, y: 96, note: pattern ? `${pattern.grooves} GROOVES` : 'SLICK · 0 GROOVES' },
    { n: '02', title: 'CARCASS', radius: R.sidewall, y: 226, note: 'CONSTRUCTION' },
    { n: '03', title: 'SIDEWALL BAND', radius: R.band, y: 356, note: compound.name.toUpperCase() },
    { n: '04', title: 'RIM', radius: R.rim, y: 486, note: '18 IN · 10 SPOKE' },
  ] as const;

  return (
    <div className="relative isolate w-full overflow-hidden bg-base">
      <svg
        viewBox="0 0 900 620"
        aria-hidden="true"
        className="h-auto w-full"
        preserveAspectRatio="xMidYMid meet"
      >
        <TyreDefs idFor={idFor} color={color} thermal={null} wet={0} />
        <defs>
          <pattern id={idFor('paper')} width="30" height="30" patternUnits="userSpaceOnUse">
            <path
              d="M30 0H0V30"
              fill="none"
              stroke="#ffffff"
              strokeOpacity="0.045"
              strokeWidth="1"
            />
          </pattern>
        </defs>

        <rect width="900" height="620" fill="#09090b" />
        <rect width="900" height="620" fill={`url(#${idFor('paper')})`} />

        {/* The axis every plate is threaded on. Drawn first, so the rings sit over it. */}
        <line
          x1="420"
          y1="40"
          x2="420"
          y2="580"
          stroke={color}
          strokeOpacity="0.35"
          strokeWidth="1"
          strokeDasharray="10 6"
        />

        {/* Left margin rule and the plate numbers running down it — the grid made visible. */}
        <line x1="70" y1="40" x2="70" y2="580" stroke="#ffffff" strokeOpacity="0.12" />

        <motion.g
          initial={reduced ? undefined : 'hidden'}
          whileInView={reduced ? undefined : 'shown'}
          viewport={{ once: true, margin: '-15% 0px' }}
          variants={{ shown: { transition: { staggerChildren: 0.1 } } }}
        >
          {PLATES.map((plate) => {
            /* Each ring is squashed to 26% height: an ellipse read as a circle seen almost
               edge-on. The ratio is constant across plates so they share one vanishing geometry. */
            const rx = plate.radius * 0.62;
            const ry = plate.radius * 0.17;
            return (
              <motion.g
                key={plate.n}
                variants={{
                  hidden: { opacity: 0, y: 18 },
                  shown: { opacity: 1, y: 0, transition: { duration: 0.7, ease: EASE_OUT_EXPO } },
                }}
              >
                {/* Plate number in the margin */}
                <text
                  x="70"
                  y={plate.y + 5}
                  className="font-display"
                  fontSize="30"
                  fontWeight="900"
                  fill="#ffffff"
                  fillOpacity="0.14"
                >
                  {plate.n}
                </text>

                {/* Rule from the margin to the ring */}
                <line
                  x1="118"
                  y1={plate.y}
                  x2={420 - rx - 16}
                  y2={plate.y}
                  stroke="#ffffff"
                  strokeOpacity="0.18"
                  strokeWidth="1"
                />
                <text
                  x="122"
                  y={plate.y - 8}
                  className="font-mono"
                  fontSize="10"
                  letterSpacing="0.22em"
                  fill="#d4d4d8"
                >
                  {plate.title}
                </text>
                <text
                  x="122"
                  y={plate.y + 16}
                  className="font-mono"
                  fontSize="8.5"
                  letterSpacing="0.18em"
                  fill="#71717a"
                >
                  {plate.note}
                </text>

                {/* The ring itself: an outer ellipse, an inner one, and a wall joining them so it
                    reads as a solid band with thickness rather than as a wire hoop. */}
                <g
                  fill="none"
                  stroke={plate.n === '03' ? color : '#e4e4e7'}
                  strokeOpacity={plate.n === '03' ? 0.95 : 0.62}
                  strokeWidth={plate.n === '03' ? 3 : 1.25}
                >
                  <ellipse cx="420" cy={plate.y} rx={rx} ry={ry} />
                  <ellipse cx="420" cy={plate.y + 13} rx={rx} ry={ry} strokeOpacity={0.3} />
                  <line x1={420 - rx} y1={plate.y} x2={420 - rx} y2={plate.y + 13} />
                  <line x1={420 + rx} y1={plate.y} x2={420 + rx} y2={plate.y + 13} />
                </g>

                {/* Groove marks, only on the tread plate and only when the compound has any. */}
                {plate.n === '01' && pattern && (
                  <g stroke="#e4e4e7" strokeOpacity="0.4" strokeWidth="1">
                    {Array.from({ length: pattern.grooves }, (_, i) => {
                      const t = (i / pattern.grooves) * Math.PI * 2;
                      const x = 420 + rx * Math.cos(t);
                      const y = plate.y + ry * Math.sin(t);
                      return <line key={i} x1={x} y1={y} x2={x} y2={y + 13} />;
                    })}
                  </g>
                )}

                {/* Spokes on the rim plate */}
                {plate.n === '04' && (
                  <g stroke="#e4e4e7" strokeOpacity="0.35" strokeWidth="1">
                    {Array.from({ length: 10 }, (_, i) => {
                      const t = (i / 10) * Math.PI * 2;
                      return (
                        <line
                          key={i}
                          x1="420"
                          y1={plate.y}
                          x2={420 + rx * Math.cos(t)}
                          y2={plate.y + ry * Math.sin(t)}
                        />
                      );
                    })}
                  </g>
                )}

                {/* Dimension arrow on the right, giving the plate a measured width. */}
                <g stroke="#ffffff" strokeOpacity="0.22" strokeWidth="1">
                  <line x1={420 + rx + 22} y1={plate.y - 6} x2={420 + rx + 22} y2={plate.y + 19} />
                  <line x1={420 + rx + 18} y1={plate.y - 6} x2={420 + rx + 26} y2={plate.y - 6} />
                  <line x1={420 + rx + 18} y1={plate.y + 19} x2={420 + rx + 26} y2={plate.y + 19} />
                </g>
                <text
                  x={420 + rx + 34}
                  y={plate.y + 10}
                  className="font-mono"
                  fontSize="8.5"
                  letterSpacing="0.16em"
                  fill="#71717a"
                >
                  R{plate.radius}
                </text>
              </motion.g>
            );
          })}
        </motion.g>

        {/* Title block, bottom right — the drawing's own cartouche. */}
        <g transform="translate(640 520)">
          <rect
            width="212"
            height="62"
            fill="none"
            stroke="#ffffff"
            strokeOpacity="0.18"
            strokeWidth="1"
          />
          <line x1="0" y1="22" x2="212" y2="22" stroke="#ffffff" strokeOpacity="0.18" />
          <line x1="140" y1="22" x2="140" y2="62" stroke="#ffffff" strokeOpacity="0.18" />
          <text
            x="8"
            y="15"
            className="font-mono"
            fontSize="9"
            letterSpacing="0.22em"
            fill="#d4d4d8"
          >
            TYRE LAB · PLATE 1/4
          </text>
          <text
            x="8"
            y="40"
            className="font-display"
            fontSize="22"
            fontWeight="900"
            fill={color}
            fillOpacity="0.95"
          >
            {compound.name.toUpperCase()}
          </text>
          <text
            x="8"
            y="55"
            className="font-mono"
            fontSize="8"
            letterSpacing="0.16em"
            fill="#71717a"
          >
            {compound.tread.toUpperCase()}
          </text>
          <text
            x="148"
            y="40"
            className="font-mono"
            fontSize="8"
            letterSpacing="0.16em"
            fill="#71717a"
          >
            GRIP {compound.grip}/5
          </text>
          <text
            x="148"
            y="54"
            className="font-mono"
            fontSize="8"
            letterSpacing="0.16em"
            fill="#71717a"
          >
            LIFE {compound.durability}/5
          </text>
        </g>
      </svg>

      <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between p-5 sm:p-8">
        <p className="font-mono text-[10px] uppercase tracking-[0.24em] text-zinc-400">
          EXPLODED VIEW <span className="text-zinc-600">·</span> 4 PLATES
        </p>
        <p className="font-mono text-[10px] uppercase tracking-[0.24em] text-zinc-400">
          {compound.category}
        </p>
      </div>
    </div>
  );
}

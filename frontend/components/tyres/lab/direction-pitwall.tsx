'use client';

import { useId } from 'react';
import { motion } from 'motion/react';

import { useReducedMotionSafe } from '@/hooks/use-reduced-motion-safe';

import type { DirectionProps } from './direction-spotlight';
import { TyrePhoto } from './tyre-photo';

/**
 * Direction E — "Pit wall": the product render at broadcast scale.
 *
 * Keeps the app's dark ground and takes one idea from the source page — red as *structure*, not
 * decoration — then pushes the tyre to a size the source never does: cropped by the frame, with
 * the compound name set large enough that the tyre occludes it.
 *
 * The SVG here is deliberately not a tyre. With a photoreal render in hand, drawing one underneath
 * would be two subjects competing; the vector layer instead becomes the *instrumentation* — rules,
 * ticks, a corner bracket and a measured baseline — which is the thing a photograph cannot supply.
 */
export function DirectionPitWall({ compound }: DirectionProps) {
  const uid = useId().replace(/:/g, '');
  const reduced = useReducedMotionSafe();

  return (
    <div className="relative isolate w-full overflow-hidden bg-base">
      {/* Compound light, thrown behind the tyre. The only place the compound hex is used at full
          strength — it is a glow, so it is decorative and needs no contrast lift. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute left-1/2 top-1/2 h-[34rem] w-[34rem] -translate-x-1/2 -translate-y-1/2 rounded-full opacity-25 blur-[120px]"
        style={{ backgroundColor: compound.color }}
      />

      {/* Structural rules. Two verticals and one baseline, in red, at grid positions — this is
          what makes the frame read as a pit-wall board rather than as a hero banner. */}
      <svg
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 h-full w-full"
        preserveAspectRatio="none"
        viewBox="0 0 100 100"
      >
        <line x1="8" y1="0" x2="8" y2="100" stroke="#E10600" strokeOpacity="0.35" strokeWidth="0.12" />
        <line x1="92" y1="0" x2="92" y2="100" stroke="#E10600" strokeOpacity="0.35" strokeWidth="0.12" />
        <line x1="0" y1="82" x2="100" y2="82" stroke="#E10600" strokeOpacity="0.3" strokeWidth="0.12" />
      </svg>

      <div className="relative px-6 py-10 sm:px-10 sm:py-14">
        <div className="flex items-start justify-between gap-4">
          <p className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.2em] text-f1-red">
            <span className="h-[3px] w-6 bg-f1-red" aria-hidden="true" />
            Compound
          </p>
          <p className="font-mono text-[10px] uppercase tracking-[0.24em] text-zinc-400">
            {compound.category}
          </p>
        </div>

        <div className="relative mt-6 flex items-center justify-center">
          {/* The name, behind the tyre. Clipped by the frame on both sides on purpose: type that
              runs out of the viewport is the cheapest way to imply the subject is bigger than the
              page can hold. */}
          <p
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-0 top-1/2 -translate-y-1/2 whitespace-nowrap text-center font-display text-[clamp(5rem,22vw,16rem)] font-black uppercase leading-none tracking-[-0.05em]"
            style={{ color: compound.color, opacity: 0.16 }}
          >
            {compound.name}
          </p>

          <motion.div
            key={compound.id}
            className="relative w-[min(78vw,30rem)]"
            initial={reduced ? false : { opacity: 0, scale: 0.94 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={reduced ? { duration: 0 } : { duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
          >
            <TyrePhoto compound={compound} sizes="(max-width: 768px) 78vw, 30rem" priority />

            {/* Measurement ticks around the render, in SVG so they scale with the box. */}
            <svg
              aria-hidden="true"
              viewBox="0 0 100 100"
              className="pointer-events-none absolute inset-0 h-full w-full text-f1-red"
            >
              {[0, 90, 180, 270].map((a) => (
                <line
                  key={a}
                  x1="50"
                  y1="1"
                  x2="50"
                  y2="6"
                  stroke="currentColor"
                  strokeOpacity="0.75"
                  strokeWidth="0.5"
                  transform={`rotate(${a} 50 50)`}
                />
              ))}
              <circle
                cx="50"
                cy="50"
                r="49"
                fill="none"
                stroke="currentColor"
                strokeOpacity="0.28"
                strokeWidth="0.25"
                strokeDasharray="1 3"
              />
            </svg>
          </motion.div>
        </div>

        {/* The measured baseline: three numbers on a rule, broadcast-style. */}
        <dl className="relative mt-8 grid grid-cols-3 border-t border-f1-red/30 pt-4">
          {(
            [
              ['Grip', compound.grip],
              ['Life', compound.durability],
              ['Warm-up', compound.warmUp],
            ] as const
          ).map(([label, value]) => (
            <div key={label} className="min-w-0">
              <dt className="text-[10px] uppercase tracking-[0.22em] text-zinc-400">{label}</dt>
              <dd className="mt-1 flex items-baseline gap-2">
                <span className="font-display text-3xl font-black leading-none text-ink">
                  {value}
                </span>
                <span className="text-[10px] text-zinc-400">/5</span>
                <span aria-hidden="true" className="ml-1 flex gap-[3px]">
                  {[1, 2, 3, 4, 5].map((n) => (
                    <span
                      key={n}
                      className="h-3 w-[3px]"
                      style={{
                        backgroundColor: n <= value ? compound.color : '#3f3f46',
                      }}
                    />
                  ))}
                </span>
              </dd>
            </div>
          ))}
        </dl>

        <p className="relative mt-5 max-w-[52ch] text-sm leading-relaxed text-zinc-300">
          {compound.tagline}
        </p>
      </div>

      {/* A corner bracket, bottom-right — the frame's only asymmetry, and what keeps the whole
          composition from centring itself into a poster. */}
      <svg
        aria-hidden="true"
        className="pointer-events-none absolute bottom-4 right-4 h-10 w-10 text-f1-red"
        viewBox="0 0 40 40"
        id={`bracket-${uid}`}
      >
        <path d="M40 22v18H22" fill="none" stroke="currentColor" strokeWidth="2" />
      </svg>
    </div>
  );
}

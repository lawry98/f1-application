'use client';

import { useId } from 'react';
import { motion } from 'motion/react';

import { useReducedMotionSafe } from '@/hooks/use-reduced-motion-safe';
import type { RaceCompound } from '@/data/tyres-data';

import { TyreBody } from './tyre-body';
import { TyreDefs, makeIdFor } from './tyre-defs';
import { CX, CY, R, polar, type ThermalState } from './tyre-geometry';

export interface DirectionProps {
  compound: RaceCompound;
  thermal?: ThermalState;
  wear?: number;
}

/**
 * Direction A — garage spotlight.
 *
 * One hard key light from upper-left, deep falloff, and a pool of compound-coloured light thrown
 * onto the floor beneath the tyre. The tyre is lit rather than diagrammed: the reading is
 * photographic, and the instrumentation (telemetry ring, crosshair, shoulder ticks) sits on top
 * as a thin technical layer rather than being the subject.
 *
 * The whole scene is one `<svg>` so the light pool can sit *behind* the tyre and the crosshair in
 * front of it, in one paint order, with no stacking-context juggling in the DOM.
 */
export function DirectionSpotlight({ compound, thermal = 'optimal', wear = 0.2 }: DirectionProps) {
  const uid = useId();
  const idFor = makeIdFor(uid);
  const reduced = useReducedMotionSafe();
  const { color } = compound;

  return (
    <div className="relative isolate w-full overflow-hidden bg-base">
      <svg
        viewBox="0 0 900 620"
        aria-hidden="true"
        className="h-auto w-full"
        preserveAspectRatio="xMidYMid meet"
      >
        <TyreDefs
          idFor={idFor}
          color={color}
          thermal={thermal}
          wet={compound.tread === 'slick' ? 0 : compound.tread === 'wet' ? 0.9 : 0.45}
          // A hint of heat, not a thermal camera. At full strength the optimal window's yellow
          // paints the whole tread gold and the tyre stops reading as rubber.
          heatScale={0.32}
        />
        <defs>
          {/* The key light itself — a soft cone falling from upper-left across the stage. */}
          <radialGradient id={idFor('key')} cx="26%" cy="8%" r="78%">
            <stop offset="0%" stopColor="#ffffff" stopOpacity="0.13" />
            <stop offset="45%" stopColor="#ffffff" stopOpacity="0.03" />
            <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
          </radialGradient>
          {/* Compound light spilling onto the floor. Elliptical because the floor is seen at a
              grazing angle — a circular pool reads as a disc lying on top of the image. */}
          <radialGradient id={idFor('pool')} cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor={color} stopOpacity="0.55" />
            <stop offset="45%" stopColor={color} stopOpacity="0.16" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </radialGradient>
          {/* Contact shadow: tight and dark directly under the tyre, dissolving fast. */}
          <radialGradient id={idFor('shadow')} cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#000000" stopOpacity="0.92" />
            <stop offset="55%" stopColor="#000000" stopOpacity="0.45" />
            <stop offset="100%" stopColor="#000000" stopOpacity="0" />
          </radialGradient>
          {/* Cinematic vignette, drawn as a ring rather than applied as a filter. */}
          <radialGradient id={idFor('vignette')} cx="50%" cy="46%" r="72%">
            <stop offset="55%" stopColor="#09090b" stopOpacity="0" />
            <stop offset="100%" stopColor="#09090b" stopOpacity="0.9" />
          </radialGradient>
          {/* The type behind the tyre is clipped to the stage so descenders never leave it. */}
          <clipPath id={idFor('stage')}>
            <rect x="0" y="0" width="900" height="620" />
          </clipPath>
        </defs>

        <g clipPath={`url(#${idFor('stage')})`}>
          <rect width="900" height="620" fill="#09090b" />
          <rect width="900" height="620" fill={`url(#${idFor('key')})`} />

          {/* Floor plane — a single horizon line plus a wash is enough to read as ground. */}
          <rect y="470" width="900" height="150" fill="#0b0b0e" />
          <line x1="0" y1="470" x2="900" y2="470" stroke={color} strokeOpacity="0.13" />

          {/* Light pool, under the tyre. */}
          <ellipse cx="450" cy="500" rx="330" ry="52" fill={`url(#${idFor('pool')})`} />

          {/* Compound name, passing BEHIND the tyre. This is the layer the whole direction turns
              on: type that the subject occludes reads as depth in a way no drop shadow does. */}
          <text
            x="450"
            y="330"
            textAnchor="middle"
            className="font-display"
            fontSize="248"
            fontWeight="900"
            letterSpacing="-0.04em"
            fill={color}
            fillOpacity="0.16"
          >
            {compound.name.toUpperCase()}
          </text>

          <ellipse cx="450" cy="497" rx="150" ry="26" fill={`url(#${idFor('shadow')})`} />

          {/* The tyre. 400-unit user space is mapped onto a 340px circle centred at 450,300. */}
          <g transform="translate(450 300) scale(0.87) translate(-200 -200)">
            <motion.g
              style={{ transformOrigin: `${CX}px ${CY}px` }}
              animate={reduced ? undefined : { rotate: 360 }}
              transition={
                reduced ? undefined : { duration: 64, ease: 'linear', repeat: Infinity }
              }
            >
              <TyreBody
                idFor={idFor}
                color={color}
                tread={compound.tread}
                wear={wear}
                thermal={thermal}
                wet={compound.tread === 'slick' ? 0 : compound.tread === 'wet' ? 0.9 : 0.45}
              />
            </motion.g>

            {/* Telemetry ring — outside the rubber, counter-rotating so the two reads separate. */}
            <motion.g
              style={{ transformOrigin: `${CX}px ${CY}px` }}
              animate={reduced ? undefined : { rotate: -360 }}
              transition={
                reduced ? undefined : { duration: 46, ease: 'linear', repeat: Infinity }
              }
            >
              <circle
                cx={CX}
                cy={CY}
                r={216}
                fill="none"
                stroke={color}
                strokeOpacity="0.5"
                strokeWidth="1"
                strokeDasharray="2 10"
              />
              <circle
                cx={CX}
                cy={CY}
                r={226}
                fill="none"
                stroke={color}
                strokeOpacity="0.75"
                strokeWidth="2"
                strokeDasharray="64 260"
                strokeLinecap="round"
              />
            </motion.g>

            {/* Fixed shoulder ticks and their crosshair — the instrumentation that does not spin,
                so the spinning parts have something to be measured against. */}
            <g stroke={color} strokeOpacity="0.8">
              {[0, 90, 180, 270].map((a) => {
                const outer = polar(a, 240);
                const inner = polar(a, 226);
                return (
                  <line key={a} x1={inner.x} y1={inner.y} x2={outer.x} y2={outer.y} strokeWidth="2" />
                );
              })}
            </g>
            <g stroke={color} strokeOpacity="0.35" strokeWidth="1">
              <line x1={CX - 262} y1={CY} x2={CX - 236} y2={CY} />
              <line x1={CX + 236} y1={CY} x2={CX + 262} y2={CY} />
            </g>

            {/* One measurement callout, pointing at the compound band. */}
            <g>
              <line
                x1={polar(52, R.band).x}
                y1={polar(52, R.band).y}
                x2={polar(52, 268).x}
                y2={polar(52, 268).y}
                stroke={color}
                strokeOpacity="0.6"
                strokeWidth="1"
              />
              <circle cx={polar(52, R.band).x} cy={polar(52, R.band).y} r="3" fill={color} />
              <line
                x1={polar(52, 268).x}
                y1={polar(52, 268).y}
                x2={polar(52, 268).x + 46}
                y2={polar(52, 268).y}
                stroke={color}
                strokeOpacity="0.6"
                strokeWidth="1"
              />
            </g>
          </g>

          <rect width="900" height="620" fill={`url(#${idFor('vignette')})`} />
        </g>
      </svg>

      {/* Text lives in the DOM, not in the SVG: it has to be selectable, translatable and part of
          the reading order. Positioned over the stage rather than inside it. */}
      <div className="pointer-events-none absolute inset-0 flex flex-col justify-between p-5 sm:p-8">
        <div className="flex items-start justify-between gap-4">
          <p className="font-mono text-[10px] uppercase tracking-[0.24em] text-zinc-400">
            02 <span className="text-zinc-600">/</span> Compound
          </p>
          <p
            className="font-mono text-[10px] uppercase tracking-[0.24em]"
            style={{ color: 'rgb(212 212 216)' }}
          >
            {compound.category}
          </p>
        </div>
        <div className="flex items-end justify-between gap-6">
          <p className="max-w-[22ch] text-sm leading-snug text-zinc-300 sm:text-base">
            {compound.tagline}
          </p>
          <p className="shrink-0 font-mono text-[10px] uppercase tracking-[0.24em] text-zinc-400">
            Grip {compound.grip}/5 · Life {compound.durability}/5
          </p>
        </div>
      </div>
    </div>
  );
}

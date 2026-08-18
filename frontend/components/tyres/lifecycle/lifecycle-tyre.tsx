'use client';

import Image from 'next/image';
import { useEffect, useRef } from 'react';
import { motion, useAnimate, useTransform, type MotionValue } from 'motion/react';

import { cn } from '@/lib/utils';

import type { ThermalState } from './lifecycle-data';
import {
  EASE_OUT_EXPO,
  LIFECYCLE_TIMING,
  SETTLE_KEYFRAMES,
  THERMAL_TINT,
  WEAR_OPACITY,
} from './lifecycle-motion';

/**
 * The Pirelli photograph, aged by scroll.
 *
 * The render itself is the permanent base and the section's only accessible image — every wear,
 * heat and light effect is a decorative layer composited over it, never a redraw of the tyre. The
 * layers are masked to the rubber so the glossy rim and, as far as the geometry allows, the red
 * `PIRELLI` / `P ZERO` wordmarks are spared: the sidewall only ever *dulls*, it is never painted
 * over or distorted.
 *
 * The photograph is a dead-on, perfectly circular view, so the whole rig can rotate as one rigid
 * object and read as a wheel rolling — the layers that carry angular detail (grain, marbles) live
 * inside the rotating rig so they turn with the rubber; the light (sheen, heat glow, settle pulse)
 * stays fixed in the scene outside it.
 *
 * Everything driven by scroll is a `MotionValue`: the parent hands in continuous `wear` and
 * `rotation`, and each layer's opacity is a `useTransform` of `wear`. No effect re-creates DOM and
 * nothing here re-renders on scroll.
 */

/** Confine an effect to the rubber annulus, sparing the central rim and the transparent corners. */
const RUBBER_MASK =
  'radial-gradient(circle closest-side at 50% 50%, rgba(0,0,0,0) 0 61%, rgba(0,0,0,1) 68%, rgba(0,0,0,1) 97%, rgba(0,0,0,0) 100%)';
/** Weight an effect toward the tread shoulder — the outer edge of a dead-on tyre. */
const SHOULDER_MASK =
  'radial-gradient(circle closest-side at 50% 50%, rgba(0,0,0,0) 0 80%, rgba(0,0,0,1) 90%, rgba(0,0,0,1) 98%, rgba(0,0,0,0) 100%)';
/** Heat builds at the shoulder and spreads inward. */
const HEAT_MASK =
  'radial-gradient(circle closest-side at 50% 50%, rgba(0,0,0,0) 0 56%, rgba(0,0,0,0.6) 78%, rgba(0,0,0,1) 92%, rgba(0,0,0,0) 100%)';

/** A fine fractal-noise grain, as a static data-URI — only its opacity ever moves. */
const GRAIN_URI =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='150' height='150'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")";

/** Picked-up rubber near the shoulder, appearing only once the tyre is genuinely worn. */
const MARBLES = [
  '88% 61%',
  '71% 89%',
  '30% 87%',
  '12% 57%',
  '27% 19%',
  '64% 12%',
  '84% 34%',
]
  .map((pos) => `radial-gradient(circle 5px at ${pos}, rgba(32,25,23,0.85), rgba(32,25,23,0) 70%)`)
  .join(',');

const maskStyle = (image: string) => ({
  maskImage: image,
  WebkitMaskImage: image,
  maskRepeat: 'no-repeat',
  WebkitMaskRepeat: 'no-repeat',
  maskSize: '100% 100%',
  WebkitMaskSize: '100% 100%',
});

export interface LifecycleTyreProps {
  /** Continuous wear, `0..1`. Reduced motion hands in a discrete value; the layers do not care. */
  wear: MotionValue<number>;
  /** Rotation in degrees. `0` (a static `MotionValue`) under reduced motion. */
  rotation: MotionValue<number>;
  activeIndex: number;
  thermal: ThermalState;
  /** Full alt text for the base photograph — includes the active stage, so it reads on its own. */
  altText: string;
  reduced: boolean;
  className?: string;
  sizes?: string;
}

export function LifecycleTyre({
  wear,
  rotation,
  activeIndex,
  thermal,
  altText,
  reduced,
  className,
  sizes = '(max-width: 640px) 45vw, (max-width: 1024px) 32vw, 22rem',
}: LifecycleTyreProps) {
  const haze = useTransform(wear, WEAR_OPACITY.haze.input, WEAR_OPACITY.haze.output);
  const scuff = useTransform(wear, WEAR_OPACITY.scuff.input, WEAR_OPACITY.scuff.output);
  const sheen = useTransform(wear, WEAR_OPACITY.sheen.input, WEAR_OPACITY.sheen.output);
  const shoulder = useTransform(wear, WEAR_OPACITY.shoulder.input, WEAR_OPACITY.shoulder.output);
  const marble = useTransform(wear, WEAR_OPACITY.marble.input, WEAR_OPACITY.marble.output);

  // Scale settle on each stage change — skipped on the first commit and under reduced motion.
  const [scope, animate] = useAnimate();
  const settled = useRef(false);
  useEffect(() => {
    if (!settled.current) {
      settled.current = true;
      return;
    }
    if (reduced || !scope.current) return;
    animate(scope.current, { scale: SETTLE_KEYFRAMES }, {
      duration: LIFECYCLE_TIMING.settle,
      ease: EASE_OUT_EXPO,
    });
  }, [activeIndex, reduced, animate, scope]);

  const tint = THERMAL_TINT[thermal];

  return (
    <div className={cn('relative aspect-square select-none', className)}>
      <div ref={scope} className="absolute inset-0">
        {/* The rolling rig — photograph plus the wear that lives on the rubber. */}
        <motion.div className="absolute inset-0" style={{ rotate: rotation }}>
          <Image
            src="/tyres/soft.webp"
            alt={altText}
            fill
            sizes={sizes}
            draggable={false}
            className="object-contain"
          />

          {/* Aged rubber: a dusty grey wash that lifts the black as it wears. */}
          <motion.div
            aria-hidden="true"
            className="absolute inset-0"
            style={{
              opacity: haze,
              backgroundColor: '#3a3632',
              mixBlendMode: 'screen',
              ...maskStyle(RUBBER_MASK),
            }}
          />

          {/* Fine abrasion grain across the rubber. */}
          <motion.div
            aria-hidden="true"
            className="absolute inset-0"
            style={{
              opacity: scuff,
              backgroundImage: GRAIN_URI,
              backgroundSize: '150px 150px',
              mixBlendMode: 'overlay',
              ...maskStyle(RUBBER_MASK),
            }}
          />

          {/* Circumferential scuffing, concentrated at the tread shoulder. */}
          <motion.div
            aria-hidden="true"
            className="absolute inset-0"
            style={{
              opacity: scuff,
              backgroundImage:
                'repeating-radial-gradient(circle at 50% 50%, rgba(255,255,255,0) 0 2px, rgba(255,255,255,0.06) 2px 3px, rgba(0,0,0,0.05) 3px 4px)',
              mixBlendMode: 'overlay',
              ...maskStyle(SHOULDER_MASK),
            }}
          />

          {/* The shoulder rounding and darkening off with wear. */}
          <motion.div
            aria-hidden="true"
            className="absolute inset-0"
            style={{
              opacity: shoulder,
              backgroundColor: 'rgba(0,0,0,1)',
              mixBlendMode: 'multiply',
              ...maskStyle(SHOULDER_MASK),
            }}
          />

          {/* Marbling — picked-up rubber at high wear only. */}
          <motion.div
            aria-hidden="true"
            className="absolute inset-0"
            style={{
              opacity: marble,
              backgroundImage: MARBLES,
              mixBlendMode: 'multiply',
              ...maskStyle(SHOULDER_MASK),
            }}
          />
        </motion.div>

        {/* Fixed light: the fresh gloss, fading as the tyre ages. */}
        <motion.div
          aria-hidden="true"
          className="absolute inset-0"
          style={{
            opacity: sheen,
            backgroundImage:
              'radial-gradient(120% 95% at 33% 24%, rgba(255,255,255,0.55) 0%, rgba(255,255,255,0) 44%)',
            mixBlendMode: 'screen',
            ...maskStyle(RUBBER_MASK),
          }}
        />

        {/* The heat treatment — discrete per stage, so it animates on the active change. */}
        <motion.div
          aria-hidden="true"
          className="absolute inset-0"
          initial={false}
          animate={{ backgroundColor: tint.color, opacity: tint.opacity }}
          transition={
            reduced
              ? { duration: LIFECYCLE_TIMING.reduced }
              : { duration: 0.6, ease: EASE_OUT_EXPO }
          }
          style={{ mixBlendMode: 'screen', ...maskStyle(HEAT_MASK) }}
        />

        {/* The restrained light pulse when a stage settles. Replays by remounting on the index. */}
        {!reduced && (
          <motion.div
            key={activeIndex}
            aria-hidden="true"
            className="absolute inset-0"
            initial={{ opacity: 0.5, scale: 0.82 }}
            animate={{ opacity: 0, scale: 1.14 }}
            transition={{ duration: LIFECYCLE_TIMING.pulse, ease: EASE_OUT_EXPO }}
            style={{
              backgroundImage:
                'radial-gradient(circle closest-side at 50% 50%, rgba(255,255,255,0.5) 0%, rgba(232,56,47,0.28) 46%, rgba(232,56,47,0) 72%)',
              mixBlendMode: 'screen',
            }}
          />
        )}
      </div>
    </div>
  );
}

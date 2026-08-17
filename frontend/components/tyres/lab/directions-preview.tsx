'use client';

import { useState } from 'react';

import { RACE_COMPOUNDS } from '@/data/tyres-data';
import { focusRing, focusRingOffsetBase } from '@/lib/focus';
import { compoundTextOnTab } from '@/lib/tyre-utils';
import { cn } from '@/lib/utils';

import { DirectionBlueprint } from './direction-blueprint';
import { DirectionSpotlight } from './direction-spotlight';
import { DirectionThermal } from './direction-thermal';
import type { ThermalState } from './tyre-geometry';

const DIRECTIONS = [
  {
    id: 'spotlight',
    label: 'A · Garage spotlight',
    blurb:
      'Photographic. One hard key light, deep falloff, compound-coloured light pooling on the floor. Instrumentation is a thin layer on top of a lit object.',
    Component: DirectionSpotlight,
  },
  {
    id: 'thermal',
    label: 'B · Thermal telemetry',
    blurb:
      'Scientific. Measurement grid, isotherm field, a temperature scale that is genuinely the image’s own ramp. The tyre is a specimen being scanned.',
    Component: DirectionThermal,
  },
  {
    id: 'blueprint',
    label: 'C · Swiss blueprint',
    blurb:
      'Editorial. The tyre taken apart along its axis into four numbered plates with leader lines, dimensions and a title block. Type does most of the work.',
    Component: DirectionBlueprint,
  },
] as const;

const THERMALS: readonly ThermalState[] = ['cold', 'optimal', 'hot'];

/**
 * A throwaway comparison surface for choosing the art direction.
 *
 * Deliberately *not* the real page: it renders all three directions at once with a shared
 * compound and thermal control, so the choice is made on the same subject in the same light
 * rather than on three separately-tuned demos. Once a direction is picked this whole route goes
 * away and only its `lab/` engine survives.
 */
export function DirectionsPreview() {
  const [compoundIndex, setCompoundIndex] = useState(2);
  const [thermal, setThermal] = useState<ThermalState>('optimal');
  const [wear, setWear] = useState(0.2);

  // `noUncheckedIndexedAccess` is on, and the fallback is cheaper than a non-null assertion:
  // `compoundIndex` only ever comes from a button bound to this same array.
  const compound = RACE_COMPOUNDS[compoundIndex] ?? RACE_COMPOUNDS[0];
  if (!compound) return null;

  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <header className="mb-8">
        <p className="flex items-center gap-2 text-[11px] uppercase tracking-[0.2em] text-zinc-400">
          <span className="h-1.5 w-5 bg-f1-red" aria-hidden="true" />
          Direction preview
        </p>
        <h1 className="mt-3 font-display text-[clamp(2rem,6vw,3.75rem)] font-black uppercase leading-[0.9] tracking-[-0.03em] text-ink">
          Pick a direction
        </h1>
        <p className="mt-3 max-w-[62ch] text-sm leading-relaxed text-zinc-300">
          All three share one SVG engine — the same geometry, defs, wear model and heat map. Only
          the lighting, texture and instrumentation language differ. Change the compound and the
          surface temperature to see how each direction responds.
        </p>
      </header>

      {/* Controls. Real buttons with visible selected state carried by more than colour. */}
      <div className="mb-10 flex flex-col gap-5 border-y border-white/10 py-5">
        <fieldset>
          <legend className="mb-2 text-[10px] uppercase tracking-[0.22em] text-zinc-400">
            Compound
          </legend>
          <div className="flex flex-wrap gap-2">
            {RACE_COMPOUNDS.map((c, i) => {
              const selected = i === compoundIndex;
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setCompoundIndex(i)}
                  aria-pressed={selected}
                  className={cn(
                    'inline-flex items-center gap-2 rounded-md border px-3 py-2 text-xs font-semibold transition-colors',
                    focusRingOffsetBase,
                    selected
                      ? 'border-white/25 bg-zinc-800/80'
                      : 'border-white/10 text-zinc-400 hover:border-white/20 hover:text-zinc-200',
                  )}
                  style={selected ? { color: compoundTextOnTab(c.color) } : undefined}
                >
                  <span
                    aria-hidden="true"
                    className="h-2.5 w-2.5 rounded-full"
                    style={{ backgroundColor: c.color }}
                  />
                  {c.name}
                  {selected && <span className="sr-only">(selected)</span>}
                </button>
              );
            })}
          </div>
        </fieldset>

        <div className="flex flex-wrap items-end gap-8">
          <fieldset>
            <legend className="mb-2 text-[10px] uppercase tracking-[0.22em] text-zinc-400">
              Surface temperature
            </legend>
            <div className="flex gap-2">
              {THERMALS.map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setThermal(t)}
                  aria-pressed={t === thermal}
                  className={cn(
                    'rounded-md border px-3 py-2 text-xs font-semibold capitalize transition-colors',
                    focusRingOffsetBase,
                    t === thermal
                      ? 'border-white/25 bg-zinc-800/80 text-ink'
                      : 'border-white/10 text-zinc-400 hover:border-white/20 hover:text-zinc-200',
                  )}
                >
                  {t}
                </button>
              ))}
            </div>
          </fieldset>

          <div>
            <label
              htmlFor="wear"
              className="mb-2 block text-[10px] uppercase tracking-[0.22em] text-zinc-400"
            >
              Wear · {Math.round(wear * 100)}%
            </label>
            <input
              id="wear"
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={wear}
              onChange={(e) => setWear(Number(e.target.value))}
              className={cn('w-56 accent-f1-red', focusRing)}
            />
          </div>
        </div>
      </div>

      <div className="space-y-14">
        {DIRECTIONS.map(({ id, label, blurb, Component }) => (
          <section key={id} aria-labelledby={`dir-${id}`}>
            <div className="mb-4 flex flex-wrap items-baseline justify-between gap-3">
              <h2
                id={`dir-${id}`}
                className="font-display text-xl font-black uppercase tracking-tight text-ink"
              >
                {label}
              </h2>
            </div>
            <p className="mb-4 max-w-[70ch] text-sm leading-relaxed text-zinc-400">{blurb}</p>
            <div className="overflow-hidden rounded-xl border border-white/10">
              <Component compound={compound} thermal={thermal} wear={wear} />
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}

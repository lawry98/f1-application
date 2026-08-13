import { describe, expect, it } from 'vitest';
import {
  loadCircuit,
  loadCircuitByLocation,
  locationSlug,
  resolveCircuitId,
} from '@/lib/circuit-geometry';

describe('locationSlug', () => {
  /*
   * These are the cases that make the slug rule non-trivial, and each one is a real 2026-calendar
   * location. The rule has to match `slug()` in `scripts/fetch-circuit-geometry.mjs` exactly,
   * because that script generated the keys in `index.json` — if the two drift, lookups return
   * null and a null silently hides the circuit visual with no error anywhere to trace.
   */
  it.each([
    ['Monza', 'monza'],
    ['Montréal', 'montreal'],
    ['São Paulo', 'sao-paulo'],
    ['Spa-Francorchamps', 'spa-francorchamps'],
    ['Las Vegas', 'las-vegas'],
    ['Monte-Carlo', 'monte-carlo'],
  ])('slugs %s to %s', (location, expected) => {
    expect(locationSlug(location)).toBe(expected);
  });

  it('collapses runs of separators and trims the ends', () => {
    expect(locationSlug('  Marina  Bay  ')).toBe('marina-bay');
  });
});

describe('resolveCircuitId', () => {
  it('resolves a location the source names the same way', () => {
    expect(resolveCircuitId('Monza')).toBe('it-1922');
  });

  /*
   * The five aliases live inside `index.json`, written there by the converter as a second key
   * pointing at the same id — not in a table in the loader. FastF1 says "Monte-Carlo" and the
   * geometry source says "Monaco"; both must land on the same circuit. This asserts the aliasing
   * survives whatever regenerates the data, which is the thing a second table here would hide.
   */
  it.each([
    ['Monte-Carlo', 'Monaco'],
    ['Bahrain', 'Sakhir'],
    ['Marina Bay', 'Singapore'],
    ['Miami Gardens', 'Miami'],
  ])('resolves the FastF1 name %s to the same circuit as %s', (fastf1Name, sourceName) => {
    const viaAlias = resolveCircuitId(fastf1Name);
    expect(viaAlias).not.toBeNull();
    expect(viaAlias).toBe(resolveCircuitId(sourceName));
  });

  it('returns null for a location the set does not carry', () => {
    expect(resolveCircuitId('Nürburgring Nordschleife Bridge')).toBeNull();
  });
});

describe('loadCircuit', () => {
  it('loads a circuit with geometry and the facts the header band shows', async () => {
    const monza = await loadCircuit('it-1922');

    expect(monza).not.toBeNull();
    expect(monza?.name).toBe('Autodromo Nazionale Monza');
    // Phase 6's band shows real track facts, so these two fields have to survive the round trip.
    expect(monza?.lengthM).toBe(5793);
    expect(monza?.firstGp).toBe(1950);
  });

  /*
   * The outline is what `CircuitGlow` strokes, and two properties of it are load-bearing:
   * it is dense enough that Catmull-Rom smoothing interpolates rather than invents shape, and it
   * is normalised into a 0–1 box so the component can pick its own user space.
   */
  it('returns a dense outline normalised into a 0-1 box', async () => {
    const monza = await loadCircuit('it-1922');
    const points = monza?.points ?? [];

    expect(points.length).toBeGreaterThan(60);
    expect(points.length).toBeLessThanOrEqual(240);
    for (const [x, y] of points) {
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThanOrEqual(1);
      expect(y).toBeGreaterThanOrEqual(0);
      expect(y).toBeLessThanOrEqual(1);
    }
  });

  /*
   * A miss hides the visual entirely, per the spec — so an unknown id is a null, not a throw.
   * Throwing here would take down a whole briefing page for a decorative track map.
   */
  it('returns null for an unknown id instead of throwing', async () => {
    await expect(loadCircuit('xx-0000')).resolves.toBeNull();
  });
});

describe('loadCircuitByLocation', () => {
  it('goes from a race location straight to its geometry', async () => {
    const monaco = await loadCircuitByLocation('Monte-Carlo');

    expect(monaco?.id).toBe('mc-1929');
    expect(monaco?.points.length).toBeGreaterThan(0);
  });

  it('returns null for an unknown location', async () => {
    await expect(loadCircuitByLocation('Nowhere')).resolves.toBeNull();
  });
});

/**
 * Reading the vendored circuit outlines.
 *
 * `data/circuits/` holds 40 circuits as normalised 0–1 outlines plus an `index.json` mapping a
 * slugged location to a circuit id. `CircuitGlow` is a pure function of its `points` prop, so
 * this module is the only thing that knows where the geometry lives.
 *
 * **The join key is `location`, not `circuit_id`.** The backend derives `circuit_id` from the
 * *event* name (`race_resolver.py:151` → `italian_grand_prix`), which names a Grand Prix rather
 * than a track, while `RaceInfo.location` (`Monza`) matches the source data's own `Location`
 * field. Keying on `circuit_id` would miss every event whose name and circuit differ, which is
 * most of them.
 *
 * **The lookup is synchronous and the geometry is not.** `index.json` is about a kilobyte, so
 * resolving a location costs nothing and can happen in render. The 40 outlines are ~168 kB
 * together, and a static import of all of them would put every circuit in the bundle to draw
 * one — so `loadCircuit` reaches for a single file through a dynamic import and the bundler
 * splits each circuit into its own chunk. Callers that already know their circuit at build time
 * (the `/candy` styleguide, the landing hero) can import the JSON directly instead and skip this
 * entirely — `toPoints` below is the one piece of this module they still need, so that the static
 * path and the dynamic path agree on the JSON↔`Point` boundary rather than each re-deriving it.
 */

import type { Point } from '@/lib/svg-path';
import index from '@/data/circuits/index.json';

/** One circuit, exactly as the converter writes it. */
export interface CircuitGeometry {
  /** The source's own id, e.g. `it-1922`. */
  id: string;
  name: string;
  location: string;
  /** Track length in metres. */
  lengthM: number;
  /** Year of this circuit's first Grand Prix. */
  firstGp: number;
  /**
   * The outline in a normalised 0–1 box with the circuit's aspect ratio preserved, downsampled
   * to at most 240 points. Densely sampled off a surveyed centre line, which is why
   * `catmullRomPath` is the right thing to draw it with.
   */
  points: Point[];
}

const LOCATION_TO_ID: Record<string, string> = index;

/**
 * Narrow a statically imported circuit's `points` to `Point[]`.
 *
 * TypeScript widens a JSON array of pairs to `number[][]`, and `Point` is a fixed-length readonly
 * pair, so `as Point[]` is not a legal assertion between them (TS2352) — the conversion has to be
 * a real `map`. The `= 0` defaults are what make it typecheck under `noUncheckedIndexedAccess`,
 * which types destructuring an array element as `number | undefined`. They are unreachable for
 * this data — the converter writes pairs — but a default cannot lie about a missing value the way
 * a non-null assertion can.
 *
 * `loadCircuit` needs none of this because `CircuitGeometry` already declares `points: Point[]`
 * and the dynamic import is cast to it wholesale. This exists for the static-import callers named
 * in the module docstring; before it did, the same seven-line helper sat in two view components
 * and Phase 6 was about to make it five.
 */
export function toPoints(raw: number[][]): Point[] {
  return raw.map(([x = 0, y = 0]): Point => [x, y]);
}

/**
 * Lowercase, strip accents, collapse everything else to single hyphens.
 *
 * **This must stay identical to `slug()` in `scripts/fetch-circuit-geometry.mjs`**, which is what
 * generated the keys in `index.json`. If the two drift, every lookup that depends on the
 * difference silently returns null — and a miss hides the visual with no error, so nothing would
 * point at this function. `tests/circuit-geometry.test.ts` pins the cases that differ by accent
 * and by separator for that reason.
 */
export function locationSlug(location: string): string {
  return location
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

/**
 * The circuit id for a race location, or `null` if the set does not carry it.
 *
 * The five places the two data sources name differently (Bahrain/Sakhir, Monte-Carlo/Monaco,
 * Marina Bay/Singapore, Miami Gardens/Miami, Kuala Lumpur/Sepang) are already aliased **inside**
 * `index.json` by the converter, which writes both keys pointing at the same id. So there is no
 * alias table here, and adding one would be a second place to keep in step.
 */
export function resolveCircuitId(location: string): string | null {
  return LOCATION_TO_ID[locationSlug(location)] ?? null;
}

/**
 * Load one circuit's geometry by id.
 *
 * The path is a template literal on purpose: a bundler turns that into a lazy context over
 * `data/circuits/*.json` and emits one chunk per circuit, so a page drawing Monza downloads
 * Monza. Written as a static import of an index of all 40, it would ship all of them.
 *
 * Returns `null` for an unknown id rather than throwing. Per the spec, **a miss hides the visual
 * entirely** — no placeholder, no error — because a briefing missing its decorative track map is
 * still a complete briefing.
 */
export async function loadCircuit(id: string): Promise<CircuitGeometry | null> {
  try {
    // Not named `module`: `@next/next/no-assign-module-variable` fails the lint on that binding,
    // because assigning it shadows the CommonJS `module` and breaks Next's bundling in ways that
    // surface far from here.
    const loaded = await import(`../data/circuits/${id}.json`);
    return (loaded.default ?? loaded) as CircuitGeometry;
  } catch {
    return null;
  }
}

/** `resolveCircuitId` then `loadCircuit`, for the common case of holding only a location. */
export async function loadCircuitByLocation(location: string): Promise<CircuitGeometry | null> {
  const id = resolveCircuitId(location);
  return id ? loadCircuit(id) : null;
}

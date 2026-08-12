#!/usr/bin/env node
/**
 * One-shot converter for circuit outlines, from bacinger/f1-circuits GeoJSON.
 *
 * Not part of the build — the committed files under data/circuits/ are the source of truth.
 * Re-run only to refresh the data or pick up a new circuit (Madrid arrived for 2026 this way).
 *
 *     node scripts/fetch-circuit-geometry.mjs
 *
 * Source: https://github.com/bacinger/f1-circuits (MIT). Attribution is obliged and lives in
 * data/circuits/CREDITS.md; adding a circuit here does not change that file, but replacing the
 * source does.
 *
 * Why this source and not FastF1 or OpenF1
 * ----------------------------------------
 * FastF1's telemetry cannot be reached from this project's environment at all — `session.load()`
 * reports car data, position data and session info unavailable against both the primary source
 * and the livetiming mirror. OpenF1's `/location` endpoint does work and would give a real
 * racing line, but a racing line is a *car's path*: it is noisy, it clips kerbs, and it only
 * exists for 2023 onward. These are surveyed centre lines, they cover 40 circuits including
 * historical ones, and they need no network at render time.
 *
 * The two traps this script exists to handle
 * ------------------------------------------
 *  1. **Longitude is not a distance.** The coordinates are WGS84 lon/lat. One degree of
 *     longitude is `cos(latitude)` as long as one degree of latitude, so normalising the two
 *     axes as if they were interchangeable squashes every circuit horizontally — Monza at
 *     45.6°N comes out about 70% of its true width. Longitude is scaled by `cos(mean latitude)`
 *     before anything else happens.
 *  2. **Latitude increases northward, SVG y increases downward.** Without flipping y every
 *     circuit renders mirrored, which is subtle enough to survive a glance and wrong enough to
 *     be embarrassing.
 *
 * Normalisation preserves aspect ratio: the longer axis spans the full 0..1 and the shorter one
 * is centred within it. Scaling each axis to fill independently would stretch Monza's straights
 * and lose the outline that makes it recognisable.
 */

import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SOURCE = 'https://raw.githubusercontent.com/bacinger/f1-circuits/master/f1-circuits.geojson';

const OUT_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'data', 'circuits');

/**
 * Enough to keep every corner of a street circuit, few enough that one file stays a few kB.
 * The outlines are only ever drawn a few hundred pixels wide.
 */
const MAX_POINTS = 240;

/**
 * FastF1 `Location` values that do not match a bacinger `Location`.
 *
 * Everything else in the 2026 calendar matches once both sides are slugged, including the ones
 * that only differ by an accent or a hyphen (Montréal/Montreal, São Paulo/Sao Paulo,
 * Spa-Francorchamps/Spa Francorchamps). These five are genuinely different names for the same
 * place, so no amount of string normalising will join them.
 *
 * Keys are slugged FastF1 locations; values are slugged bacinger locations.
 */
const LOCATION_ALIASES = {
  bahrain: 'sakhir',
  'miami-gardens': 'miami',
  'monte-carlo': 'monaco',
  'kuala-lumpur': 'sepang',
  'marina-bay': 'singapore',
};

/** Lowercase, strip accents, collapse anything else to single hyphens. */
function slug(value) {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

/** Every nth point, keeping the first. GeoJSON vertices are dense and fairly even. */
function downsample(values, limit) {
  if (values.length <= limit) return values;
  const step = values.length / limit;
  return Array.from({ length: limit }, (_, i) => values[Math.floor(i * step)]);
}

/**
 * lon/lat degrees to a normalised 0..1 box, aspect ratio intact and y flipped for SVG.
 * See the two traps in the file header — both are handled here and nowhere else.
 */
function project(coordinates) {
  const meanLat = coordinates.reduce((sum, [, lat]) => sum + lat, 0) / coordinates.length;
  const lonScale = Math.cos((meanLat * Math.PI) / 180);

  const planar = coordinates.map(([lon, lat]) => [lon * lonScale, -lat]);

  const xs = planar.map(([x]) => x);
  const ys = planar.map(([, y]) => y);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  const span = Math.max(Math.max(...xs) - minX, Math.max(...ys) - minY) || 1;

  // Centre the shorter axis rather than stretching it to fill.
  const padX = (span - (Math.max(...xs) - minX)) / 2;
  const padY = (span - (Math.max(...ys) - minY)) / 2;

  return planar.map(([x, y]) => [
    Number(((x - minX + padX) / span).toFixed(4)),
    Number(((y - minY + padY) / span).toFixed(4)),
  ]);
}

/**
 * A circuit's outline can be a single LineString or a MultiLineString. Take the longest ring:
 * the extra rings are pit lanes and layout variants, and the racing loop is the long one.
 */
function longestRing(geometry) {
  if (geometry.type === 'LineString') return geometry.coordinates;
  if (geometry.type === 'MultiLineString') {
    return geometry.coordinates.reduce((best, ring) => (ring.length > best.length ? ring : best));
  }
  throw new Error(`unsupported geometry ${geometry.type}`);
}

async function main() {
  const response = await fetch(SOURCE);
  if (!response.ok) throw new Error(`${SOURCE} -> HTTP ${response.status}`);
  const collection = await response.json();

  await mkdir(OUT_DIR, { recursive: true });

  /** slugged bacinger location -> circuit id, plus the FastF1 aliases pointing at the same ids. */
  const index = {};
  let written = 0;

  for (const feature of collection.features) {
    const { id, Name: name, Location: location, length, firstgp } = feature.properties;

    const points = downsample(project(longestRing(feature.geometry)), MAX_POINTS);

    await writeFile(
      join(OUT_DIR, `${id}.json`),
      `${JSON.stringify({ id, name, location, lengthM: length ?? null, firstGp: firstgp ?? null, points })}\n`,
    );

    index[slug(location)] = id;
    written++;
  }

  for (const [from, to] of Object.entries(LOCATION_ALIASES)) {
    if (!index[to]) throw new Error(`alias ${from} -> ${to} has no circuit; source names changed`);
    index[from] = index[to];
  }

  await writeFile(
    join(OUT_DIR, 'index.json'),
    `${JSON.stringify(Object.fromEntries(Object.entries(index).sort()), null, 2)}\n`,
  );

  console.log(`wrote ${written} circuits and ${Object.keys(index).length} location keys`);
}

await main();

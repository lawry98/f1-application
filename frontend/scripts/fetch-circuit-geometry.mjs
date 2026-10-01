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
 *
 * Each file also carries `centroid` — WGS84 degrees, the unprojected mean of the same ring — for
 * the backend's weather forecast, which asks OpenWeather for coordinates rather than geocoding a
 * place name. It is the only field not derived through `project`, so adding it moved no outline.
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
 * Everything else matches once both sides are slugged, including the ones that only differ by an
 * accent or a hyphen (Montréal/Montreal, São Paulo/Sao Paulo, Spa-Francorchamps/Spa
 * Francorchamps). These are genuinely different names for the same place, so no amount of string
 * normalising will join them.
 *
 * The first five come from the 2026 calendar. The rest are how FastF1 spells the same circuits in
 * **earlier** seasons — measured 2026-09-28 across 1955–2025 — and they matter because the winners
 * route walks past seasons and the briefing band draws any year a user asks for: `Yas Island` is
 * Abu Dhabi 2020–25, `Spa` is every Belgian GP before 2022.
 *
 * Keys are slugged FastF1 locations; values are slugged bacinger locations.
 */
const LOCATION_ALIASES = {
  bahrain: 'sakhir',
  'miami-gardens': 'miami',
  'monte-carlo': 'monaco',
  'kuala-lumpur': 'sepang',
  'marina-bay': 'singapore',
  'yas-island': 'yas-marina',
  'abu-dhabi': 'yas-marina',
  spa: 'spa-francorchamps',
  nurburgring: 'nurburg',
  mugello: 'scarperia-e-san-piero',
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
/**
 * The mean of the ring's vertices, in degrees. The vertices are dense and fairly even along a
 * surveyed centre line, so this lands on the circuit — near enough for a weather forecast, whose
 * grid is kilometres wide. Five decimals is about a metre.
 */
function centroid(coordinates) {
  const mean = (axis) =>
    coordinates.reduce((sum, point) => sum + point[axis], 0) / coordinates.length;
  return { lat: Number(mean(1).toFixed(5)), lon: Number(mean(0).toFixed(5)) };
}

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
  const catalog = [];
  let written = 0;

  for (const feature of collection.features) {
    const { id, Name: name, Location: location, length, firstgp } = feature.properties;

    const ring = longestRing(feature.geometry);
    const points = downsample(project(ring), MAX_POINTS);

    await writeFile(
      join(OUT_DIR, `${id}.json`),
      `${JSON.stringify({ id, name, location, lengthM: length ?? null, firstGp: firstgp ?? null, centroid: centroid(ring), points })}\n`,
    );

    index[slug(location)] = id;
    catalog.push({
      id,
      slug: slug(location),
      name,
      location,
      lengthM: length ?? null,
      firstGp: firstgp ?? null,
    });
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

  // The points-free view the grid and detail page read, so neither downloads an outline to learn a
  // circuit's slug, name or length. `tests/circuit-catalog.test.ts` checks it against every outline.
  catalog.sort((a, b) => a.id.localeCompare(b.id));
  await writeFile(join(OUT_DIR, 'catalog.json'), `${JSON.stringify(catalog, null, 2)}\n`);

  console.log(
    `wrote ${written} circuits, ${catalog.length} catalog entries and ${Object.keys(index).length} location keys`,
  );
}

await main();

#!/usr/bin/env node
/**
 * One-shot downloader for team logos and driver headshots.
 *
 * Not part of the build — the committed files under public/ are the source of truth.
 * Re-run only to refresh or add an asset. Sources are public Wikimedia Commons URLs; any
 * entry that cannot be sourced is simply left out and the UI falls back at render.
 *
 * Two rules this script exists to enforce, both of which a hand-download gets wrong:
 *
 *  1. Never write a file whose bytes disagree with its extension. A 404 or a rate-limit
 *     page saved as `.png` renders as a broken image forever instead of hitting the
 *     designed fallback, so every response is sniffed before it is written.
 *  2. Never substitute. A key with no free source is absent from the map, not filled with
 *     a lookalike — a wrong face is a factual error on the page, a missing file is not.
 *
 * Commons serves photographs as JPEG, but the UI paths in data/teams-data.ts are `.png`,
 * so headshots are transcoded with macOS `sips` (no npm dependency, and `-Z` bounds the
 * committed pixel count). Without `sips` the headshots are skipped rather than written
 * with a lying extension — see rule 1.
 *
 * REQUIRES macOS. The JPEG-to-PNG step shells out to `sips`, which ships with macOS and
 * nothing else. On Linux the logos still download and every headshot is skipped with a
 * warning — deliberately, since the alternative is a JPEG named `.png`. Porting means
 * swapping `sips` for ImageMagick/`vips`, not adding an npm dependency.
 *
 * Attribution for what this downloads lives in public/drivers/CREDITS.md (the photographs
 * are CC BY / CC BY-SA and oblige it) and public/logos/CREDITS.md. Adding an entry to a map
 * below means adding a row there too.
 *
 * Usage: mise exec -- node scripts/fetch-team-assets.mjs
 */
import { mkdir, writeFile, rm } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const execFileAsync = promisify(execFile);

/** Longest edge, in px, of a committed headshot. PNG is lossless — this is the size lever. */
const HEADSHOT_MAX_EDGE = 400;

const USER_AGENT = 'f1-briefing-agent/1.0 (personal project)';

/**
 * upload.wikimedia.org rate-limits a burst of ~5 requests and answers 429 for the rest,
 * so this pauses between files and retries with backoff. Both matter: without the pause
 * most of the run 429s, and without the retry a single throttled file is silently absent.
 */
const REQUEST_SPACING_MS = 1200;
const MAX_ATTEMPTS = 5;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Team logos. Every entry is an official mark of the named marque under a Commons
 * public-domain tag (PD-textlogo / PD-shape), not a fan recreation.
 *
 * Absent by design — no freely licensed vector of the team lockup exists on Commons:
 *   racing-bulls  (Visa Cash App Racing Bulls)
 * Where only the marque's brand mark is free and the full team lockup is not, the brand
 * mark is used: ferrari, red-bull, cadillac, aston-martin.
 */
const LOGOS = {
  mercedes:
    'https://upload.wikimedia.org/wikipedia/commons/f/fc/Mercedes-AMG_Petronas_F1_Team_logo_%282026%29.svg',
  ferrari: 'https://upload.wikimedia.org/wikipedia/commons/9/9b/Ferrari_wordmark.svg',
  mclaren: 'https://upload.wikimedia.org/wikipedia/commons/b/bb/Mclaren_Logo_2021.svg',
  'red-bull': 'https://upload.wikimedia.org/wikipedia/commons/9/91/Logo_of_Red_bull.svg',
  haas: 'https://upload.wikimedia.org/wikipedia/commons/1/18/TGR_Haas_F1_Team_Logo_%282026%29.svg',
  audi: 'https://upload.wikimedia.org/wikipedia/commons/0/03/Audif1.com_logo17_%28cropped%29.svg',
  alpine: 'https://upload.wikimedia.org/wikipedia/commons/7/7e/Alpine_F1_Team_Logo.svg',
  williams:
    'https://upload.wikimedia.org/wikipedia/commons/1/12/Atlassian_Williams_F1_Team_logo.svg',
  cadillac: 'https://upload.wikimedia.org/wikipedia/commons/7/7f/Cadillac_Logo_2021.svg',
  'aston-martin':
    'https://upload.wikimedia.org/wikipedia/commons/b/b7/Aston_Martin_wordmark.svg',
};

/**
 * Driver headshots — the lead photograph of each driver's English Wikipedia article,
 * which is a Commons-hosted free photograph of that driver.
 *
 * The `500px-` in these URLs is not arbitrary. upload.wikimedia.org only renders an
 * allow-listed set of thumbnail widths (see https://w.wiki/GHai) and answers 400 with an
 * HTML error page for anything else — 400px, notably, is rejected. Downscaling to
 * HEADSHOT_MAX_EDGE happens locally in sips instead. sergio-perez has no `thumb/` path
 * because the Commons original is already under 500px wide.
 */
const HEADSHOTS = {
  'george-russell':
    'https://upload.wikimedia.org/wikipedia/commons/thumb/7/7f/KingsLeonSilverstne040724_%2828_of_112%29_%2853838006028%29_%28cropped%29.jpg/500px-KingsLeonSilverstne040724_%2828_of_112%29_%2853838006028%29_%28cropped%29.jpg',
  'kimi-antonelli':
    'https://upload.wikimedia.org/wikipedia/commons/thumb/f/f3/Kimi_Antonelli_at_the_2025_US_Grand_Prix_in_Austin%2C_TX_%28cropped%29.jpg/500px-Kimi_Antonelli_at_the_2025_US_Grand_Prix_in_Austin%2C_TX_%28cropped%29.jpg',
  'charles-leclerc':
    'https://upload.wikimedia.org/wikipedia/commons/thumb/7/7b/2024-08-25_Motorsport%2C_Formel_1%2C_Gro%C3%9Fer_Preis_der_Niederlande_2024_STP_3978_by_Stepro_%28cropped2%29.jpg/500px-2024-08-25_Motorsport%2C_Formel_1%2C_Gro%C3%9Fer_Preis_der_Niederlande_2024_STP_3978_by_Stepro_%28cropped2%29.jpg',
  'lewis-hamilton':
    'https://upload.wikimedia.org/wikipedia/commons/thumb/d/d3/Prime_Minister_Keir_Starmer_meets_Sir_Lewis_Hamilton_%2854566928382%29_%28cropped%29.jpg/500px-Prime_Minister_Keir_Starmer_meets_Sir_Lewis_Hamilton_%2854566928382%29_%28cropped%29.jpg',
  'lando-norris':
    'https://upload.wikimedia.org/wikipedia/commons/thumb/9/90/2024-08-25_Motorsport%2C_Formel_1%2C_Gro%C3%9Fer_Preis_der_Niederlande_2024_STP_3968_by_Stepro_%28cropped2%29.jpg/500px-2024-08-25_Motorsport%2C_Formel_1%2C_Gro%C3%9Fer_Preis_der_Niederlande_2024_STP_3968_by_Stepro_%28cropped2%29.jpg',
  'oscar-piastri':
    'https://upload.wikimedia.org/wikipedia/commons/thumb/e/e5/2026_Chinese_GP_-_Oscar_Piastri_%28cropped%29_%28cropped%29.jpg/500px-2026_Chinese_GP_-_Oscar_Piastri_%28cropped%29_%28cropped%29.jpg',
  'max-verstappen':
    'https://upload.wikimedia.org/wikipedia/commons/thumb/5/52/2024-08-25_Motorsport%2C_Formel_1%2C_Gro%C3%9Fer_Preis_der_Niederlande_2024_STP_3973_by_Stepro_%28medium_crop%29.jpg/500px-2024-08-25_Motorsport%2C_Formel_1%2C_Gro%C3%9Fer_Preis_der_Niederlande_2024_STP_3973_by_Stepro_%28medium_crop%29.jpg',
  'isack-hadjar':
    'https://upload.wikimedia.org/wikipedia/commons/thumb/7/75/Isack_Hadjar_at_the_Melbourne_Walk_during_the_2026_Australian_Grand_Prix_%28028A8753%29_%28cropped%29.jpg/500px-Isack_Hadjar_at_the_Melbourne_Walk_during_the_2026_Australian_Grand_Prix_%28028A8753%29_%28cropped%29.jpg',
  'esteban-ocon':
    'https://upload.wikimedia.org/wikipedia/commons/thumb/2/2e/Esteban_Ocon_2024_Suzuka_%28cropped%29.jpg/500px-Esteban_Ocon_2024_Suzuka_%28cropped%29.jpg',
  'oliver-bearman':
    'https://upload.wikimedia.org/wikipedia/commons/thumb/9/9a/2025_Japan_GP_-_Haas_-_Oliver_Bearman_-_Thursday_%28cropped%29.jpg/500px-2025_Japan_GP_-_Haas_-_Oliver_Bearman_-_Thursday_%28cropped%29.jpg',
  'liam-lawson':
    'https://upload.wikimedia.org/wikipedia/commons/thumb/8/88/Liam_Lawson_at_the_Red_Bull_Fan_Zone_%E2%80%93_Crown_Riverwalk%2C_Melbourne_%28028A7795%29.jpg/500px-Liam_Lawson_at_the_Red_Bull_Fan_Zone_%E2%80%93_Crown_Riverwalk%2C_Melbourne_%28028A7795%29.jpg',
  'arvid-lindblad':
    'https://upload.wikimedia.org/wikipedia/commons/thumb/0/0c/Arvid_Lindblad_at_the_Red_Bull_Fan_Zone_%E2%80%93_Crown_Riverwalk%2C_Melbourne_%28028A7869%29_%28cropped%29.jpg/500px-Arvid_Lindblad_at_the_Red_Bull_Fan_Zone_%E2%80%93_Crown_Riverwalk%2C_Melbourne_%28028A7869%29_%28cropped%29.jpg',
  'nico-hulkenberg':
    'https://upload.wikimedia.org/wikipedia/commons/thumb/d/de/2019_Formula_One_tests_Barcelona%2C_Hulkenberg_%2840287128313%29.jpg/500px-2019_Formula_One_tests_Barcelona%2C_Hulkenberg_%2840287128313%29.jpg',
  'gabriel-bortoleto':
    'https://upload.wikimedia.org/wikipedia/commons/thumb/2/25/Gabriel_Bortoleto_at_the_Melbourne_Walk_during_the_2026_Australian_Grand_Prix_%28028A8581%29_cropped.jpg/500px-Gabriel_Bortoleto_at_the_Melbourne_Walk_during_the_2026_Australian_Grand_Prix_%28028A8581%29_cropped.jpg',
  'pierre-gasly':
    'https://upload.wikimedia.org/wikipedia/commons/thumb/f/fd/2022_French_Grand_Prix_%2852279065728%29_%28midcrop%29.png/500px-2022_French_Grand_Prix_%2852279065728%29_%28midcrop%29.png',
  'franco-colapinto':
    'https://upload.wikimedia.org/wikipedia/commons/thumb/1/1c/Franco_Colapinto_at_the_Melbourne_Walk_during_the_2026_Australian_Grand_Prix_%28028A8698%29_cropped.jpg/500px-Franco_Colapinto_at_the_Melbourne_Walk_during_the_2026_Australian_Grand_Prix_%28028A8698%29_cropped.jpg',
  'carlos-sainz':
    'https://upload.wikimedia.org/wikipedia/commons/thumb/c/ce/Formula1Gabelhofen2022_%2804%29_%28cropped2%29.jpg/500px-Formula1Gabelhofen2022_%2804%29_%28cropped2%29.jpg',
  'alexander-albon':
    'https://upload.wikimedia.org/wikipedia/commons/thumb/4/4a/Alex_Albon_at_the_Melbourne_Walk_during_the_2026_Australian_Grand_Prix_%28028A8626%29_%28cropped%29.jpg/500px-Alex_Albon_at_the_Melbourne_Walk_during_the_2026_Australian_Grand_Prix_%28028A8626%29_%28cropped%29.jpg',
  'sergio-perez':
    'https://upload.wikimedia.org/wikipedia/commons/5/55/2021_US_GP_driver_parade_%28cropped2%29.jpg',
  'valtteri-bottas':
    'https://upload.wikimedia.org/wikipedia/commons/thumb/2/20/Valtteri_Bottas_at_the_2026_Adelaide_Motorsport_Festival_%28028A7556%29.jpg/500px-Valtteri_Bottas_at_the_2026_Adelaide_Motorsport_Festival_%28028A7556%29.jpg',
  'fernando-alonso':
    'https://upload.wikimedia.org/wikipedia/commons/thumb/9/97/Alonso-68_%2824710447098%29.jpg/500px-Alonso-68_%2824710447098%29.jpg',
  'lance-stroll':
    'https://upload.wikimedia.org/wikipedia/commons/thumb/e/e1/2019_Formula_One_tests_Barcelona%2C_Stroll_%2833376133178%29.jpg/500px-2019_Formula_One_tests_Barcelona%2C_Stroll_%2833376133178%29.jpg',
};

/** Fetch the bytes, retrying throttles and transient errors. Null with a reason logged. */
async function fetchBytes(url, label) {
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    if (attempt > 1) await sleep(REQUEST_SPACING_MS * 2 ** (attempt - 1));

    let response;
    try {
      response = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
    } catch (error) {
      if (attempt === MAX_ATTEMPTS) {
        console.warn(`  skip ${label} — ${error.message}`);
        return null;
      }
      continue;
    }

    if (response.ok) return Buffer.from(await response.arrayBuffer());

    const retryable = response.status === 429 || response.status >= 500;
    if (!retryable || attempt === MAX_ATTEMPTS) {
      console.warn(`  skip ${label} — HTTP ${response.status}`);
      return null;
    }
  }
  return null;
}

/** What the bytes actually are, ignoring the URL and the Content-Type header. */
function sniff(bytes) {
  if (bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex'))) {
    return 'png';
  }
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return 'jpeg';
  }
  // SVG is XML: allow a BOM, whitespace, a declaration, comments or a doctype before <svg.
  const head = bytes.subarray(0, 1024).toString('utf8');
  if (/<svg[\s>]/i.test(head)) return 'svg';
  return 'unknown';
}

async function downloadLogo(url, destination, label) {
  const bytes = await fetchBytes(url, label);
  if (!bytes) return false;

  const kind = sniff(bytes);
  if (kind !== 'svg') {
    console.warn(`  skip ${label} — response is ${kind}, not SVG`);
    return false;
  }
  await writeFile(destination, bytes);
  console.log(`  wrote ${label} (${bytes.length} bytes)`);
  return true;
}

async function downloadHeadshot(url, destination, label) {
  const bytes = await fetchBytes(url, label);
  if (!bytes) return false;

  const kind = sniff(bytes);
  if (kind !== 'png' && kind !== 'jpeg') {
    console.warn(`  skip ${label} — response is ${kind}, not an image`);
    return false;
  }

  const scratch = join(tmpdir(), `f1-headshot-${process.pid}-${Date.now()}.${kind}`);
  await writeFile(scratch, bytes);
  try {
    // -Z bounds the longest edge; -s format png makes the extension truthful.
    await execFileAsync('sips', [
      '-s',
      'format',
      'png',
      '-Z',
      String(HEADSHOT_MAX_EDGE),
      scratch,
      '--out',
      destination,
    ]);
  } catch (error) {
    console.warn(`  skip ${label} — sips failed (${error.message.split('\n')[0]})`);
    return false;
  } finally {
    await rm(scratch, { force: true });
  }
  console.log(`  wrote ${label}`);
  return true;
}

async function main() {
  const logoDir = join('public', 'logos');
  const driverDir = join('public', 'drivers');
  await mkdir(logoDir, { recursive: true });
  await mkdir(driverDir, { recursive: true });

  let ok = 0;
  let missed = 0;

  console.log('Logos:');
  for (const [id, url] of Object.entries(LOGOS)) {
    const destination = join(logoDir, `${id}.svg`);
    (await downloadLogo(url, destination, destination)) ? ok++ : missed++;
    await sleep(REQUEST_SPACING_MS);
  }

  console.log('Headshots:');
  for (const [id, url] of Object.entries(HEADSHOTS)) {
    const destination = join(driverDir, `${id}.png`);
    (await downloadHeadshot(url, destination, destination)) ? ok++ : missed++;
    await sleep(REQUEST_SPACING_MS);
  }

  console.log(`\n${ok} fetched, ${missed} unavailable (those fall back at render).`);
}

main();

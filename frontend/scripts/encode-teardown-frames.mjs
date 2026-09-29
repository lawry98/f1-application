#!/usr/bin/env node
/**
 * Re-derives the `/teardown` frame sequence from its source renders.
 *
 * Not part of the build: the committed WebPs in public/frames/ are what ships, and the PNGs in
 * assets/teardown-frames/ are what they are derived from. Re-run after replacing a source frame.
 *
 *     node scripts/encode-teardown-frames.mjs           # write public/frames/*.webp
 *     node scripts/encode-teardown-frames.mjs --check   # re-encode in memory, exit 1 on any drift
 *
 * The output is byte-for-byte deterministic for a given sharp, which is why sharp is pinned to an
 * exact version in package.json: a different libwebp is a different set of bytes. `--check` is
 * how to confirm the committed set is still the one these sources and settings produce.
 *
 * The settings, and how they were chosen
 * --------------------------------------
 * Measured on 12 frames spanning the sequence (smallest, largest, fastest-changing, and the ones
 * the callouts sit over), against the PNG sources, then over all 192:
 *
 *     PNG (the sources)   30.13 MB
 *     WebP lossless       ~13.7 MB
 *     JPEG q85 mozjpeg     ~4.5 MB   SSIM 0.965
 *     WebP q80             ~2.8 MB   SSIM 0.961, carbon weave visibly smeared at 3x
 *     WebP q85              3.60 MB  SSIM 0.967  <- shipped
 *     WebP q90              5.58 MB  SSIM 0.977
 *     AVIF q60             ~2.6 MB   SSIM 0.968
 *
 * At the desktop display scale (the 800px canvas is drawn ~1.65x up) q85 is not distinguishable
 * from the source on the largest frame. AVIF would save another ~1 MB but Safari only decodes it
 * from 16, so it would need a WebP fallback set shipped beside it; WebP alone covers everything
 * that can lay the page out at all (its `aspect-ratio` already needs Safari 15). Decode cost does
 * not separate the formats: 1-2 ms a frame in Chromium, 7 ms at worst under a 4x CPU throttle.
 *
 * `smartSubsample` is libwebp's sharp-YUV conversion, which keeps the saturated reds (the Pirelli
 * sidewall text, the engine glow) from bleeding into the dark bodywork beside them.
 *
 * Alpha is stripped, and asserted absent first. Every source is fully opaque, so the channel is
 * pure weight; but a re-render that *did* carry transparency would composite differently over the
 * page's `bg-zinc-950`, and silently flattening it would hide that. So a non-opaque pixel stops
 * the script instead.
 */

import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE_DIR = join(ROOT, 'assets', 'teardown-frames');
const OUT_DIR = join(ROOT, 'public', 'frames');

const WEBP_OPTIONS = { quality: 85, effort: 6, smartSubsample: true };

/** `frame_0000.png` … in order, refusing a gap: the scene maps scroll to index arithmetically. */
async function sourceFrames() {
  const names = (await readdir(SOURCE_DIR)).filter((f) => /^frame_\d{4}\.png$/.test(f)).sort();
  names.forEach((name, i) => {
    const expected = `frame_${String(i).padStart(4, '0')}.png`;
    if (name !== expected) throw new Error(`${SOURCE_DIR}: expected ${expected}, found ${name}`);
  });
  if (names.length === 0) throw new Error(`${SOURCE_DIR}: no frame_NNNN.png sources`);
  return names;
}

async function encode(file) {
  const image = sharp(file);
  const { hasAlpha } = await image.metadata();
  if (hasAlpha) {
    const alpha = (await image.stats()).channels[3];
    if (alpha.min !== 255) {
      throw new Error(`${file}: not fully opaque (alpha min ${alpha.min}); refusing to flatten it`);
    }
  }
  return image.removeAlpha().webp(WEBP_OPTIONS).toBuffer();
}

async function main() {
  const check = process.argv.includes('--check');
  const names = await sourceFrames();
  if (!check) await mkdir(OUT_DIR, { recursive: true });

  let sourceBytes = 0;
  let outBytes = 0;
  const drifted = [];
  for (const name of names) {
    const source = join(SOURCE_DIR, name);
    const target = join(OUT_DIR, name.replace(/\.png$/, '.webp'));
    const webp = await encode(source);
    sourceBytes += (await readFile(source)).length;
    outBytes += webp.length;
    if (check) {
      const committed = await readFile(target).catch(() => null);
      if (!committed || !committed.equals(webp)) drifted.push(target);
    } else {
      await writeFile(target, webp);
    }
  }

  const mb = (n) => `${(n / 1e6).toFixed(2)} MB`;
  console.log(`${names.length} frames: ${mb(sourceBytes)} of PNG -> ${mb(outBytes)} of WebP`);
  if (check) {
    if (drifted.length > 0) {
      console.error(`${drifted.length} committed frames differ from a fresh encode:`);
      drifted.forEach((f) => console.error(`  ${f}`));
      process.exit(1);
    }
    console.log('every committed frame matches a fresh encode byte for byte');
  }
}

await main();

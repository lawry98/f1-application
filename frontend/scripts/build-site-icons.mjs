#!/usr/bin/env node
/**
 * Rasterises `app/icon.svg` into the two icons clients fetch by a fixed name.
 *
 * Not part of the build: the committed files in app/ are what ships, and icon.svg is what they
 * are derived from. Re-run after changing the SVG.
 *
 *     node scripts/build-site-icons.mjs           # write app/apple-icon.png and app/favicon.ico
 *     node scripts/build-site-icons.mjs --check   # rebuild in memory, exit 1 on any drift
 *
 * The output is byte-for-byte deterministic for a given sharp, which is pinned to an exact version
 * in package.json for `encode-teardown-frames.mjs` already.
 *
 * - `apple-icon.png`, 180×180: what iOS asks for. iOS composites a transparent touch icon onto
 *   black and applies its own corner mask, so this one is flattened onto the SVG's own base
 *   colour — full-bleed and opaque, with the rounded corners filled in.
 * - `favicon.ico`, 16/32/48: for the clients that request `/favicon.ico` blindly and never read a
 *   `<link rel="icon">` — crawlers, feed readers, older browsers. PNG-in-ICO frames, which every
 *   browser since IE Vista reads, with the corners left transparent like the SVG's.
 */

import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const APP = join(dirname(fileURLToPath(import.meta.url)), '..', 'app');
const SOURCE = join(APP, 'icon.svg');

const APPLE_SIZE = 180;
const FAVICON_SIZES = [16, 32, 48];

/** The SVG at `size` pixels, rasterised at that size rather than scaled up from its viewBox. */
function raster(svg, size) {
  const viewBox = Number(/viewBox="0 0 (\d+) \d+"/.exec(svg.toString())?.[1]);
  if (!viewBox) throw new Error(`${SOURCE}: expected a square viewBox="0 0 N N"`);
  return sharp(svg, { density: (72 * size) / viewBox }).resize(size, size);
}

async function appleIcon(svg) {
  const base = /<rect[^>]*fill="(#[0-9A-Fa-f]{6})"/.exec(svg.toString())?.[1];
  if (!base) throw new Error(`${SOURCE}: expected a <rect> background fill`);
  return raster(svg, APPLE_SIZE)
    .flatten({ background: base })
    .png({ compressionLevel: 9 })
    .toBuffer();
}

/** An ICO directory (6-byte header, 16 bytes per entry) followed by the PNG frames it points at. */
async function favicon(svg) {
  const frames = await Promise.all(
    FAVICON_SIZES.map((size) => raster(svg, size).png({ compressionLevel: 9 }).toBuffer()),
  );
  const header = Buffer.alloc(6 + 16 * frames.length);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type: icon
  header.writeUInt16LE(frames.length, 4);

  let offset = header.length;
  frames.forEach((frame, i) => {
    const entry = 6 + 16 * i;
    header.writeUInt8(FAVICON_SIZES[i], entry); // width
    header.writeUInt8(FAVICON_SIZES[i], entry + 1); // height
    header.writeUInt8(0, entry + 2); // palette size: none
    header.writeUInt8(0, entry + 3); // reserved
    header.writeUInt16LE(1, entry + 4); // colour planes
    header.writeUInt16LE(32, entry + 6); // bits per pixel
    header.writeUInt32LE(frame.length, entry + 8);
    header.writeUInt32LE(offset, entry + 12);
    offset += frame.length;
  });
  return Buffer.concat([header, ...frames]);
}

async function main() {
  const check = process.argv.includes('--check');
  const svg = await readFile(SOURCE);
  const outputs = [
    ['apple-icon.png', await appleIcon(svg)],
    ['favicon.ico', await favicon(svg)],
  ];

  let drift = 0;
  for (const [name, bytes] of outputs) {
    const path = join(APP, name);
    if (check) {
      const committed = await readFile(path).catch(() => null);
      if (!committed?.equals(bytes)) {
        console.error(`drift: app/${name} is not what app/icon.svg builds`);
        drift++;
      }
    } else {
      await writeFile(path, bytes);
      console.log(`wrote app/${name} (${bytes.length} bytes)`);
    }
  }
  if (check) {
    if (drift) process.exit(1);
    console.log('app/apple-icon.png and app/favicon.ico match app/icon.svg');
  }
}

await main();

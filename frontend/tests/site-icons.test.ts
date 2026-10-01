import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { PNG } from 'pngjs';
import { describe, expect, it } from 'vitest';

import tailwindConfig from '../tailwind.config';

const APP = resolve(__dirname, '..', 'app');

const colors = tailwindConfig.theme?.extend?.colors as Record<string, unknown>;
const BASE = (colors.base as string).toLowerCase();
const RED = (colors.f1 as { red: string }).red.toLowerCase();

function hexAt(png: PNG, x: number, y: number): { hex: string; alpha: number } {
  const i = (png.width * y + x) * 4;
  const channel = (offset: number) => png.data.readUInt8(i + offset);
  const hex = `#${[0, 1, 2].map((c) => channel(c).toString(16).padStart(2, '0')).join('')}`;
  return { hex, alpha: channel(3) };
}

describe('icon.svg', () => {
  /*
   * The nav's mark — a red dot — on the page's base. An SVG file cannot read the theme, so the
   * hex values are written into it; this is what keeps them the theme's.
   */
  it('is drawn in the theme tokens and nothing else', () => {
    const svg = readFileSync(resolve(APP, 'icon.svg'), 'utf8');
    const fills = [...svg.matchAll(/fill="([^"]+)"/g)].map((m) => m[1]!.toLowerCase());

    expect(new Set(fills)).toEqual(new Set([BASE, RED]));
  });
});

describe('apple-icon.png', () => {
  const png = PNG.sync.read(readFileSync(resolve(APP, 'apple-icon.png')));

  it('is 180×180, the size iOS asks for', () => {
    expect([png.width, png.height]).toEqual([180, 180]);
  });

  /*
   * iOS composites a transparent touch icon onto black and applies its own corner mask, so the
   * file must be full-bleed and opaque: the SVG's rounded corners are filled with base.
   */
  it('is opaque base to the corners with the red dot at its centre', () => {
    const corners: [number, number][] = [
      [0, 0],
      [179, 0],
      [0, 179],
      [179, 179],
    ];
    for (const [x, y] of corners) {
      expect(hexAt(png, x, y)).toEqual({ hex: BASE, alpha: 255 });
    }
    expect(hexAt(png, 90, 90)).toEqual({ hex: RED, alpha: 255 });
  });
});

describe('favicon.ico', () => {
  const ico = readFileSync(resolve(APP, 'favicon.ico'));

  /*
   * An ICO directory of PNG frames. A browser picks the frame nearest the size it is drawing, so
   * each entry's declared size must be the size of the PNG it points at.
   */
  it('holds 16, 32 and 48px PNG frames whose directory entries match them', () => {
    expect(ico.readUInt16LE(0)).toBe(0); // reserved
    expect(ico.readUInt16LE(2)).toBe(1); // type 1 = icon
    const count = ico.readUInt16LE(4);

    const sizes = [];
    for (let i = 0; i < count; i++) {
      const entry = 6 + i * 16;
      const declared = ico.readUInt8(entry);
      const length = ico.readUInt32LE(entry + 8);
      const offset = ico.readUInt32LE(entry + 12);
      const frame = PNG.sync.read(ico.subarray(offset, offset + length));

      expect([frame.width, frame.height]).toEqual([declared, declared]);
      expect(hexAt(frame, declared / 2, declared / 2).hex).toBe(RED);
      sizes.push(declared);
    }
    expect(sizes).toEqual([16, 32, 48]);
  });
});

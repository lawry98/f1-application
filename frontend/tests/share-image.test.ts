// @vitest-environment node
import { describe, expect, it } from 'vitest';

import OpengraphImage, * as og from '@/app/opengraph-image';
import TwitterImage, * as twitter from '@/app/twitter-image';
import tailwindConfig from '../tailwind.config';
import { SHARE_IMAGE_COLORS } from '@/lib/share-image';

/** Width and height out of a PNG's IHDR chunk: bytes 16–23, big-endian, after the signature. */
function pngSize(bytes: Uint8Array): { width: number; height: number } {
  const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  expect([...bytes.subarray(0, 8)]).toEqual(signature);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return { width: view.getUint32(16), height: view.getUint32(20) };
}

/*
 * Rendered for real, with the committed fonts, so this also fails if a font file stops
 * resolving or a glyph the image uses is missing — both of which would otherwise surface only in
 * `pnpm build`, or, for a missing glyph, as a silent network fetch at build time.
 */
describe.each([
  ['opengraph-image', OpengraphImage, og],
  ['twitter-image', TwitterImage, twitter],
])('%s', (_name, render, config) => {
  it('is a 1200×630 PNG, the size its metadata declares', async () => {
    const response = await render();
    const bytes = new Uint8Array(await response.arrayBuffer());

    expect(response.headers.get('content-type')).toBe('image/png');
    expect(pngSize(bytes)).toEqual({ width: 1200, height: 630 });
    expect(config.size).toEqual({ width: 1200, height: 630 });
    expect(config.contentType).toBe('image/png');
  });

  it('carries alt text', () => {
    expect(config.alt).toMatch(/F1 Briefing Agent/);
  });
});

describe('share image colours', () => {
  /*
   * The image is drawn with inline styles, not classes, so it cannot read the theme. Retuning a
   * token in `tailwind.config.ts` would leave every link preview in the old colour.
   */
  it('match the theme tokens', () => {
    const colors = tailwindConfig.theme?.extend?.colors as Record<string, unknown>;
    const f1 = colors.f1 as { red: string };

    expect(SHARE_IMAGE_COLORS.base.toLowerCase()).toBe((colors.base as string).toLowerCase());
    expect(SHARE_IMAGE_COLORS.ink.toLowerCase()).toBe((colors.ink as string).toLowerCase());
    expect(SHARE_IMAGE_COLORS.red.toLowerCase()).toBe(f1.red.toLowerCase());
  });
});

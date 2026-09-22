/**
 * The team-livery recolour.
 *
 * This file exists because the defect it guards shipped invisible. `f1-car-model.tsx` picked the
 * materials to recolour by matching `body`/`Body`/`paint` against material names, and the GLB we
 * ship names its four materials `Livery`, `RearLight`, `Wheels` and `WheelCovers` — zero matches,
 * so the recolour ran on nothing and every team rendered the baked blue. Nothing caught it:
 * `showcase-page.test.tsx` mocks the scene away, and jsdom has no WebGL to render into.
 *
 * So the guard is a pure function tested against **the asset actually in `public/`**, not against
 * a fixture restating what we believe the asset contains. `selectLiveryMaterials` reading the real
 * material names is the assertion that would have failed on the original filter, and
 * `LIVERY_BASE_RGB` measured against the real texture is what fails if the model is re-exported
 * in another colour.
 *
 * Widening the old filter to match `Livery` would have been a different bug, not a fix: the base
 * texel is `#003572`, whose red channel is **0**, and three.js multiplies `material.color` into
 * `.map`. No multiply can put red back, so Ferrari renders `#000000`, five more teams render
 * near-black, and the rest render the same blue slightly darker. Hence a per-texel recolour.
 */

import { beforeAll, describe, expect, it } from 'vitest';

import { TEAMS } from '@/data/teams-data';
import {
  LIVERY_BASE_RGB,
  hexToRgb,
  liveryPaintScale,
  recolourLivery,
  selectLiveryMaterials,
} from '@/lib/livery';
import { decodeLiveryTexture, glbMaterialNames, modalColor, type DecodedTexture } from './glb';

describe('selectLiveryMaterials', () => {
  it('finds the bodywork material in the GLB we actually ship', () => {
    /*
     * The whole bug in one assertion. The shipped names are `Livery`, `RearLight`, `Wheels`,
     * `WheelCovers`; the filter this replaces matched none of them and returned an empty list,
     * which the component then happily iterated over zero times.
     */
    const selected = selectLiveryMaterials(glbMaterialNames().map((name) => ({ name })));

    expect(selected).not.toHaveLength(0);
    expect(selected.map((material) => material.name)).toEqual(['Livery']);
  });

  it('leaves the wheels, wheel covers and rear light alone', () => {
    const names = glbMaterialNames();
    expect(names).toContain('Wheels');
    expect(names).toContain('WheelCovers');
    expect(names).toContain('RearLight');

    const selected = selectLiveryMaterials(names.map((name) => ({ name })));

    expect(selected.map((material) => material.name)).not.toContain('Wheels');
    expect(selected.map((material) => material.name)).not.toContain('WheelCovers');
    expect(selected.map((material) => material.name)).not.toContain('RearLight');
  });

  it('returns nothing rather than guessing when no material is a livery', () => {
    expect(selectLiveryMaterials([{ name: 'Chassis' }, { name: 'Glass' }])).toEqual([]);
  });

  it('tolerates an unnamed material', () => {
    expect(selectLiveryMaterials([{ name: undefined }, { name: 'Livery' }])).toHaveLength(1);
  });
});

describe('liveryPaintScale', () => {
  it('reads the base texel as full-strength paint', () => {
    expect(liveryPaintScale(...LIVERY_BASE_RGB)).toBeCloseTo(1, 5);
  });

  it('reads black as zero-strength paint, so shadowed bodywork stays black', () => {
    /*
     * Black is on the ray at k=0, and `0 × teamColour` is black whatever the team — the 30% of
     * this texture that is floor, wings and underbody keeps its structure for free, with no
     * special case.
     */
    expect(liveryPaintScale(0, 0, 0)).toBe(0);
  });

  it('scales an anti-aliased edge texel proportionally', () => {
    // (0,45,97) is a real texel from the blue→black boundary: 45/53 = 0.849, 97/114 = 0.851.
    expect(liveryPaintScale(0, 45, 97)).toBeCloseTo(0.85, 2);
  });

  it.each([
    ['white decal text', 255, 255, 255],
    ['cream panel', 255, 219, 150],
    ['orange accent stripe', 255, 107, 0],
    ['red accent stripe', 255, 0, 6],
    ['yellow accent stripe', 255, 224, 0],
  ])('rejects the %s, which must survive the recolour', (_label, r, g, b) => {
    expect(liveryPaintScale(r, g, b)).toBeNull();
  });

  it('rejects a colour off the base ray even when its red channel is zero', () => {
    // Same red channel as the base, nothing like its green:blue ratio.
    expect(liveryPaintScale(0, 200, 40)).toBeNull();
  });
});

describe('recolourLivery', () => {
  const rgba = (...texels: [number, number, number][]) =>
    new Uint8ClampedArray(texels.flatMap(([r, g, b]) => [r, g, b, 255]));

  it('paints the base texel the exact team colour', () => {
    const source = rgba([...LIVERY_BASE_RGB]);
    const target = new Uint8ClampedArray(source.length);

    recolourLivery(source, target, [220, 0, 0]);

    expect(Array.from(target)).toEqual([220, 0, 0, 255]);
  });

  it('keeps black bodywork black', () => {
    const source = rgba([0, 0, 0]);
    const target = new Uint8ClampedArray(source.length);

    recolourLivery(source, target, [220, 0, 0]);

    expect(Array.from(target)).toEqual([0, 0, 0, 255]);
  });

  it('copies decals through untouched', () => {
    const source = rgba([255, 107, 0]);
    const target = new Uint8ClampedArray(source.length);

    recolourLivery(source, target, [220, 0, 0]);

    expect(Array.from(target)).toEqual([255, 107, 0, 255]);
  });

  it('shades an anti-aliased edge rather than leaving a fringe of the old blue', () => {
    const source = rgba([0, 45, 97]);
    const target = new Uint8ClampedArray(source.length);

    recolourLivery(source, target, [220, 0, 0]);

    // 0.85 of the way to Ferrari red, and no blue left behind.
    expect(target[0]).toBeGreaterThan(180);
    expect(target[0]).toBeLessThan(195);
    expect(target[1]).toBe(0);
    expect(target[2]).toBe(0);
  });

  it('preserves alpha', () => {
    const source = new Uint8ClampedArray([...LIVERY_BASE_RGB, 128]);
    const target = new Uint8ClampedArray(4);

    recolourLivery(source, target, [220, 0, 0]);

    expect(target[3]).toBe(128);
  });

  it('reads from the pristine source every time, so switching teams does not compound', () => {
    /*
     * The failure this prevents: recolouring in place means the second team multiplies against
     * the first team's output, and the car drifts further from the right colour on every click.
     */
    const source = rgba([...LIVERY_BASE_RGB]);
    const target = new Uint8ClampedArray(source.length);

    recolourLivery(source, target, [0, 210, 190]);
    recolourLivery(source, target, [220, 0, 0]);

    expect(Array.from(target)).toEqual([220, 0, 0, 255]);
  });
});

describe('the shipped livery texture', () => {
  let texture: DecodedTexture;

  beforeAll(() => {
    texture = decodeLiveryTexture();
  });

  it('is still built on the base colour the recolour is calibrated to', () => {
    /*
     * `LIVERY_BASE_RGB` is the one place this number lives. A re-exported model in another base
     * colour would leave the recolour matching almost nothing and the car stuck on the new baked
     * livery — the original defect, wearing different clothes. This is what fails instead.
     */
    expect(modalColor(texture.data)).toEqual([...LIVERY_BASE_RGB]);
  });

  it('recolours the bodywork to the exact team colour', () => {
    const target = new Uint8ClampedArray(texture.data.length);

    recolourLivery(texture.data, target, hexToRgb('#dc0000'));

    // Ferrari is the team a naive `color` multiply renders pure black.
    expect(modalColor(target)).toEqual([220, 0, 0]);
  });

  it('leaves the decals legible for every team on the grid', () => {
    const decal = findTexel(texture, (r, g, b) => r === 255 && g === 219 && b === 150);

    for (const team of TEAMS) {
      const target = new Uint8ClampedArray(texture.data.length);
      recolourLivery(texture.data, target, hexToRgb(team.color));

      expect([target[decal], target[decal + 1], target[decal + 2]]).toEqual([255, 219, 150]);
    }
  });

  it('gives every team on the grid a distinct body colour', () => {
    /*
     * Under the multiply this replaces, six of eleven teams rendered black or near-black and the
     * other five rendered the same blue — so "did the car change at all?" is the question worth
     * asking of all eleven at once.
     */
    const base = findTexel(texture, (r, g, b) => r === 0 && g === 53 && b === 114);

    const rendered = TEAMS.map((team) => {
      const target = new Uint8ClampedArray(texture.data.length);
      recolourLivery(texture.data, target, hexToRgb(team.color));
      return `${target[base]},${target[base + 1]},${target[base + 2]}`;
    });

    expect(new Set(rendered).size).toBe(TEAMS.length);
  });
});

function findTexel(
  texture: DecodedTexture,
  match: (r: number, g: number, b: number) => boolean,
): number {
  for (let i = 0; i < texture.data.length; i += 4) {
    if (match(texture.data[i]!, texture.data[i + 1]!, texture.data[i + 2]!)) return i;
  }
  throw new Error('no such texel in the shipped livery texture');
}

describe('hexToRgb', () => {
  it('parses a team colour', () => {
    expect(hexToRgb('#dc0000')).toEqual([220, 0, 0]);
  });

  it('parses without the leading hash', () => {
    expect(hexToRgb('00d2be')).toEqual([0, 210, 190]);
  });
});

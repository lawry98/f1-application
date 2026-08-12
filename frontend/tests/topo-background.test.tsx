import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { TopoBackground } from '@/components/candy/topo-background';

describe('TopoBackground', () => {
  /*
   * The contours must not change size when their container does.
   *
   * The first version set a `viewBox` and `preserveAspectRatio="xMidYMid slice"`, which makes
   * the scale `max(containerW / fieldW, containerH / fieldH)` — a function of the container.
   * Measured on /briefing: the empty state was 1440×702 and scaled 1.5, but a fully streamed
   * briefing was 1440×3171 and scaled 6.61, showing 218 of 960 field units. The texture visibly
   * zoomed on every streamed chunk and ended up as a few enormous strokes.
   *
   * Both assertions below pin the fix rather than the symptom: without a `viewBox` one user
   * unit is one CSS pixel, and a `userSpaceOnUse` pattern tiles at a fixed pixel size, so a
   * taller container reveals more tiles instead of magnifying the same ones.
   */
  it('does not scale its contours with the container', () => {
    const { container } = render(<TopoBackground />);
    const svg = container.querySelector('svg')!;

    expect(svg.hasAttribute('viewBox')).toBe(false);
    expect(svg.hasAttribute('preserveAspectRatio')).toBe(false);
  });

  it('tiles the contours at a fixed pixel size', () => {
    const { container } = render(<TopoBackground />);
    const pattern = container.querySelector('pattern')!;

    expect(pattern).toHaveAttribute('patternUnits', 'userSpaceOnUse');
    // A filled rect is what makes the tile repeat across whatever area the container has.
    expect(container.querySelector('rect')?.getAttribute('fill')).toMatch(/^url\(#/);
  });

  it('draws several closed contour rings', () => {
    const { container } = render(<TopoBackground />);
    const paths = container.querySelectorAll('path');

    expect(paths.length).toBeGreaterThanOrEqual(6);
    for (const path of Array.from(paths)) {
      // Closed, or the "contour" reads as an arc with two loose ends.
      expect(path.getAttribute('d')?.endsWith('Z')).toBe(true);
    }
  });

  it('is decorative and cannot intercept a click', () => {
    const { container } = render(<TopoBackground />);
    const svg = container.querySelector('svg')!;

    expect(svg).toHaveAttribute('aria-hidden', 'true');
    expect(svg.classList.contains('pointer-events-none')).toBe(true);
    // Absolute, so dropping the texture into a container never moves its contents.
    expect(svg.classList.contains('absolute')).toBe(true);
  });

  it('takes its stroke colour from the call site', () => {
    const { container } = render(<TopoBackground />);
    const group = container.querySelector('g')!;

    expect(group).toHaveAttribute('stroke', 'currentColor');
    expect(group).toHaveAttribute('fill', 'none');
  });

  it('defaults to a visible opacity', () => {
    // 12%. A 1px stroke at the brief's 5% over #09090B is invisible on a real display, and at
    // 6% the outlines were legible only if you already knew to look for them.
    const { container } = render(<TopoBackground />);

    expect(container.querySelector('svg')!.classList.contains('opacity-[0.12]')).toBe(true);
  });

  it('keeps every outline inside the tile so the seams do not show', () => {
    // A pattern tile clips its contents, so an outline crossing an edge is sliced flat and the
    // tiling shows up as a grid of straight cuts. Every placement has to satisfy
    // `size / 2 <= cx, cy <= TILE - size / 2`, which is easy to get wrong by eye when adding
    // one — hence an assertion rather than a comment.
    const { container } = render(<TopoBackground />);
    const tile = Number(container.querySelector('pattern')!.getAttribute('width'));

    for (const path of Array.from(container.querySelectorAll('pattern path'))) {
      const numbers = (path.getAttribute('d')!.match(/-?\d+(\.\d+)?/g) ?? []).map(Number);
      expect(Math.min(...numbers)).toBeGreaterThanOrEqual(0);
      expect(Math.max(...numbers)).toBeLessThanOrEqual(tile);
    }
  });

  it('lets a className override the default opacity', () => {
    // Quieter inside ticket cards than behind a hero, so opacity has to be overridable rather
    // than baked in. `cn` has to drop the default, not merely append to it.
    const { container } = render(<TopoBackground className="opacity-[0.04] text-ink" />);
    const svg = container.querySelector('svg')!;

    expect(svg.classList.contains('opacity-[0.04]')).toBe(true);
    expect(svg.classList.contains('opacity-[0.12]')).toBe(false);
  });

  it('renders identical geometry every time', () => {
    // The outlines are a fixed table put through a fixed transform, with nothing random
    // anywhere, precisely so the server and the client agree. If this ever fails, every page
    // carrying the texture has a hydration mismatch.
    //
    // The pattern id is excluded: `useId` hands each instance its own, which is the point of
    // using it, and React derives it from the position in the tree so it matches across the
    // server/client boundary. Geometry is what has to be deterministic.
    const strokeIds = (html: string) => html.replace(/topo-:[^"')]+/g, 'topo-id');

    const first = strokeIds(render(<TopoBackground />).container.innerHTML);
    const second = strokeIds(render(<TopoBackground />).container.innerHTML);

    expect(first).toBe(second);
  });
});

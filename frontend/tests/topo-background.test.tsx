import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { TopoBackground } from '@/components/candy/topo-background';

describe('TopoBackground', () => {
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
    // 8%, not the brief's 5%: a 1px stroke at 5% over #09090B was invisible on a real screen.
    const { container } = render(<TopoBackground />);

    expect(container.querySelector('svg')!.classList.contains('opacity-[0.08]')).toBe(true);
  });

  it('lets a className override the default opacity', () => {
    // Quieter inside ticket cards than behind a hero, so opacity has to be overridable rather
    // than baked in. `cn` has to drop the default, not merely append to it.
    const { container } = render(<TopoBackground className="opacity-[0.04] text-ink" />);
    const svg = container.querySelector('svg')!;

    expect(svg.classList.contains('opacity-[0.04]')).toBe(true);
    expect(svg.classList.contains('opacity-[0.08]')).toBe(false);
  });

  it('renders identical markup every time', () => {
    // The contour wobble is a sum of sines, not Math.random, precisely so the server and the
    // client agree. If this ever fails, every page carrying the texture has a hydration
    // mismatch.
    const first = render(<TopoBackground />).container.innerHTML;
    const second = render(<TopoBackground />).container.innerHTML;

    expect(first).toBe(second);
  });
});

/**
 * The `/showcase` scene's page chrome — not the scene. jsdom has no WebGL, so the canvas and
 * everything three.js draws are stubbed out; the car's framing is verified in a browser by
 * projecting vertices (CLAUDE.md, "Verifying a camera means projecting vertices").
 */

import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import F1CarShowcase from '@/components/3d/f1-car-showcase';
import { focusRing } from '@/lib/focus';

vi.mock('@react-three/fiber', () => ({
  Canvas: () => <div data-testid="canvas" />,
}));
vi.mock('@/components/3d/fit-camera', () => ({ FitCamera: () => null }));
vi.mock('@/components/3d/f1-car-model', () => ({
  CAR_SHADOW_NORMAL_BIAS: 0,
  PrimitiveCar: () => null,
  RealCar: () => null,
}));

describe('F1CarShowcase', () => {
  it('has no back link of its own: the site nav above it replaces it', () => {
    // It was the only way off the route before the route had a nav. Beside the nav's wordmark,
    // which goes to the same place, it is a second home link in the first screen.
    render(<F1CarShowcase />);

    expect(screen.queryByRole('link', { name: /back to briefing agent/i })).toBeNull();
  });

  it('keeps the page heading and the credits link at the foot', () => {
    render(<F1CarShowcase />);

    expect(screen.getByRole('heading', { level: 1, name: /car showcase/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /view credits/i })).toHaveAttribute('href', '/credits');
  });

  it('gives the credits link at the foot the branch ring', () => {
    // It had no focus treatment at all and fell through to the browser's own outline — the one
    // control on the route the focus sweep found once `/showcase` joined it. Text on bare
    // `zinc-950`, so the flush ring, as on `/credits`' own prose links.
    render(<F1CarShowcase />);

    const link = screen.getByRole('link', { name: /view credits/i });
    for (const token of focusRing.split(' ')) expect(link).toHaveClass(token);
  });
});

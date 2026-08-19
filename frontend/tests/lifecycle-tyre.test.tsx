import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ActLifecycle } from '@/components/tyres/acts/act-lifecycle';
import {
  LIFECYCLE,
  LIFECYCLE_COUNT,
  THERMAL_LABEL,
} from '@/components/tyres/lifecycle/lifecycle-data';

/*
 * The lifecycle's *headline* requirement, which the behavioural act-lifecycle.test.tsx does not
 * pin: the aged tyre is the Pirelli **photograph**, not the drawn-SVG engine, and each stage
 * drives the exact wear/thermal figures the page's copy is written against. act-lifecycle.test.tsx
 * asserts the image's accessible name but never its *source*, so a silent regression back to the
 * SVG hero (or to a different asset) would sail past it — this file is that guard.
 *
 * Reduced motion is exercised through the repo's standard partial-mock of `motion/react` over a
 * mutable flag (see redacted-reveal.test.tsx for why matchMedia cannot drive it). The lifecycle's
 * whole design is that the *rendered tree is identical* with motion on or off — only the animation
 * values differ — so the reduced branch is verified by rendering the full content and controls,
 * not by asserting a class.
 */

let reduceMotion = false;

vi.mock('motion/react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('motion/react')>();
  return { ...actual, useReducedMotion: () => reduceMotion };
});

beforeEach(() => {
  reduceMotion = false;
});

/** The stages the page's wear/thermal narrative is written against, with their canonical targets. */
const KEY_STAGES = [
  { id: 'preparation', wear: 0, pct: 0, thermal: 'cold' as const },
  { id: 'prescriptions', wear: 0.05, pct: 5, thermal: 'optimal' as const },
  { id: 'formation-lap', wear: 0.1, pct: 10, thermal: 'optimal' as const },
  { id: 'stint', wear: 0.45, pct: 45, thermal: 'hot' as const },
  { id: 'pit-stop', wear: 0.8, pct: 80, thermal: 'hot' as const },
  { id: 'after', wear: 1, pct: 100, thermal: 'cold' as const },
];

describe('lifecycle tyre — photographic base', () => {
  it('uses the Pirelli soft.webp photograph as the persistent base image', () => {
    render(<ActLifecycle />);
    const img = screen.getByRole('img');
    // next/image rewrites a non-SVG src through its loader (…/_next/image?url=%2Ftyres%2Fsoft.webp…);
    // decode before matching so the assertion is about the asset, not the loader's encoding.
    const src = decodeURIComponent(img.getAttribute('src') ?? '');
    expect(src).toContain('/tyres/soft.webp');
    expect(img.tagName).toBe('IMG');
  });

  it('does not render the drawn-SVG tyre engine inside the lifecycle', () => {
    const { container } = render(<ActLifecycle />);
    // The SVG tyre artwork (TyreVisual / lab tyre body) is the only thing that paints a sidewall
    // band; its absence means the lifecycle is not falling back to the generated illustration.
    expect(container.querySelector('[data-testid="tyre-sidewall"]')).toBeNull();
    // Exactly one accessible image, and it is a raster <img>, never an inline <svg role="img">.
    expect(screen.getAllByRole('img')).toHaveLength(1);
  });

  it('describes the tyre image by the active stage so it never reads as generic decoration', () => {
    render(<ActLifecycle />);
    // First stage is active on mount; the name must be in the accessible description.
    expect(screen.getByRole('img')).toHaveAccessibleName(
      new RegExp(`${LIFECYCLE[0]!.stage.name}`, 'i'),
    );
  });
});

describe('lifecycle tyre — canonical wear and thermal targets', () => {
  it('holds the authoritative wear/thermal values in the data', () => {
    const byId = Object.fromEntries(LIFECYCLE.map((e) => [e.stage.id, e.visual]));
    for (const { id, wear, thermal } of KEY_STAGES) {
      expect(byId[id]?.wear).toBeCloseTo(wear, 5);
      expect(byId[id]?.thermal).toBe(thermal);
    }
  });

  it('renders each key stage’s wear percentage paired with its thermal label', () => {
    render(<ActLifecycle />);
    for (const { pct, thermal } of KEY_STAGES) {
      const label = THERMAL_LABEL[thermal];
      // The card chip reads e.g. "Wear 45% · Hot"; tolerate the separator, pin the pairing.
      const matches = screen.getAllByText(new RegExp(`Wear ${pct}%.*${label}`));
      expect(matches.length).toBeGreaterThan(0);
    }
  });
});

describe('lifecycle tyre — reduced motion', () => {
  it('renders the whole tree — content, controls and the single photo — with motion reduced', () => {
    reduceMotion = true;
    render(<ActLifecycle />);

    // Every stage's heading and concise summary is still present…
    for (const { stage, visual } of LIFECYCLE) {
      expect(screen.getByRole('heading', { level: 3, name: stage.name })).toBeInTheDocument();
      expect(screen.getByText(visual.summary)).toBeInTheDocument();
    }
    // …the full navigation is still operable…
    expect(screen.getByRole('button', { name: 'Previous stage' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Next stage' })).toBeInTheDocument();
    // The visible digit is aria-hidden; each stepper button's accessible name is its sr-only
    // "Step X of N: name", so match on the accessible name rather than textContent.
    expect(screen.getAllByRole('button', { name: /^Step \d+ of \d+:/ })).toHaveLength(
      LIFECYCLE_COUNT,
    );
    // …and the photograph is still the one and only lifecycle image.
    expect(screen.getAllByRole('img')).toHaveLength(1);
    const src = decodeURIComponent(screen.getByRole('img').getAttribute('src') ?? '');
    expect(src).toContain('/tyres/soft.webp');
  });
});

import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  LandingSectionTheme,
  TONE_TRANSITION_MS,
} from '@/components/landing/landing-section-theme';

// The only recipe verified to work in this repo for driving reduced motion. `useReducedMotion`
// caches its answer in a module-global on first call and queries `(prefers-reduced-motion)` — not
// the `: reduce` variant `tests/setup.ts` stubs `matchMedia` with — so overriding `matchMedia`
// cannot drive it. Partial-mocking the module and flipping this flag is the only way.
// `useReducedMotionSafe` wraps motion's hook precisely so this keeps working.
let reduceMotion = false;

vi.mock('motion/react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('motion/react')>();
  return { ...actual, useReducedMotion: () => reduceMotion };
});

beforeEach(() => {
  reduceMotion = false;
});

/**
 * `tests/setup.ts`'s stub reports everything as immediately intersecting — it invokes the callback
 * synchronously inside `observe()` and never again. That is enough to observe the *entry* edge,
 * which is the whole of the "in view" branch, but it means nothing here can test the exit edge:
 * there is no way to make the stub report `isIntersecting: false`. Where a test needs to prove a
 * class did **not** come from the observer, it installs `NeverFires` below instead, so the only
 * remaining source of the class is the branch under test.
 */
class NeverFires implements IntersectionObserver {
  readonly root = null;
  readonly rootMargin = '';
  readonly thresholds: ReadonlyArray<number> = [];
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
  takeRecords(): IntersectionObserverEntry[] {
    return [];
  }
}

function withNeverFiringObserver(run: () => void) {
  const real = globalThis.IntersectionObserver;
  globalThis.IntersectionObserver = NeverFires;
  try {
    run();
  } finally {
    globalThis.IntersectionObserver = real;
  }
}

describe('LandingSectionTheme', () => {
  it('renders its children and the tone it was assigned', () => {
    render(
      <LandingSectionTheme tone="base-warm">
        <p>section content</p>
      </LandingSectionTheme>,
    );

    expect(screen.getByText('section content')).toBeInTheDocument();
    // The tone is exposed as an attribute because it is *not* derivable from the class — a warm
    // section renders `bg-base` until it is in view — so this is the only way a caller's
    // assignment can be asserted rather than its current animation state.
    expect(screen.getByText('section content').parentElement).toHaveAttribute(
      'data-landing-tone',
      'base-warm',
    );
  });

  it('warms a `base-warm` section once the observer reports it in view', () => {
    const { container } = render(
      <LandingSectionTheme tone="base-warm">
        <p>warm</p>
      </LandingSectionTheme>,
    );
    const wrapper = container.firstElementChild;

    // The setup stub reports intersection synchronously, so by the time render returns the effect
    // has run and the class has settled.
    expect(wrapper).toHaveClass('bg-base-warm');
    expect(wrapper).not.toHaveClass('bg-base');
  });

  it('leaves a `base` section on `base` even though the observer reports it in view', () => {
    // The negative case, and it is not vacuous: the stub reports *every* observed element as
    // intersecting, so a component that warmed on intersection regardless of its assigned tone
    // would paint the whole page warm and pass every other test in this file.
    const { container } = render(
      <LandingSectionTheme tone="base">
        <p>cool</p>
      </LandingSectionTheme>,
    );

    expect(container.firstElementChild).toHaveClass('bg-base');
    expect(container.firstElementChild).not.toHaveClass('bg-base-warm');
  });

  it('stays on `base` while a warm section is out of view', () => {
    // With an observer that never fires, `inView` never becomes true — so this pins the *resting*
    // state a warm section transitions from. If the component ever started rendering `bg-base-warm`
    // eagerly, the 600 ms transition would have nothing to animate and would silently disappear.
    withNeverFiringObserver(() => {
      const { container } = render(
        <LandingSectionTheme tone="base-warm">
          <p>not yet</p>
        </LandingSectionTheme>,
      );

      expect(container.firstElementChild).toHaveClass('bg-base');
      expect(container.firstElementChild).not.toHaveClass('bg-base-warm');
    });
  });

  it('transitions background-color over the spec’s 600 ms, and only background-color', () => {
    const { container } = render(
      <LandingSectionTheme tone="base-warm">
        <p>warm</p>
      </LandingSectionTheme>,
    );
    const wrapper = container.firstElementChild;

    /*
     * Built from the exported constant rather than retyped, so the class and the number cannot
     * drift apart.
     *
     * **Read this before trusting it.** An assertion that a class is *present* cannot show the
     * class *does* anything, and that gap already bit: this shipped as `duration-[600ms]`, passed
     * here, and rendered at 150 ms, because Tailwind in this project emits the standard duration
     * steps and not arbitrary ones — so no rule containing `600ms` was ever generated and the
     * wrapper fell through to the duration `transition-[background-color]` sets for itself. jsdom
     * computes no CSS, so nothing in this file could have caught it; it took reading
     * `transitionDuration` off a live element in Chromium. The fix was a real `duration-600` token
     * in `tailwind.config.ts`. If this class changes shape again, verify in a browser, not here.
     */
    expect(wrapper).toHaveClass(`duration-${TONE_TRANSITION_MS}`);
    // `transition-[background-color]`, not `transition-colors`: the latter would also animate
    // `color`, `border-color`, `fill` and `stroke` the moment one of those is added to a wrapper.
    expect(wrapper).toHaveClass('transition-[background-color]');
    expect(wrapper).not.toHaveClass('transition-colors');
  });

  it('does not transition a `base` section, which never changes colour', () => {
    const { container } = render(
      <LandingSectionTheme tone="base">
        <p>cool</p>
      </LandingSectionTheme>,
    );

    expect(container.firstElementChild).not.toHaveClass('transition-[background-color]');
  });

  describe('reduced motion', () => {
    it('applies the warm tone with no transition and no observer', () => {
      // Both halves matter. A 600 ms scroll-triggered colour crossfade is exactly what the
      // preference asks us to drop — but dropping the *tone* with it would flatten the page's
      // alternation for those users, which is a design change, not an accessibility one. So the
      // section is simply painted warm from the start.
      //
      // The never-firing observer is what makes this assertion mean something: with the setup
      // stub, `bg-base-warm` could have come from the observer firing anyway. Here the only
      // possible source is the reduced-motion branch.
      reduceMotion = true;

      withNeverFiringObserver(() => {
        const { container } = render(
          <LandingSectionTheme tone="base-warm">
            <p>warm</p>
          </LandingSectionTheme>,
        );
        const wrapper = container.firstElementChild;

        expect(wrapper).toHaveClass('bg-base-warm');
        expect(wrapper).not.toHaveClass('transition-[background-color]');
        expect(wrapper).not.toHaveClass(`duration-${TONE_TRANSITION_MS}`);
      });
    });

    it('still renders its children', () => {
      reduceMotion = true;
      render(
        <LandingSectionTheme tone="base-warm">
          <p>section content</p>
        </LandingSectionTheme>,
      );

      expect(screen.getByText('section content')).toBeInTheDocument();
    });
  });
});

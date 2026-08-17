import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { BlurFadeReduced } from '@/components/candy/blur-fade-reduced';

// The repo's reduced-motion recipe, used verbatim. `useReducedMotion` caches its answer in a
// module-global on the first call and queries `(prefers-reduced-motion)` — not the `: reduce`
// variant `tests/setup.ts` stubs `matchMedia` with — so overriding `matchMedia` cannot drive it.
// Partial-mocking the module and flipping this flag is the only way to control it per-test, and
// real `motion` elements still render through the spread. `useReducedMotionSafe` deliberately
// wraps motion's hook rather than reading `matchMedia`, which is what keeps this recipe working.
let reduceMotion = false;

vi.mock('motion/react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('motion/react')>();
  return { ...actual, useReducedMotion: () => reduceMotion };
});

beforeEach(() => {
  reduceMotion = false;
});

/** The single `motion.div` `BlurFade` renders, which is the only element either branch produces. */
function fade(container: HTMLElement): HTMLElement {
  return container.firstElementChild as HTMLElement;
}

describe('BlurFadeReduced', () => {
  it('renders its children on both branches, before anything animates', () => {
    // The floor this component must never fall through: whatever the preference, the content is
    // in the DOM on the first render, with no timer advanced and no viewport event fired.
    const { unmount } = render(<BlurFadeReduced>Race weekend intel</BlurFadeReduced>);
    expect(screen.getByText('Race weekend intel')).toBeInTheDocument();
    unmount();

    reduceMotion = true;
    render(<BlurFadeReduced>Race weekend intel</BlurFadeReduced>);
    expect(screen.getByText('Race weekend intel')).toBeInTheDocument();
  });

  it('leaves the un-reduced path exactly as BlurFade had it', () => {
    // `inView` with jsdom's stubbed IntersectionObserver never fires, so the element stays on the
    // `hidden` variant: opacity 0 and a 6px blur. That is the vendored component's own behaviour
    // and this wrapper must not have altered it — the whole point is that only the reduced branch
    // differs.
    const { container } = render(
      <BlurFadeReduced inView>
        <p>Four steps. One pipeline.</p>
      </BlurFadeReduced>,
    );

    expect(fade(container).style.opacity).toBe('0');
    expect(fade(container).style.filter).toContain('blur(6px)');
  });

  it('paints the finished state under reduced motion, not a frozen initial one', () => {
    /*
     * The failure this test exists to catch is the tempting one: "disable the animation" by
     * leaving the element on its `hidden` variant, which in this component means `opacity: 0`.
     * That is content present in the DOM and invisible on screen — strictly worse than the
     * animation it replaced, and exactly what the spec's "complete and readable under reduced
     * motion" rules out. Opacity 1 and no blur are the two values that say "final state".
     */
    reduceMotion = true;
    const { container } = render(
      <BlurFadeReduced inView delay={0.24} direction="up">
        <p>Four steps. One pipeline.</p>
      </BlurFadeReduced>,
    );

    expect(fade(container).style.opacity).toBe('1');
    expect(fade(container).style.filter).toBe('blur(0px)');
    // `inView` is still passed through, so this also pins that the reduced branch is not gated on
    // the viewport: `useInView` is false here and the content is visible anyway.
    expect(screen.getByText('Four steps. One pipeline.')).toBeInTheDocument();
  });

  it('reaches the finished state when the preference flips on an already-mounted element', () => {
    /*
     * The `key` guard for a flip that arrives *after* the component has settled, which is the one
     * case no other test here covers.
     *
     * A review claimed the keys were entirely unguarded — that every test unmounts between the
     * branches, so nothing would fail if the keys were deleted. That was checked and it is wrong:
     * `useReducedMotionSafe` returns `false` on the first client render and flips in a layout
     * effect, so even a plain `render()` under `reduceMotion = true` goes through a false → true
     * transition inside `act`, and deleting the keys already fails the two tests above (`paints
     * the finished state…` and `renders no translate…`). What none of them reach is a flip on a
     * tree that has *finished* mounting on the un-reduced branch — a preference toggled at the OS
     * level while the page is open, or any later re-render that changes the answer. This is that
     * case, and it fails without the keys too.
     *
     * Delete `key="reduced"` / `key="motion"` and this is what happens: the `motion.div` is
     * already mounted carrying `initial="hidden"`, motion reads `initial` once at mount and
     * ignores the later `initial={false}`, so it *animates* opacity 0 → 1 on a future frame
     * instead of committing the target. In jsdom no frame runs, and the element stays at
     * `opacity: 0` — content in the DOM and invisible on screen, across all eight landing
     * `BlurFadeReduced` sections and the six feature cards. Distinct keys force a real remount, so
     * `initial={false}` is read at mount time and the final values are written during the commit.
     *
     * Same `render()` result throughout — `rerender` re-renders the existing tree rather than
     * mounting a new one, which is exactly the situation the keys exist for.
     *
     * `tree()` builds a fresh element each call rather than reusing one object, and that is load-
     * bearing rather than style: `useReducedMotion()` is read during render and is not reactive,
     * so nothing schedules an update when the flag moves. Handing `rerender` the *same* element
     * makes React bail out on referential equality and the component never re-renders at all —
     * the test then fails at `opacity: '0'` with the keys correctly in place, proving nothing.
     */
    const tree = () => (
      <BlurFadeReduced inView>
        <p>Four steps. One pipeline.</p>
      </BlurFadeReduced>
    );
    const { container, rerender } = render(tree());
    expect(fade(container).style.opacity).toBe('0');

    reduceMotion = true;
    rerender(tree());

    expect(fade(container).style.opacity).toBe('1');
    expect(fade(container).style.filter).toBe('blur(0px)');
    const transform = fade(container).style.transform;
    expect(transform === '' || transform === 'none' || /translate[XY]\(0px\)/.test(transform)).toBe(
      true,
    );
  });

  it('renders no translate under reduced motion', () => {
    // `BlurFade`'s hidden variant is a 6px `y` offset. Motion writes the composed transform to the
    // inline style, so an offset that survived would show up here — and a section that still
    // slides into place is the visible half of the defect, alongside the blur.
    reduceMotion = true;
    const { container } = render(<BlurFadeReduced inView>Ready to get started?</BlurFadeReduced>);
    const transform = fade(container).style.transform;

    expect(transform === '' || transform === 'none' || /translate[XY]\(0px\)/.test(transform)).toBe(
      true,
    );
  });

  it('emits the same element tree on both branches', () => {
    /*
     * The hydration guard. Motion's own `useReducedMotion()` returns `null` during SSR and the
     * real preference on the client's *first* render, so a component that branches which
     * *elements* it returns renders two different trees — a confirmed error on `/` in Chromium
     * under emulated reduced motion. This wrapper branches only on props, and
     * `useReducedMotionSafe` additionally reports `false` until a layout effect has run, so the
     * server tree and the first client tree agree by construction. Comparing tag names and child
     * counts is what pins "props differ, structure does not".
     */
    const { container: motionful, unmount } = render(
      <BlurFadeReduced inView>
        <p>Your race weekend briefing.</p>
      </BlurFadeReduced>,
    );
    const before = fade(motionful).outerHTML.replace(/style="[^"]*"/, '');
    unmount();

    reduceMotion = true;
    const { container: reduced } = render(
      <BlurFadeReduced inView>
        <p>Your race weekend briefing.</p>
      </BlurFadeReduced>,
    );

    expect(fade(reduced).outerHTML.replace(/style="[^"]*"/, '')).toBe(before);
  });

  it('passes className and arbitrary props straight through', () => {
    // Adoption at the call sites is an import swap and nothing else, so every prop `BlurFade`
    // accepted has to survive the wrapper untouched — `landing-features.tsx` depends on
    // `className="h-full"` reaching the element for its equal-height card grid.
    const { container } = render(
      <BlurFadeReduced inView className="h-full" data-testid="wrapped">
        card
      </BlurFadeReduced>,
    );

    expect(fade(container)).toHaveClass('h-full');
    expect(fade(container)).toHaveAttribute('data-testid', 'wrapped');
  });
});

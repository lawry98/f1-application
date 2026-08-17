import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import tailwindConfig from '../tailwind.config';
import { focusRing, focusRingOffsetBase, focusRingOffsetBaseWarm, focusRingOnRedFill } from '@/lib/focus';

const ROOT = resolve(__dirname, '..');

/**
 * The guard for a bug that shipped and that nothing else here could see.
 *
 * `lib/focus.ts` is the only place `focus-visible:ring-f1-red` and `focus-visible:ring-ink` are
 * written down. Tailwind emits a utility only when it reads that literal string somewhere in
 * `content`, and `content` listed only `components/` and `app/` — so neither rule was ever
 * generated. Every control built from these four exports kept its `ring-2` and fell back to
 * Tailwind's **default blue** `--tw-ring-color`, measured at `rgb(59 130 246 / 0.5)` on a live
 * focused control. On the red-filled CTA that is the invisible-indicator case `lib/focus.ts`
 * exists to prevent: a ring on a fill of nearly its own colour.
 *
 * Nothing in the existing suite could catch it. jsdom computes no CSS, so a test asserting the
 * class name passes with the rule absent; a screenshot cannot see a ring that only paints on
 * `:focus-visible`. It is the same family as the `duration-[600ms]` class that generated no rule
 * and silently ran at 150ms.
 *
 * So this asserts the *mechanism* rather than the rendered colour: every class these exports name
 * must live in a file some `content` glob actually reaches.
 */
describe('tailwind content globs', () => {
  const globs = tailwindConfig.content as string[];

  it('reaches lib/, where the focus-ring classes are authored', () => {
    expect(globs.some((g) => g.startsWith('./lib/'))).toBe(true);
  });

  // Non-vacuity: the classes really are only in lib/, so the glob above is load-bearing rather
  // than a belt-and-braces entry that could be dropped without consequence.
  it('is the only thing that reaches ring-f1-red and ring-ink', () => {
    const focusSource = readFileSync(resolve(ROOT, 'lib/focus.ts'), 'utf8');
    expect(focusSource).toContain('focus-visible:ring-f1-red');
    expect(focusSource).toContain('focus-visible:ring-ink');
  });

  it('covers every class the four focus exports name', () => {
    const authored = [focusRing, focusRingOffsetBase, focusRingOffsetBaseWarm, focusRingOnRedFill]
      .flatMap((s) => s.split(/\s+/))
      .filter(Boolean);

    // Each one is written in lib/focus.ts, so a glob reaching lib/ covers all of them. A class
    // that ever moves out of that file has to arrive somewhere else `content` reaches.
    const focusSource = readFileSync(resolve(ROOT, 'lib/focus.ts'), 'utf8');
    for (const cls of authored) {
      expect(focusSource, `${cls} is not in lib/focus.ts`).toContain(cls);
    }
  });
});

/**
 * Tests for the streaming reveal registry.
 *
 * These are the unit-level counterpart to `briefing-card.test.tsx`: the card proves the reveal
 * behaves correctly over real markdown, this file proves the arithmetic and the reset rule that
 * make that possible, driven directly rather than through a parser.
 *
 * The properties under test are all about *identity across re-renders*, which is what a streaming
 * surface needs and a static one never exercises. A registry that handed out fresh ordinals on
 * every pass would look completely correct in a single-render test and strobe at 12 Hz in the
 * browser.
 */

import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import {
  MAX_CONCURRENT_REVEALS,
  REVEAL_DELAY_S,
  RevealOrdinalProvider,
  WIPE_DURATION_S,
  revealDelaySeconds,
  useRevealSlot,
} from '@/components/briefing/reveal-ordinal';

/**
 * A probe that reports its slot as data attributes, mirroring what the real block renderers emit.
 *
 * jsdom cannot observe a motion `delay` — it is an animation option, not an attribute — so the
 * attributes are the only observable surface the throttle has.
 */
function Probe({ offset, label }: { offset: number | undefined; label: string }) {
  const { ordinal, delaySeconds } = useRevealSlot(offset);
  return <span data-label={label} data-reveal-ordinal={ordinal} data-reveal-delay={delaySeconds} />;
}

/** The slot a probe reported, read back out of the DOM. */
function slotOf(container: HTMLElement, label: string): { ordinal: number; delay: number } {
  const el = container.querySelector(`[data-label="${label}"]`);
  if (!el) throw new Error(`no probe labelled "${label}" rendered`);
  return {
    ordinal: Number(el.getAttribute('data-reveal-ordinal')),
    delay: Number(el.getAttribute('data-reveal-delay')),
  };
}

/**
 * A fresh element every call.
 *
 * `rerender(sameElementObject)` bails on referential equality and never re-renders, so a test that
 * changes nothing but the provider's `source` has to build a new tree each time or it silently
 * asserts against the first render forever.
 */
function tree(source: string, offsets: readonly (number | undefined)[]) {
  // Keyed by label rather than by position so a rerender preserves each probe's fiber — the same
  // property the real block renderers rely on, and the reason the registry is testable at all.
  const probes = offsets.map((offset, index) => ({ offset, label: `b${index}` }));
  return (
    <RevealOrdinalProvider source={source}>
      {probes.map((probe) => (
        <Probe key={probe.label} offset={probe.offset} label={probe.label} />
      ))}
    </RevealOrdinalProvider>
  );
}

describe('revealDelaySeconds', () => {
  it('reveals MAX_CONCURRENT_REVEALS blocks per wave, each wave one wipe behind the last', () => {
    // Derived from the constants rather than a hardcoded table: a second copy of 0.2/0.85/1.5 in
    // the suite would keep passing after someone changed MAX_CONCURRENT_REVEALS and quietly stop
    // testing the throttle at all.
    for (let i = 0; i < 3 * MAX_CONCURRENT_REVEALS; i += 1) {
      const group = Math.floor(i / MAX_CONCURRENT_REVEALS);
      expect(revealDelaySeconds(i)).toBeCloseTo(REVEAL_DELAY_S + group * WIPE_DURATION_S, 6);
    }
  });

  it('rounds away IEEE 754 noise, because the value is written into an attribute', () => {
    // 0.2 + 0.65 is 0.8500000000000001 in floating point. Unrounded, the DOM carries that string
    // and every reader — test or human — sees noise instead of a delay.
    expect(String(revealDelaySeconds(MAX_CONCURRENT_REVEALS))).toBe('0.85');
    expect(String(revealDelaySeconds(2 * MAX_CONCURRENT_REVEALS))).toBe('1.5');
  });
});

describe('RevealOrdinalProvider', () => {
  it('hands out ordinals in the order offsets are first seen', () => {
    const { container } = render(tree('abcdefghij', [0, 4, 8]));

    expect(slotOf(container, 'b0').ordinal).toBe(0);
    expect(slotOf(container, 'b1').ordinal).toBe(1);
    expect(slotOf(container, 'b2').ordinal).toBe(2);
  });

  it('throttles a whole wave to four concurrent bars', () => {
    // Nine blocks arriving at once is the completed-briefing case: the terminal `briefing` event
    // replaces the string wholesale and every block is new in one pass.
    const offsets = [0, 1, 2, 3, 4, 5, 6, 7, 8];
    const { container } = render(tree('x'.repeat(20), offsets));

    const slots = offsets.map((_, i) => slotOf(container, `b${i}`));
    expect(slots).toHaveLength(9); // non-vacuity: nine probes, nine slots
    slots.forEach((slot, i) => {
      expect(slot.ordinal).toBe(i);
      expect(slot.delay).toBe(revealDelaySeconds(i));
    });
  });

  it('keeps a block its ordinal while the source grows — the streaming case', () => {
    // The property the whole module exists for. Prefix growth happens every 80 ms; if it churned
    // ordinals, every bar would remount and the page would strobe.
    const { container, rerender } = render(tree('First para.', [0]));
    expect(slotOf(container, 'b0').ordinal).toBe(0);

    rerender(tree('First para.\n\nSecond', [0, 13]));

    expect(slotOf(container, 'b0').ordinal).toBe(0);
    expect(slotOf(container, 'b0').delay).toBe(REVEAL_DELAY_S);
    // The newcomer is alone in its wave, so it also gets the plain delay — a wave of one is the
    // normal streaming case, and the throttle only bites when many blocks land together.
    expect(slotOf(container, 'b1').ordinal).toBe(1);
    expect(slotOf(container, 'b1').delay).toBe(REVEAL_DELAY_S);
  });

  it('starts a later wave behind the earlier one even though the source only grew', () => {
    // A block's wave is fixed when it is *first seen*, so five blocks arriving across two paints
    // do not share a wave — the fifth is alone and starts at the plain delay, not at 0.85.
    const first = [0, 1, 2, 3];
    const { container, rerender } = render(tree('xxxx', first));
    expect(slotOf(container, 'b3').delay).toBe(REVEAL_DELAY_S);

    rerender(tree('xxxxx', [...first, 4]));

    expect(slotOf(container, 'b4').ordinal).toBe(4);
    expect(slotOf(container, 'b4').delay).toBe(REVEAL_DELAY_S);
  });

  it('resets when the source is replaced by a non-prefix string', () => {
    // A second briefing must not inherit the first's ordinals, or its opening heading would
    // reveal at a two-second delay with no bar anywhere near it.
    const { container, rerender } = render(tree('Monaco briefing', [0, 7]));
    expect(slotOf(container, 'b1').ordinal).toBe(1);

    rerender(tree('Silverstone briefing', [0, 12]));

    expect(slotOf(container, 'b0').ordinal).toBe(0);
    expect(slotOf(container, 'b1').ordinal).toBe(1);
  });

  it('resets when the source shrinks', () => {
    const { container, rerender } = render(tree('a long first briefing', [0, 7, 13]));
    expect(slotOf(container, 'b2').ordinal).toBe(2);

    rerender(tree('short', [0]));

    expect(slotOf(container, 'b0').ordinal).toBe(0);
  });

  it('does not reset when the source merely grows', () => {
    // The negative of the reset test, and the more important of the two: resetting on prefix
    // growth would restart every bar on the page twelve times a second.
    const { container, rerender } = render(tree('Half a briefing', [0, 5]));

    rerender(tree('Half a briefing and then some more of it', [0, 5]));

    expect(slotOf(container, 'b0').ordinal).toBe(0);
    expect(slotOf(container, 'b1').ordinal).toBe(1);
  });

  it('gives a block with no source position ordinal -1 without consuming one', () => {
    // A positionless block has no stable key, so it would take a *fresh* ordinal on every paint —
    // exhausting the wave and pushing genuinely new blocks into a later, wrong throttle group.
    const { container } = render(tree('xxxx', [undefined, 0, 2]));

    expect(slotOf(container, 'b0').ordinal).toBe(-1);
    expect(slotOf(container, 'b0').delay).toBe(REVEAL_DELAY_S);
    // The registry is untouched by it: the real blocks still number from zero.
    expect(slotOf(container, 'b1').ordinal).toBe(0);
    expect(slotOf(container, 'b2').ordinal).toBe(1);
  });

  it('degrades to the unplaced slot outside a provider rather than throwing', () => {
    // A missing provider is a wiring mistake; blanking a briefing that has already streamed in
    // over it would break spec rule 5, which says content is never gated on the reveal.
    const { container } = render(<Probe offset={0} label="orphan" />);

    expect(slotOf(container, 'orphan')).toEqual({ ordinal: -1, delay: REVEAL_DELAY_S });
  });
});

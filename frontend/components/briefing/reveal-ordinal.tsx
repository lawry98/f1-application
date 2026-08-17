'use client';

import * as React from 'react';

/**
 * Arrival-order bookkeeping for the declassified streaming reveal.
 *
 * `BriefingCard` renders one `ReactMarkdown` over a string that *grows* — `hooks/use-briefing.ts`
 * accumulates SSE deltas in a ref and repaints at most every 80 ms, so a 500–1500 delta briefing
 * re-parses its whole markdown source ~12 times a second. Every one of those parses produces the
 * same blocks in the same order with the same source offsets, plus (occasionally) one more.
 *
 * That stability is the only thing that makes a redaction bar over streaming prose possible. A bar
 * is a mount-time animation: if a block's identity churned between paints, React would remount it,
 * the bar would restart, and the page would strobe at 12 Hz. So block identity here is the block's
 * **source start offset** — not a render-order counter, which resets on every pass and therefore
 * cannot tell a block that has been on screen for two seconds from one that just arrived.
 *
 * Two rejected alternatives, both tried on paper first:
 *
 * - *A counter incremented per renderer call.* It has no memory across passes, so every block looks
 *   new on every paint and the throttle below degenerates to "everything at delay 0.2".
 * - *A `useRef` inside each renderer.* react-markdown recreates the element tree each parse; the
 *   renderers are stable component *types* but their fibers are only preserved because the blocks
 *   are positionally stable, which is the same property this registry keys on — except a per-block
 *   ref cannot answer "how many blocks arrived in this same wave", which rule 4's throttle needs.
 *
 * Deliberately generic: nothing here knows about markdown, briefings or SSE. It is a map from a
 * monotonically-growing string's block offsets to (ordinal, delay) pairs.
 */

/** The spec's "~200 ms after the block mounts". */
export const REVEAL_DELAY_S = 0.2;

/**
 * The spec's "at most ~4 bar animations concurrently".
 *
 * Four is not a performance ceiling — motion animates a `scaleX` on a composited layer and a
 * hundred would be fine. It is a *legibility* ceiling: a completed briefing is 15–25 blocks, and
 * every bar wiping at once reads as the whole page flashing red rather than as a document being
 * declassified line by line.
 */
export const MAX_CONCURRENT_REVEALS = 4;

/**
 * `RedactedReveal`'s own wipe duration, duplicated here rather than imported.
 *
 * A concurrency slot is free once the bar occupying it has finished, so the throttle's step *is*
 * the wipe's length. `redacted-reveal.tsx` keeps its copy module-private (it is an animation
 * constant, not an API), and exporting it to satisfy this one call site would widen that
 * component's surface for a number that has been 0.65 since the kit shipped. If the wipe ever
 * changes, this constant changes with it — `reveals four blocks per wave, one wipe apart` in
 * `tests/reveal-ordinal.test.tsx` pins the relationship, not the value.
 */
export const WIPE_DURATION_S = 0.65;

export interface RevealSlot {
  /** 0-based index of this block in arrival order across the whole briefing. */
  ordinal: number;
  /** Seconds to pass to `RedactedReveal`'s `delay`. */
  delaySeconds: number;
}

/**
 * The delay for the `waveIndex`-th block of a single wave: four together, then a wipe's pause,
 * then four more.
 *
 * Exported because the test derives its expectations from this rather than from a hardcoded table
 * — a second copy of `0.2 / 0.85 / 1.5` in the suite would pass happily after someone changed
 * `MAX_CONCURRENT_REVEALS` and quietly stop testing the throttle.
 *
 * **The rounding is load-bearing, not cosmetic.** `0.2 + 0.65` is `0.8500000000000001` in IEEE 754,
 * and this number is emitted as a `data-reveal-delay` attribute — so without it the DOM carries
 * `"0.8500000000000001"` and any assertion, or any human reading the inspector, sees noise. Three
 * decimals is a millisecond, which is finer than any of these constants.
 */
export function revealDelaySeconds(waveIndex: number): number {
  const raw = REVEAL_DELAY_S + Math.floor(waveIndex / MAX_CONCURRENT_REVEALS) * WIPE_DURATION_S;
  return Math.round(raw * 1000) / 1000;
}

/**
 * The slot handed to a block with no source position, and to any block rendered outside a
 * provider.
 *
 * `ordinal: -1` rather than a real one: such a block must not consume an ordinal or enter the
 * registry, because it has no stable key and would take a *fresh* ordinal on every paint —
 * exhausting the wave and pushing every genuinely new block into a later, wrong throttle group.
 * It still gets the plain `REVEAL_DELAY_S`, so it reveals normally; the throttle is the only thing
 * it opts out of.
 */
const UNPLACED: RevealSlot = { ordinal: -1, delaySeconds: REVEAL_DELAY_S };

type SlotResolver = (startOffset: number | undefined) => RevealSlot;

const RevealOrdinalContext = React.createContext<SlotResolver | null>(null);

interface Registry {
  /** Source start offset → the slot that offset was first assigned. */
  slots: Map<number, RevealSlot>;
  /** The next ordinal to hand out. */
  nextOrdinal: number;
  /** Position within the *current* render pass's wave; reset by the provider's render body. */
  waveIndex: number;
  /** The source the registry was last reconciled against, for the reset check. */
  source: string;
}

export interface RevealOrdinalProviderProps {
  /**
   * The exact string being rendered. The provider cannot see it any other way — react-markdown's
   * renderers report offsets *into* it, but never the string itself — and without it the registry
   * has no way to know a second briefing has replaced the first.
   */
  source: string;
  children: React.ReactNode;
}

export function RevealOrdinalProvider({ source, children }: RevealOrdinalProviderProps) {
  const registryRef = React.useRef<Registry>({
    slots: new Map(),
    nextOrdinal: 0,
    waveIndex: 0,
    source: '',
  });
  const registry = registryRef.current;

  /*
   * Reset, **in render and against a ref — not in an effect.**
   *
   * An effect runs after the children have committed, which is one whole paint too late: the
   * renderers below read their ordinals during *this* pass, so an effect-based reset would hand
   * the first block of a brand-new briefing the ordinal the last block of the previous one had,
   * and only correct itself on the following flush.
   *
   * The condition is deliberately "not a prefix" rather than "not equal". Prefix growth *is* the
   * streaming case — it happens 12 times a second — and resetting on it would restart every bar on
   * the page every 80 ms, which is the exact failure this whole module exists to prevent. A
   * shorter string cannot be a prefix of a longer one, so `startsWith` alone would do; the length
   * comparison is kept because "the source shrank" and "the source changed identity" are two
   * different events (a new race, and a terminal `briefing` event that rewrites the text) and a
   * reader should not have to derive one from the other.
   */
  if (source.length < registry.source.length || !source.startsWith(registry.source)) {
    registry.slots.clear();
    registry.nextOrdinal = 0;
  }
  registry.source = source;
  // A wave is "the offsets first seen in this render pass". The provider renders before its
  // children, so its render body is the only place that can mark the boundary between passes.
  registry.waveIndex = 0;

  /*
   * Stable for the provider's whole life, which matters twice over: it is the context value, so an
   * unstable one would re-render every renderer on every paint for no reason, and the renderers
   * themselves are module constants in `briefing-card.tsx` precisely so React never remounts a
   * block mid-stream.
   *
   * It mutates the ref during the children's render. That is not React-pure, and under a
   * *discarded* concurrent render pass it would burn ordinals — but the failure mode is a block
   * revealing one throttle group later than it strictly needed to, whereas the alternative
   * (assigning ordinals in an effect) is wrong on every single paint. Slots are memoised per
   * offset, so the assignment is idempotent: a repeat render, including React 18 StrictMode's
   * double invoke, returns the slot already stored rather than allocating a second one.
   */
  const resolve = React.useCallback<SlotResolver>((startOffset) => {
    if (startOffset === undefined) return UNPLACED;

    const reg = registryRef.current;
    const known = reg.slots.get(startOffset);
    if (known) return known;

    const slot: RevealSlot = {
      ordinal: reg.nextOrdinal,
      delaySeconds: revealDelaySeconds(reg.waveIndex),
    };
    reg.nextOrdinal += 1;
    reg.waveIndex += 1;
    reg.slots.set(startOffset, slot);
    return slot;
  }, []);

  return <RevealOrdinalContext.Provider value={resolve}>{children}</RevealOrdinalContext.Provider>;
}

/**
 * The ordinal and reveal delay for the block starting at `startOffset` in the provider's source.
 *
 * Stable across re-parses: a paragraph that grows from 12 characters to 400 keeps the offset it
 * started at, so it keeps its slot, so its bar does not restart.
 *
 * Degrades rather than throws outside a provider. A missing provider is a wiring mistake, and the
 * worst it should cost is an unthrottled reveal — a thrown error would blank a briefing that had
 * already streamed in, which is the one outcome spec rule 5 forbids.
 */
export function useRevealSlot(startOffset: number | undefined): RevealSlot {
  const resolve = React.useContext(RevealOrdinalContext);
  return resolve ? resolve(startOffset) : UNPLACED;
}

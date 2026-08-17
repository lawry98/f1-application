/**
 * Tests for BriefingCard.
 *
 * Two contracts live here now.
 *
 * The original one: *whether* a truncated briefing tells the reader so, and where it says it.
 * ADR-0002 rejected an alarm-styled error in favour of a calm line beneath the prose.
 *
 * The new one, added with the declassified streaming reveal: the card wraps every top-level
 * markdown block in a redaction bar, **except** the block currently being written. That exception
 * is the whole feature. `hooks/use-briefing.ts` repaints at most every 80 ms over a string that
 * grows by a few characters each time, so a bar over the growing block would re-mount and re-wipe
 * ~12 times a second and the page would strobe. None of that is visible in a single render, which
 * is why most of what follows re-renders and compares.
 *
 * The class strings on the renderers are still deliberately not pinned — that would be testing
 * Tailwind. What is pinned is structure, ordinals, delays, ARIA and colour *ratios*.
 */

import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BriefingCard } from '@/components/briefing/briefing-card';
import {
  MAX_CONCURRENT_REVEALS,
  REVEAL_DELAY_S,
  revealDelaySeconds,
} from '@/components/briefing/reveal-ordinal';
import { contrastRatio } from '@/lib/team-utils';
import { ZINC, restingTextNeutrals } from './zinc';

/**
 * The reduced-motion recipe this repo uses everywhere. `window.matchMedia` cannot drive
 * `useReducedMotion` — motion caches the preference in a module global on first call and queries
 * `(prefers-reduced-motion)`, not `(prefers-reduced-motion: reduce)` — so the module is
 * partial-mocked over a mutable flag instead.
 */
let reduceMotion = false;

vi.mock('motion/react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('motion/react')>();
  return { ...actual, useReducedMotion: () => reduceMotion };
});

beforeEach(() => {
  reduceMotion = false;
});

const MARKER = /stopped early/i;

/** The card's own surface. Every neutral in it is judged against this, not against the page. */
const CARD_BG = '#18181b'; // bg-zinc-900

/** Four top-level blocks: h1, p, ul, p. The trailing paragraph is the one still being written. */
const STREAMING = [
  '# Race Weekend',
  '',
  'First paragraph.',
  '',
  '- alpha',
  '- beta',
  '',
  'Last paragraph still writing',
].join('\n');

/** Every element carrying a reveal slot, in document order. */
function blocks(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>('[data-reveal-ordinal]'));
}

/**
 * The redaction bars inside one block.
 *
 * `RedactedReveal`'s bar is the only `aria-hidden` node it emits, and it is `aria-hidden`
 * precisely because it is decoration over text that is already in the DOM (spec rule 5).
 */
function barsIn(el: HTMLElement): HTMLElement[] {
  return Array.from(el.querySelectorAll<HTMLElement>('[aria-hidden="true"]'));
}

function ordinalsOf(container: HTMLElement): number[] {
  return blocks(container).map((el) => Number(el.getAttribute('data-reveal-ordinal')));
}

/**
 * A factory, not a constant.
 *
 * `rerender(sameElementObject)` bails on referential equality and never re-renders, so a test that
 * flips `loading` and re-renders needs a fresh element each time or it silently asserts against
 * the first render.
 */
function card(props: { briefing: string; loading?: boolean; truncated?: boolean }) {
  return <BriefingCard race="Monaco Grand Prix" {...props} />;
}

describe('BriefingCard', () => {
  it('renders the briefing prose as markdown', () => {
    render(<BriefingCard race="Monaco Grand Prix" briefing={'## Overview\n\nTight and twisty.'} />);

    expect(screen.getByRole('heading', { name: 'Overview' })).toBeInTheDocument();
    expect(screen.getByText('Tight and twisty.')).toBeInTheDocument();
  });

  it('says nothing about truncation for a complete briefing', () => {
    render(<BriefingCard race="Monaco Grand Prix" briefing="Complete." truncated={false} />);

    expect(screen.queryByText(MARKER)).not.toBeInTheDocument();
  });

  it('omits the marker when truncated is not passed at all', () => {
    render(<BriefingCard race="Monaco Grand Prix" briefing="Complete." />);

    expect(screen.queryByText(MARKER)).not.toBeInTheDocument();
  });

  it('marks a truncated briefing as unfinished', () => {
    render(<BriefingCard race="Monaco Grand Prix" briefing="Half a br" truncated />);

    expect(screen.getByText(MARKER)).toBeInTheDocument();
  });

  it('puts the marker after the prose, not above it', () => {
    // Placement is the decision, not decoration: an alarm above readable prose reads as
    // "everything broke". See ADR-0002's rejection of an accompanying error event.
    render(<BriefingCard race="Monaco Grand Prix" briefing="Readable prose." truncated />);

    const prose = screen.getByText('Readable prose.');
    const marker = screen.getByText(MARKER);

    expect(prose.compareDocumentPosition(marker) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('still renders the whole partial briefing alongside the marker', () => {
    // The prose is the deliverable; the marker is a caveat on it, not a replacement.
    render(
      <BriefingCard race="Monaco Grand Prix" briefing={'## Overview\n\nHalf a br'} truncated />,
    );

    expect(screen.getByRole('heading', { name: 'Overview' })).toBeInTheDocument();
    expect(screen.getByText('Half a br')).toBeInTheDocument();
    expect(screen.getByText(MARKER)).toBeInTheDocument();
  });
});

describe('BriefingCard header', () => {
  it('names the race with no chequered-flag emoji', () => {
    const { container } = render(card({ briefing: 'Prose.' }));

    expect(screen.getByText('Monaco Grand Prix')).toBeInTheDocument();
    // Phase 6 strips the emoji from the empty state and the trace too; one survivor here would
    // read as an oversight rather than as a decision.
    expect(container.textContent).not.toContain('🏁');
  });

  it('keeps the subtitle string while lifting it off zinc-500', () => {
    render(card({ briefing: 'Prose.' }));

    const subtitle = screen.getByText('Race Weekend Briefing');
    // The string is contract; the shade is not. zinc-500 on this card measures 3.66:1 and the
    // branch rule forbids it on any run carrying real text.
    expect(subtitle).toHaveClass('text-zinc-400');
  });
});

describe('BriefingCard streaming reveal', () => {
  it('leaves the final block bare while loading and reveals every earlier one', () => {
    // Spec rule 3, and the point of the whole feature. The last block is still being written.
    const { container } = render(card({ briefing: STREAMING, loading: true }));

    const found = blocks(container);
    expect(found).toHaveLength(4); // non-vacuity: h1, p, ul, p

    found.slice(0, -1).forEach((block) => {
      expect(barsIn(block).length).toBeGreaterThan(0);
    });
    expect(barsIn(found[found.length - 1]!)).toHaveLength(0);
  });

  it('gives the final block its bar once loading ends', () => {
    const { container, rerender } = render(card({ briefing: STREAMING, loading: true }));
    expect(barsIn(blocks(container).at(-1)!)).toHaveLength(0);

    rerender(card({ briefing: STREAMING, loading: false }));

    const found = blocks(container);
    expect(found).toHaveLength(4);
    found.forEach((block) => expect(barsIn(block).length).toBeGreaterThan(0));
  });

  it('reveals every block when loading is not passed at all', () => {
    // The default matters: `/briefing` renders completed briefings from history with no `loading`
    // prop, and those must not permanently withhold a bar from their last paragraph.
    const { container } = render(card({ briefing: STREAMING }));

    const found = blocks(container);
    expect(found).toHaveLength(4);
    found.forEach((block) => expect(barsIn(block).length).toBeGreaterThan(0));
  });

  it('keeps earlier blocks their ordinals as the final one grows', () => {
    // The stability property. If ordinals churned on a flush, React would remount each block,
    // every bar would restart, and the page would strobe at the flush rate.
    const { container, rerender } = render(card({ briefing: STREAMING, loading: true }));
    const before = ordinalsOf(container);
    expect(before).toEqual([0, 1, 2, 3]);

    rerender(card({ briefing: `${STREAMING} and more words arrive`, loading: true }));

    expect(ordinalsOf(container)).toEqual(before);
    // …and the block that grew is still the bare one.
    expect(barsIn(blocks(container).at(-1)!)).toHaveLength(0);
  });

  it('moves the bare block along as a new block starts', () => {
    const { container, rerender } = render(card({ briefing: STREAMING, loading: true }));

    rerender(card({ briefing: `${STREAMING}\n\n## Next section`, loading: true }));

    const found = blocks(container);
    expect(found).toHaveLength(5); // the h2 joined
    // The paragraph that was being written is now complete and gets its bar; the newcomer is the
    // one still growing.
    expect(barsIn(found[3]!).length).toBeGreaterThan(0);
    expect(barsIn(found[4]!)).toHaveLength(0);
  });

  it('puts exactly one bar over a paragraph containing bold and italic runs', () => {
    /*
     * The trap this branch pays for repeatedly. `RedactedReveal` calls
     * `React.Children.toArray(children)` and gives every top-level child its own line and its own
     * bar — which is what makes the landing hero's staircase work and is catastrophic here, since
     * a markdown paragraph's `children` is an array of text nodes and inline elements. Passed
     * bare, this paragraph would render three bars.
     */
    const { container } = render(
      card({ briefing: 'Sainz took **P4** after a *late* stop.', loading: false }),
    );

    const found = blocks(container);
    expect(found).toHaveLength(1);
    expect(barsIn(found[0]!)).toHaveLength(1);
  });

  it('puts exactly one bar over a list, not one per item', () => {
    const { container } = render(card({ briefing: '- alpha\n- beta\n- gamma', loading: false }));

    const found = blocks(container);
    expect(found).toHaveLength(1);
    expect(barsIn(found[0]!)).toHaveLength(1);
    expect(container.querySelectorAll('li')).toHaveLength(3); // non-vacuity: it really is a list
  });

  it('throttles a completed briefing to four concurrent bars', () => {
    // Spec rule 4. A completed briefing arrives as one wave — every block is new in one pass —
    // so the delays step by a wipe every MAX_CONCURRENT_REVEALS blocks.
    const nine = Array.from({ length: 9 }, (_, i) => `Paragraph ${i}.`).join('\n\n');
    const { container } = render(card({ briefing: nine, loading: false }));

    const found = blocks(container);
    expect(found).toHaveLength(9);
    found.forEach((block, i) => {
      // Expectation derived from the constants, not from a second copy of the 0.2/0.85/1.5 table.
      expect(block.getAttribute('data-reveal-delay')).toBe(String(revealDelaySeconds(i)));
    });
    // Pin the group boundaries explicitly so a change to MAX_CONCURRENT_REVEALS is visible here.
    expect(found[MAX_CONCURRENT_REVEALS - 1]!.getAttribute('data-reveal-delay')).toBe(
      String(REVEAL_DELAY_S),
    );
    expect(found[MAX_CONCURRENT_REVEALS]!.getAttribute('data-reveal-delay')).toBe('0.85');
    expect(found[2 * MAX_CONCURRENT_REVEALS]!.getAttribute('data-reveal-delay')).toBe('1.5');
  });
});

describe('BriefingCard accessibility', () => {
  it.each([true, false])('has every block of text in the DOM at loading=%s', (loading) => {
    // Spec rule 5, absolute on this page: a reveal never gates whether text exists, only how it
    // appears. Asserted on the first render, before any animation could have run.
    render(card({ briefing: STREAMING, loading }));

    expect(screen.getByRole('heading', { name: 'Race Weekend' })).toBeInTheDocument();
    expect(screen.getByText('First paragraph.')).toBeInTheDocument();
    expect(screen.getByText('alpha')).toBeInTheDocument();
    expect(screen.getByText('beta')).toBeInTheDocument();
    expect(screen.getByText('Last paragraph still writing')).toBeInTheDocument();
  });

  it('hides every bar from the accessibility tree', () => {
    const { container } = render(card({ briefing: STREAMING, loading: false }));

    const bars = blocks(container).flatMap(barsIn);
    expect(bars.length).toBeGreaterThan(0); // non-vacuity
    bars.forEach((bar) => {
      expect(bar).toHaveAttribute('aria-hidden', 'true');
      expect(bar.className).toContain('pointer-events-none');
    });
  });

  it('renders every block with no bars at all under reduced motion', () => {
    // `RedactedReveal`'s own reduced-motion branch returns the static *final* state — bar gone,
    // text visible. Asserted through the card rather than by re-testing the kit component: what
    // matters here is that the card's wrapping does not reintroduce a bar it cannot animate away.
    reduceMotion = true;
    const { container } = render(card({ briefing: STREAMING, loading: false }));

    expect(blocks(container)).toHaveLength(4);
    expect(blocks(container).flatMap(barsIn)).toHaveLength(0);
    expect(screen.getByText('First paragraph.')).toBeInTheDocument();
    expect(screen.getByText('Last paragraph still writing')).toBeInTheDocument();
  });

  it('keeps the race name readable under reduced motion too', () => {
    reduceMotion = true;
    render(card({ briefing: 'Prose.' }));

    expect(screen.getByText('Monaco Grand Prix')).toBeInTheDocument();
  });
});

describe('BriefingCard contrast', () => {
  it('keeps every resting neutral above 4.5:1 on the card surface', () => {
    // The card paints an opaque `bg-zinc-900`, so its own text is judged against that and not
    // against the page — measuring the right colour against the wrong background is the mistake
    // CLAUDE.md records shipping twice.
    const { container } = render(card({ briefing: STREAMING, loading: false, truncated: true }));

    const neutrals = restingTextNeutrals(container);
    expect(neutrals.length).toBeGreaterThan(0); // non-vacuity: a helper that finds nothing passes
    neutrals.forEach(({ hex, text }) => {
      expect(contrastRatio(hex, CARD_BG), `"${text}" at ${hex}`).toBeGreaterThanOrEqual(4.5);
    });
  });

  it('would fail if a neutral slipped back to zinc-500', () => {
    // The premise of the assertion above: it only means anything because the shade it forbids is
    // genuinely under the bar on this surface.
    expect(contrastRatio(ZINC['500']!, CARD_BG)).toBeLessThan(4.5);
    expect(contrastRatio(ZINC['400']!, CARD_BG)).toBeGreaterThanOrEqual(4.5);
  });
});

import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';

import { CompoundTablist } from '@/components/tyres/compound-tablist';
import { RACE_COMPOUNDS } from '@/data/tyres-data';
import { stepTo } from '@/hooks/use-compound-carousel';

function renderTablist({ index = 0, onSelect = vi.fn() } = {}) {
  render(
    <CompoundTablist
      compounds={RACE_COMPOUNDS}
      index={index}
      onSelect={onSelect}
      tabId={(id) => `tab-${id}`}
      panelId={(id) => `panel-${id}`}
    />,
  );
  return { onSelect };
}

const LAST = RACE_COMPOUNDS.length - 1;

describe('CompoundTablist — the raw target contract', () => {
  /*
   * This is the contract the whole direction system rests on, and it was broken.
   *
   * `stepTo` derives direction from the **raw** target — `-1` means "one before the start",
   * `count` means "one past the end" — and wraps afterwards. The tablist originally wrapped
   * first and passed the already-wrapped index, so `stepTo` could no longer tell a wrap from a
   * jump: ArrowLeft at index 0 arrived as `select(4)`, which reads as a *forward* move of four
   * and animated the scene in from the right. The Previous button, for the identical state
   * change, animated it in from the left. Same destination, opposite motion.
   */
  it('passes one before the start for ArrowLeft on the first tab', () => {
    const { onSelect } = renderTablist({ index: 0 });
    fireEvent.keyDown(screen.getAllByRole('tab')[0]!, { key: 'ArrowLeft' });
    expect(onSelect).toHaveBeenCalledWith(-1);
  });

  it('passes one past the end for ArrowRight on the last tab', () => {
    const { onSelect } = renderTablist({ index: LAST });
    fireEvent.keyDown(screen.getAllByRole('tab')[LAST]!, { key: 'ArrowRight' });
    expect(onSelect).toHaveBeenCalledWith(RACE_COMPOUNDS.length);
  });

  /** The pay-off: the raw values the tablist emits give the wrap the correct direction. */
  it('yields a backward direction for the ArrowLeft wrap', () => {
    const { onSelect } = renderTablist({ index: 0 });
    fireEvent.keyDown(screen.getAllByRole('tab')[0]!, { key: 'ArrowLeft' });
    const raw = onSelect.mock.calls[0]![0] as number;
    expect(stepTo(0, raw, RACE_COMPOUNDS.length)).toEqual({ index: LAST, direction: -1 });
  });

  it('yields a forward direction for the ArrowRight wrap', () => {
    const { onSelect } = renderTablist({ index: LAST });
    fireEvent.keyDown(screen.getAllByRole('tab')[LAST]!, { key: 'ArrowRight' });
    const raw = onSelect.mock.calls[0]![0] as number;
    expect(stepTo(LAST, raw, RACE_COMPOUNDS.length)).toEqual({ index: 0, direction: 1 });
  });

  it('passes plain in-range indices for a click', () => {
    const { onSelect } = renderTablist({ index: 0 });
    fireEvent.click(screen.getAllByRole('tab')[2]!);
    expect(onSelect).toHaveBeenCalledWith(2);
  });

  it('passes in-range indices for Home and End', () => {
    const { onSelect } = renderTablist({ index: 2 });
    fireEvent.keyDown(screen.getAllByRole('tab')[2]!, { key: 'End' });
    expect(onSelect).toHaveBeenLastCalledWith(LAST);
    fireEvent.keyDown(screen.getAllByRole('tab')[2]!, { key: 'Home' });
    expect(onSelect).toHaveBeenLastCalledWith(0);
  });
});

describe('CompoundTablist — structure', () => {
  it('marks only the selected tab as selected and focusable', () => {
    renderTablist({ index: 1 });
    const tabs = screen.getAllByRole('tab');
    expect(tabs.filter((t) => t.getAttribute('aria-selected') === 'true')).toHaveLength(1);
    expect(tabs.filter((t) => t.getAttribute('tabindex') === '0')).toHaveLength(1);
    expect(tabs[1]).toHaveAttribute('tabindex', '0');
  });

  /*
   * Only the selected compound's panel is in the DOM — `AnimatePresence` renders one — so an
   * `aria-controls` on the other four points at an id that does not exist. Invalid ARIA, and
   * validators flag it.
   */
  it('only points aria-controls at a panel that exists', () => {
    renderTablist({ index: 1 });
    const tabs = screen.getAllByRole('tab');
    expect(tabs.filter((t) => t.hasAttribute('aria-controls'))).toHaveLength(1);
    expect(tabs[1]).toHaveAttribute('aria-controls', `panel-${RACE_COMPOUNDS[1]!.id}`);
  });

  it('does not intercept keys the page needs for scrolling', () => {
    const { onSelect } = renderTablist({ index: 0 });
    for (const key of ['ArrowUp', 'ArrowDown', 'PageDown', 'Tab']) {
      fireEvent.keyDown(screen.getAllByRole('tab')[0]!, { key });
    }
    expect(onSelect).not.toHaveBeenCalled();
  });

  /*
   * `overflow-x: auto` forces `overflow-y: auto` too, so a `ring-offset-2` focus ring — a
   * box-shadow 4px outside the button — is clipped unless the scroll container has padding.
   * `teams-chip-strip.tsx` already gets this right with `px-4 py-2`.
   */
  it('leaves room for a focus ring inside the scroll container', () => {
    const { container } = render(
      <CompoundTablist
        compounds={RACE_COMPOUNDS}
        index={0}
        onSelect={vi.fn()}
        tabId={(id) => `tab-${id}`}
        panelId={(id) => `panel-${id}`}
      />,
    );
    const list = container.querySelector('[role="tablist"]')!;
    expect(list.className).toMatch(/\bp-1\b|\bpx-1\b/);
    expect(list.className).toMatch(/\bp-1\b|\bpy-1\b/);
  });
});

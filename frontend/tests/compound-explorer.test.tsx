import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';

import {
  CompoundExplorer,
  panelVariants,
  commitFromDrag,
  dragElasticFor,
  DRAG_ELASTIC,
  SWIPE_COMMIT_PX,
} from '@/components/tyres/compound-explorer';
import { RACE_COMPOUNDS } from '@/data/tyres-data';
import { contrastRatio, DARK_BG, MIN_CONTRAST } from '@/lib/team-utils';
import { restingTextNeutrals } from './zinc';

function renderExplorer({ reducedMotion = false } = {}) {
  return render(<CompoundExplorer compounds={RACE_COMPOUNDS} reducedMotion={reducedMotion} />);
}

/** The one panel a screen reader can actually reach — the exiting one is aria-hidden. */
function livePanel() {
  return screen.getByRole('tabpanel');
}

describe('CompoundExplorer — structure', () => {
  it('exposes the selector as a labelled tablist', () => {
    renderExplorer();
    expect(screen.getByRole('tablist', { name: /compound/i })).toBeInTheDocument();
  });

  it('renders one tab per compound', () => {
    renderExplorer();
    expect(screen.getAllByRole('tab')).toHaveLength(RACE_COMPOUNDS.length);
  });

  it('gives every tab an accessible name', () => {
    renderExplorer();
    for (const compound of RACE_COMPOUNDS) {
      expect(screen.getByRole('tab', { name: new RegExp(compound.name, 'i') })).toBeInTheDocument();
    }
  });

  it('selects exactly one tab at a time', () => {
    renderExplorer();
    expect(screen.getAllByRole('tab', { selected: true })).toHaveLength(1);
  });

  it('shows exactly one reachable panel', () => {
    renderExplorer();
    expect(screen.getAllByRole('tabpanel')).toHaveLength(1);
  });

  it('wires the selected tab to the visible panel', () => {
    renderExplorer();
    const tab = screen.getAllByRole('tab', { selected: true })[0]!;
    expect(livePanel()).toHaveAttribute('aria-labelledby', tab.id);
    expect(tab).toHaveAttribute('aria-controls', livePanel().id);
  });

  it('labels the previous and next controls for screen readers', () => {
    renderExplorer();
    expect(screen.getByRole('button', { name: /previous compound/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /next compound/i })).toBeInTheDocument();
  });

  /*
   * The scene changes without focus moving and without any text the user was reading being
   * replaced in place, so nothing would otherwise be announced at all.
   */
  it('announces the current compound in a polite live region', () => {
    renderExplorer();
    const status = screen.getByRole('status');
    expect(status).toHaveAttribute('aria-live', 'polite');
    expect(status).toHaveTextContent(new RegExp(RACE_COMPOUNDS[0]!.name, 'i'));
  });

  it('says where in the set the current compound sits', () => {
    renderExplorer();
    expect(screen.getByRole('status')).toHaveTextContent(`1 of ${RACE_COMPOUNDS.length}`);
  });
});

describe('CompoundExplorer — selection', () => {
  it('shows the compound whose tab was clicked', () => {
    renderExplorer();
    const target = RACE_COMPOUNDS[2]!;

    fireEvent.click(screen.getByRole('tab', { name: new RegExp(target.name, 'i') }));

    expect(within(livePanel()).getByRole('heading', { level: 3 })).toHaveTextContent(target.name);
  });

  it('advances with the next control', () => {
    renderExplorer();

    fireEvent.click(screen.getByRole('button', { name: /next compound/i }));

    expect(screen.getAllByRole('tab', { selected: true })[0]).toHaveAccessibleName(
      new RegExp(RACE_COMPOUNDS[1]!.name, 'i'),
    );
  });

  it('wraps backward from the first compound to the last', () => {
    renderExplorer();

    fireEvent.click(screen.getByRole('button', { name: /previous compound/i }));

    expect(screen.getAllByRole('tab', { selected: true })[0]).toHaveAccessibleName(
      new RegExp(RACE_COMPOUNDS[RACE_COMPOUNDS.length - 1]!.name, 'i'),
    );
  });

  it('keeps the live region in step with the selection', () => {
    renderExplorer();

    fireEvent.click(screen.getByRole('button', { name: /next compound/i }));

    expect(screen.getByRole('status')).toHaveTextContent(new RegExp(RACE_COMPOUNDS[1]!.name, 'i'));
  });
});

describe('CompoundExplorer — keyboard', () => {
  it('puts only the selected tab in the tab order', () => {
    renderExplorer();
    const tabs = screen.getAllByRole('tab');
    expect(tabs.filter((t) => t.getAttribute('tabindex') !== '-1')).toHaveLength(1);
    expect(screen.getAllByRole('tab', { selected: true })[0]).toHaveAttribute('tabindex', '0');
  });

  it('moves to the next compound on ArrowRight', () => {
    renderExplorer();
    screen.getAllByRole('tab', { selected: true })[0]!.focus();

    fireEvent.keyDown(document.activeElement!, { key: 'ArrowRight' });

    expect(screen.getAllByRole('tab', { selected: true })[0]).toHaveAccessibleName(
      new RegExp(RACE_COMPOUNDS[1]!.name, 'i'),
    );
  });

  it('moves to the previous compound on ArrowLeft', () => {
    renderExplorer();
    screen.getAllByRole('tab', { selected: true })[0]!.focus();

    fireEvent.keyDown(document.activeElement!, { key: 'ArrowRight' });
    fireEvent.keyDown(document.activeElement!, { key: 'ArrowLeft' });

    expect(screen.getAllByRole('tab', { selected: true })[0]).toHaveAccessibleName(
      new RegExp(RACE_COMPOUNDS[0]!.name, 'i'),
    );
  });

  it('jumps to the first compound on Home and the last on End', () => {
    renderExplorer();
    screen.getAllByRole('tab', { selected: true })[0]!.focus();

    fireEvent.keyDown(document.activeElement!, { key: 'End' });
    expect(screen.getAllByRole('tab', { selected: true })[0]).toHaveAccessibleName(
      new RegExp(RACE_COMPOUNDS[RACE_COMPOUNDS.length - 1]!.name, 'i'),
    );

    fireEvent.keyDown(document.activeElement!, { key: 'Home' });
    expect(screen.getAllByRole('tab', { selected: true })[0]).toHaveAccessibleName(
      new RegExp(RACE_COMPOUNDS[0]!.name, 'i'),
    );
  });

  // Roving tabindex: the arrow key must carry focus with it, or the next arrow press goes
  // to a tab that is no longer the one the user thinks they are on.
  it('carries focus with the selection', () => {
    renderExplorer();
    screen.getAllByRole('tab', { selected: true })[0]!.focus();

    fireEvent.keyDown(document.activeElement!, { key: 'ArrowRight' });

    expect(document.activeElement).toBe(screen.getAllByRole('tab', { selected: true })[0]);
  });

  it('leaves the page to scroll on keys it does not own', () => {
    renderExplorer();
    screen.getAllByRole('tab', { selected: true })[0]!.focus();

    fireEvent.keyDown(document.activeElement!, { key: 'ArrowDown' });

    expect(screen.getAllByRole('tab', { selected: true })[0]).toHaveAccessibleName(
      new RegExp(RACE_COMPOUNDS[0]!.name, 'i'),
    );
  });
});

describe('panelVariants', () => {
  /*
   * jsdom lays nothing out, so the honest place to assert "no spatial movement under reduced
   * motion" is the variant object handed to motion — not a rendered pixel. The pixel half of
   * the claim is discharged in a real browser.
   */
  it('translates in the direction of travel when motion is allowed', () => {
    const forward = panelVariants(false);
    expect(forward.enter(1).x).toBeGreaterThan(0);
    expect(forward.exit(1).x).toBeLessThan(0);
  });

  it('mirrors the path when travelling backward', () => {
    const back = panelVariants(false);
    expect(back.enter(-1).x).toBeLessThan(0);
    expect(back.exit(-1).x).toBeGreaterThan(0);
  });

  // Spatial consistency: what left to the left comes back from the left.
  it('makes exit and enter symmetric', () => {
    const v = panelVariants(false);
    expect(v.enter(1).x).toBe(-v.exit(1).x);
  });

  it('removes every spatial offset under reduced motion', () => {
    const reduced = panelVariants(true);
    for (const direction of [1, -1] as const) {
      expect(reduced.enter(direction).x ?? 0).toBe(0);
      expect(reduced.exit(direction).x ?? 0).toBe(0);
    }
  });

  it('keeps a crossfade under reduced motion rather than teleporting', () => {
    const reduced = panelVariants(true);
    expect(reduced.enter(1).opacity).toBe(0);
    expect(reduced.center.opacity).toBe(1);
  });

  it('keeps the reduced crossfade short', () => {
    const reduced = panelVariants(true);
    expect(reduced.center.transition.duration).toBeLessThanOrEqual(0.2);
  });
});

describe('commitFromDrag', () => {
  it('ignores a drag that never left the dead zone', () => {
    expect(commitFromDrag(10, 0)).toBe(0);
  });

  it('commits forward on a drag past the threshold to the left', () => {
    expect(commitFromDrag(-(SWIPE_COMMIT_PX + 1), 0)).toBe(1);
  });

  it('commits backward on a drag past the threshold to the right', () => {
    expect(commitFromDrag(SWIPE_COMMIT_PX + 1, 0)).toBe(-1);
  });

  /*
   * Momentum projection, per Apple's fluid-interfaces guidance: a short flick should throw
   * the scene even though the finger barely moved. Without this, a fast swipe that covers
   * 30px feels broken.
   */
  it('commits on a fast flick that never reached the distance threshold', () => {
    expect(commitFromDrag(-20, -1200)).toBe(1);
  });

  it('does not commit on a slow drag in the same distance', () => {
    expect(commitFromDrag(-20, -50)).toBe(0);
  });

  it('lets velocity and distance disagree without double-counting', () => {
    // Dragged left (forward) but flicked back to the right: the projection wins.
    expect(commitFromDrag(-30, 1500)).toBe(-1);
  });
});

describe('CompoundExplorer — contrast', () => {
  it('holds every resting neutral above AA on the page background', () => {
    const { container } = renderExplorer();
    const neutrals = restingTextNeutrals(container);
    expect(neutrals.length).toBeGreaterThan(0);
    for (const { hex, text } of neutrals) {
      expect(contrastRatio(hex, DARK_BG), `${hex} on "${text}"`).toBeGreaterThanOrEqual(
        MIN_CONTRAST,
      );
    }
  });
});

describe('CompoundExplorer — the label is not the product', () => {
  /*
   * The single most important thing this page teaches. Each dry label must say, on its own
   * panel, that it is assigned per race — not leave the reader to find that three sections
   * further down.
   */
  it('says on every dry panel that the label is assigned per race', () => {
    renderExplorer();

    for (const compound of RACE_COMPOUNDS.filter((c) => c.nominationNote)) {
      fireEvent.click(screen.getByRole('tab', { name: new RegExp(compound.name, 'i') }));
      expect(within(livePanel()).getByText(compound.nominationNote!)).toBeInTheDocument();
    }
  });

  it('never prints a compound number as if it were the label', () => {
    const { container } = renderExplorer();
    // A bare "C3"-style token would be a numbered compound masquerading as a race label.
    expect(container.textContent).not.toMatch(/\bC[1-6]\b/);
  });
});

describe('CompoundExplorer — the prose stays selectable', () => {
  /*
   * framer-motion writes `user-select: none` (plus `-webkit-touch-callout: none`) inline onto
   * any element with `drag` — permanently, not just during a gesture — unless
   * `dragListener={false}`. The drag wrapper originally enclosed the whole scene, so none of the
   * summary, warm-up note, degradation note or race scenario on an *explainer* page could be
   * selected or copied. Verified in `framer-motion/dist/es/render/html/use-props.mjs`.
   *
   * The fix routes the gesture through `dragControls` started from the tyre, which is also the
   * object a reader would instinctively swipe.
   */
  it('does not disable text selection anywhere above the copy', () => {
    renderExplorer();
    let node: HTMLElement | null = screen.getByRole('tabpanel');
    const offenders: string[] = [];
    while (node) {
      if (node.style.userSelect === 'none' || node.style.webkitUserSelect === 'none') {
        offenders.push(node.tagName + '.' + node.className.slice(0, 40));
      }
      node = node.parentElement;
    }
    expect(offenders).toEqual([]);
  });

  it('still exposes a grab affordance on the tyre', () => {
    const { container } = renderExplorer();
    expect(container.querySelector('[data-drag-handle="true"]')).not.toBeNull();
  });
});

describe('dragElasticFor', () => {
  it('lets the scene rubber-band under the finger normally', () => {
    expect(dragElasticFor(false)).toBe(DRAG_ELASTIC);
  });

  /*
   * Reduced motion zeroes the *displacement*, it does not remove the gesture. Swiping is
   * direct manipulation the user is performing, not autonomous motion — and removing the
   * element would mean the server and the client render different trees, which is a hydration
   * mismatch by construction because `useReducedMotion()` cannot know the answer during SSR.
   * That mismatch was real and observed in a browser before this was changed.
   */
  it('removes all displacement under reduced motion while keeping the swipe', () => {
    expect(dragElasticFor(true)).toBe(0);
  });
});

describe('CompoundExplorer — reduced motion', () => {
  // The markup must not depend on the reduced-motion signal at all; the cursor affordance is
  // dropped by a `motion-reduce:` CSS variant instead, which the browser evaluates.
  it('renders identical markup whether or not motion is reduced', () => {
    const { container: normal } = renderExplorer({ reducedMotion: false });
    const { container: reduced } = renderExplorer({ reducedMotion: true });
    const shape = (root: ParentNode) =>
      Array.from(root.querySelectorAll('*'))
        .map((el) => el.tagName)
        .join(',');
    expect(shape(reduced)).toBe(shape(normal));
  });

  it('still changes compound under reduced motion', () => {
    renderExplorer({ reducedMotion: true });

    fireEvent.click(screen.getByRole('button', { name: /next compound/i }));

    expect(screen.getAllByRole('tab', { selected: true })[0]).toHaveAccessibleName(
      new RegExp(RACE_COMPOUNDS[1]!.name, 'i'),
    );
  });
});

describe('CompoundExplorer — no runaway motion', () => {
  it('does not auto-advance', () => {
    vi.useFakeTimers();
    try {
      renderExplorer();
      const before = screen.getAllByRole('tab', { selected: true })[0]!.textContent;
      vi.advanceTimersByTime(30_000);
      expect(screen.getAllByRole('tab', { selected: true })[0]!.textContent).toBe(before);
    } finally {
      vi.useRealTimers();
    }
  });
});

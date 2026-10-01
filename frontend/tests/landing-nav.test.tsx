import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { LandingNav } from '@/components/landing/landing-nav';
import { NAV_LINKS } from '@/components/landing/links';
import { contrastRatio, DARK_BG, MIN_CONTRAST } from '@/lib/team-utils';
import { restingTextNeutrals } from './zinc';

// Static import plus a hoisted `vi.mock`, not a top-level `await`: the latter passes under vitest
// and fails `pnpm typecheck` with TS1378.
const pathname = vi.hoisted(() => ({ current: '/' }));
vi.mock('next/navigation', () => ({ usePathname: () => pathname.current }));

/**
 * The destinations, retyped rather than only mapped from `NAV_LINKS`.
 *
 * Both are asserted, and they are asserting different things. The retyped list is the contract:
 * `SHARED-P7.md` says every link survives the 390 px pass, so a destination silently disappearing
 * from `links.ts` has to fail somewhere, and it cannot fail in a test that derives its expectation
 * from the same file. The `NAV_LINKS` comparison then catches the opposite drift — a link added to
 * the shared list and not rendered.
 *
 * `/candy` is deliberately absent from `links.ts` and must stay absent; that is pinned below.
 */
const DESTINATIONS = [
  ['/briefing', 'Briefing'],
  ['/teardown', 'Car Anatomy'],
  // The two "how the machine works" experiences belong next to each other, and Briefing — the
  // thing the app is named for — stays first. The retyped list above is what pins that order.
  ['/tyres', 'Tyres'],
  // Circuits opens the season group — where they race, then who is winning, then who they are —
  // and sits beside Standings because the two share `?year=` links.
  ['/circuits', 'Circuits'],
  // The table sits before the profiles it leads to, and leaves Teams beside Showcase, which
  // shares its liveries.
  ['/standings', 'Standings'],
  ['/teams', 'Teams'],
  ['/showcase', 'Showcase'],
  ['/credits', 'Credits'],
] as const;

function renderNav(at = '/') {
  pathname.current = at;
  return render(<LandingNav />);
}

afterEach(() => {
  pathname.current = '/';
  vi.restoreAllMocks();
});

describe('LandingNav', () => {
  it('renders every destination with its label and href', () => {
    render(<LandingNav />);

    for (const [href, label] of DESTINATIONS) {
      expect(screen.getByRole('link', { name: label })).toHaveAttribute('href', href);
    }
    expect(NAV_LINKS.map(({ href, label }) => [href, label])).toEqual(
      DESTINATIONS.map(([href, label]) => [href, label]),
    );
  });

  it('does not link to the styleguide', () => {
    // `/candy` is a development styleguide, not a destination for readers. Its absence is a
    // decision, and an absence with no test is indistinguishable from an oversight.
    render(<LandingNav />);

    expect(screen.queryByRole('link', { name: /candy/i })).toBeNull();
  });

  describe('the 390 px pass', () => {
    /*
     * Measured at a 390 viewport before this change: the `ul` was **393.3 px wide inside a 390 px
     * viewport**, `Showcase` ended at x=400.6 and `Credits` at x=475.8 — both entirely past the
     * right edge — while `document.documentElement.scrollWidth` stayed at 390, so the page did not
     * scroll to reach them. Two of five destinations were unreachable on a phone.
     *
     * **jsdom lays nothing out**, so none of that is assertable here and none of it is asserted
     * here. What these tests pin is the *mechanism* chosen to fix it, which is the part a later
     * edit can remove by accident: take away `min-w-0` and the row stops shrinking and overflows
     * the header again; take away `overflow-x-auto` and it is clipped instead of scrolled; take
     * away `flex-shrink-0` on the items and the labels squeeze and wrap. The geometry itself was
     * verified in a browser at 390 and at 1440.
     */
    it('makes the link row a horizontal scroller rather than clipping it', () => {
      const { container } = render(<LandingNav />);
      const list = container.querySelector('ul');

      expect(list).toHaveClass('overflow-x-auto');
      // Without this a flex item's automatic minimum size is its content, so the row keeps its
      // full width and overflows the header instead of scrolling inside itself. The flex item is
      // the row's wrapper, which also positions the overflow fades.
      expect(list?.parentElement).toHaveClass('min-w-0');
      // Stops a horizontal swipe on the bar from chaining into the browser's back gesture.
      expect(list).toHaveClass('overscroll-x-contain');
    });

    it('gives the scroller room for a focus ring', () => {
      // Not spacing. `overflow-x: auto` forces `overflow-y` to compute to `auto` as well, and a
      // ring drawn at `ring-offset-2` is a box-shadow painted 4 px outside the link — which a
      // scroll container clips. Remove this padding and every focused link in the bar loses the
      // top and bottom of its indicator.
      const { container } = render(<LandingNav />);

      expect(container.querySelector('ul')).toHaveClass('py-1.5');
    });

    it('gives the first and last links the same clearance at the row’s ends', () => {
      // The same clip, sideways. Measured on main at 375 and at 1440 alike: with no horizontal
      // padding the first link sat flush at the row's left edge, so the left 4 px of its ring were
      // cut off, and the last link's right side the same once the row was scrolled to its end.
      const { container } = render(<LandingNav />);

      expect(container.querySelector('ul')).toHaveClass('px-1.5');
    });

    it('keeps every label on one line at its natural width', () => {
      const { container } = render(<LandingNav />);

      for (const item of Array.from(container.querySelectorAll('li'))) {
        expect(item).toHaveClass('flex-shrink-0');
      }
      for (const [, label] of DESTINATIONS) {
        expect(screen.getByRole('link', { name: label })).toHaveClass('whitespace-nowrap');
      }
    });

    it('never squeezes the wordmark', () => {
      // Before this, the brand and the link row shared the shortfall at 390 and both lost: the
      // wordmark wrapped to two lines inside a 56 px bar.
      render(<LandingNav />);

      expect(screen.getByRole('link', { name: /F1 Briefing Agent/ })).toHaveClass('flex-shrink-0');
    });
  });

  describe('focus rings', () => {
    // The rule and its measurements live in `lib/focus.ts`; these assert the call sites use it
    // rather than restating class strings, which is what let four near-identical rings drift apart
    // across this branch in the first place.
    it('gives every link a 2 px red ring', () => {
      render(<LandingNav />);

      const links = screen.getAllByRole('link');
      expect(links.length).toBe(DESTINATIONS.length + 1);
      for (const link of links) {
        expect(link).toHaveClass('focus-visible:ring-2', 'focus-visible:ring-f1-red');
        expect(link).toHaveClass('focus-visible:outline-none');
      }
    });

    it('offsets the ring on the nav items, which can carry a fill, and not on the wordmark', () => {
      // The active item is `bg-zinc-800`, where a flush red ring measures 3.00:1 — exactly at
      // WCAG 2.4.11's bar. The offset band separates ring from fill. The wordmark is never filled,
      // so it takes the flush ring and no offset band to be mismatched against the header.
      render(<LandingNav />);

      for (const [, label] of DESTINATIONS) {
        expect(screen.getByRole('link', { name: label })).toHaveClass(
          'focus-visible:ring-offset-2',
          'focus-visible:ring-offset-base',
        );
      }
      expect(screen.getByRole('link', { name: /F1 Briefing Agent/ })).not.toHaveClass(
        'focus-visible:ring-offset-2',
      );
    });
  });

  it('marks the active route', () => {
    pathname.current = '/teams';
    render(<LandingNav />);

    expect(screen.getByRole('link', { name: 'Teams' })).toHaveClass('bg-zinc-800');
    expect(screen.getByRole('link', { name: 'Briefing' })).not.toHaveClass('bg-zinc-800');
    pathname.current = '/';
  });

  /*
   * `pathname === href` is an exact match on purpose — `startsWith` would light up `/teams` while
   * on a hypothetical `/teams/x`, but it would also light up `/` on every route. The property
   * worth pinning is therefore that *exactly one* link is ever marked.
   */
  it('marks exactly one link as the current page', () => {
    renderNav('/tyres');

    const current = screen.getAllByRole('link', { current: 'page' });
    expect(current).toHaveLength(1);
    expect(current[0]).toHaveAccessibleName('Tyres');
  });

  it('marks nothing as current on a route that is not in the nav', () => {
    renderNav('/somewhere-else');

    expect(screen.queryAllByRole('link', { current: 'page' })).toHaveLength(0);
  });

  /*
   * Seven links do not fit a 390 px viewport, so the row scrolls — which means the link for the page
   * you are actually on can start off screen, and the nav then shows no sign of where you are.
   * `teams-chip-strip.tsx` solves the identical problem the identical way.
   */
  it('brings the current page into view in the scrolling row', () => {
    const scrollIntoView = vi.spyOn(Element.prototype, 'scrollIntoView');
    renderNav('/credits');

    expect(scrollIntoView).toHaveBeenCalledWith(
      expect.objectContaining({ inline: 'center', block: 'nearest' }),
    );
  });

  it('does not scroll when no nav link is current', () => {
    const scrollIntoView = vi.spyOn(Element.prototype, 'scrollIntoView');
    renderNav('/somewhere-else');

    expect(scrollIntoView).not.toHaveBeenCalled();
  });

  it('holds every resting neutral above AA on the page background', () => {
    const { container } = renderNav();

    const neutrals = restingTextNeutrals(container);
    expect(neutrals.length).toBeGreaterThan(0);
    for (const { hex, text } of neutrals) {
      expect(contrastRatio(hex, DARK_BG), `${hex} on "${text}"`).toBeGreaterThanOrEqual(
        MIN_CONTRAST,
      );
    }
  });
});

/*
 * ---------------------------------------------------------------------------
 * The overflow fades, and why they are tested through a modelled layout
 * ---------------------------------------------------------------------------
 *
 * At 375 px the row shows about two of its eight links, the scrollbar is hidden, and nothing else
 * says there is more. The fades are that signal, so what matters is whether each one is showing at
 * a given scroll position — and jsdom has no scroll position, no widths and no layout at all.
 *
 * So, as in `use-scroll-spy.test.ts`, the geometry is a model: the row's box and every link's
 * offset are fixed numbers (measured at 375×812 on main), `scrollLeft` is a variable, and every
 * width and rect the component can read is derived from them. The expected fade state is computed
 * from that model alone, never from the component. The browser half — that the fades really paint,
 * and that a Tabbed-to ring really clears them — is `browser/nav-overflow.spec.ts`.
 *
 * Scroll events are queued and flushed by the test rather than fired from the setter, because a
 * browser fires them asynchronously. That is what makes the on-load tests mean something: the
 * current link is scrolled into view during mount, and the right fade has to be showing *before*
 * the event for that scroll arrives.
 */

/** Where the row starts at 375: after the gutter, the wordmark and the bar's gap. */
const ROW_LEFT = 153;
/** The row's box at 375 — measured as `clientWidth` on main. */
const PHONE_ROW_WIDTH = 206;
/** Each label's natural width at 375, in nav order. */
const LINK_WIDTHS = [75.6, 109.9, 60.6, 74.2, 90, 67.8, 92.2, 71.2];
/** `gap-1`. */
const LINK_GAP = 4;
/** The row's own horizontal padding, which `scrollWidth` includes. */
const ROW_PADDING = 6;
/** How far a focus ring paints outside its link: `ring-offset-2` plus `ring-2` (lib/focus.ts). */
const RING_REACH = 4;
/** The width of each fade. Copied, not imported, so the test states the contract. */
const FADE_WIDTH = 32;

const CONTENT_WIDTH =
  ROW_PADDING * 2 +
  LINK_WIDTHS.reduce((sum, w) => sum + w, 0) +
  LINK_GAP * (LINK_WIDTHS.length - 1);

const linkOffset = (index: number): number =>
  ROW_PADDING + LINK_WIDTHS.slice(0, index).reduce((sum, w) => sum + w + LINK_GAP, 0);

interface Layout {
  rowWidth: number;
  scrollLeft: number;
}

let layout: Layout = { rowWidth: PHONE_ROW_WIDTH, scrollLeft: 0 };
let pendingScroll = false;

const maxScroll = (): number => Math.max(0, CONTENT_WIDTH - layout.rowWidth);

const rect = (left: number, width: number): DOMRect =>
  ({
    left,
    right: left + width,
    width,
    top: 0,
    bottom: 32,
    height: 32,
    x: left,
    y: 0,
    toJSON: () => ({}),
  }) as DOMRect;

const isRow = (el: Element): boolean => el.matches('nav[aria-label="Main navigation"] ul');

/** The index of a nav link in the model, or -1 for anything else. */
const linkIndex = (el: Element): number =>
  el.matches('nav[aria-label="Main navigation"] ul a')
    ? NAV_LINKS.findIndex(({ href }) => href === el.getAttribute('href'))
    : -1;

/** Moves the virtual scroll position the way a browser does: clamped, then a scroll event later. */
function setScrollLeft(value: number): void {
  const next = Math.min(maxScroll(), Math.max(0, value));
  if (next === layout.scrollLeft) return;
  layout.scrollLeft = next;
  pendingScroll = true;
}

/** Delivers the scroll event the last move queued, as the browser's next frame would. */
function flushScroll(): void {
  if (!pendingScroll) return;
  pendingScroll = false;
  const row = document.querySelector('nav[aria-label="Main navigation"] ul');
  act(() => {
    row?.dispatchEvent(new Event('scroll'));
  });
}

/** One user scroll: move, then the event. */
function scrollRowTo(value: number): void {
  setScrollLeft(value);
  flushScroll();
}

const originals = new Map<string, PropertyDescriptor>();

function installLayoutModel(): void {
  for (const prop of ['scrollLeft', 'scrollWidth', 'clientWidth'] as const) {
    originals.set(prop, Object.getOwnPropertyDescriptor(Element.prototype, prop)!);
  }
  const original = (prop: string) => originals.get(prop)!;

  Object.defineProperty(Element.prototype, 'scrollLeft', {
    configurable: true,
    get(this: Element) {
      return isRow(this) ? layout.scrollLeft : original('scrollLeft').get!.call(this);
    },
    set(this: Element, value: number) {
      if (isRow(this)) setScrollLeft(value);
      else original('scrollLeft').set!.call(this, value);
    },
  });
  Object.defineProperty(Element.prototype, 'scrollWidth', {
    configurable: true,
    get(this: Element) {
      return isRow(this)
        ? Math.max(CONTENT_WIDTH, layout.rowWidth)
        : original('scrollWidth').get!.call(this);
    },
  });
  Object.defineProperty(Element.prototype, 'clientWidth', {
    configurable: true,
    get(this: Element) {
      return isRow(this) ? layout.rowWidth : original('clientWidth').get!.call(this);
    },
  });

  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
    if (isRow(this)) return rect(ROW_LEFT, layout.rowWidth);
    const index = linkIndex(this);
    if (index >= 0)
      return rect(ROW_LEFT + linkOffset(index) - layout.scrollLeft, LINK_WIDTHS[index]!);
    return rect(0, 0);
  });

  // `scrollIntoView({ inline: 'center' })` on a nav link: centre it, clamped, as a browser does.
  vi.spyOn(Element.prototype, 'scrollIntoView').mockImplementation(function (this: Element) {
    const index = linkIndex(this);
    if (index < 0) return;
    setScrollLeft(linkOffset(index) + LINK_WIDTHS[index]! / 2 - layout.rowWidth / 2);
  });
}

function removeLayoutModel(): void {
  for (const [prop, descriptor] of originals)
    Object.defineProperty(Element.prototype, prop, descriptor);
  originals.clear();
}

/**
 * What the model says should be showing, computed without going near the component. Within a pixel
 * of an end counts as at it: a fractional device-pixel ratio can stop a scroll just short.
 */
function expectedFades(): { start: boolean; end: boolean } {
  return {
    start: maxScroll() > 1 && layout.scrollLeft > 1,
    end: maxScroll() - layout.scrollLeft > 1,
  };
}

const fade = (edge: 'start' | 'end'): HTMLElement => screen.getByTestId(`nav-fade-${edge}`);
const isShowing = (el: HTMLElement): boolean => el.classList.contains('opacity-100');

function shownFades(): { start: boolean; end: boolean } {
  const start = fade('start');
  const end = fade('end');
  // Exactly one of the two states, so a fade carrying both classes cannot read as either.
  for (const el of [start, end]) {
    expect(el.classList.contains('opacity-100')).not.toBe(el.classList.contains('opacity-0'));
  }
  return { start: isShowing(start), end: isShowing(end) };
}

describe('the overflow fades', () => {
  beforeEach(() => {
    layout = { rowWidth: PHONE_ROW_WIDTH, scrollLeft: 0 };
    pendingScroll = false;
    installLayoutModel();
  });

  afterEach(() => {
    removeLayoutModel();
  });

  it('shows only the end fade at the start of a row that overflows', () => {
    renderNav('/');
    flushScroll();

    expect(expectedFades()).toEqual({ start: false, end: true });
    expect(shownFades()).toEqual(expectedFades());
  });

  it('shows both part-way along', () => {
    renderNav('/');
    scrollRowTo(200);

    expect(expectedFades()).toEqual({ start: true, end: true });
    expect(shownFades()).toEqual(expectedFades());
  });

  it('shows only the start fade at the end', () => {
    renderNav('/');
    scrollRowTo(maxScroll());

    expect(expectedFades()).toEqual({ start: true, end: false });
    expect(shownFades()).toEqual(expectedFades());
  });

  it('treats a sub-pixel remainder as the end', () => {
    // A browser at a fractional device pixel ratio can stop scrolling a fraction short of
    // `scrollWidth - clientWidth`. Without a tolerance the end fade would stay up over nothing.
    renderNav('/');
    scrollRowTo(maxScroll() - 0.5);

    expect(shownFades()).toEqual({ start: true, end: false });
  });

  it('agrees with the geometry at every position along the row', () => {
    renderNav('/');
    const wrong: string[] = [];
    for (let x = 0; x <= maxScroll(); x += 20) {
      scrollRowTo(x);
      const shown = shownFades();
      const want = expectedFades();
      if (shown.start !== want.start || shown.end !== want.end) {
        wrong.push(`at ${x}: showed ${JSON.stringify(shown)}, wanted ${JSON.stringify(want)}`);
      }
    }
    expect(wrong).toEqual([]);
  });

  it('shows neither fade when every link fits', () => {
    layout.rowWidth = CONTENT_WIDTH;
    renderNav('/');
    flushScroll();

    expect(shownFades()).toEqual({ start: false, end: false });
  });

  describe('on arrival, with the current link already scrolled into view', () => {
    it('is at the end on the last link’s page, before any scroll event arrives', () => {
      renderNav('/credits');

      expect(expectedFades()).toEqual({ start: true, end: false });
      expect(shownFades()).toEqual(expectedFades());
    });

    it('is part-way along on a middle link’s page', () => {
      renderNav('/circuits');

      expect(expectedFades()).toEqual({ start: true, end: true });
      expect(shownFades()).toEqual(expectedFades());
    });
  });

  it('follows the row when it grows to fit', () => {
    // Turning a phone to landscape gives the row room for every link; nothing scrolls, so only a
    // size change can tell the fades.
    let notify: () => void = () => {};
    vi.stubGlobal(
      'ResizeObserver',
      class {
        constructor(callback: () => void) {
          notify = callback;
        }
        observe(): void {}
        unobserve(): void {}
        disconnect(): void {}
      },
    );
    renderNav('/');
    flushScroll();
    expect(shownFades()).toEqual({ start: false, end: true });

    layout.rowWidth = CONTENT_WIDTH;
    act(() => notify());

    expect(shownFades()).toEqual({ start: false, end: false });
    vi.unstubAllGlobals();
  });

  /*
   * A fade alone is not always a hint. At 365–378 and 430–443 px the row's first overflow falls in
   * the gap between two links, so at the start nothing reaches the end fade and it paints over
   * empty header: measured at 375, 6.5 px of "Tyres" sat under it. The chevron is drawn in the
   * fade itself, so it says "more this way" whatever the row happens to be cut at.
   */
  it('draws a chevron in each fade, pointing the way the hidden links lie', () => {
    renderNav('/');

    expect(fade('end').querySelector('svg.lucide-chevron-right')).not.toBeNull();
    expect(fade('start').querySelector('svg.lucide-chevron-left')).not.toBeNull();
    // Inside the fade, so it shows and hides with it — one state, not two to keep in step.
    expect(fade('end').querySelectorAll('svg')).toHaveLength(1);
    expect(fade('start').querySelectorAll('svg')).toHaveLength(1);
  });

  it('keeps the fades out of the accessibility tree and out of the pointer’s way', () => {
    renderNav('/');

    for (const edge of ['start', 'end'] as const) {
      expect(fade(edge)).toHaveAttribute('aria-hidden', 'true');
      expect(fade(edge)).toHaveClass('pointer-events-none');
    }
  });

  it('changes the fades without animating them, so reduced motion has nothing to remove', () => {
    renderNav('/');

    for (const edge of ['start', 'end'] as const) {
      // The fade and everything in it, chevron included: a chevron that nudged would be the
      // animated hint this row deliberately does without.
      const animated = [fade(edge), ...Array.from(fade(edge).querySelectorAll('*'))].flatMap((el) =>
        Array.from(el.classList).filter((c) => /^(transition|animate|duration)/.test(c)),
      );
      expect(animated).toEqual([]);
    }
  });

  /*
   * A Tabbed-to link must not sit under a fade, or its ring is painted over. Chromium does not
   * guarantee that by itself: measured at 375, focusing a link that is partly scrolled out of the
   * row does not scroll it at all, so the ring sits clipped at the edge, under the fade.
   */
  describe('a link reached by keyboard', () => {
    /** jsdom has no input modality, so `:focus-visible` is modelled: keyboard focus, or not. */
    function focusByKeyboard(link: HTMLElement, keyboard = true): void {
      const matches = Element.prototype.matches;
      const spy = vi.spyOn(Element.prototype, 'matches').mockImplementation(function (
        this: Element,
        selector: string,
      ) {
        if (selector === ':focus-visible') return keyboard && this === document.activeElement;
        return matches.call(this, selector);
      });
      act(() => link.focus());
      flushScroll();
      spy.mockRestore();
    }

    /** The ring's box in the model, and every visible fade it overlaps. */
    function ringProblems(index: number): string[] {
      const left = ROW_LEFT + linkOffset(index) - layout.scrollLeft - RING_REACH;
      const right = left + LINK_WIDTHS[index]! + RING_REACH * 2;
      const problems: string[] = [];
      if (left < ROW_LEFT || right > ROW_LEFT + layout.rowWidth)
        problems.push('clipped by the row');
      const shown = shownFades();
      if (shown.start && left < ROW_LEFT + FADE_WIDTH) problems.push('under the start fade');
      if (shown.end && right > ROW_LEFT + layout.rowWidth - FADE_WIDTH)
        problems.push('under the end fade');
      return problems;
    }

    it('scrolls each link, in Tab order, clear of both fades and of the row’s edges', () => {
      renderNav('/');
      const problems: string[] = [];
      NAV_LINKS.forEach(({ label }, index) => {
        focusByKeyboard(screen.getByRole('link', { name: label }));
        for (const problem of ringProblems(index)) problems.push(`${label}: ${problem}`);
      });
      expect(problems).toEqual([]);
    });

    it('does the same coming back with Shift+Tab', () => {
      renderNav('/');
      scrollRowTo(maxScroll());
      const problems: string[] = [];
      [...NAV_LINKS].reverse().forEach(({ label }) => {
        const index = NAV_LINKS.findIndex((link) => link.label === label);
        focusByKeyboard(screen.getByRole('link', { name: label }));
        for (const problem of ringProblems(index)) problems.push(`${label}: ${problem}`);
      });
      expect(problems).toEqual([]);
    });

    it('leaves the row alone when the focus came from a pointer', () => {
      // A mouse focuses a link on mousedown. Scrolling the row then would slide the link out from
      // under the pointer before mouseup, and the click would land on whatever took its place.
      renderNav('/');
      const before = layout.scrollLeft;
      focusByKeyboard(screen.getByRole('link', { name: 'Tyres' }), false);

      expect(layout.scrollLeft).toBe(before);
    });
  });
});

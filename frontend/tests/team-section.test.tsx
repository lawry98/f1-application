import { describe, it, expect, vi, beforeEach } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';

import { TeamSection } from '@/components/teams/team-section';
import { monogram } from '@/components/teams/team-monogram-tile';
import { TEAMS, TEAM_MAP, type Team } from '@/data/teams-data';
import { inlineColouredText, restingTextNeutrals, ZINC, detach } from './zinc';
import {
  seamWash,
  seamLabelColor,
  readableOnDark,
  SEAM_WASH_ALPHA,
  sectionGradient,
  sectionStandingColor,
  sectionStandingBackdrop,
  sectionSurfaceBackdrop,
  contrastRatio,
  MIN_CONTRAST,
  GLOW_PEAK_OPACITY,
  DARK_BG,
} from '@/lib/team-utils';

/**
 * `RedactedReveal` and `BlurFadeReduced` both branch which *elements* they return on
 * `useReducedMotionSafe`, which wraps motion's `useReducedMotion`. That hook cannot be driven
 * through `window.matchMedia` — motion caches the answer in a module global on the first call and
 * queries `(prefers-reduced-motion)` rather than `(prefers-reduced-motion: reduce)` — so the whole
 * branch drives it by partial-mocking the module over a mutable flag. Spreading `actual` keeps real
 * `motion` elements, `useInView`, `useMotionValue` and `useSpring` working, which this section and
 * `NumberTicker` all need.
 */
let reduceMotion = false;

vi.mock('motion/react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('motion/react')>();
  return { ...actual, useReducedMotion: () => reduceMotion };
});

beforeEach(() => {
  reduceMotion = false;
});

const mclaren = TEAM_MAP['mclaren']!;
// McLaren's #ff8700 already clears AA everywhere, so it cannot show the seam fix. Ferrari
// is one of the seven that failed on the wash.
const ferrari = TEAM_MAP['ferrari']!;
// The worst livery on this page for anything light: Haas's white composites the section stack to
// `#4a4a4b`, the lightest backdrop any section copy can sit on.
const haas = TEAM_MAP['haas']!;

function renderSection(overrides: Partial<Parameters<typeof TeamSection>[0]> = {}) {
  return render(
    <TeamSection
      team={mclaren}
      index={2}
      isActive
      onInspect={vi.fn()}
      reducedMotion={false}
      {...overrides}
    />,
  );
}

/**
 * Take the three regimes that are *not* the section stack out of `container`, so what is left is
 * text sitting on the gradient + glow composite and nothing else.
 *
 * Every exclusion here is a settled exception with its own backdrop helper and its own test file,
 * and each is pulled by a property or an explicit selector with a **pinned count**, so the hole
 * cannot widen silently — a fourth exempt surface fails the count rather than slipping through.
 *
 *   - `aria-hidden` subtrees carry no text a reader ever gets (the watermark, the topo texture,
 *     the redaction bar), so they are not judged as text at all.
 *   - The driver portraits. Their caption sits on a photograph behind `portraitScrim()`, which is
 *     a background no section-level helper describes; `driver-portrait.test.tsx` measures it
 *     against `portraitCaptionBackdrop()`. `aspect-[3/4]` is this file's own call-site class on
 *     `DriverPortrait`, deliberately rather than anything inside that component, which another
 *     agent owns.
 *   - The CTA button and the monogram tile. Both paint an **opaque team-colour fill** and take
 *     their label from `onColor`, which picks black or white against that fill. Measuring either
 *     against the section stack measures a background they never have.
 */
function sectionStackOnly(container: HTMLElement, team: Team): HTMLElement {
  const hidden = Array.from(container.querySelectorAll<HTMLElement>('[aria-hidden="true"]'));

  // Outermost matches only. `DriverPortrait` forwards this className down its own tree, so the
  // class legitimately appears on more than one node per portrait; counting the roots is what
  // makes the pin describe "one portrait per driver" rather than that component's internals,
  // which another agent owns.
  const aspected = Array.from(container.querySelectorAll<HTMLElement>('*')).filter((el) =>
    el.classList.contains('aspect-[3/4]'),
  );
  const portraits = aspected.filter((el) => !aspected.some((o) => o !== el && o.contains(el)));
  expect(
    portraits,
    'driver portraits no longer identifiable by their call-site class',
  ).toHaveLength(team.drivers.length);

  // One CTA, one monogram tile. `[role="img"]` is `TeamMonogramTile`'s own marker; the portraits'
  // `next/image` elements carry an implicit role, not the attribute, and are gone by now anyway.
  const selfBacked = Array.from(
    container.querySelectorAll<HTMLElement>('button, [role="img"]'),
  ).filter((el) => Boolean(el.textContent?.trim()));
  expect(
    selfBacked,
    'a new self-backed surface appeared — give it a backdrop of its own',
  ).toHaveLength(2);

  detach([...hidden, ...portraits, ...selfBacked]);
  return container;
}

describe('TeamSection', () => {
  it('renders both drivers as portraits', () => {
    renderSection();
    expect(screen.getByAltText('Lando Norris')).toBeInTheDocument();
    expect(screen.getByAltText('Oscar Piastri')).toBeInTheDocument();
  });

  it('keeps the constructor name and meta stats', () => {
    renderSection();
    expect(screen.getByText('Woking, United Kingdom')).toBeInTheDocument();
    expect(screen.getByText('1966')).toBeInTheDocument();
  });

  it('renders a decorative watermark that screen readers ignore', () => {
    const { container } = renderSection();
    const watermark = container.querySelector('[data-testid="team-watermark"]');
    expect(watermark).toHaveAttribute('aria-hidden', 'true');
  });

  it('exposes a scroll target id for the nav rail and hero to jump to', () => {
    renderSection();
    expect(document.getElementById('team-mclaren')).toBeInTheDocument();
  });

  // The glow blob only ever animates `opacity`. Hinting `transform` promoted eleven
  // 40vw×40vw compositor layers for the whole life of the page and bought nothing.
  it('hints will-change for the only property the glow blob animates', () => {
    const { container } = renderSection();
    const blob = container.querySelector('.pointer-events-none.absolute[style*="blur"]');
    expect(blob).not.toBeNull();
    expect(blob!.className).toMatch(/will-change-\[opacity\]/);
    expect(blob!.className).not.toMatch(/will-change-transform/);
  });

  it('draws the watermark from the shared monogram helper', () => {
    const { container } = renderSection();
    expect(container.querySelector('[data-testid="team-watermark"]')).toHaveTextContent(
      monogram(mclaren.shortName),
    );
  });

  // Brief item 5. Eleven per-section observers firing on isIntersecting fought at every
  // boundary. The page has exactly one spy now, and it lives in hooks/use-scroll-spy.ts.
  //
  // vi.spyOn(globalThis, 'IntersectionObserver') looks like the natural way to assert
  // this, but tinyspy's wrapper does not forward `new` correctly for this constructor:
  // the instance it hands back is missing the real prototype (no .observe), which
  // breaks BlurFade's own legitimate useInView call and fails every test in this file,
  // not just this one. Subclassing the real observer keeps `new` working (constructor
  // chains through `super`) while still letting us record what it was constructed with.
  it('constructs no IntersectionObserver of its own', () => {
    const RealObserver = globalThis.IntersectionObserver;
    const calls: ConstructorParameters<typeof IntersectionObserver>[] = [];
    class TrackingObserver extends RealObserver {
      constructor(...args: ConstructorParameters<typeof IntersectionObserver>) {
        super(...args);
        calls.push(args);
      }
    }
    globalThis.IntersectionObserver = TrackingObserver as unknown as typeof IntersectionObserver;

    try {
      renderSection();
    } finally {
      globalThis.IntersectionObserver = RealObserver;
    }

    // BlurFade's useInView legitimately builds its own; what must not appear is one
    // observing this section for activation purposes.
    const activationObservers = calls.filter(
      ([, options]) => options?.rootMargin?.includes('-15%') ?? false,
    );
    expect(activationObservers).toHaveLength(0);
  });

  // Brief item 4: the browser does the scrolling, against this offset. No handler maths.
  it('carries a scroll offset so an anchored jump clears the fixed nav', () => {
    renderSection();
    const section = document.getElementById('team-mclaren');
    expect(section?.className).toMatch(/scroll-mt-\[var\(--teams-scroll-offset\)\]/);
  });

  // Brief item 10's consequence: the dossier is gone below xl, so the standing has to be
  // in the section or it disappears from the page below 1280px.
  it('states the team’s championship standing', () => {
    renderSection();
    expect(screen.getByTestId('section-standing')).toHaveTextContent('P3');
    expect(screen.getByTestId('section-standing')).toHaveTextContent('220 PTS');
  });

  // This line sits inside the glow blob, not beside it: the blob is 40vw wide with a 120px blur
  // in an 840px-wide section, so at 1440x900 its core covers the content column. Measured in a
  // browser with the glyphs hidden, the pixel behind them was the livery at ~0.78 alpha, where
  // Ferrari's `readableOnDark` red reads 1.40:1 and Alpine admits no readable colour at all.
  it('colours the standing line against the glow, not against the page background', () => {
    render(
      <TeamSection team={ferrari} index={1} isActive onInspect={vi.fn()} reducedMotion={false} />,
    );
    const standing = screen.getByTestId('section-standing');
    expect(standing).toHaveStyle({ color: sectionStandingColor(ferrari.color) });
    // The colour it used to get, which fails on the glow.
    expect(sectionStandingColor(ferrari.color)).not.toBe(readableOnDark(ferrari.color));
    expect(
      contrastRatio(sectionStandingColor(ferrari.color), sectionStandingBackdrop(ferrari.color)),
    ).toBeGreaterThanOrEqual(MIN_CONTRAST);
  });

  // The glow keeps the true livery — it is a large decorative fill, and a lightened one stops
  // reading as the livery. What came down is its *strength*: at the peak of 1 it shipped with,
  // no text colour on the column cleared AA, white included.
  // `initial={{ opacity: 0 }}` is what motion writes during render, so the animated target is
  // only observable once it has run a frame — hence `waitFor` rather than a bare assertion.
  it('paints the glow in the true livery at the damped peak the contrast maths assumes', async () => {
    const { container } = render(
      <TeamSection team={ferrari} index={1} isActive onInspect={vi.fn()} reducedMotion />,
    );
    const glow = container.querySelector<HTMLElement>('[style*="blur(120px)"]');
    expect(glow, 'no glow blob found').not.toBeNull();
    expect(glow!.style.backgroundColor).toBe('rgb(220, 0, 0)');
    await waitFor(() => expect(Number(glow!.style.opacity)).toBeCloseTo(GLOW_PEAK_OPACITY, 5));
  });

  // The section's meta labels — Constructor, Base, Power Unit, First Entry, Championships, the
  // tagline and the bottom team name — were `zinc-500`, then `zinc-400`, and are now `zinc-300`.
  //
  // This used to measure them against `DARK_BG`, and that assertion was true but had stopped
  // being the binding one: the section paints a livery gradient *under* the glow blob, so the
  // background these runs really have is the livery composited twice, which is lighter than the
  // page and therefore the *stricter* of the two for light-on-dark text. Measuring against the
  // page reported a safe number, passed, and left the rendered page failing — the exact
  // wrong-background failure `CLAUDE.md` records this page shipping twice. The next test pins the
  // "stricter" premise down rather than assuming it.
  //
  // All eleven liveries, not one: the composite is a function of the team colour, so a single
  // sample proves nothing about Haas's white — which is the case that actually fails.
  it('holds every resting neutral above AA on the section stack, for all eleven teams', () => {
    for (const team of TEAMS) {
      const { container } = render(
        <TeamSection team={team} index={0} isActive onInspect={vi.fn()} reducedMotion={false} />,
      );
      const neutrals = restingTextNeutrals(sectionStackOnly(container, team));
      const backdrop = sectionSurfaceBackdrop(team.color);

      // Non-vacuity. Detaching four groups from the tree makes "measured nothing" a live way for
      // this to pass, and it is the one outcome that would look identical to success.
      expect(neutrals.length, `${team.id} rendered no resting neutrals at all`).toBeGreaterThan(0);
      for (const { hex, text } of neutrals) {
        expect(
          contrastRatio(hex, backdrop),
          `${team.id}: ${hex} on "${text}" over ${backdrop}`,
        ).toBeGreaterThanOrEqual(MIN_CONTRAST);
      }
      cleanup();
    }
  });

  it('is right that the section stack is the stricter background of the two', () => {
    // The premise the test above rests on, asserted rather than assumed: both decorative layers
    // are a livery over a near-black page, and every 2026 livery is lighter than `#09090b`, so the
    // composite can only ever be lighter than the page and a light neutral can only ever score at
    // or below its page ratio. A future livery darker than the background would flip that, the
    // test above would silently become the lenient one, and nothing else would notice.
    for (const team of TEAMS) {
      const { container } = render(
        <TeamSection team={team} index={0} isActive onInspect={vi.fn()} reducedMotion={false} />,
      );
      const backdrop = sectionSurfaceBackdrop(team.color);

      for (const { hex, text } of restingTextNeutrals(sectionStackOnly(container, team))) {
        expect(contrastRatio(hex, backdrop), `${team.id}: ${hex} on "${text}"`).toBeLessThanOrEqual(
          contrastRatio(hex, DARK_BG),
        );
      }
      cleanup();
    }
  });

  // The rung, pinned by its negative. Without this the move off `zinc-400` reads as taste and gets
  // reverted to match the rest of the branch, whose floor really is `zinc-400`. `#ffffff` is Haas,
  // the worst case: it composites the stack to `#4a4a4b`, where `zinc-400` is 3.45:1 and
  // `zinc-300` is 5.99:1. `zinc-400` was already marginal here before the gradient existed —
  // 4.78:1 on the glow alone, 0.28 of headroom — so this is spending the last of an old problem
  // rather than the gradient creating a new one.
  it('would fail on zinc-400, which is why this section is a rung lighter than the branch', () => {
    const worst = sectionSurfaceBackdrop('#ffffff');

    expect(worst).toBe('#4a4a4b');
    expect(contrastRatio(ZINC['400']!, worst)).toBeLessThan(MIN_CONTRAST);
    expect(contrastRatio(ZINC['300']!, worst)).toBeGreaterThanOrEqual(MIN_CONTRAST);
  });

  // `restingTextNeutrals` reads `text-zinc-N` classes and so sees none of this page's most
  // contrast-sensitive text: the liveries arrive as inline `style={{ color }}` from
  // `lib/team-utils.ts`. A suite built only on the class walker would pass over `/teams` while
  // measuring nothing that can actually fail. `inlineColouredText` is its counterpart, and it is
  // deliberately not filtered to team colours — a call site painting a raw livery straight onto
  // text shows up here as a failing ratio rather than as an absence.
  it('puts every inline-coloured run through the contrast layer, for all eleven teams', () => {
    for (const team of TEAMS) {
      const { container } = render(
        <TeamSection team={team} index={0} isActive onInspect={vi.fn()} reducedMotion={false} />,
      );
      const runs = inlineColouredText(sectionStackOnly(container, team));
      const backdrop = sectionSurfaceBackdrop(team.color);

      // The seam label and the standing line, both team-coloured. Two is the count, not a floor
      // that happens to hold — if one of them stops being painted this way the assertion below
      // would have nothing left to measure.
      // `.slice(0, 32)` because both walkers truncate the text they report — it is a failure
      // message, not a payload — and "Visa Cash App Racing Bulls F1 Team" is longer than that.
      expect(runs.map((r) => r.text)).toEqual([
        team.name.slice(0, 32),
        expect.stringContaining('PTS'),
      ]);
      for (const { hex, text } of runs) {
        expect(
          contrastRatio(hex, backdrop),
          `${team.id}: ${hex} on "${text}" over ${backdrop}`,
        ).toBeGreaterThanOrEqual(MIN_CONTRAST);
      }
      cleanup();
    }
  });

  // Brief item 3's trap. The dossier moves to xl, so the button that reaches the 3D
  // inspector has to survive down to xl — not lg — or 1024-1279px gets neither.
  it('exposes the inspect action below xl, not below lg', () => {
    renderSection();
    const button = screen.getByRole('button', { name: /inspect/i });
    const wrapper = button.closest('[class*="hidden"]') ?? button.parentElement;
    expect(wrapper?.className).toMatch(/xl:hidden/);
    expect(wrapper?.className).not.toMatch(/(^|\s)lg:hidden/);
  });

  // Brief item 9: the separator used to be a 1px rule in this section's own colour at its
  // top edge, sitting directly under the previous team's content, where it read as that
  // team's bottom border.
  it('opens with a seam that names the team it introduces', () => {
    renderSection();
    const seam = screen.getByTestId('team-seam');
    expect(seam).toHaveTextContent(mclaren.name);
  });

  // The contrast maths lives in team-utils and is asserted over all eleven teams there.
  // What that cannot see is the component quietly authoring its own gradient or its own
  // label colour again — which is exactly how the seam failed AA in the first place. These
  // two pin the rendered DOM to the helpers, so the wash alpha and the label can only be
  // retuned together.
  // jsdom normalises the `#rrggbbaa` stop the component writes into `rgba(r, g, b, a)`, so
  // this compares the channels rather than the serialised text — which also keeps it from
  // breaking on a jsdom that serialises differently.
  it('paints the wash from the shared helper, at the authored alpha', () => {
    const { container } = render(
      <TeamSection team={ferrari} index={0} isActive onInspect={vi.fn()} reducedMotion={false} />,
    );
    const seam = container.querySelector<HTMLElement>('[data-testid="team-seam"]')!;

    const rendered = /rgba\(\s*(\d+),\s*(\d+),\s*(\d+),\s*([\d.]+)\s*\)/.exec(
      seam.getAttribute('style') ?? '',
    );
    expect(rendered, 'seam wash is not a translucent colour stop').not.toBeNull();

    const wash = seamWash(ferrari.color);
    const expected = [1, 3, 5].map((i) => parseInt(wash.slice(i, i + 2), 16));
    expect([1, 2, 3].map((i) => Number(rendered![i]))).toEqual(expected);
    expect(Number(rendered![4])).toBeCloseTo(SEAM_WASH_ALPHA, 2);
  });

  it('colours the seam label against the wash, not against the page background', () => {
    render(
      <TeamSection team={ferrari} index={0} isActive onInspect={vi.fn()} reducedMotion={false} />,
    );
    const label = screen.getByTestId('team-seam-label');
    expect(label).toHaveStyle({ color: seamLabelColor(ferrari.color) });
    // The bug: this is the colour it used to get, and it fails AA on the wash.
    expect(seamLabelColor(ferrari.color)).not.toBe(readableOnDark(ferrari.color));
  });

  // Same reason the seam pins its wash to `seamWash`: the contrast maths lives in `team-utils`
  // and is asserted across all eleven liveries there, but nothing there can see this component
  // quietly authoring its own gradient at its own alpha. Pinning the rendered declaration to the
  // helper is what keeps `SECTION_GRADIENT_PEAK_ALPHA`, the neutral floor and this markup able to
  // move only together. All eleven, because the string is a function of the team colour.
  it('paints the per-team gradient from the shared helper, for all eleven teams', () => {
    for (const team of TEAMS) {
      const { container } = render(
        <TeamSection team={team} index={0} isActive onInspect={vi.fn()} reducedMotion={false} />,
      );
      const gradient = container.querySelector<HTMLElement>('[data-testid="team-gradient"]');

      expect(gradient, `${team.id} paints no section gradient`).not.toBeNull();
      // `sectionGradient` writes `rgba()` rather than `#RRGGBBAA` precisely so this is readable:
      // jsdom's CSS parser drops the eight-digit hex form inside a gradient and the whole
      // declaration would come back empty, which looks identical to the component not setting it.
      //
      // The helper's own string is round-tripped through a throwaway element rather than compared
      // literally, because jsdom re-serialises a gradient it understands — it drops `to bottom`,
      // which is the default direction. Both sides therefore go through the same normalisation and
      // the assertion still fails on any real change to the helper. The emptiness check below is
      // what keeps that from degenerating into `'' === ''` if the parser ever rejects the value.
      const reference = document.createElement('div');
      reference.style.background = sectionGradient(team.color);
      expect(reference.style.background, 'jsdom parsed no gradient at all').not.toBe('');
      expect(gradient!.style.background).toBe(reference.style.background);
      expect(gradient).toHaveAttribute('aria-hidden', 'true');
      expect(gradient!.classList.contains('pointer-events-none')).toBe(true);
      cleanup();
    }
  });

  /**
   * The single most valuable assertion about the texture. `TopoBackground` strokes `currentColor`
   * and sets no colour of its own, so an instance with no colour class resolves to `rgb(0, 0, 0)`
   * on a near-black page — invisible, and indistinguishable from a correctly coloured one in a
   * screenshot, because there is nothing wrong to see. That exact bug shipped once on this branch
   * already. jsdom cannot sample pixels, so asserting the class is the only way to catch it.
   *
   * `opacity-[0.04]` is the spec's 4%, and it has to *win* over the component's own
   * `opacity-[0.12]` default through tailwind-merge — asserting the absence of the default is what
   * proves the merge actually resolved rather than emitting both.
   */
  it('gives the topo texture a colour and the spec 4%, not its own 12% default', () => {
    const { container } = renderSection();
    const topo = Array.from(container.querySelectorAll('svg')).find((svg) =>
      svg.querySelector('pattern'),
    );

    expect(topo, 'no TopoBackground rendered in the section').toBeDefined();
    expect(topo!.classList.contains('text-ink')).toBe(true);
    expect(topo!.classList.contains('opacity-[0.04]')).toBe(true);
    expect(topo!.classList.contains('opacity-[0.12]')).toBe(false);
    expect(topo).toHaveAttribute('aria-hidden', 'true');
  });

  /**
   * The collapse trap, pinned.
   *
   * `RedactedReveal` runs the call site's `className` through `cn()`, and tailwind-merge reads an
   * arbitrary `text-[…]` whose value is not a plain length — `clamp()` is not — as a *colour*
   * utility. A size and `text-ink` in one string therefore collapse to whichever came last, and
   * the heading silently loses one of them. The fix is that the colour is not in that string at
   * all: it sits on the wrapper and the h2 inherits it. Asserting the h2 carries **no** colour
   * class of its own is what stops someone "helpfully" adding one back.
   *
   * `RedactedReveal` renders one `inline-block` element per child and no outer wrapper, so a
   * single child is exactly one h2 — the one the page's heading order needs.
   */
  it('renders one h2 that inherits ink from an ancestor rather than carrying a colour itself', () => {
    const { container } = renderSection();
    const headings = container.querySelectorAll('h2');

    expect(headings).toHaveLength(1);
    const heading = headings[0]!;
    expect(heading).toHaveTextContent(mclaren.shortName);

    const ownColourClasses = Array.from(heading.classList).filter((c) =>
      /^text-(ink|white|black|zinc-\d+|f1-red|brand)$/.test(c),
    );
    expect(ownColourClasses, 'the heading is carrying its own colour again').toEqual([]);
    expect(heading.closest('.text-ink'), 'nothing above the heading declares ink').not.toBeNull();

    // The column-scoped size, verbatim. `.text-mega`'s `clamp(4rem, 14vw, 12rem)` is measured
    // against the viewport, and the heading's row is 724px at 1440 — `MERCEDES` at the 192px cap
    // is ≈1136px and gets clipped by the section's own `overflow-hidden`.
    //
    // The 5.25rem cap is pinned rather than merely "some clamp": it was measured in Chromium
    // across all eleven names, and 84px is the last size at which `ASTON MARTIN` — the widest,
    // which is not the longest *word* — still clears the column with margin. At 92px it wraps to
    // two lines, and a taller section changes what `use-scroll-spy` measures. jsdom cannot see
    // any of that, so the string is the only thing guarding it.
    expect(heading.classList.contains('text-[clamp(2.5rem,6vw,5.25rem)]')).toBe(true);
    expect(heading.classList.contains('text-mega')).toBe(false);
  });

  // The reveal must never gate whether the heading *exists* — worst case for a stuck animation is
  // cosmetic, never missing copy. Under the preference the bar element is not rendered at all
  // (the static *final* state, not a frozen initial one), and the rest of the section is intact.
  //
  // `useReducedMotionSafe` returns `false` on the first render and flips in a layout effect, so a
  // plain `render()` with the flag set exercises the false→true transition inside `act` — no
  // rerender needed. The un-reduced half of the pair is asserted first so this cannot pass on a
  // component that never renders a bar in either state.
  it('renders the full section with no redaction bar under reduced motion', () => {
    const { container: motionContainer } = renderSection();
    expect(
      motionContainer.querySelectorAll('h2 [aria-hidden="true"].bg-ink'),
      'no ink redaction bar in the un-reduced state — the reduced assertion below is vacuous',
    ).toHaveLength(1);
    cleanup();

    reduceMotion = true;
    const { container } = renderSection();

    expect(container.querySelectorAll('h2 [aria-hidden="true"].bg-ink')).toHaveLength(0);
    expect(container.querySelector('h2')).toHaveTextContent(mclaren.shortName);
    // …and the rest of the section came with it: tagline, meta values, both portraits.
    expect(screen.getByText(mclaren.tagline)).toBeInTheDocument();
    expect(screen.getByText('Woking, United Kingdom')).toBeInTheDocument();
    expect(screen.getByAltText('Lando Norris')).toBeInTheDocument();
    expect(screen.getByAltText('Oscar Piastri')).toBeInTheDocument();
  });

  // Haas is the livery that forces the whole neutral floor, so it gets an explicit render rather
  // than only appearing inside an eleven-team loop where a failure names a team and nothing else.
  it('survives the worst livery on the page', () => {
    const { container } = render(
      <TeamSection team={haas} index={0} isActive onInspect={vi.fn()} reducedMotion={false} />,
    );
    const backdrop = sectionSurfaceBackdrop(haas.color);

    expect(backdrop).toBe('#4a4a4b');
    for (const { hex, text } of restingTextNeutrals(sectionStackOnly(container, haas))) {
      expect(contrastRatio(hex, backdrop), `${hex} on "${text}"`).toBeGreaterThanOrEqual(
        MIN_CONTRAST,
      );
    }
  });
});

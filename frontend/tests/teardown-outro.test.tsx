import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { TeardownOutro } from '@/components/teardown/teardown-outro';
import { cardSurfaceBackdrop, contrastRatio, DARK_BG, MIN_CONTRAST } from '@/lib/team-utils';
import { restingTextNeutrals } from './zinc';

/**
 * The four 2026-regulation figures, copied out of the component by hand on purpose — importing
 * `STATS` from the source would make every assertion below tautological, agreeing with whatever
 * the component says today even if a value got rounded or dropped in a future edit. These are the
 * exact numbers the task brief names as ones the parent cites in the commit message.
 */
const STAT_VALUES = ['1000', '15000', '768', '5'];
const STAT_UNITS = ['HP', 'RPM', 'KG', 'G'];
const STAT_LABELS = ['Power unit output', 'Rev limit', 'Minimum weight', 'Peak cornering'];

/**
 * The four "systems" card copy blocks, likewise copied out by hand rather than imported — these
 * are cited verbatim in the task brief and (per that brief) in the parent's commit message, so the
 * test should fail if a future edit rounds, rewords, or drops one rather than silently agreeing
 * with whatever the component says.
 */
const SYSTEM_KICKERS = [
  '01 · Power unit',
  '02 · Aerodynamics',
  '03 · Chassis',
  '04 · Tyres and brakes',
];
const SYSTEM_TITLES = ['V6 turbo-hybrid', 'Active wings', 'Carbon monocoque', '18-inch slicks'];
const SYSTEM_FOOTERS = ['~1000 HP combined', 'Active aero', 'Monocoque + halo', 'Carbon discs'];

/**
 * The four road-car comparison rows, likewise copied out by hand — cited verbatim in the task
 * brief and (per that brief) in the parent's commit message, so a future edit that rounds,
 * recomputes, or drops one fails here rather than agreeing with whatever the component says.
 * `ROW_UNITS` includes `'KG'` — the same unit `STAT_UNITS` already uses for "Minimum weight" —
 * on purpose: the brief's downforce row and the existing minimum-weight stat are both genuinely
 * measured in kilograms, so the page now has two independent, correct `'KG'` labels. That is
 * exactly what breaks a singular `getByText('KG')`, which is why the stat-units assertion below
 * was changed to `getAllByText`; see that test's comment.
 */
const ROW_LABELS = ['0–100 km/h', '100–0 km/h braking', 'Downforce at 250 km/h', 'Power to weight'];
const ROW_F1_VALUES = ['2.6', '15', '1000', '1300'];
const ROW_UNITS = ['S', 'M', 'KG', 'HP/T'];
const ROW_ROAD_VALUES = ['3.5 s', '32 m', 'near zero', '450 hp/t'];

describe('TeardownOutro', () => {
  describe('content survives', () => {
    it('renders the kicker', () => {
      render(<TeardownOutro />);
      expect(screen.getByText('By the numbers')).toBeInTheDocument();
    });

    it('renders the full heading sentence despite it being split across spans', () => {
      // The accent run ("behind the car") is its own <span> so the caps/serif treatment can
      // apply to it alone — that is the branch's mixed-type heading idiom: ALL-CAPS
      // `font-display` in `ink` with one or two accent words swapped to `font-serif-display`
      // italic in `f1-red`, the accent staying sentence-case because the contrast between the
      // two cases is the point. A naive
      // `getByText('The numbers behind the car.')` therefore finds nothing, because Testing
      // Library matches per element and no single element holds the whole sentence. Normalising
      // `textContent` is what proves the sentence still reads correctly once the spans are
      // flattened, which is what a screen reader and a copy-paste both actually get.
      render(<TeardownOutro />);
      const heading = screen.getByRole('heading', { level: 2 });

      expect(heading.textContent?.replace(/\s+/g, ' ').trim()).toBe('The numbers behind the car.');
    });

    it('renders all four stat values, units and labels verbatim', () => {
      // MegaStat's non-animating path (jsdom's stubbed IntersectionObserver reports everything
      // in view immediately, but `useReducedMotion` still defaults to "no preference" here, so
      // this exercises the counting path) still renders the true final digits in an
      // `aria-hidden` painted span plus an invisible sibling holding the same final text for
      // layout — either way, the final string is in the DOM. Asserting via `getAllByText` (not
      // `getByText`) for the values because MegaStat renders the same final text twice per stat
      // (the width-reserving invisible twin and the live digits), by design.
      render(<TeardownOutro />);

      for (const value of STAT_VALUES) {
        expect(screen.getAllByText(value).length).toBeGreaterThanOrEqual(1);
      }
      for (const unit of STAT_UNITS) {
        // `getAllByText`, not the singular `getByText` this started as: the road-car comparison
        // table added later also carries a `'KG'` unit (its downforce row, genuinely also
        // kilograms — see the `ROW_UNITS` comment above), so `'KG'` is no longer unique on the
        // page. `getByText('KG')` now throws "multiple elements found" rather than failing on
        // content, which is the kind of break the task brief anticipated ("existing assertions"
        // can need updating when new content legitimately duplicates a string) without meaning
        // the underlying check — "KG" is present — is any less true.
        expect(screen.getAllByText(unit).length).toBeGreaterThanOrEqual(1);
      }
      for (const label of STAT_LABELS) {
        expect(screen.getByText(label)).toBeInTheDocument();
      }
    });

    it('renders the closing paragraph', () => {
      render(<TeardownOutro />);
      expect(
        screen.getByText(
          'Every one of those numbers is a compromise with the other three. That is the whole sport.',
        ),
      ).toBeInTheDocument();
    });

    it('renders the second kicker, "Under the bodywork"', () => {
      render(<TeardownOutro />);
      expect(screen.getByText('Under the bodywork')).toBeInTheDocument();
    });

    it('renders the full systems h3 sentence despite it being split across spans', () => {
      // Same reasoning as the h2 test above: the accent run ("one compromise") is its own <span>
      // so the serif/italic/red treatment applies to it alone, so a naive `getByText` against the
      // full sentence finds nothing. Normalising `textContent` proves the sentence reads correctly
      // once the spans are flattened. Selected by id, not `getByRole('heading', { level: 3 })` —
      // there are now two h3s (this one and the scale block's below), so the role query alone is
      // ambiguous and throws; the id pins down *which* h3 this assertion is about.
      const { container } = render(<TeardownOutro />);
      const heading = container.querySelector('#teardown-outro-systems-heading')!;

      expect(heading.textContent?.replace(/\s+/g, ' ').trim()).toBe(
        'Four systems, one compromise.',
      );
    });

    it('renders the full scale h3 sentence despite it being split across spans', () => {
      // The new h3 for this task, same split-across-spans shape as the other two headings in this
      // file — the accent run ("a different animal") is its own <span> for the serif/italic/red
      // treatment, so this asserts the flattened `textContent` rather than a naive `getByText`.
      const { container } = render(<TeardownOutro />);
      const heading = container.querySelector('#teardown-outro-scale-heading')!;

      expect(heading.textContent?.replace(/\s+/g, ' ').trim()).toBe(
        'The same job, a different animal.',
      );
    });

    it('renders all four system-card kickers, titles and footers verbatim', () => {
      render(<TeardownOutro />);

      for (const kicker of SYSTEM_KICKERS) {
        expect(screen.getByText(kicker)).toBeInTheDocument();
      }
      for (const title of SYSTEM_TITLES) {
        expect(screen.getByText(title)).toBeInTheDocument();
      }
      for (const footer of SYSTEM_FOOTERS) {
        expect(screen.getByText(footer)).toBeInTheDocument();
      }
    });

    it('renders the third kicker, "For scale"', () => {
      render(<TeardownOutro />);
      expect(screen.getByText('For scale')).toBeInTheDocument();
    });

    it('renders all four comparison rows — labels, F1 values, units and road-car values verbatim', () => {
      // Values and units are separately matchable because `getNodeText` (the primitive under
      // `getByText`) only reads an element's *direct* text-node children, not descendant elements
      // — so `<td>2.6<sup>S</sup></td>` gives the `<td>` an own-text of `'2.6'` and the `<sup>` an
      // own-text of `'S'`, with no concatenated `'2.6S'` in between to confuse a partial match.
      // That is the same shape `MegaStat` already relies on for its own value/sup split.
      render(<TeardownOutro />);

      for (const label of ROW_LABELS) {
        expect(screen.getByText(label)).toBeInTheDocument();
      }
      for (const value of ROW_F1_VALUES) {
        // getAllByText, not getByText: '1000' also appears as the "By the numbers" power-unit
        // stat's value, itself rendered twice by `MegaStat` (the width-reserving invisible twin
        // plus the live digits — see the STAT_VALUES test above), so '1000' can legitimately
        // match three elements at once here.
        expect(screen.getAllByText(value).length).toBeGreaterThanOrEqual(1);
      }
      for (const unit of ROW_UNITS) {
        // getAllByText: 'KG' also appears in the "By the numbers" stats (Minimum weight, 768 KG)
        // — see the `ROW_UNITS` comment at the top of the file.
        expect(screen.getAllByText(unit).length).toBeGreaterThanOrEqual(1);
      }
      for (const roadValue of ROW_ROAD_VALUES) {
        expect(screen.getByText(roadValue)).toBeInTheDocument();
      }
    });

    it("renders the comparison table's two named column headers", () => {
      render(<TeardownOutro />);
      expect(screen.getByText('Formula 1')).toBeInTheDocument();
      expect(screen.getByText('Road car')).toBeInTheDocument();
    });

    it('renders the closing line above the CTA', () => {
      render(<TeardownOutro />);
      expect(screen.getByText('That is the car. The race is the other half.')).toBeInTheDocument();
    });
  });

  describe('structural contract the parent page depends on', () => {
    it('carries id="teardown-outro" on the section', () => {
      const { container } = render(<TeardownOutro />);
      expect(container.querySelector('section#teardown-outro')).toBeInTheDocument();
    });

    it('labels the section with the heading it points at, not either new h3', () => {
      // This is the assertion the task brief calls out as catching the easy mistake in this
      // change: adding a new heading group is exactly the kind of edit that tempts re-pointing
      // (or duplicating) `aria-labelledby` at the new heading. A section has exactly one
      // accessible name, and it must keep resolving to the original h2 — now checked against
      // *both* h3s (systems, and this task's scale block), not just one.
      const { container } = render(<TeardownOutro />);
      const section = container.querySelector('section#teardown-outro')!;
      const labelledBy = section.getAttribute('aria-labelledby');

      expect(labelledBy).toBe('teardown-outro-heading');
      // Resolving the reference, not just asserting the string: an `aria-labelledby` pointing at
      // an id that no longer exists is silently worse than no label at all, and the attribute
      // alone can't tell you which happened.
      const h2 = screen.getByRole('heading', { level: 2 });
      // `getAllByRole`, not `getByRole`: there are now two h3s on the page (systems, scale), so
      // the singular query throws "multiple elements found" rather than answering the question.
      const h3s = screen.getAllByRole('heading', { level: 3 });
      expect(h3s).toHaveLength(2);
      expect(container.querySelector(`#${labelledBy}`)).toBe(h2);
      for (const h3 of h3s) {
        expect(container.querySelector(`#${labelledBy}`)).not.toBe(h3);
      }
    });

    it('renders exactly four stats', () => {
      const { container } = render(<TeardownOutro />);
      // Seven decorative red tick bars total: one in each of the section's three kickers ("By
      // the numbers", "Under the bodywork", and this task's "For scale"), plus one per MegaStat
      // (each stat draws its own tick above its numeral). Scoped to
      // `[aria-hidden="true"].bg-f1-red` rather than a bare `.bg-f1-red` selector, because the
      // `/briefing` CTA pill also carries `bg-f1-red` as its fill colour — that element is an
      // interactive link, not a decorative tick, and a bare-class selector would silently fold it
      // into this count. This grew from 6 (4 stats + 2 kickers) to 7 when this task's kicker was
      // added, reusing the same shared kicker idiom (and therefore the same red bar) as the other
      // two. That duplication is deliberate, not a copy-paste bug: the kicker idiom is one
      // markup shape — `text-[11px] font-semibold uppercase tracking-[0.2em]` plus an
      // `aria-hidden` `h-1.5 w-5 bg-f1-red` tick — reused verbatim wherever a section opens.
      expect(container.querySelectorAll('[aria-hidden="true"].bg-f1-red')).toHaveLength(
        STAT_VALUES.length + 3,
      );
    });

    it('renders exactly four TicketCards for the systems grid', () => {
      // `.notch-card` is `TicketCard`'s own class, applied only when `notch="bottom-right"`
      // (the default, and what this component uses) — counting it rather than a locally-authored
      // wrapper class ties the assertion to "four TicketCard instances actually rendered", not to
      // this file's own grid markup, which is free to change independently.
      const { container } = render(<TeardownOutro />);
      expect(container.querySelectorAll('.notch-card')).toHaveLength(4);
    });

    it('gives each new h3 its own id, independent of the section label and of each other', () => {
      const { container } = render(<TeardownOutro />);
      // `getAllByRole`: two h3s now exist (systems, scale), so the singular query would throw.
      const h3s = screen.getAllByRole('heading', { level: 3 });
      expect(h3s).toHaveLength(2);

      for (const h3 of h3s) {
        expect(h3.id).toBeTruthy();
        expect(h3.id).not.toBe('teardown-outro-heading');
        expect(container.querySelector(`#${h3.id}`)).toBe(h3);
      }
      // Distinct from each other too: two h3s sharing one id would each still resolve `#id` to
      // *a* h3 in the loop above (whichever the browser returns first for that id), silently
      // hiding the collision.
      expect(h3s[0]!.id).not.toBe(h3s[1]!.id);
    });

    it('sits between the systems TicketCards and the closing CTA line, in document order', () => {
      // The task brief's own name for the bug this guards against: appending the new block at the
      // end instead of splicing it in between the two existing ones. `compareDocumentPosition`
      // with `DOCUMENT_POSITION_FOLLOWING` answers "does B come after A in the document" directly
      // from the DOM tree, which is a stronger check than comparing substring indices in
      // `container.textContent` — it can't be fooled by, say, CSS moving something visually
      // without moving it in the DOM (irrelevant under jsdom, but the assertion should mean the
      // same thing it will once this renders for real).
      const { container } = render(<TeardownOutro />);
      const cards = container.querySelectorAll('.notch-card');
      const lastCard = cards[cards.length - 1]!;
      const scaleHeading = container.querySelector('#teardown-outro-scale-heading')!;
      const closingLine = screen.getByText('That is the car. The race is the other half.');

      const FOLLOWING = Node.DOCUMENT_POSITION_FOLLOWING;
      expect(lastCard.compareDocumentPosition(scaleHeading) & FOLLOWING).toBeTruthy();
      expect(scaleHeading.compareDocumentPosition(closingLine) & FOLLOWING).toBeTruthy();
    });

    it('renders the /briefing CTA as a reachable link with its accessible name', () => {
      render(<TeardownOutro />);
      const link = screen.getByRole('link', { name: 'Generate a Briefing' });

      expect(link).toHaveAttribute('href', '/briefing');
    });
  });

  describe('contrast', () => {
    /**
     * The assertion this section shipped without, and the reason it shipped a regression.
     *
     * Every 11px label here was moved off `zinc-500` in an earlier phase for contrast, and a
     * later pass put `zinc-500` back on three kickers, four card footers and four table cells —
     * with comments asserting it was fine. Nothing failed, because every contrast claim on this
     * branch lived in prose. These tests measure the ratio instead: `zinc-500` is `#71717a`, and
     * `contrastRatio` puts it at 4.12:1 on `zinc-950` and 3.93:1 on the card surface, both under
     * the 4.5:1 floor, so reverting the colour fails here on the number rather than on a class
     * string. WCAG's large-text exemption is not a way out of it either — it begins at 18.66px
     * bold / 24px regular, and the largest neutral in this section is a 14px table cell.
     */
    it('holds every resting neutral above the small-text floor on the card surface', () => {
      // Measured against `cardSurfaceBackdrop()`, not `DARK_BG`, for every neutral in the tree
      // — including the ones sitting directly on the section's `bg-zinc-950`. A translucent
      // white card surface *lightens* what is behind the glyphs, which lowers a light neutral's
      // ratio, so the card composite is the stricter of the two backgrounds this section paints
      // on and clearing it implies clearing bare `zinc-950`. The next test pins that "stricter"
      // premise down rather than leaving it as an assumption, because measuring the right colour
      // against the wrong background is the failure mode this whole test exists to catch: it
      // reports a safe number, passes, and leaves the rendered page failing.
      const { container } = render(<TeardownOutro />);
      const neutrals = restingTextNeutrals(container);
      const cardBg = cardSurfaceBackdrop();

      expect(neutrals.length).toBeGreaterThan(0);
      for (const { hex, text } of neutrals) {
        expect(contrastRatio(hex, cardBg), `${hex} behind "${text}"`).toBeGreaterThanOrEqual(
          MIN_CONTRAST,
        );
      }
    });

    it('is right that the card surface is the stricter background of the two', () => {
      // The premise the test above rests on, asserted rather than assumed: for a light-on-dark
      // neutral, the card composite can only ever score at or below bare `zinc-950`. If a future
      // surface change ever inverted that, the test above would silently become the *lenient*
      // one and stop catching anything.
      const { container } = render(<TeardownOutro />);
      const cardBg = cardSurfaceBackdrop();

      for (const { hex, text } of restingTextNeutrals(container)) {
        expect(contrastRatio(hex, cardBg), `${hex} behind "${text}"`).toBeLessThanOrEqual(
          contrastRatio(hex, DARK_BG),
        );
      }
    });

    it('actually paints neutrals inside the TicketCards, so the card backdrop is exercised', () => {
      // Without this, the two tests above would still pass on a version of this component that
      // had stopped putting any text inside a card at all — the stricter background would be
      // measured against nothing that really sits on it. Each card carries at least its body
      // paragraph and its footer label.
      const { container } = render(<TeardownOutro />);
      const cards = Array.from(container.querySelectorAll('.notch-card'));
      const cardBg = cardSurfaceBackdrop();

      expect(cards).toHaveLength(4);
      for (const card of cards) {
        const neutrals = restingTextNeutrals(card);
        expect(neutrals.length).toBeGreaterThanOrEqual(2);
        for (const { hex, text } of neutrals) {
          expect(contrastRatio(hex, cardBg), `${hex} behind "${text}"`).toBeGreaterThanOrEqual(
            MIN_CONTRAST,
          );
        }
      }
    });
  });

  describe('TopoBackground regression guard', () => {
    /**
     * The single most valuable assertion in this file, per the task brief: a `TopoBackground`
     * with no colour class strokes `currentColor` against a declared-nowhere ancestor colour and
     * resolves to black-on-`zinc-950` — invisible, and indistinguishable from a correctly
     * coloured instance in a screenshot, because there is nothing wrong to see. That exact bug
     * shipped once already on this branch (Phase 3's hero). Asserting the `text-ink` class is
     * present is the only way to catch a missing colour without sampling rendered pixels, which
     * jsdom cannot do at all.
     */
    it('gives TopoBackground a text colour so its currentColor stroke is not invisible', () => {
      const { container } = render(<TeardownOutro />);
      const svg = container.querySelector('svg')!;

      expect(svg).toHaveAttribute('aria-hidden', 'true');
      expect(svg.classList.contains('text-ink')).toBe(true);
    });
  });
});

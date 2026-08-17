/**
 * Tailwind's zinc ramp as hex, and a way to ask a rendered tree which of its text runs take
 * their colour from it.
 *
 * jsdom applies no stylesheet, so a class name is the only thing a test can see. Mapping the
 * class back to the colour Tailwind would paint is what lets the assertions measure a *ratio*
 * rather than pin a string: swap `text-zinc-400` for `text-zinc-500` and the test fails on 4.12
 * being under 4.5, which is the thing that actually matters. The ramp is small and stable, so
 * duplicating six values here is cheaper than parsing Tailwind's config.
 */
export const ZINC: Record<string, string> = {
  '200': '#e4e4e7',
  '300': '#d4d4d8',
  '400': '#a1a1aa',
  '500': '#71717a',
  '600': '#52525b',
  '700': '#3f3f46',
  // Not a text shade on this branch — it is here because it is a *surface*: `bg-zinc-800` is the
  // fill of `/briefing`'s primary input, and the placeholder inside it has to be judged against
  // the layer it really sits on rather than against the page behind the field.
  '800': '#27272a',
};

export interface RestingNeutral {
  /** The hex Tailwind would paint. */
  hex: string;
  /** The text it colours, for a failure message that names the thing on screen. */
  text: string;
}

function zincClass(el: Element): string | null {
  // Resting state only. `hover:`/`focus-visible:` variants are a different state and are
  // allowed to be brighter *or* dimmer than the bar without failing it.
  const match = Array.from(el.classList).find((c) => /^text-zinc-\d+$/.test(c));
  return match ? match.replace('text-zinc-', '') : null;
}

/**
 * Every text run under `root` whose colour comes from a resting `text-zinc-N` class, looking up
 * the tree for the nearest one because these components set the colour on a wrapper as often as
 * on the text itself.
 *
 * Keyed on each element's **own** text children rather than on `textContent`, which matters more
 * than it looks: a first version skipped any element with mixed content — text plus a nested
 * span — and so silently passed the chip strip, whose chip is `zinc-500` label text wrapped
 * around a `zinc-400` span. A test that cannot see the failing case is worse than no test.
 *
 * Text runs only. An icon wrapper coloured `text-zinc-500` carries no text node, is judged
 * against WCAG's 3:1 non-text bar rather than 4.5:1, and is correctly left alone — the hero's
 * scroll-cue chevron is exactly that case.
 *
 * This function only enumerates; it does not choose what to judge the neutrals against. Callers
 * that pass `DARK_BG` are applying a deliberate one-directional lower bound — `zinc-950` is the
 * most permissive surface on the page, so passing it can only ever *undercount* failures. A
 * component whose neutrals actually sit on a lighter composite (a card, a wash) should judge them
 * against that composite instead, which is stricter, not against this function's signature.
 */
export function restingTextNeutrals(root: ParentNode): RestingNeutral[] {
  const out: RestingNeutral[] = [];
  for (const el of Array.from(root.querySelectorAll('*'))) {
    const own = ownText(el);
    if (!own) continue;

    // The walk stops at whichever colour source is *nearer*, and an inline `style="color: …"`
    // beats a class outright in the cascade. `/teams` is why this matters: team liveries arrive
    // as inline colours from `lib/team-utils.ts`, often on a span nested inside a `text-zinc-N`
    // wrapper, and reporting that run at the wrapper's shade would measure a colour the page
    // never paints — the same wrong-input failure `whiteWashSurfaces` guards against on the
    // background side. Those runs belong to `inlineColouredText` below, not here.
    let shade: string | null = null;
    for (let node: Element | null = el; node && !shade; node = node.parentElement) {
      if (inlineColor(node)) break;
      shade = zincClass(node);
    }
    if (!shade) continue;

    const hex = ZINC[shade];
    if (!hex) throw new Error(`add zinc-${shade} to the ZINC map in tests/zinc.ts`);
    out.push({ hex, text: own.slice(0, 32) });
  }
  return out;
}

/** An element's own text children, joined — the unit both walkers key on. */
function ownText(el: Element): string {
  return Array.from(el.childNodes)
    .filter((n) => n.nodeType === 3)
    .map((n) => n.textContent?.trim() ?? '')
    .filter(Boolean)
    .join(' ');
}

/**
 * `#rrggbb` for an element's inline `color`, or `null` if it sets none.
 *
 * jsdom normalises `style={{ color: '#dc0000' }}` to the string `rgb(220, 0, 0)`, so the value
 * has to be converted back before `contrastRatio` — which, like every colour function in
 * `@/lib/team-utils`, parses hex only.
 */
function inlineColor(el: Element): string | null {
  const raw = (el as HTMLElement).style?.color;
  if (!raw) return null;
  const rgb = /^rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(raw);
  if (rgb) {
    return `#${[rgb[1], rgb[2], rgb[3]]
      .map((c) => Number(c).toString(16).padStart(2, '0'))
      .join('')}`;
  }
  if (/^#[0-9a-f]{6}$/i.test(raw)) return raw.toLowerCase();
  throw new Error(`tests/zinc.ts cannot read the inline colour "${raw}"`);
}

/**
 * Every placeholder under `root` whose colour comes from a `placeholder:text-zinc-N` class.
 *
 * A third partition of the tree, and the reason it needs one: a placeholder is an *attribute*,
 * not a text node, and its colour is a variant class rather than a plain one — so
 * `restingTextNeutrals` and `inlineColouredText` between them report **nothing** about it. That
 * is not a theoretical gap. `/briefing`'s primary input shipped `placeholder:text-zinc-500`
 * through a whole phase of contrast work and a whole-branch review at **3.08:1** over its own
 * `bg-zinc-800` fill, while every sweep on the page passed, because no helper could see it.
 *
 * Reported with the placeholder's own text so a failure names the string on screen. An input with
 * no such class is skipped — it inherits the field's text colour, which the other two helpers do
 * see — so pair this with a non-vacuity assertion, the same as the other two.
 */
export function placeholderNeutrals(root: ParentNode): RestingNeutral[] {
  const out: RestingNeutral[] = [];
  for (const el of Array.from(root.querySelectorAll<HTMLElement>('[placeholder]'))) {
    const match = Array.from(el.classList).find((c) => /^placeholder:text-zinc-\d+$/.test(c));
    if (!match) continue;

    const shade = match.replace('placeholder:text-zinc-', '');
    const hex = ZINC[shade];
    if (!hex) throw new Error(`add zinc-${shade} to the ZINC map in tests/zinc.ts`);
    out.push({ hex, text: el.getAttribute('placeholder') ?? '' });
  }
  return out;
}

export interface LiveryRun {
  /** The hex actually painted, normalised out of whatever jsdom stored. */
  hex: string;
  /** The text it colours, for a failure message that names the thing on screen. */
  text: string;
}

/**
 * Every text run under `root` whose colour comes from an inline `style="color: …"`.
 *
 * `restingTextNeutrals`' counterpart, and `/teams` needs it because that page's most
 * contrast-sensitive text is not a `text-zinc-N` class at all — the seam label, the section
 * standing line, the rail's active standings row, the portrait nationality and every `MegaStat`
 * tone override carry a **team livery**, computed at render time by `lib/team-utils.ts` and
 * applied inline. A class-reading helper reports none of them, so a suite built only on
 * `restingTextNeutrals` would pass over `/teams` while measuring nothing that can actually fail.
 *
 * Deliberately **not** filtered to "team colours": it reports every inline-coloured run, so a call
 * site that paints a raw livery straight onto text — bypassing the contrast layer, which is the
 * one mistake `CLAUDE.md` says this page has made twice — shows up here as a failing ratio rather
 * than as an absence.
 *
 * Same keying as `restingTextNeutrals` (an element's *own* text children, nearest colour source
 * walking up), so the two partition the tree between them and neither double-counts the other's
 * runs.
 */
export function inlineColouredText(root: ParentNode): LiveryRun[] {
  const out: LiveryRun[] = [];
  for (const el of Array.from(root.querySelectorAll('*'))) {
    const own = ownText(el);
    if (!own) continue;

    let hex: string | null = null;
    for (let node: Element | null = el; node && !hex; node = node.parentElement) {
      hex = inlineColor(node);
      if (!hex && zincClass(node)) break;
    }
    if (!hex) continue;

    out.push({ hex, text: own.slice(0, 32) });
  }
  return out;
}

/**
 * Every element under `root` that paints a translucent white surface over the page — the ticket
 * cards and icon tiles (`bg-white/[0.03]`), the badges, and the outline pills (`bg-white/[0.02]`).
 *
 * They exist as a group because of the one mistake `CLAUDE.md` records shipping twice on the teams
 * pages — measuring the right *colour* against the wrong *background*. `base` is `#09090B`, and a
 * 2–3% white wash over it is lighter, so text on one of these surfaces scores a *lower* ratio than
 * the same text on bare `base`. Judging a whole section against `DARK_BG` reports every one of
 * them optimistically and passes while the rendered page fails. Pair with `detach` below and
 * `cardSurfaceBackdrop()` from `@/lib/team-utils` to measure each group against what is really
 * behind it.
 *
 * The alphas are pinned in the pattern rather than matched loosely: a new surface at some other
 * alpha is a background this helper has not been told about, and silently including it would be
 * the same wrong-background failure one level up.
 */
export function whiteWashSurfaces(root: ParentNode): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>('*')).filter((el) =>
    Array.from(el.classList).some((c) => /^bg-white\/\[0\.0[23]\]$/.test(c)),
  );
}

/**
 * Move `elements` out of the rendered tree and into a detached parent.
 *
 * Two jobs in one. It takes the washed surfaces out of the container, so whatever is left there is
 * text on bare `base` — and it gives `restingTextNeutrals` a root that *contains* the surfaces
 * rather than being one. That helper walks `querySelectorAll('*')`, which excludes the node it is
 * handed, and an outline pill carries its label as its own text node: handing it the pill directly
 * reports nothing at all, and the assertion passes by measuring an empty list.
 *
 * Nested surfaces are left inside their parent (the feature cards and their icon tiles do this) so
 * that moving one cannot tear it out of the other.
 *
 * **The one way this can silently under-report.** `restingTextNeutrals` walks *up* the tree for the
 * nearest `text-zinc-N`, and detaching severs that chain: text whose colour is set on an ancestor
 * that stays behind in the original container loses its shade and is dropped from the measurement
 * with no failure — the same silent skip the helper was written to defeat. Nothing hits this today
 * (all three landing sections set the colour on the text element itself), but a section that
 * colours a *card wrapper* and relies on inheritance would go unmeasured. If a call site's neutral
 * count ever drops without markup being deleted, this is why.
 */
export function detach(elements: HTMLElement[]): HTMLElement {
  const holder = document.createElement('div');
  elements
    .filter((el) => !elements.some((other) => other !== el && other.contains(el)))
    .forEach((el) => holder.appendChild(el));
  return holder;
}

import { DARK_BG, MIN_CONTRAST, blendOver, liftUntilContrast, ringOnDark } from '@/lib/team-utils';

/**
 * Compound colour → a colour that is actually readable where it is used.
 *
 * This module exists for one reason, and it is the lesson `lib/team-utils.ts` records at
 * length: `readableOnDark` clears 4.5:1 on bare `zinc-950` **by construction** — it returns
 * the first lightness step that clears the bar — so it has zero headroom for anything laid
 * between the glyphs and the page. The explorer puts compound-coloured text on three
 * different backdrops, so there are three helpers, one per backdrop, not one helper overall.
 *
 * The division of labour is the same as the teams page's: **decorative surfaces keep the true
 * hex** — the sidewall band, the glow, the oversized background type, the tablist's active
 * underline — and only glyphs are lifted.
 */

/**
 * Peak opacity of a compound's accent glow, and — deliberately the same number — the alpha
 * its composite is judged at.
 *
 * A contrast constraint before it is an aesthetic one, exactly as `GLOW_PEAK_OPACITY` is for
 * a team section. The glow is a large blurred field behind the copy column, so at full
 * strength the composite under the copy is nearly the compound colour itself, and over the
 * hard compound's near-white or the medium's bright yellow **no text colour clears AA at
 * all** — not even black, since the helpers here only ever lighten. Capping the wash is what
 * keeps a readable colour reachable; `tyre-utils.test.ts` asserts that it still is.
 */
export const TYRE_GLOW_PEAK = 0.18;

/**
 * Tailwind `zinc-900` and the opacity the explorer's cards are authored at — `bg-zinc-900/60`.
 *
 * Kept here rather than inlined so the contrast maths and the class cannot drift: a Tailwind
 * class name cannot be built from a runtime value, so the components keep the literal and the
 * tests pin the two together from both sides.
 */
export const CARD_FILL = '#18181b';
export const CARD_ALPHA = 0.6;

/**
 * Tailwind `zinc-800` and the opacity the tablist's active tab is authored at —
 * `bg-zinc-800/80`.
 *
 * A fourth backdrop rather than a reuse of the card one, because it is *lighter* than the card
 * and therefore stricter. This was found in a browser, not in a test: the active tab first
 * shipped using `compoundTextOnPage`, which clears the bar on bare `zinc-950` by construction
 * and so has no headroom for the highlight sitting behind it — the same mistake this repo has
 * now made three times, and the reason every surface here gets its own function.
 */
export const TAB_FILL = '#27272a';
export const TAB_ALPHA = 0.8;

/** The opaque colour behind the active tab's label. */
export function compoundTabBackdrop(): string {
  return blendOver(TAB_FILL, TAB_ALPHA, DARK_BG);
}

/** A compound colour lifted to AA as the active tab's label. */
export function compoundTextOnTab(hex: string): string {
  return liftUntilContrast(hex, MIN_CONTRAST, compoundTabBackdrop());
}

/** The opaque colour a compound's glow leaves behind the copy that sits inside it. */
export function compoundGlowBackdrop(hex: string): string {
  return blendOver(hex, TYRE_GLOW_PEAK, DARK_BG);
}

/**
 * The opaque colour behind text on an explorer card.
 *
 * `zinc-900` at 0.6 over `zinc-950` flattens to `#121215`, which is **lighter** than the page
 * — a harder background to read on, not an easier one, which is the trap.
 */
export function compoundCardBackdrop(): string {
  return blendOver(CARD_FILL, CARD_ALPHA, DARK_BG);
}

/**
 * Tailwind `zinc-800` and the opacity the allocation section's highlighted row is authored at —
 * `bg-zinc-800/70`, laid on top of a `bg-zinc-900/60` card rather than on the page.
 *
 * The fifth backdrop, and the fifth time this repo has had to learn the same thing. The row's
 * label was coloured with `compoundTextOnCard`, which is judged against the card alone; Soft
 * measured 4.60:1 there and **3.95:1** where the glyphs actually sit, at ~12px — a live AA
 * failure, on the very row the section highlights to make its point.
 *
 * It resolves to the same hex as `compoundTabBackdrop()` by arithmetic coincidence — `/80` over
 * the page happens to match `/70` over a card. They stay separate functions so that changing
 * one cannot silently move the other.
 */
export const TRACKED_ROW_FILL = '#27272a';
export const TRACKED_ROW_ALPHA = 0.7;

/** The opaque colour behind a label on the highlighted allocation row. */
export function compoundTrackedRowBackdrop(): string {
  return blendOver(TRACKED_ROW_FILL, TRACKED_ROW_ALPHA, compoundCardBackdrop());
}

/** A compound colour lifted to AA as a label on the highlighted allocation row. */
export function compoundTextOnTrackedRow(hex: string): string {
  return liftUntilContrast(hex, MIN_CONTRAST, compoundTrackedRowBackdrop());
}

/** A compound colour lifted to AA as small text sitting *inside* that compound's glow. */
export function compoundTextOnGlow(hex: string): string {
  return liftUntilContrast(hex, MIN_CONTRAST, compoundGlowBackdrop(hex));
}

/** A compound colour lifted to AA as small text on a `bg-zinc-900/60` card. */
export function compoundTextOnCard(hex: string): string {
  return liftUntilContrast(hex, MIN_CONTRAST, compoundCardBackdrop());
}

/*
 * There is deliberately no `compoundSurface` / `compoundOnSurface` pair here.
 *
 * They existed, were tested, and had zero call sites — nothing on this page fills a surface
 * with a compound colour, because the tyre's sidewall band and the tablist's dot are strokes
 * and dots rather than fills. They also duplicated `teamColorButtonStyle`'s damping logic. If a
 * compound-filled surface is ever needed, that is the function to reach for.
 */

/** A compound colour lifted to the 3:1 non-text bar, for a focus ring on `zinc-950`. */
export function compoundRing(hex: string): string {
  return ringOnDark(hex);
}

/**
 * The eyebrow label colour, and why it is not the raw `f1-red` token.
 *
 * `#dc2626` is 4.12:1 on `zinc-950`. `/credits` already carries a comment saying so and
 * limiting it to `text-2xl` and up — yet eyebrow labels across the site use it at `text-sm`,
 * which is an AA failure. Rather than copy an existing failure onto a new page, this lifts it
 * to the bar. At 14px the two are indistinguishable; only the ratio changes.
 */
export const EYEBROW_RED = liftUntilContrast('#dc2626', MIN_CONTRAST, DARK_BG);

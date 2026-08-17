/**
 * The branch's focus-visible treatment, in one place.
 *
 * The spec asks for "`focus-visible` rings 2 px red at offset 2 px everywhere". Measured, that
 * rule is not safe everywhere, and the exceptions are not cosmetic — they are the difference
 * between a visible indicator and none:
 *
 * | ring    | against                          | ratio | 3:1 |
 * |---------|----------------------------------|-------|-----|
 * | f1-red  | `base` `#09090B`                 | 4.01  | ok  |
 * | f1-red  | `base-warm` `#140B0B`            | 3.91  | ok  |
 * | f1-red  | topo page `#212124`              | 3.23  | ok  |
 * | f1-red  | topo over `base-warm` `#2C2323`  | 3.08  | ok  |
 * | f1-red  | the rail's active row `#1b1b1e`  | 3.46  | ok  |
 * | f1-red  | a TicketCard's wash over topo    | 2.96  | FAILS |
 * | f1-red  | an `f1-red` fill                 | 1.00  | FAILS |
 * | ink     | an `f1-red` fill                 | 4.50  | ok  |
 *
 * Every figure above is against the colour actually composited on screen, not against the token a
 * class names. Those differ, and the difference is the repo's most-repeated contrast bug: the
 * rail's active row is `bg-zinc-800/60` over the page, so it composites to `#1b1b1e` (red 3.46),
 * **not** to `zinc-800` (red 3.00). Reaching for the token is how an assertion ends up measuring
 * the right colour against the wrong background — `CLAUDE.md` records that shipping three times.
 *
 * WCAG 2.4.11 puts a focus indicator at the **3:1 non-text bar**, not 4.5:1, and judges it against
 * the colours *adjacent* to it. So the rule this file encodes is:
 *
 * 1. Red is the default ring.
 * 2. **On a red fill the ring is `ink`**, because red-on-red is 1.00:1 — an invisible indicator.
 * 3. An offset is only correct when the colour behind the control is a token we can name. A
 *    `ring-offset-base` band on a page whose real backdrop is `#212124` measures 1.24:1 against
 *    that backdrop, i.e. it paints a visible dark halo rather than disappearing. On those
 *    surfaces the ring goes flush (`focusRing`) and takes its contrast from the page itself.
 *
 * The topo composites above are derived from the screenshot-measured `#212124`, not from the
 * authored `opacity-[0.12]`: `TopoBackground` strokes contours rather than filling, so its
 * effective alpha is ~0.105, not 0.12. The derivation reproduces the measured value to within one
 * unit per channel.
 *
 * **`components/ui/button.tsx` is vendored and must not be hand-edited**, and it ships
 * `focus-visible:ring-1 focus-visible:ring-ring` with no offset. Every export here therefore
 * restates `ring-2` and the colour so a call site's `cn()` wins on order, rather than relying on
 * the base being changed.
 */

/**
 * The default: a 2px red ring painted flush against the page.
 *
 * Use on any control sitting directly on `base`, `base-warm`, or a topo page — the ring clears
 * 3:1 on all four of those backdrops (3.08–4.01) and needs no offset band to separate it from
 * anything.
 */
export const focusRing =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-f1-red';

/**
 * A 2px red ring held off the control by a 2px band of `base`.
 *
 * Use on a **filled, non-red** control that sits on `base` — the offset stops the ring being
 * painted onto the fill, which is what would otherwise drop it toward that fill's own colour.
 * Only correct where the surrounding page really is `base`; see rule 3 above.
 */
export const focusRingOffsetBase = `${focusRing} focus-visible:ring-offset-2 focus-visible:ring-offset-base`;

/** As {@link focusRingOffsetBase}, for a control on the warm alternating sections. */
export const focusRingOffsetBaseWarm = `${focusRing} focus-visible:ring-offset-2 focus-visible:ring-offset-base-warm`;

/**
 * The inverse ring, for a control **filled with `f1-red`**.
 *
 * Red on red is 1.00:1 — not a weak indicator, an absent one. `ink` on the same fill is 4.50:1,
 * comfortably over the 3:1 bar, and the offset separates it from the fill so the ring reads as a
 * ring rather than as a border. Pair with the offset that matches the surrounding page.
 */
export const focusRingOnRedFill =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink focus-visible:ring-offset-2';

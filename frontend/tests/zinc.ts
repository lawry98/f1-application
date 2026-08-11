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
 */
export function restingTextNeutrals(root: ParentNode): RestingNeutral[] {
  const out: RestingNeutral[] = [];
  for (const el of Array.from(root.querySelectorAll('*'))) {
    const own = Array.from(el.childNodes)
      .filter((n) => n.nodeType === 3)
      .map((n) => n.textContent?.trim() ?? '')
      .filter(Boolean)
      .join(' ');
    if (!own) continue;

    let shade: string | null = null;
    for (let node: Element | null = el; node && !shade; node = node.parentElement) {
      shade = zincClass(node);
    }
    if (!shade) continue;

    const hex = ZINC[shade];
    if (!hex) throw new Error(`add zinc-${shade} to the ZINC map in tests/zinc.ts`);
    out.push({ hex, text: own.slice(0, 32) });
  }
  return out;
}

import type { RaceCompound } from '@/data/tyres-data';

/**
 * The single-letter shorthand for a compound: H, M, S, I, W.
 *
 * Derived from the **id**, not from the name. `name.charAt(0)` is the obvious version and is
 * wrong on exactly one compound — "Full Wet" starts with F — which is the kind of bug that ships,
 * because four of the five look right and the fifth only appears when you scroll to the end of the
 * range. The ids are `hard | medium | soft | intermediate | wet`, whose initials are the shorthand
 * the sport actually uses.
 *
 * This letter is also the page's **non-colour channel for compound identity**: it is what a
 * reader who cannot distinguish the sidewall colours uses to tell one plate from another, so it
 * is never purely decorative even when it is `aria-hidden` beside a visible name.
 */
export function compoundLetter(compound: Pick<RaceCompound, 'id'>): string {
  return compound.id.charAt(0).toUpperCase();
}

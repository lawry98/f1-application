import { type Team } from '@/data/teams-data';

/**
 * Inline style + extra className for a team-colour-filled CTA.
 *
 * The fill is the true livery unless it is too bright for a dark UI, in which case it is
 * damped to a neutral and given a keyline so the button still has an edge. The label colour
 * is **derived from the fill it actually got**, not from a hand-authored per-team value — a damped
 * fill is no longer the team's colour, so the authored value would be describing the wrong
 * surface.
 */
export function teamColorButtonStyle(team: Team) {
  const damped = needsDamping(team.color);
  const fill = damped ? '#27272a' : team.color;
  return {
    style: {
      backgroundColor: fill,
      color: onColor(fill),
      borderColor: damped ? '#52525b' : 'transparent',
    },
    className: damped ? 'border' : '',
  };
}

/** The season the page describes. Used to derive elapsed seasons from a debut year. */
const CURRENT_SEASON = 2026;

/** Seasons elapsed since a constructor's debut, for the rail's derived stat cell. */
export function seasonsSince(firstEntry: number): number {
  return CURRENT_SEASON - firstEntry;
}

/** The page background every small text colour on it is judged against — Tailwind `zinc-950`. */
export const DARK_BG = '#09090b';

/** WCAG 2.1 AA for text below 18.66px bold / 24px regular. Team colour is only ever used at 9–10px. */
export const MIN_CONTRAST = 4.5;

/**
 * WCAG 2.1 non-text contrast, for UI boundaries rather than glyphs — focus rings above all.
 * Deliberately lower than `MIN_CONTRAST`: a ring is not text, and holding it to the text bar
 * would lighten the darker liveries further than they need to go for no gain.
 */
export const MIN_RING_CONTRAST = 3;

/**
 * Fills above this relative luminance read as blown-out against `zinc-950` and get damped
 * to a neutral before being used as a surface.
 *
 * This replaces a `team.color === '#ffffff'` equality check that only ever covered Haas.
 * The failure it guards against is aesthetic rather than a contrast one — white text on a
 * white button is unreadable, but so is a white button in a page this dark, whatever the
 * label does — so it is expressed as a property of the colour, not a list of hexes.
 */
const MAX_FILL_LUMINANCE = 0.75;

function parseHex(hex: string): [number, number, number] {
  const v = parseInt(hex.replace('#', ''), 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
}

function toHex(rgb: [number, number, number]): string {
  return `#${rgb.map((c) => Math.round(c).toString(16).padStart(2, '0')).join('')}`;
}

function relativeLuminance(hex: string): number {
  const [r, g, b] = parseHex(hex).map((c8) => {
    const c = c8 / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG 2.1 contrast ratio between two opaque hex colours. 1 (identical) to 21 (black on white). */
export function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const [lighter, darker] = la >= lb ? [la, lb] : [lb, la];
  return (lighter + 0.05) / (darker + 0.05);
}

function rgbToHsl([r8, g8, b8]: [number, number, number]): [number, number, number] {
  const [r, g, b] = [r8 / 255, g8 / 255, b8 / 255];
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  if (d === 0) return [0, 0, l];
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h =
    max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h * 60, s, l];
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const hp = (((h % 360) + 360) % 360) / 60;
  const x = c * (1 - Math.abs((hp % 2) - 1));
  const m = l - c / 2;
  const [r, g, b] =
    hp < 1
      ? [c, x, 0]
      : hp < 2
        ? [x, c, 0]
        : hp < 3
          ? [0, c, x]
          : hp < 4
            ? [0, x, c]
            : hp < 5
              ? [x, 0, c]
              : [c, 0, x];
  return [(r + m) * 255, (g + m) * 255, (b + m) * 255];
}

/**
 * `hex` laid over `bg` at `alpha`, flattened to the opaque colour the eye actually receives.
 *
 * Contrast is only ever defined between two opaque colours, so anything that sits on a
 * translucent wash has to be judged against the *result* of that wash, not against whatever
 * is underneath it.
 */
export function blendOver(hex: string, alpha: number, bg: string): string {
  const fg = parseHex(hex);
  const back = parseHex(bg);
  return toHex(fg.map((c, i) => alpha * c + (1 - alpha) * back[i]!) as [number, number, number]);
}

const liftCache = new Map<string, string>();

/**
 * Shared mechanism behind every lift-until-readable helper in this module —
 * `readableOnDark`, `ringOnDark`, `seamLabelColor`, `railStandingColor`, `sectionStandingColor`,
 * `portraitCaptionColor`, and `trayValueColor`: lighten `hex` in HSL, one step of lightness at a
 * time, until it clears `target` contrast against `bg`, then return the first candidate that does.
 * Caches on `` `${bg}:${target}:${hex}` `` so callers using different targets or different
 * backgrounds don't collide.
 *
 * Lightness is raised in HSL rather than blended toward white so hue and saturation survive —
 * the result still reads as the brand colour instead of washing out to grey.
 *
 * Exported because `lib/tyre-utils.ts` needs the same mechanism against its own four backdrops.
 * It is not team-specific — it takes three plain values and knows nothing about a `Team` — and
 * duplicating the HSL walk in a second module to keep this private would be the worse trade.
 */
export function liftUntilContrast(hex: string, target: number, bg: string): string {
  const key = `${bg}:${target}:${hex}`;
  const cached = liftCache.get(key);
  if (cached) return cached;

  let result = hex;
  if (contrastRatio(hex, bg) < target) {
    const [h, s, l] = rgbToHsl(parseHex(hex));
    result = '#ffffff';
    for (let step = l; step <= 1; step += 0.01) {
      const candidate = toHex(hslToRgb(h, s, Math.min(step, 1)));
      if (contrastRatio(candidate, bg) >= target) {
        result = candidate;
        break;
      }
    }
  }

  liftCache.set(key, result);
  return result;
}

/**
 * A team colour lightened just far enough to clear WCAG AA as small text on `zinc-950`.
 *
 * Seven of the eleven 2026 liveries fail 4.5:1 against the page background — Racing Bulls'
 * `#2b4562` sits at 2.02:1, effectively invisible at 10px. Lightness is raised in HSL, so hue
 * and saturation survive and the result still reads as the brand colour; blending toward white
 * instead would wash the hue out.
 *
 * This is for **small text only**. Bars, accent rules, keylines wider than a hairline and glow
 * blobs are large or decorative, exempt from the AA text rule, and must keep the true colour —
 * a livery wall painted in lightened brand colours is no longer a livery wall.
 */
export function readableOnDark(hex: string): string {
  return liftUntilContrast(hex, MIN_CONTRAST, DARK_BG);
}

/**
 * Below this point, five call sites each pair their own backdrop function with a lift-until-
 * readable colour function — `seamLabelColor`, `railStandingColor`, `sectionStandingColor`,
 * `portraitCaptionColor`, `trayValueColor`. The reason all five exist rather than reusing
 * `readableOnDark` is the same every time and stated once here, not per function: `readableOnDark`
 * clears 4.5:1 on bare `zinc-950` *by construction* — it stops at the first lightness step that
 * clears there — so it has zero headroom for any wash, highlight, scrim or card sitting between
 * the glyphs and the page. What differs per site, and is worth restating there, is the measured
 * numbers and *which* element keeps its authored strength while the text moves instead.
 */

/**
 * Opacity of the seam wash where it is strongest — the gradient's first stop, at the top of
 * the band. Authored as the `4d` suffix so the gradient string and the contrast maths cannot
 * drift apart; change it in one place and both follow.
 */
export const SEAM_WASH_ALPHA_HEX = '4d';
export const SEAM_WASH_ALPHA = parseInt(SEAM_WASH_ALPHA_HEX, 16) / 255;

/** The seam gradient's opening stop: the true livery at `SEAM_WASH_ALPHA`. */
export function seamWash(hex: string): string {
  return `${hex}${SEAM_WASH_ALPHA_HEX}`;
}

/**
 * The opaque colour behind the seam label. The label sits *inside* the wash, so `zinc-950`
 * is not what is behind it — the wash over `zinc-950` is.
 *
 * Sampled at full `SEAM_WASH_ALPHA` rather than at the label's own y-position. The wash only
 * fades going down, so judging against its strongest point holds the label readable anywhere
 * in the band, and spares this from depending on the label's exact offset and font size.
 */
export function seamLabelBackdrop(hex: string): string {
  return blendOver(hex, SEAM_WASH_ALPHA, DARK_BG);
}

/**
 * A team colour lifted far enough to clear WCAG AA as the seam's small caps label.
 *
 * Judged against the background the label really has, `readableOnDark` leaves seven of the
 * eleven liveries between 3.58 and 4.03 — Audi at 3.58, Williams 3.60, Aston Martin 3.63,
 * Cadillac 3.70, Ferrari 3.75, Red Bull 3.80, Racing Bulls 3.98. The wash is what the seam
 * exists for, so the wash keeps its authored strength and the *label* moves instead.
 */
export function seamLabelColor(hex: string): string {
  return liftUntilContrast(hex, MIN_CONTRAST, seamLabelBackdrop(hex));
}

/**
 * Tailwind `zinc-800`, and the opacity the nav rail's active-row highlight is authored at —
 * `bg-zinc-800/60`. Authored here so the contrast maths and the class cannot drift apart; a
 * Tailwind class name cannot be built from a runtime value, so the component keeps the literal
 * and `teams-nav-rail.test.tsx` pins the two together.
 */
export const RAIL_ACTIVE_FILL = '#27272a';
export const RAIL_ACTIVE_ALPHA = 0.6;

/**
 * The opaque colour behind the active rail row's standings line. The row is the one place in
 * the rail that is not on bare `zinc-950`: the highlight is a translucent `zinc-800` wash over
 * it, and a browser reading the pixel behind those glyphs returns `#1b1b1d` — a unit of blue
 * off what this composite predicts, which is Chrome rounding the blend.
 */
export function railStandingBackdrop(): string {
  return blendOver(RAIL_ACTIVE_FILL, RAIL_ACTIVE_ALPHA, DARK_BG);
}

/**
 * A team colour lifted far enough to clear AA as the active rail row's standings line.
 *
 * Judged against the highlight rather than the page, `readableOnDark` leaves seven of the eleven
 * liveries short — Cadillac at 3.93, Audi 3.94, Racing Bulls 3.95, Aston Martin 3.97, Williams
 * 3.99, Red Bull 4.04, Ferrari 4.02. The highlight is what marks the row as current, so the
 * highlight keeps its authored strength and the *text* moves.
 */
export function railStandingColor(hex: string): string {
  return liftUntilContrast(hex, MIN_CONTRAST, railStandingBackdrop());
}

/**
 * Peak opacity of a section's glow blob, and — deliberately the same number — the alpha its
 * composite is judged at.
 *
 * This is a ceiling the contrast layer imposes on a decorative element, which no other constant
 * here does, so it is worth being explicit about why. The blob is `40vw` square with a 120px
 * blur, and at 1440x900 a team section is 840px wide, so the blob's *core* lands on the content
 * column rather than in the margin. At the peak of 1 it originally animated to, the pixel behind
 * the standing line is the livery at ~0.78 alpha, and on Alpine's `#0184e9` pure white reaches
 * only 3.83:1 — no text colour clears AA, so no amount of lifting could fix the line while the
 * glow stayed that strong. The value itself is a judgement made by eye against a browser: 0.3
 * still read as too heavy a flood, 0.18 as a wash. Measured across the sweep, the composite
 * under the glyphs is the livery at 0.92 of whatever the peak is — the blur is flat where the
 * text sits — so using the peak itself as the alpha is the conservative side of the real number
 * by about 8%, and keeps this to one constant instead of two that can drift.
 *
 * The livery *hex* is untouched — this is the wash's strength, not its colour.
 */
export const GLOW_PEAK_OPACITY = 0.18;

/** The opaque colour the glow leaves behind the section's standing line. */
export function sectionStandingBackdrop(hex: string): string {
  return blendOver(hex, GLOW_PEAK_OPACITY, DARK_BG);
}

/**
 * A team colour lifted far enough to clear AA as the section's standing line, which sits inside
 * the glow rather than beside it.
 *
 * Damping the glow is necessary but not sufficient: `readableOnDark` clears 4.5:1 on bare
 * `zinc-950` *by construction*, so it has no headroom for any tint at all, and eight of the
 * eleven liveries still fail on the damped composite. Both halves are needed.
 */
export function sectionStandingColor(hex: string): string {
  return liftUntilContrast(hex, MIN_CONTRAST, sectionStandingBackdrop(hex));
}

/**
 * Strength of the scrim under a driver portrait's caption, and the alpha its contrast is judged
 * at.
 *
 * This is the one call site where the background is not a colour at all — it is a photograph, and
 * headshots get swapped, so no measurement of today's images would stay true. The bound that does
 * stay true is the brightest pixel a photo could ever hold: white. Judged there, `0.9` is what
 * carries all three lines of the caption, and the reason it has to be a scrim rather than a
 * heavier lift is that only one of those lines goes through this module at all — the driver's name
 * is plain white (measured at 1.13:1 over a pale headshot) and the short code is a neutral.
 *
 * A real photo is darker than white, so every ratio on screen beats the one asserted in tests.
 */
export const PORTRAIT_SCRIM_ALPHA = 0.9;

/**
 * Height of the scrim's fade, and the padding that keeps the caption's text below it.
 *
 * The AA guarantee only holds where the scrim is at full strength, so the gradient's soft top
 * edge — which is there so the scrim does not read as a hard band across the portrait — must sit
 * entirely above the first line of text. Expressed in px rather than a percentage so it cannot
 * drift with the block's height, and both values live here so the gradient and the padding cannot
 * be changed apart.
 */
export const PORTRAIT_SCRIM_FADE_PX = 24;
export const PORTRAIT_SCRIM_TEXT_INSET = PORTRAIT_SCRIM_FADE_PX + 8;

/**
 * The caption scrim: fading in over its top `PORTRAIT_SCRIM_FADE_PX`, then flat at full strength
 * for the rest of the block, which is where the text sits.
 *
 * Written downwards from the top edge rather than upwards with `calc(100% - …)` for a reason worth
 * keeping: jsdom's CSS parser cannot read a gradient containing `calc()` and silently rewrites the
 * whole declaration to `background-image: none`, so the `calc` version was unobservable in a test
 * — it looked like the component had simply not set it. `to bottom` from `0px` says the same thing
 * with arithmetic the parser can follow.
 */
export function portraitScrim(): string {
  const [r, g, b] = parseHex(DARK_BG);
  const solid = `rgba(${r}, ${g}, ${b}, ${PORTRAIT_SCRIM_ALPHA})`;
  return `linear-gradient(to bottom, rgba(${r}, ${g}, ${b}, 0) 0px, ${solid} ${PORTRAIT_SCRIM_FADE_PX}px, ${solid} 100%)`;
}

/** The worst opaque colour the caption can sit on: the scrim over a pure white photo. */
export function portraitCaptionBackdrop(): string {
  return blendOver(DARK_BG, PORTRAIT_SCRIM_ALPHA, '#ffffff');
}

/**
 * A team colour lifted far enough to clear AA as the portrait's nationality line.
 *
 * Seven of the eleven fail on the scrimmed worst case with `readableOnDark`, for the usual
 * reason: that helper leaves no headroom above 4.5:1 on bare `zinc-950`, and this backdrop is
 * lighter than `zinc-950`.
 */
export function portraitCaptionColor(hex: string): string {
  return liftUntilContrast(hex, MIN_CONTRAST, portraitCaptionBackdrop());
}

/**
 * Tailwind `zinc-900`, and the opacity the compare tray is authored at — `bg-zinc-900/60`.
 *
 * Same arrangement as `RAIL_ACTIVE_FILL` / `RAIL_ACTIVE_ALPHA` above, and for the same reason: a
 * Tailwind class cannot be built from a runtime value, so the component keeps the literal and the
 * tests pin the two together from both sides.
 */
export const TRAY_FILL = '#18181b';
export const TRAY_ALPHA = 0.6;

/**
 * The opaque colour behind a value in the compare tray. The tray is a card, not the page: a
 * `zinc-900` wash at `TRAY_ALPHA` over `zinc-950` flattens to `#121215`, which is *lighter* than
 * `zinc-950` and therefore a harder background to read on, not an easier one.
 */
export function trayValueBackdrop(): string {
  return blendOver(TRAY_FILL, TRAY_ALPHA, DARK_BG);
}

/**
 * A team colour lifted far enough to clear AA as the tray's leading value.
 *
 * Fifth call site of the same lesson. `readableOnDark` clears 4.5:1 on bare `zinc-950` *by
 * construction* — it returns the first lightness step that clears, so there is no headroom above
 * the bar — and a colour sitting at exactly 4.5:1 on `#09090b` measures ~4.23:1 on `#121215`.
 * Every livery that needed lifting at all fails here; the ones already above the bar (Haas's
 * white) pass through untouched.
 */
export function trayValueColor(hex: string): string {
  return liftUntilContrast(hex, MIN_CONTRAST, trayValueBackdrop());
}

/**
 * Strength of the portrait's bottom-edge dissolve, at its darkest.
 *
 * This used to be a Tailwind `from-zinc-950 via-zinc-950/40` gradient reaching **full** `zinc-950`
 * at the bottom edge — authored before the caption had a scrim of its own. The scrim landed on
 * 2026-08-11 anchored to that same edge, so the two now stack: 0.9 over 1.0 is opaque, and the
 * bottom third of every headshot went black.
 *
 * The number is bounded rather than chosen freely: the scrim is what backs the caption and carries
 * the AA guarantee, so the dissolve must stay the *weaker* of the two, or it becomes a second
 * uncontrolled contributor to a composite `portraitCaptionBackdrop` already claims to describe.
 * Anything under `PORTRAIT_SCRIM_ALPHA` is safe for contrast — a darker composite only ever raises
 * the real ratio above the asserted worst case — so this is a visual judgement inside a hard
 * ceiling.
 */
export const PORTRAIT_DISSOLVE_ALPHA = 0.6;

/**
 * The portrait's bottom-edge dissolve: strongest at the bottom, gone by the top.
 *
 * Written with explicit `rgba()` stops rather than Tailwind's `from-`/`via-`/`to-` for the same
 * reason `portraitScrim` is: the alpha has to be one number shared with the contrast maths, and a
 * Tailwind opacity suffix cannot be built from a runtime value. No `calc()` — jsdom's CSS parser
 * silently discards a whole gradient declaration that contains one.
 */
export function portraitDissolve(): string {
  const [r, g, b] = parseHex(DARK_BG);
  const rgba = (a: number) => `rgba(${r}, ${g}, ${b}, ${a})`;
  return `linear-gradient(to top, ${rgba(PORTRAIT_DISSOLVE_ALPHA)} 0%, ${rgba(
    PORTRAIT_DISSOLVE_ALPHA * 0.4,
  )} 45%, ${rgba(0)} 100%)`;
}

/** Whether a livery is too bright to use as a surface in this dark UI. */
export function needsDamping(hex: string): boolean {
  return relativeLuminance(hex) > MAX_FILL_LUMINANCE;
}

/** Black or white, whichever reads better **on top of** `fill`. */
export function onColor(fill: string): string {
  return contrastRatio('#000000', fill) >= contrastRatio('#ffffff', fill) ? '#000000' : '#ffffff';
}

/**
 * A team colour lifted just far enough to serve as a focus ring on `zinc-950`.
 *
 * Same lightness walk as `readableOnDark`, held to `MIN_RING_CONTRAST` instead of the text
 * bar, so the ring still reads as the brand colour rather than as a lightened wash of it.
 */
export function ringOnDark(hex: string): string {
  return liftUntilContrast(hex, MIN_RING_CONTRAST, DARK_BG);
}

/**
 * Wash colour for a driver portrait, damped on the same test `teamColorButtonStyle` uses.
 *
 * A livery bright enough to be a bad surface is a bad *wash* for the same reason: laid over
 * zinc-950 it erases the portrait rather than tinting it. That is `needsDamping`, so this
 * asks `needsDamping` — it used to be a `team.color === '#ffffff'` equality check, which
 * covered Haas and nothing else, including a near-white livery a hex away from it.
 *
 * `keyline` is the *text* variant — it labels the 10px nationality line, so it goes through
 * `portraitCaptionColor`, which judges it against the caption scrim over the brightest photo a
 * headshot could be. It used to use `readableOnDark`, i.e. the page background, which is not
 * behind it at all: over a pale race suit that line measured 1.89:1. The wash (`color`) keeps the
 * true livery: it is a large blended fill, not text, and lightening it would drain the portrait's
 * tint.
 */
export function duotoneFor(team: Team): { color: string; opacity: number; keyline: string } {
  const damped = needsDamping(team.color);
  return {
    color: damped ? '#52525b' : team.color,
    opacity: damped ? 0.35 : 0.45,
    keyline: portraitCaptionColor(team.color),
  };
}

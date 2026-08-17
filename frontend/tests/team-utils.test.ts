import { describe, it, expect } from 'vitest';

import {
  seasonsSince,
  duotoneFor,
  teamColorButtonStyle,
  contrastRatio,
  readableOnDark,
  DARK_BG,
  MIN_CONTRAST,
  MIN_RING_CONTRAST,
  needsDamping,
  onColor,
  ringOnDark,
  blendOver,
  seamWash,
  seamLabelColor,
  seamLabelBackdrop,
  SEAM_WASH_ALPHA,
  railStandingBackdrop,
  railStandingColor,
  RAIL_ACTIVE_FILL,
  RAIL_ACTIVE_ALPHA,
  sectionStandingBackdrop,
  sectionStandingColor,
  sectionSurfaceBackdrop,
  sectionCardBackdrop,
  sectionGradient,
  GLOW_PEAK_OPACITY,
  SECTION_GRADIENT_PEAK_ALPHA,
  portraitCaptionBackdrop,
  portraitCaptionColor,
  portraitScrim,
  PORTRAIT_SCRIM_ALPHA,
  PORTRAIT_SCRIM_FADE_PX,
  PORTRAIT_SCRIM_TEXT_INSET,
  TRAY_FILL,
  TRAY_ALPHA,
  trayValueBackdrop,
  trayValueColor,
  PORTRAIT_DISSOLVE_ALPHA,
  portraitDissolve,
} from '@/lib/team-utils';
import { TEAMS, TEAM_MAP, STANDINGS_AS_OF } from '@/data/teams-data';
import { ZINC } from './zinc';

describe('seasonsSince', () => {
  it('counts seasons from the debut year to 2026', () => {
    expect(seasonsSince(1950)).toBe(76);
    expect(seasonsSince(1966)).toBe(60);
  });

  it('returns 0 for a team debuting in 2026', () => {
    expect(seasonsSince(2026)).toBe(0);
  });
});

describe('duotoneFor', () => {
  it('washes a portrait in the team colour', () => {
    const ferrari = TEAM_MAP['ferrari']!;
    expect(duotoneFor(ferrari).color).toBe('#dc0000');
    expect(duotoneFor(ferrari).opacity).toBeGreaterThan(0);
  });

  it('substitutes a neutral tint for white-liveried teams', () => {
    const haas = TEAM_MAP['haas']!;
    expect(haas.color).toBe('#ffffff');
    // A white wash over zinc-950 erases the portrait, so Haas gets a neutral
    // tint plus a visible keyline instead.
    expect(duotoneFor(haas).color).not.toBe('#ffffff');
    expect(duotoneFor(haas).keyline).toBe('#ffffff');
  });
});

describe('contrastRatio', () => {
  // Anchors against the two ends of the scale, so a regression in the luminance maths cannot
  // hide behind the readableOnDark assertions below all still passing.
  it('returns 21 for black on white and 1 for a colour against itself', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 2);
    expect(contrastRatio('#dc0000', '#dc0000')).toBeCloseTo(1, 5);
  });

  it('agrees with the published ratios for the failing liveries', () => {
    expect(contrastRatio('#2b4562', DARK_BG)).toBeCloseTo(2.02, 1); // Racing Bulls
    expect(contrastRatio('#1e41ff', DARK_BG)).toBeCloseTo(3.08, 1); // Red Bull
    expect(contrastRatio('#e8002d', DARK_BG)).toBeCloseTo(4.23, 1); // Audi
  });
});

describe('readableOnDark', () => {
  // The finding this closes: seven of eleven 2026 liveries fail 4.5:1 as small text on
  // zinc-950 — Racing Bulls' #2b4562 at 2.02:1 is effectively invisible at 10px. Asserted
  // over the whole set, not the seven, so adding a twelfth team cannot slip through.
  it('clears WCAG AA for every team on the dark page background', () => {
    expect(TEAMS).toHaveLength(11);
    for (const team of TEAMS) {
      const text = readableOnDark(team.color);
      expect(
        contrastRatio(text, DARK_BG),
        `${team.shortName} (${team.color} -> ${text})`,
      ).toBeGreaterThanOrEqual(MIN_CONTRAST);
    }
  });

  it('leaves a colour that already clears AA untouched', () => {
    // Haas is #ffffff at 19.3:1; McLaren's #ff8000 also passes raw.
    expect(readableOnDark('#ffffff')).toBe('#ffffff');
    expect(contrastRatio('#ff8000', DARK_BG)).toBeGreaterThanOrEqual(MIN_CONTRAST);
    expect(readableOnDark('#ff8000')).toBe('#ff8000');
  });

  // Lightening in HSL rather than blending toward white is what keeps the result reading as
  // the brand colour. Racing Bulls' navy must come back as a lighter navy, not as grey.
  it('keeps the hue when it lightens, rather than washing to white', () => {
    const lifted = readableOnDark('#2b4562');
    expect(lifted).not.toBe('#2b4562');
    expect(lifted).not.toBe('#ffffff');

    const [r, g, b] = [1, 3, 5].map((i) => parseInt(lifted.slice(i, i + 2), 16)) as [
      number,
      number,
      number,
    ];
    // Still blue-dominant, and still visibly saturated.
    expect(b).toBeGreaterThan(r);
    expect(b).toBeGreaterThan(g);
    expect(b - r).toBeGreaterThan(20);
  });

  it('is stable across calls, so the cache cannot return a different colour', () => {
    for (const team of TEAMS) {
      expect(readableOnDark(team.color)).toBe(readableOnDark(team.color));
    }
  });
});

describe('duotoneFor', () => {
  // This asserted the keyline against `DARK_BG`, which is not what is behind it: the keyline
  // labels the nationality line *inside the portrait*, over a photograph. Third test on this
  // branch to measure the right colour against the wrong background — judged over the portrait
  // it was as low as 1.89:1. The wash is a large blended fill and still keeps the true livery.
  it('returns a keyline that clears AA over the portrait, while the wash keeps the true livery', () => {
    for (const team of TEAMS) {
      const { color, keyline } = duotoneFor(team);
      expect(
        contrastRatio(keyline, portraitCaptionBackdrop()),
        `${team.shortName} keyline ${keyline}`,
      ).toBeGreaterThanOrEqual(MIN_CONTRAST);
      if (team.color !== '#ffffff') expect(color).toBe(team.color);
    }
  });

  it('takes the keyline from the portrait caption helper, not from the page-background one', () => {
    for (const team of TEAMS) {
      expect(duotoneFor(team).keyline, `${team.shortName}`).toBe(portraitCaptionColor(team.color));
    }
  });

  it('lifts Racing Bulls out of invisibility', () => {
    const racingBulls = TEAM_MAP['racing-bulls']!;
    expect(racingBulls.color).toBe('#2b4562');
    expect(duotoneFor(racingBulls).keyline).not.toBe('#2b4562');
  });

  // The damping test is `needsDamping`, the same predicate `teamColorButtonStyle` uses —
  // not the `#ffffff` equality check it used to be, which covered Haas and nothing else.
  // Output for the current grid is unchanged; what this adds is the near-white livery.
  it('damps any livery too bright to wash with, not just #ffffff', () => {
    const nearWhite = { ...TEAM_MAP['haas']!, color: '#fafafa' };
    expect(nearWhite.color).not.toBe('#ffffff');
    expect(needsDamping(nearWhite.color)).toBe(true);
    expect(duotoneFor(nearWhite).color).toBe('#52525b');
    expect(duotoneFor(nearWhite).opacity).toBe(0.35);
  });

  it('still gives Haas its neutral tint and leaves every other wash the true livery', () => {
    expect(duotoneFor(TEAM_MAP['haas']!).color).toBe('#52525b');
    expect(duotoneFor(TEAM_MAP['haas']!).opacity).toBe(0.35);
    for (const team of TEAMS) {
      if (needsDamping(team.color)) continue;
      expect(duotoneFor(team).color, `${team.shortName} wash`).toBe(team.color);
      expect(duotoneFor(team).opacity).toBe(0.45);
    }
  });
});

describe('teamColorButtonStyle', () => {
  it('still special-cases the white livery', () => {
    expect(teamColorButtonStyle(TEAM_MAP['haas']!).className).toBe('border');
  });
});

describe('the seam label', () => {
  /**
   * Flattens `#rrggbbaa` over `bg` — deliberately re-derived here rather than imported, so
   * these assertions model "what is actually behind the glyphs" independently of the code
   * that decides the label colour. The alpha is read out of the wash string the component
   * really renders, so retuning the gradient moves this too.
   */
  function flatten(wash: string, bg: string): string {
    const alpha = parseInt(wash.slice(7, 9), 16) / 255;
    const channels = [1, 3, 5].map((i) => {
      const fg = parseInt(wash.slice(i, i + 2), 16);
      const back = parseInt(bg.slice(i, i + 2), 16);
      return Math.round(alpha * fg + (1 - alpha) * back);
    });
    return `#${channels.map((c) => c.toString(16).padStart(2, '0')).join('')}`;
  }

  /**
   * The whole stack behind the label: the seam wash over the section's per-team gradient over the
   * page. **Two liveries, not one** — and leaving the gradient out is the defect these assertions
   * now exist to catch.
   *
   * `sectionGradient` ramps away across the section's upper half and peaks at its **top edge**,
   * which is precisely where the `h-16` seam band sits, so the label is over the ramp's strongest
   * point. Composed independently of `seamLabelBackdrop` on purpose: `seamLabelColor` lifts against
   * whatever that helper returns, so asking it for the backdrop and then measuring the colour it
   * derived from that answer passes by construction whatever it composes — which is exactly how the
   * missing layer survived a whole-branch review.
   */
  function seamStack(hex: string): string {
    return flatten(seamWash(hex), blendOver(hex, SECTION_GRADIENT_PEAK_ALPHA, DARK_BG));
  }

  it('carries the livery and the authored alpha into the wash', () => {
    expect(seamWash('#dc0000')).toBe('#dc00004d');
    expect(SEAM_WASH_ALPHA).toBeCloseTo(0x4d / 255, 5);
  });

  // The finding this closes. The label sits *on the wash over the section gradient*, not on bare
  // zinc-950, so the background it must be read against is that whole stack composited over the
  // page — and judged there, `readableOnDark` leaves nine of eleven liveries short of AA.
  it('clears WCAG AA against the composited seam stack for every team', () => {
    expect(TEAMS).toHaveLength(11);
    for (const team of TEAMS) {
      const behind = seamStack(team.color);
      const label = seamLabelColor(team.color);
      expect(
        contrastRatio(label, behind),
        `${team.shortName} seam label ${label} on ${behind}`,
      ).toBeGreaterThanOrEqual(MIN_CONTRAST);
    }
  });

  // Without this, the test above could be satisfied by `readableOnDark` and the fix would
  // look unnecessary. It is not: this pins the failure the seam actually had.
  //
  // The list grew from six to nine when the section gradient was composed into the backdrop, which
  // is the measurement behind that change: Mercedes (4.59) and Haas (5.83) are the only two
  // liveries whose `readableOnDark` value survives the real stack, and McLaren — which cleared the
  // wash alone at 4.90 — drops to 4.11 once the gradient under it is counted.
  it('is a real lift over readableOnDark, which fails on that same background', () => {
    const failing = [
      'audi',
      'williams',
      'aston-martin',
      'cadillac',
      'ferrari',
      'red-bull',
      'mclaren',
      'alpine',
      'racing-bulls',
    ];
    for (const id of failing) {
      const team = TEAM_MAP[id]!;
      const behind = seamStack(team.color);
      expect(
        contrastRatio(readableOnDark(team.color), behind),
        `${team.shortName} would have passed untreated`,
      ).toBeLessThan(MIN_CONTRAST);
    }
    // Pinned as a set, not a floor: a livery quietly dropping off this list means the seam stopped
    // being a special case for it, which is a change to argue for rather than to discover later.
    const measured = TEAMS.filter(
      (t) => contrastRatio(readableOnDark(t.color), seamStack(t.color)) < MIN_CONTRAST,
    ).map((t) => t.id);
    expect(measured.sort()).toEqual([...failing].sort());
  });

  // The seam exists to announce the incoming team, so the fix had to move the label rather
  // than flatten the wash. Guard the wash's visibility explicitly.
  it('leaves the wash strong enough to still read as a wash', () => {
    expect(SEAM_WASH_ALPHA).toBeGreaterThan(0.25);
    for (const team of TEAMS) {
      const behind = flatten(seamWash(team.color), DARK_BG);
      expect(behind, `${team.shortName} wash vanished`).not.toBe(DARK_BG);
    }
  });

  // Lifted in HSL, so the label still reads as the brand rather than defaulting to white.
  it('keeps the brand hue rather than falling back to white', () => {
    for (const team of TEAMS) {
      if (team.color === '#ffffff') continue;
      expect(seamLabelColor(team.color), `${team.shortName}`).not.toBe('#ffffff');
    }
  });

  /**
   * The layer that was missing, pinned.
   *
   * This assertion used to read `blendOver(team.color, SEAM_WASH_ALPHA, DARK_BG)` — the wash alone —
   * and so pinned the defect rather than the fix: `seamLabelColor` lifts against whatever this
   * helper returns, so every ratio assertion above it stayed green while nine of the eleven labels
   * failed on screen. Both halves are needed here. The equality says the gradient is composed at
   * `SECTION_GRADIENT_PEAK_ALPHA`; the inequality says that layer is doing something, i.e. the
   * stack is strictly lighter than the wash alone and therefore strictly harder for light text —
   * which is why omitting it failed in the direction that looks safe.
   */
  it('composes the section gradient under the wash, not the wash alone', () => {
    for (const team of TEAMS) {
      const washOnly = blendOver(team.color, SEAM_WASH_ALPHA, DARK_BG);
      expect(seamLabelBackdrop(team.color), team.shortName).toBe(seamStack(team.color));
      // `contrastRatio(x, DARK_BG)` stands in for relative luminance: every livery is lighter than
      // `#09090b`, so both composites are too, and the ratio is monotone in luminance there.
      expect(
        contrastRatio(seamLabelBackdrop(team.color), DARK_BG),
        `${team.shortName}: the gradient layer makes no difference`,
      ).toBeGreaterThan(contrastRatio(washOnly, DARK_BG));
    }
  });
});

describe('the active rail row’s standings line', () => {
  // Second instance of the seam's bug, and the reason a green suite never saw it: the line was
  // judged against `DARK_BG` while it renders on the row's `bg-zinc-800/60` highlight. Measured
  // in a browser at 1440x900 by hiding the glyphs and reading the pixel behind them, that
  // backdrop is #1b1b1d — one unit of blue off the #1b1b1e this composite predicts, which is
  // Chrome rounding the blend, not a disagreement.
  it('agrees with blendOver on what the highlight leaves behind', () => {
    expect(railStandingBackdrop()).toBe(blendOver(RAIL_ACTIVE_FILL, RAIL_ACTIVE_ALPHA, DARK_BG));
  });

  it('clears WCAG AA against the highlight for every team', () => {
    expect(TEAMS).toHaveLength(11);
    for (const team of TEAMS) {
      const text = railStandingColor(team.color);
      expect(
        contrastRatio(text, railStandingBackdrop()),
        `${team.shortName} (${team.color} -> ${text})`,
      ).toBeGreaterThanOrEqual(MIN_CONTRAST);
    }
  });

  // Without this, the assertion above would also pass with `readableOnDark` still in place and
  // the fix would look unnecessary. Seven of the eleven fail on the highlight — Ferrari at
  // 4.02, which is the number the browser reported for the shipped code.
  it('is a real lift over readableOnDark, which fails on that same highlight', () => {
    const failing = [
      'ferrari',
      'red-bull',
      'racing-bulls',
      'audi',
      'williams',
      'cadillac',
      'aston-martin',
    ];
    for (const id of failing) {
      const team = TEAM_MAP[id]!;
      expect(
        contrastRatio(readableOnDark(team.color), railStandingBackdrop()),
        `${team.shortName} would have passed untreated`,
      ).toBeLessThan(MIN_CONTRAST);
      expect(railStandingColor(team.color)).not.toBe(readableOnDark(team.color));
    }
  });

  it('keeps the brand hue rather than falling back to white', () => {
    for (const team of TEAMS) {
      if (team.color === '#ffffff') continue;
      expect(railStandingColor(team.color), `${team.shortName}`).not.toBe('#ffffff');
    }
  });
});

describe('the section standing line', () => {
  // Third instance, and the one that could not be fixed by colour alone. The glow blob is 40vw
  // wide with a 120px blur inside an 840px section at 1440x900, so it covers the content column
  // rather than the margin. Measured with the blob at its shipped peak opacity of 1, the pixel
  // behind this line is the livery at ~0.78 alpha — Alpine's #0184e9 — where *pure white* tops
  // out at 3.83:1. No text colour clears AA there, so the glow's peak had to come down before
  // any lift could work. These assertions pin both halves of that.
  // Two decorative layers now, not one. Phase 5 paints a per-team gradient under the whole
  // section, and the glow sits on top of it, so the backdrop is the livery composited twice. The
  // old single-layer expectation is kept below as the *negative*: it is what this would be if the
  // gradient were left out, and leaving it out is the failure mode — a lighter real background
  // than the one the colour was lifted against.
  it('agrees with blendOver on both layers the section paints behind the line', () => {
    for (const team of TEAMS) {
      expect(sectionStandingBackdrop(team.color)).toBe(
        blendOver(
          team.color,
          GLOW_PEAK_OPACITY,
          blendOver(team.color, SECTION_GRADIENT_PEAK_ALPHA, DARK_BG),
        ),
      );
    }
  });

  it('is strictly lighter than the glow alone, so the gradient is genuinely accounted for', () => {
    for (const team of TEAMS) {
      const glowOnly = blendOver(team.color, GLOW_PEAK_OPACITY, DARK_BG);
      // Light-on-dark: a lighter backdrop is the stricter one. If these two ever agree, the
      // gradient has been dropped from the stack and every lift below is measured optimistically.
      expect(
        contrastRatio('#ffffff', sectionStandingBackdrop(team.color)),
        `${team.shortName} backdrop ignores the section gradient`,
      ).toBeLessThan(contrastRatio('#ffffff', glowOnly));
    }
  });

  // The section's neutral floor, which the gradient is what moved. `zinc-400` had 0.28 of
  // headroom on the glow alone (4.78:1 on Haas) and does not survive the gradient at 3.45:1;
  // `zinc-300` clears it at 5.99:1, and at 5.54:1 through a TicketCard's wash on top. Every
  // resting neutral inside a team section is held to that rung, and this is where the rung
  // itself is proved rather than asserted in a comment.
  it('admits zinc-300 but not zinc-400 anywhere in a team section', () => {
    expect(TEAMS).toHaveLength(11);
    const haas = TEAMS.find((t) => t.color === '#ffffff');
    expect(haas, 'the white livery is the worst case and must still be on the grid').toBeDefined();

    for (const team of TEAMS) {
      for (const bg of [sectionSurfaceBackdrop(team.color), sectionCardBackdrop(team.color)]) {
        expect(
          contrastRatio(ZINC['300']!, bg),
          `${team.shortName} zinc-300`,
        ).toBeGreaterThanOrEqual(MIN_CONTRAST);
      }
    }

    expect(
      contrastRatio(ZINC['400']!, sectionSurfaceBackdrop(haas!.color)),
      'zinc-400 must NOT clear the floor, or the rung above is unmotivated',
    ).toBeLessThan(MIN_CONTRAST);
  });

  // The necessary condition the shipped glow violated: if white cannot clear AA on the
  // backdrop, nothing can, and no amount of lifting saves the line. This fails outright if the
  // peak opacity is raised back towards 1.
  it('holds the glow weak enough that a readable colour exists at all', () => {
    expect(TEAMS).toHaveLength(11);
    for (const team of TEAMS) {
      expect(
        contrastRatio('#ffffff', sectionStandingBackdrop(team.color)),
        `${team.shortName} glow admits no readable text`,
      ).toBeGreaterThanOrEqual(MIN_CONTRAST);
    }
  });

  it('clears WCAG AA against the glow for every team', () => {
    for (const team of TEAMS) {
      const text = sectionStandingColor(team.color);
      expect(
        contrastRatio(text, sectionStandingBackdrop(team.color)),
        `${team.shortName} (${team.color} -> ${text})`,
      ).toBeGreaterThanOrEqual(MIN_CONTRAST);
    }
  });

  // Damping the glow alone does not fix this: `readableOnDark` output clears 4.5:1 on bare
  // zinc-950 by construction, so it has little or no headroom for a tint.
  //
  // *Which* teams fail moves with `GLOW_PEAK_OPACITY` — eight at 0.3, seven at 0.18, because
  // Alpine's `#0090ff` reads 6.09:1 on the page and that headroom survives a weaker wash. So the
  // set is derived rather than listed, with Ferrari asserted by name as the canary: at 4.66:1 on
  // bare zinc-950 it has the least headroom on the grid and cannot survive any wash at all.
  it('is a real lift over readableOnDark, which fails on that same glow', () => {
    const failing = TEAMS.filter(
      (team) =>
        contrastRatio(readableOnDark(team.color), sectionStandingBackdrop(team.color)) <
        MIN_CONTRAST,
    );
    expect(failing.map((team) => team.id)).toContain('ferrari');
    expect(failing.length, 'nothing fails untreated — is the glow doing anything?').toBeGreaterThan(
      4,
    );
    for (const team of failing) {
      expect(sectionStandingColor(team.color), `${team.shortName}`).not.toBe(
        readableOnDark(team.color),
      );
    }
  });

  it('keeps the brand hue rather than falling back to white', () => {
    for (const team of TEAMS) {
      if (team.color === '#ffffff') continue;
      expect(sectionStandingColor(team.color), `${team.shortName}`).not.toBe('#ffffff');
    }
  });
});

describe('the portrait caption', () => {
  // Fifth and last instance of the class, and the only one where the background is not a colour
  // at all: the caption sits on a photograph. A photo's pixels are unknowable — headshots get
  // swapped — so the only honest bound is the brightest pixel one could ever hold, which is
  // white. Everything here is judged against the scrim over pure white, so a real photo can only
  // do better. Measured before the scrim: 1.89:1 at worst, over a driver's pale race suit.
  it('judges the caption against the scrim over the brightest photo possible', () => {
    expect(portraitCaptionBackdrop()).toBe(blendOver(DARK_BG, PORTRAIT_SCRIM_ALPHA, '#ffffff'));
  });

  it('clears WCAG AA in that worst case for every team', () => {
    expect(TEAMS).toHaveLength(11);
    for (const team of TEAMS) {
      const text = portraitCaptionColor(team.color);
      expect(
        contrastRatio(text, portraitCaptionBackdrop()),
        `${team.shortName} (${team.color} -> ${text})`,
      ).toBeGreaterThanOrEqual(MIN_CONTRAST);
    }
  });

  // The other two lines in the same block ride on the same scrim, and they are the reason the
  // scrim exists rather than a heavier lift: the driver's name is plain white and was measured at
  // 1.13:1 over a pale headshot. No colour helper touches those, so the scrim has to carry them.
  it('carries the white name and the neutral short code too', () => {
    expect(contrastRatio('#ffffff', portraitCaptionBackdrop())).toBeGreaterThanOrEqual(
      MIN_CONTRAST,
    );
    expect(contrastRatio('#a1a1aa', portraitCaptionBackdrop())).toBeGreaterThanOrEqual(
      MIN_CONTRAST,
    );
  });

  it('is a real lift over readableOnDark, which fails on that same backdrop', () => {
    const failing = TEAMS.filter(
      (team) => contrastRatio(readableOnDark(team.color), portraitCaptionBackdrop()) < MIN_CONTRAST,
    );
    expect(failing.map((team) => team.id)).toContain('ferrari');
    expect(failing.length).toBeGreaterThan(4);
    for (const team of failing) {
      expect(portraitCaptionColor(team.color), `${team.shortName}`).not.toBe(
        readableOnDark(team.color),
      );
    }
  });

  it('keeps the brand hue rather than falling back to white', () => {
    for (const team of TEAMS) {
      if (team.color === '#ffffff') continue;
      expect(portraitCaptionColor(team.color), `${team.shortName}`).not.toBe('#ffffff');
    }
  });

  // The guarantee above only holds where the scrim is at full strength, so the gradient's fade
  // has to sit entirely above the text. This is the arithmetic that keeps it there.
  it('keeps the fade clear of the text it is protecting', () => {
    expect(PORTRAIT_SCRIM_TEXT_INSET).toBeGreaterThan(PORTRAIT_SCRIM_FADE_PX);
  });

  it('builds the gradient from the same alpha the maths uses', () => {
    const scrim = portraitScrim();
    // One transparent stop at the top edge, then two at full strength — the flat zone the
    // guarantee depends on. A single full-strength stop would be a fade all the way down.
    expect(
      scrim.match(new RegExp(`rgba\\(9, 9, 11, ${PORTRAIT_SCRIM_ALPHA}\\)`, 'g')) ?? [],
    ).toHaveLength(2);
    expect(scrim).toContain(`${PORTRAIT_SCRIM_FADE_PX}px`);
    expect(scrim).toContain('rgba(9, 9, 11, 0) 0px');
  });
});

describe('needsDamping', () => {
  it('damps a literally white livery', () => {
    expect(needsDamping('#ffffff')).toBe(true);
  });

  it('leaves every other livery on the grid undamped', () => {
    expect(TEAMS).toHaveLength(11);
    for (const team of TEAMS) {
      if (team.color === '#ffffff') continue;
      expect(needsDamping(team.color), `${team.shortName} ${team.color}`).toBe(false);
    }
  });

  // The point of the predicate: it is not an equality check against one hex, so a future
  // near-white livery is caught without anyone remembering to add a special case.
  it('catches a near-white livery that is not exactly #ffffff', () => {
    expect(needsDamping('#fafafa')).toBe(true);
  });
});

describe('onColor', () => {
  it('picks black on a light fill and white on a dark one', () => {
    expect(onColor('#ffffff')).toBe('#000000');
    expect(onColor('#dc0000')).toBe('#ffffff');
  });

  // The property that matters: whatever it picks must actually be readable on that fill.
  // A mid-tone fill where neither black nor white reaches AA would be a real finding.
  it('clears AA on the fill it was given, for every fill this page uses', () => {
    expect(TEAMS).toHaveLength(11);
    for (const team of TEAMS) {
      const fill = needsDamping(team.color) ? '#27272a' : team.color;
      expect(
        contrastRatio(onColor(fill), fill),
        `${team.shortName} text on ${fill}`,
      ).toBeGreaterThanOrEqual(MIN_CONTRAST);
    }
  });
});

describe('ringOnDark', () => {
  it('clears non-text contrast against the page background for every team', () => {
    expect(TEAMS).toHaveLength(11);
    for (const team of TEAMS) {
      expect(
        contrastRatio(ringOnDark(team.color), DARK_BG),
        `${team.shortName} ring ${ringOnDark(team.color)}`,
      ).toBeGreaterThanOrEqual(MIN_RING_CONTRAST);
    }
  });

  // A ring is not text. Holding it to 4.5:1 would lighten liveries further than they need
  // to go and wash the brand out for no accessibility gain.
  it('is a lower bar than the text variant, so it lifts colours less', () => {
    expect(MIN_RING_CONTRAST).toBeLessThan(MIN_CONTRAST);
    const navy = '#2b4562';
    expect(contrastRatio(ringOnDark(navy), DARK_BG)).toBeLessThan(
      contrastRatio(readableOnDark(navy), DARK_BG),
    );
  });

  it('leaves a colour that already clears the bar untouched', () => {
    expect(ringOnDark('#ffffff')).toBe('#ffffff');
  });
});

describe('teamColorButtonStyle after generalisation', () => {
  it('still damps Haas and keeps its keyline', () => {
    const haas = teamColorButtonStyle(TEAM_MAP['haas']!);
    expect(haas.className).toBe('border');
    expect(haas.style.backgroundColor).toBe('#27272a');
  });

  it('fills with the true livery for an undamped team', () => {
    const ferrari = teamColorButtonStyle(TEAM_MAP['ferrari']!);
    expect(ferrari.style.backgroundColor).toBe('#dc0000');
    expect(ferrari.className).toBe('');
  });

  // Derived from the fill, not from a hand-authored per-team value.
  it('derives its label colour so every team’s CTA is readable', () => {
    expect(TEAMS).toHaveLength(11);
    for (const team of TEAMS) {
      const { style } = teamColorButtonStyle(team);
      expect(
        contrastRatio(style.color, style.backgroundColor),
        `${team.shortName} CTA label`,
      ).toBeGreaterThanOrEqual(MIN_CONTRAST);
    }
  });
});

describe('standings data', () => {
  it('gives every team a position, points, logo and driver headshots', () => {
    for (const team of TEAMS) {
      expect(team.logo).toBe(`/logos/${team.id}.svg`);
      expect(team.position).toBeGreaterThanOrEqual(1);
      expect(team.points).toBeGreaterThanOrEqual(0);
      for (const driver of team.drivers) {
        expect(driver.headshot).toBe(`/drivers/${driver.id}.png`);
      }
    }
  });

  it('assigns each championship position exactly once', () => {
    const positions = TEAMS.map((t) => t.position).sort((a, b) => a - b);
    expect(positions).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
  });

  it('ranks Mercedes first on 379 points and Cadillac last on zero', () => {
    expect(TEAM_MAP['mercedes']!.points).toBe(379);
    expect(TEAM_MAP['mercedes']!.position).toBe(1);
    expect(TEAM_MAP['cadillac']!.points).toBe(0);
    expect(TEAM_MAP['cadillac']!.position).toBe(11);
  });

  it('dates its own numbers rather than implying they are live', () => {
    expect(STANDINGS_AS_OF).toMatch(/Round 11/);
  });
});

describe('the section gradient', () => {
  // Written as `rgba()` rather than `#RRGGBBAA` because jsdom's CSS parser drops the eight-digit
  // hex form inside a gradient and rewrites the declaration to nothing — the same parser gap
  // `portraitScrim` documents for `calc()`. Asserting the string here is what stops someone
  // "tidying" it back to the shorter form and making it silently unobservable in every component
  // test that checks the section paints one.
  it('carries the livery and the authored peak alpha as rgba, not as an eight-digit hex', () => {
    expect(sectionGradient('#dc0000')).toBe(
      `linear-gradient(to bottom, rgba(220, 0, 0, ${SECTION_GRADIENT_PEAK_ALPHA}), rgba(220, 0, 0, 0) 60%)`,
    );
  });

  it('ramps to fully transparent, so the composite is only ever at most the peak', () => {
    for (const team of TEAMS) {
      const css = sectionGradient(team.color);
      expect(css, `${team.shortName}`).toContain(', 0) 60%)');
      expect(css, `${team.shortName}`).not.toContain('#');
    }
  });
});

describe('trayValueColor', () => {
  it('clears AA on the tray’s own backdrop for every team', () => {
    expect(TEAMS).toHaveLength(11);
    const backdrop = trayValueBackdrop();
    for (const team of TEAMS) {
      expect(
        contrastRatio(trayValueColor(team.color), backdrop),
        `${team.shortName} tray value ${trayValueColor(team.color)} on ${backdrop}`,
      ).toBeGreaterThanOrEqual(MIN_CONTRAST);
    }
  });

  // The reason this helper exists at all, stated as a test. `readableOnDark` stops at the first
  // lightness step clearing 4.5:1 on bare zinc-950, so it has no headroom for any layer on top.
  // The tray is zinc-900 at 0.6 over the page, which computes to #121215 — lighter than the page —
  // and a colour sitting at exactly 4.5:1 on #09090b lands at ~4.23:1 there. Ferrari is the
  // worked example; every livery that needed lifting behaves the same way.
  it('is a different answer from readableOnDark, because the tray is not the page', () => {
    const backdrop = trayValueBackdrop();
    expect(contrastRatio(readableOnDark('#dc0000'), backdrop)).toBeLessThan(MIN_CONTRAST);
    expect(contrastRatio(trayValueColor('#dc0000'), backdrop)).toBeGreaterThanOrEqual(MIN_CONTRAST);
  });

  it('leaves a livery that already clears the bar alone', () => {
    expect(trayValueColor('#ffffff')).toBe('#ffffff');
  });
});

describe('the tray backdrop', () => {
  // A Tailwind class cannot be built from a runtime value, so the component keeps the literal
  // `bg-zinc-900/60` and these two constants carry the same numbers for the contrast maths.
  // teams-compare-tray.test.tsx pins the class to them from the other side.
  it('is authored as zinc-900 at the opacity the component uses', () => {
    expect(TRAY_FILL).toBe('#18181b');
    expect(TRAY_ALPHA).toBe(0.6);
  });

  it('is lighter than the page, which is the whole problem', () => {
    expect(contrastRatio(trayValueBackdrop(), '#ffffff')).toBeLessThan(
      contrastRatio(DARK_BG, '#ffffff'),
    );
  });
});

describe('portraitDissolve', () => {
  // The dissolve and the caption scrim now overlap: the scrim is anchored to the same bottom edge
  // the dissolve is darkest at, so before this they stacked to near-opaque and ate the photo.
  // The scrim is what backs the caption and carries the AA guarantee, so it must stay the
  // stronger of the two — the dissolve is only there to soften the portrait's bottom edge.
  it('is weaker than the scrim that actually backs the caption', () => {
    expect(PORTRAIT_DISSOLVE_ALPHA).toBeLessThan(PORTRAIT_SCRIM_ALPHA);
  });

  it('fades to fully transparent at the top of the portrait', () => {
    expect(portraitDissolve()).toMatch(/rgba\(9, 9, 11, 0\) 100%/);
  });

  // jsdom's cssstyle cannot parse a gradient containing calc() — it rewrites the whole declaration
  // to `background-image: none`, which looks exactly like a component that never set it. Same
  // reason portraitScrim() is written downwards from 0px.
  it('contains no calc(), which jsdom cannot parse', () => {
    expect(portraitDissolve()).not.toMatch(/calc\(/);
  });
});

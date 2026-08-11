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
  GLOW_PEAK_OPACITY,
  portraitCaptionBackdrop,
  portraitCaptionColor,
  portraitScrim,
  PORTRAIT_SCRIM_ALPHA,
  PORTRAIT_SCRIM_FADE_PX,
  PORTRAIT_SCRIM_TEXT_INSET,
} from '@/lib/team-utils';
import { TEAMS, TEAM_MAP, STANDINGS_AS_OF } from '@/data/teams-data';

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

  it('carries the livery and the authored alpha into the wash', () => {
    expect(seamWash('#dc0000')).toBe('#dc00004d');
    expect(SEAM_WASH_ALPHA).toBeCloseTo(0x4d / 255, 5);
  });

  // The finding this closes. The label sits *on the wash*, not on bare zinc-950, so the
  // background it must be read against is the wash composited over the page — and judged
  // there, `readableOnDark` leaves seven of eleven liveries short of AA.
  it('clears WCAG AA against the composited wash for every team', () => {
    expect(TEAMS).toHaveLength(11);
    for (const team of TEAMS) {
      const behind = flatten(seamWash(team.color), DARK_BG);
      const label = seamLabelColor(team.color);
      expect(
        contrastRatio(label, behind),
        `${team.shortName} seam label ${label} on ${behind}`,
      ).toBeGreaterThanOrEqual(MIN_CONTRAST);
    }
  });

  // Without this, the test above could be satisfied by `readableOnDark` and the fix would
  // look unnecessary. It is not: this pins the failure the seam actually had.
  it('is a real lift over readableOnDark, which fails on that same background', () => {
    const failing = ['audi', 'williams', 'aston-martin', 'cadillac', 'ferrari', 'red-bull'];
    for (const id of failing) {
      const team = TEAM_MAP[id]!;
      const behind = flatten(seamWash(team.color), DARK_BG);
      expect(
        contrastRatio(readableOnDark(team.color), behind),
        `${team.shortName} would have passed untreated`,
      ).toBeLessThan(MIN_CONTRAST);
    }
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

  it('agrees with blendOver on what sits behind the label', () => {
    for (const team of TEAMS) {
      expect(seamLabelBackdrop(team.color)).toBe(
        blendOver(team.color, SEAM_WASH_ALPHA, DARK_BG),
      );
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
    const failing = ['ferrari', 'red-bull', 'racing-bulls', 'audi', 'williams', 'cadillac', 'aston-martin'];
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
  it('agrees with blendOver on what the glow leaves behind', () => {
    for (const team of TEAMS) {
      expect(sectionStandingBackdrop(team.color)).toBe(
        blendOver(team.color, GLOW_PEAK_OPACITY, DARK_BG),
      );
    }
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
      (team) =>
        contrastRatio(readableOnDark(team.color), portraitCaptionBackdrop()) < MIN_CONTRAST,
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
    expect(scrim.match(new RegExp(`rgba\\(9, 9, 11, ${PORTRAIT_SCRIM_ALPHA}\\)`, 'g')) ?? [])
      .toHaveLength(2);
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

import { describe, it, expect } from 'vitest';

import {
  seasonsSince,
  duotoneFor,
  teamColorButtonStyle,
  contrastRatio,
  readableOnDark,
  DARK_BG,
  MIN_CONTRAST,
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
  // The keyline labels the 10px nationality line, so it is text and must clear AA. The wash
  // is a large blended fill and keeps the true livery — lightening it drains the portrait.
  it('returns an AA-passing keyline while the wash keeps the true livery', () => {
    for (const team of TEAMS) {
      const { color, keyline } = duotoneFor(team);
      expect(
        contrastRatio(keyline, DARK_BG),
        `${team.shortName} keyline ${keyline}`,
      ).toBeGreaterThanOrEqual(MIN_CONTRAST);
      if (team.color !== '#ffffff') expect(color).toBe(team.color);
    }
  });

  it('lifts Racing Bulls out of invisibility', () => {
    const racingBulls = TEAM_MAP['racing-bulls']!;
    expect(racingBulls.color).toBe('#2b4562');
    expect(duotoneFor(racingBulls).keyline).not.toBe('#2b4562');
  });
});

describe('teamColorButtonStyle', () => {
  it('still special-cases the white livery', () => {
    expect(teamColorButtonStyle(TEAM_MAP['haas']!).className).toBe('border');
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

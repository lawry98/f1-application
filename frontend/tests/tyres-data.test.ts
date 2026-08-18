import { describe, it, expect } from 'vitest';

import {
  ALLOCATION_EXAMPLES,
  ALLOCATION_RULES,
  ALLOCATION_TRACKED_COMPOUND,
  DRY_RANGE,
  LIFECYCLE_STAGES,
  RACE_COMPOUNDS,
  STRATEGY_SCENARIOS,
  TYRES_SEASON,
  TYRE_FAQ,
  TYRE_SOURCES,
  type SourceRef,
} from '@/data/tyres-data';

/*
 * The page's central promise is that nothing on it is invented and everything sourced can be
 * traced. That promise is a property of this module, so it is tested here rather than through
 * the DOM — a render test can only see whether *a* link appeared, not whether it was the right
 * one for the claim beside it.
 */

const HTTPS = /^https:\/\/[^\s]+$/;

function everySource(): { where: string; source: SourceRef }[] {
  const out: { where: string; source: SourceRef }[] = [];
  for (const c of RACE_COMPOUNDS) {
    c.sources.forEach((s) => out.push({ where: `compound ${c.id}`, source: s }));
    out.push({ where: `compound ${c.id} scenario`, source: c.scenario.source });
  }
  for (const s of STRATEGY_SCENARIOS) {
    s.sources.forEach((src) => out.push({ where: `scenario ${s.id}`, source: src }));
  }
  for (const a of ALLOCATION_EXAMPLES)
    out.push({ where: `allocation ${a.event}`, source: a.source });
  for (const r of ALLOCATION_RULES) out.push({ where: `rule ${r.label}`, source: r.source });
  for (const f of TYRE_FAQ) out.push({ where: `faq ${f.id}`, source: f.source });
  for (const l of LIFECYCLE_STAGES) {
    if (l.source) out.push({ where: `lifecycle ${l.id}`, source: l.source });
  }
  return out;
}

describe('every citation is usable', () => {
  it('has a publisher, a title and an https URL', () => {
    for (const { where, source } of everySource()) {
      expect(source.publisher, where).toBeTruthy();
      expect(source.title, where).toBeTruthy();
      expect(source.url, `${where} → ${source.title}`).toMatch(HTTPS);
    }
  });

  /** Otherwise a claim cites something the reader cannot find in the page's own source list. */
  it('appears in the page-level source list', () => {
    const listed = new Set(TYRE_SOURCES.map((s) => s.url));
    for (const { where, source } of everySource()) {
      expect(listed.has(source.url), `${where} cites an unlisted source: ${source.title}`).toBe(
        true,
      );
    }
  });

  it('never gives one URL two different titles', () => {
    const byUrl = new Map<string, string>();
    for (const { source } of everySource()) {
      const seen = byUrl.get(source.url);
      if (seen) expect(source.title, source.url).toBe(seen);
      byUrl.set(source.url, source.title);
    }
  });
});

describe('citations match the race they describe', () => {
  /*
   * The invariant a code review caught by hand: the "rain that comes back" scenario described
   * Melbourne 2025 and Montreal 2026 while citing a *Hungarian* Grand Prix race report.
   *
   * Deliberately the negative form — **no source may name an event the copy does not** — rather
   * than "some source must name the event the copy does". The positive form looks stronger and is
   * unusable: Bahrain 2025's own Pirelli race report is titled "Piastri's clean sweep in
   * McLaren's second home race" and names no circuit at all, so it would fail while being exactly
   * the right citation. The negative form has no such false positive and still catches a source
   * pointing at the wrong Grand Prix, which is the mistake that actually happened.
   */
  const EVENTS = [
    ['Bahrain', 'Sakhir'],
    ['Silverstone', 'British'],
    ['Barcelona', 'Catalunya'],
    ['Melbourne', 'Australian'],
    ['Hungary', 'Budapest', 'Hungaroring'],
    ['Monaco', 'Monte Carlo'],
    ['Suzuka', 'Japanese'],
    ['Canada', 'Canadian', 'Montreal'],
    ['Austria', 'Spielberg'],
  ];

  /** Which event groups a string refers to, under any of their names. */
  const eventsIn = (text: string): Set<number> =>
    new Set(EVENTS.flatMap((names, i) => (names.some((n) => text.includes(n)) ? [i] : [])));

  const label = (i: number) => EVENTS[i]![0];

  it.each(STRATEGY_SCENARIOS.map((s) => [s.id, s] as const))(
    '%s cites no event it does not discuss',
    (_id, scenario) => {
      const inText = eventsIn(
        [
          scenario.situation,
          scenario.detail,
          scenario.leaning,
          scenario.advantage,
          scenario.risk,
        ].join(' '),
      );
      for (const source of scenario.sources) {
        for (const event of Array.from(eventsIn(source.title))) {
          expect(
            inText.has(event),
            `cites "${source.title}" (${label(event)}) but the copy never mentions it`,
          ).toBe(true);
        }
      }
    },
  );

  it.each(RACE_COMPOUNDS.map((c) => [c.id, c] as const))(
    "%s's race scenario cites no other event",
    (_id, compound) => {
      const inText = eventsIn(`${compound.scenario.title} ${compound.scenario.body}`);
      for (const event of Array.from(eventsIn(compound.scenario.source.title))) {
        expect(
          inText.has(event),
          `${compound.id} cites "${compound.scenario.source.title}" (${label(event)})`,
        ).toBe(true);
      }
    },
  );

  /** And a race scenario has to cite a dated race report, not a general explainer standing in. */
  it.each(RACE_COMPOUNDS.map((c) => [c.id, c] as const))(
    "%s's race scenario cites a race source",
    (_id, compound) => {
      expect(compound.scenario.source.url).toMatch(/press\.pirelli\.com|formula1\.com/);
    },
  );
});

describe('the numbered range and the race label stay separate', () => {
  it('is five compounds for 2026, not six', () => {
    expect(TYRES_SEASON).toBe(2026);
    expect(DRY_RANGE).toHaveLength(5);
    expect(DRY_RANGE.map((c) => c.name)).toEqual(['C1', 'C2', 'C3', 'C4', 'C5']);
  });

  it('ranks the range hardest to softest with no gaps', () => {
    expect(DRY_RANGE.map((c) => c.rank)).toEqual([1, 2, 3, 4, 5]);
  });

  /*
   * The structural guarantee. If a compound number ever appeared in a `RaceCompound`'s copy, the
   * page would be asserting the fixed mapping it exists to deny — and the type system cannot
   * catch a number written into a sentence.
   */
  it('never writes a compound number into a race-label panel', () => {
    for (const compound of RACE_COMPOUNDS) {
      const prose = [
        compound.tagline,
        compound.summary,
        compound.warmUpNote,
        compound.degradation,
        compound.suitedTo,
        compound.strategicRole,
        compound.scenario.title,
        compound.scenario.body,
        compound.nominationNote ?? '',
      ].join(' ');
      expect(prose, compound.id).not.toMatch(/\bC[1-9]\b/);
    }
  });

  it('gives every dry label the sentence that says it is a role', () => {
    for (const compound of RACE_COMPOUNDS.filter((c) => c.comparisonGroup === 'dry')) {
      expect(compound.nominationNote, compound.id).toBeTruthy();
    }
  });

  it('leaves the wet-weather compounds without one, because they are products', () => {
    for (const compound of RACE_COMPOUNDS.filter((c) => c.comparisonGroup === 'wet')) {
      expect(compound.nominationNote, compound.id).toBeUndefined();
    }
  });

  /** One example reads as a rule. The point only lands with several. */
  it('shows the tracked compound under more than one label', () => {
    expect(ALLOCATION_EXAMPLES.length).toBeGreaterThan(1);
    const labels = ALLOCATION_EXAMPLES.map(
      (a) => a.picks.find((p) => p.compound === ALLOCATION_TRACKED_COMPOUND)?.label,
    );
    expect(labels.every(Boolean), 'tracked compound missing from an example').toBe(true);
    expect(new Set(labels).size).toBeGreaterThan(1);
  });

  it('orders every allocation hardest to softest', () => {
    for (const example of ALLOCATION_EXAMPLES) {
      expect(
        example.picks.map((p) => p.label),
        example.event,
      ).toEqual(['Hard', 'Medium', 'Soft']);
      const numbers = example.picks.map((p) => Number(p.compound.slice(1)));
      expect(
        [...numbers].sort((a, b) => a - b),
        example.event,
      ).toEqual(numbers);
    }
  });

  it('only nominates compounds that exist in the range', () => {
    const names = new Set(DRY_RANGE.map((c) => c.name));
    for (const example of ALLOCATION_EXAMPLES) {
      for (const pick of example.picks) {
        expect(names.has(pick.compound), `${example.event} nominates ${pick.compound}`).toBe(true);
      }
    }
  });
});

describe('the ordinal scales stay ordinal', () => {
  it.each(RACE_COMPOUNDS.map((c) => [c.id, c] as const))('%s stays in range', (_id, compound) => {
    for (const [field, value] of [
      ['grip', compound.grip],
      ['durability', compound.durability],
      ['warmUp', compound.warmUp],
    ] as const) {
      expect(value, `${compound.id}.${field}`).toBeGreaterThanOrEqual(1);
      expect(value, `${compound.id}.${field}`).toBeLessThanOrEqual(5);
    }
    expect(compound.attack, `${compound.id}.attack`).toBeGreaterThanOrEqual(0);
    expect(compound.attack, `${compound.id}.attack`).toBeLessThanOrEqual(1);
  });

  // The softest dry compound must out-grip and under-last the hardest, or the page is teaching
  // the trade-off backwards.
  it('keeps the dry trade-off pointing the right way', () => {
    const dry = Object.fromEntries(RACE_COMPOUNDS.map((c) => [c.id, c]));
    expect(dry.soft!.grip).toBeGreaterThan(dry.hard!.grip);
    expect(dry.soft!.durability).toBeLessThan(dry.hard!.durability);
    expect(dry.soft!.warmUp).toBeGreaterThan(dry.hard!.warmUp);
    expect(dry.soft!.attack).toBeGreaterThan(dry.hard!.attack);
    expect(dry.medium!.attack).toBeGreaterThan(dry.hard!.attack);
    expect(dry.medium!.attack).toBeLessThan(dry.soft!.attack);
  });
});

describe('unsupported claims stay out of the copy', () => {
  const allProse = [
    ...RACE_COMPOUNDS.flatMap((c) => [c.summary, c.degradation, c.scenario.body]),
    ...LIFECYCLE_STAGES.map((l) => l.body),
    ...TYRE_FAQ.map((f) => f.answer),
    ...STRATEGY_SCENARIOS.flatMap((s) => [s.advantage, s.risk]),
  ]
    .join(' ')
    .toLowerCase();

  it('claims no full recycling and no recycled-content figure', () => {
    expect(allProse).not.toContain('100% recycled');
    expect(allProse).not.toMatch(/fully recycled|entirely recycled/);
    expect(allProse).not.toContain('iscc');
  });

  /*
   * Pirelli publishes no per-compound operating temperature window for C1–C5 — the only figures
   * that exist describe the superseded ultrasoft range — so a temperature in °C next to a
   * compound would be invented.
   */
  it('states no per-compound operating temperature', () => {
    for (const compound of RACE_COMPOUNDS) {
      const prose = `${compound.summary} ${compound.warmUpNote} ${compound.degradation}`;
      expect(prose, compound.id).not.toMatch(/\d+\s*°|\d+\s*degrees/i);
    }
  });

  /** Where a published figure describes an older specification, the page has to say so. */
  it('dates the water-displacement figures it quotes', () => {
    const water = TYRE_FAQ.find((f) => f.id === 'water')!;
    expect(water.answer).toMatch(/litres/i);
    expect(water.answer).toMatch(/2020|2022|earlier specification/i);
  });
});

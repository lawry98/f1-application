import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { BriefingExample, BriefingExampleSummary } from '@/data/briefing-examples';
import {
  BRIEFING_EXAMPLES,
  exampleById,
  exampleFor,
  exampleForFailure,
  exampleHref,
  featuredExample,
  formatCapturedDate,
  loadBriefingExample,
} from '@/lib/briefing-examples';
import type { RaceInfo } from '@/types';

const ROOT = resolve(__dirname, '..');
const DIR = join(ROOT, 'data', 'briefing-examples');

function files(): BriefingExample[] {
  return readdirSync(DIR)
    .filter((name) => name.endsWith('.json') && name !== 'index.json')
    .sort()
    .map((name) => JSON.parse(readFileSync(join(DIR, name), 'utf8')) as BriefingExample);
}

const CATALOG: BriefingExampleSummary[] = [
  {
    id: '2026-06-monaco-grand-prix',
    event: 'Monaco Grand Prix',
    year: 2026,
    round: 6,
    circuit: 'Circuit de Monaco',
    captured_at: '2026-10-01T17:00:00+00:00',
    as_of: '2026-06-05T11:30:00+00:00',
    is_upcoming: false,
  },
  {
    id: '2026-17-singapore-grand-prix',
    event: 'Singapore Grand Prix',
    year: 2026,
    round: 17,
    circuit: 'Marina Bay Street Circuit',
    captured_at: '2026-10-02T08:00:00+00:00',
    as_of: '2026-10-02T00:00:00+00:00',
    is_upcoming: true,
  },
];

const RACE = { name: 'Singapore Grand Prix', year: 2026 } as RaceInfo;

describe('the committed examples', () => {
  it('exist', () => {
    expect(BRIEFING_EXAMPLES.length).toBeGreaterThan(0);
  });

  it('are indexed exactly, one row per file, in id order', () => {
    expect(BRIEFING_EXAMPLES).toEqual(
      files().map((example) => ({
        id: example.id,
        event: example.race_info.name,
        year: example.race_info.year,
        round: example.race_info.round,
        circuit: example.race_info.circuit_name,
        captured_at: example.captured_at,
        as_of: example.race_info.as_of,
        is_upcoming: example.race_info.is_upcoming,
      })),
    );
  });

  it('are each named for their year, round and event, and are schema 1', () => {
    for (const example of files()) {
      expect(example.schema).toBe(1);
      expect(example.id).toMatch(/^\d{4}-\d{2}-[a-z0-9-]+$/);
      expect(example.id.startsWith(`${example.race_info.year}-`)).toBe(true);
    }
  });

  it('each load through the lazy loader as the file on disk', async () => {
    for (const example of files()) {
      expect(await loadBriefingExample(example.id)).toEqual(example);
    }
  });
});

describe('loadBriefingExample', () => {
  it('loads nothing for an id the index does not list, so a URL cannot reach other files', async () => {
    expect(await loadBriefingExample('index')).toBeNull();
    expect(await loadBriefingExample('../circuits/mc-1929')).toBeNull();
    expect(await loadBriefingExample('2099-01-nowhere')).toBeNull();
  });
});

describe('finding an example', () => {
  it('by id', () => {
    expect(exampleById('2026-06-monaco-grand-prix', CATALOG)?.event).toBe('Monaco Grand Prix');
    expect(exampleById('nope', CATALOG)).toBeNull();
    expect(exampleById(null, CATALOG)).toBeNull();
  });

  it('by the exact event name and year, never a near match', () => {
    expect(exampleFor('Monaco Grand Prix', 2026, CATALOG)?.id).toBe('2026-06-monaco-grand-prix');
    expect(exampleFor('Monaco Grand Prix', 2025, CATALOG)).toBeNull();
    expect(exampleFor('Monaco', 2026, CATALOG)).toBeNull();
    expect(exampleFor('monaco grand prix', 2026, CATALOG)).toBeNull();
  });

  it('for a failure, by race_info when it arrived', () => {
    // Typed "Singapore" resolved to the 2026 race before the run failed.
    expect(exampleForFailure(RACE, 'Singapore', 2027, CATALOG)?.id).toBe(
      '2026-17-singapore-grand-prix',
    );
  });

  it('for a failure with no race_info, by the quick-select name and the calendar year', () => {
    expect(exampleForFailure(null, 'Singapore Grand Prix', 2026, CATALOG)?.id).toBe(
      '2026-17-singapore-grand-prix',
    );
    expect(exampleForFailure(null, '  Singapore Grand Prix ', 2026, CATALOG)?.id).toBe(
      '2026-17-singapore-grand-prix',
    );
    expect(exampleForFailure(null, 'Singapore', 2026, CATALOG)).toBeNull();
    expect(exampleForFailure(null, 'Singapore Grand Prix', 2027, CATALOG)).toBeNull();
  });

  it('features Monaco when there is one, else the first example', () => {
    expect(featuredExample(CATALOG)?.id).toBe('2026-06-monaco-grand-prix');
    expect(featuredExample(CATALOG.slice(1))?.id).toBe('2026-17-singapore-grand-prix');
    expect(featuredExample([])).toBeNull();
  });

  it('links by a query parameter on /briefing', () => {
    expect(exampleHref('2026-06-monaco-grand-prix')).toBe(
      '/briefing?example=2026-06-monaco-grand-prix',
    );
  });
});

describe('formatCapturedDate', () => {
  it("reads the capture's own UTC date, never the reader's time zone", () => {
    expect(formatCapturedDate('2026-10-01T17:00:00+00:00')).toBe('1 Oct 2026');
    expect(formatCapturedDate('2026-10-01T23:59:59+00:00')).toBe('1 Oct 2026');
    expect(formatCapturedDate('2026-12-31T00:00:00+00:00')).toBe('31 Dec 2026');
  });
});

/**
 * The guard for "load examples lazily". `loadBriefingExample`'s template-literal import is what
 * makes the bundler emit one chunk per example; a static import of one puts its whole briefing in
 * the page bundle. Only the index — ids and dates, no prose — may be imported statically.
 */
describe('example imports', () => {
  const SCANNED = ['app', 'components', 'hooks', 'lib'];
  const STATIC_EXAMPLE_IMPORT = /from\s+['"]@\/data\/briefing-examples\/(?!index\.json)[^'"]+['"]/;

  function sources(dir: string): string[] {
    return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) return sources(full);
      return /\.(ts|tsx)$/.test(entry.name) ? [relative(ROOT, full)] : [];
    });
  }

  it('never statically imports an example', () => {
    const offenders = SCANNED.flatMap((dir) => sources(join(ROOT, dir))).filter((file) =>
      STATIC_EXAMPLE_IMPORT.test(readFileSync(join(ROOT, file), 'utf8')),
    );
    expect(offenders).toEqual([]);
  });
});

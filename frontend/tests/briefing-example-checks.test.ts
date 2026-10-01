/**
 * The fact checks, run over every committed example and over the shared cases.
 *
 * The capture script runs the Python checks before it writes an example and stores their verdict
 * in `checks`. This suite recomputes that verdict with the TypeScript port and holds the two to
 * each other: a hand edit to the prose or the evidence either fails a check here or changes the
 * verdict, and a drift between the two checkers shows up on real briefings, not only on the cases.
 */

import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { BriefingExample } from '@/data/briefing-examples';
import { checkExample, type CheckableExample } from './briefing-example-checks';
import cases from './fixtures/briefing-check-cases.json';

const DIR = resolve(__dirname, '..', 'data', 'briefing-examples');

const examples = readdirSync(DIR)
  .filter((name) => name.endsWith('.json') && name !== 'index.json')
  .sort()
  .map((name) => JSON.parse(readFileSync(join(DIR, name), 'utf8')) as BriefingExample);

describe.each(examples.map((example) => [example.id, example] as const))(
  'the committed example %s',
  (_id, example) => {
    const result = checkExample(example);

    it('fails no check', () => {
      expect(result.failed).toEqual([]);
    });

    it('used every tool it planned, and every one succeeded', () => {
      expect(example.tools.map((t) => t.tool).sort()).toEqual([...example.tool_plan].sort());
      expect(example.tools.every((t) => t.success)).toBe(true);
      expect(example.briefing.truncated).toBe(false);
    });

    it('carries the verdict the capture recorded', () => {
      expect(example.checks).toEqual({ passed: result.passed, flagged: result.flagged });
    });
  },
);

type Fixture = typeof cases;
type Case = Fixture['cases'][number];

function merge(base: Record<string, unknown>, patch: Record<string, unknown>): void {
  for (const [key, value] of Object.entries(patch)) {
    const current = base[key];
    if (
      value !== null &&
      typeof value === 'object' &&
      !Array.isArray(value) &&
      current !== null &&
      typeof current === 'object' &&
      !Array.isArray(current)
    ) {
      merge(current as Record<string, unknown>, value as Record<string, unknown>);
    } else {
      base[key] = value;
    }
  }
}

function buildCase(testCase: Case): CheckableExample {
  const bases = cases.bases as Record<string, unknown>;
  const example = structuredClone(bases[testCase.base]) as CheckableExample;
  for (const [old, replacement] of (testCase as { replace?: [string, string][] }).replace ?? []) {
    expect(example.briefing.content, `replace target missing: ${old}`).toContain(old);
    example.briefing.content = example.briefing.content.replace(old, replacement);
  }
  const patch = (testCase as { patch?: Record<string, unknown> }).patch;
  if (patch) merge(example as unknown as Record<string, unknown>, structuredClone(patch));
  return example;
}

describe('the shared check cases', () => {
  it.each(cases.cases.map((c) => [c.name, c] as const))('%s', (_name, testCase) => {
    const result = checkExample(buildCase(testCase));

    expect(result.failed.map((f) => f.check)).toEqual(testCase.expect.failed);
    expect(result.flagged.map((f) => f.claim)).toEqual(testCase.expect.flagged);
  });

  it('pass a clean example on every check, by name', () => {
    const result = checkExample(buildCase({ base: 'monaco' } as Case));

    expect(result.passed.map((p) => p.check)).toEqual([
      'tools',
      'complete',
      'sections',
      'circuit',
      'standings',
      'results',
      'as_of',
      'weather',
    ]);
  });

  it('name every flag with its check, section and reason', () => {
    const result = checkExample(buildCase({ base: 'monaco' } as Case));

    expect(result.flagged).toEqual([
      {
        check: 'circuit',
        section: 'Track Profile',
        claim: 'Overtaking is close to impossible, so qualifying decides most races.',
        reason: 'circuit knowledge, not in the gathered data',
      },
    ]);
  });
});

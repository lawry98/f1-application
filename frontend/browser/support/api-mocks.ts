import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

import type { Page } from '@playwright/test';

/**
 * Serves `/api/*` from the captured responses in `tests/fixtures/`, the same bytes the Vitest
 * suite parses, so the browser suite needs no backend and no network.
 *
 * Fails closed: an `/api/` request with no fixture gets a 501 and is recorded, and the
 * fixture in `test.ts` fails the test on it. A new endpoint therefore cannot go silently
 * unmocked.
 */
const FIXTURES = path.resolve(__dirname, '..', '..', 'tests', 'fixtures');

function fixture(name: string): unknown {
  return JSON.parse(readFileSync(path.join(FIXTURES, name), 'utf8'));
}

export interface BriefingRefusal {
  status: 429 | 503;
  code: 'busy' | 'rate_limited' | 'daily_cap';
  retryAfterSeconds: number;
  limit: number;
}

/**
 * Answer `/api/briefing/stream` with the cost guard's refusal — the JSON body and Retry-After
 * header `backend/api/routes.py` sends — instead of a run.
 *
 * Registered after `mockApi` by any test that calls it, so it wins: Playwright tries routes in
 * reverse order of registration. A refusal never opens the event stream, which is why this is
 * a plain JSON response and not one of the captured `.sse` fixtures.
 */
export async function mockBriefingRefusal(page: Page, refusal: BriefingRefusal): Promise<void> {
  await page.route('**/api/briefing/stream', (route) =>
    route.fulfill({
      status: refusal.status,
      json: {
        code: refusal.code,
        retry_after_seconds: refusal.retryAfterSeconds,
        limit: refusal.limit,
      },
      headers: { 'Retry-After': String(refusal.retryAfterSeconds) },
    }),
  );
}

/** A captured `.sse` body as text — whole, or for cutting with `tests/sse-cuts.ts`. */
export function sseFixture(name: 'clean.sse' | 'truncated.sse'): string {
  return readFileSync(path.join(FIXTURES, name), 'utf8');
}

/**
 * Answer `/api/briefing/stream` with `bodies` in turn, one per request, as the event stream the
 * route serves. Each body is captured bytes — a fixture from {@link sseFixture}, or a cut of one
 * made at runtime — so a stream that stops mid-way is real frames up to the cut, never a
 * hand-written approximation.
 *
 * A request past the last body gets a 501, which the page reports as an error and the test
 * then fails on. Registered after `mockApi` for the same reason as {@link mockBriefingRefusal}.
 */
export async function mockBriefingStreams(page: Page, bodies: string[]): Promise<void> {
  let call = 0;
  await page.route('**/api/briefing/stream', (route) => {
    const body = bodies[call++];
    if (body === undefined) return route.fulfill({ status: 501, body: 'no stream left to serve' });
    return route.fulfill({ status: 200, contentType: 'text/event-stream', body });
  });
}

export async function mockApi(page: Page): Promise<string[]> {
  const unmocked: string[] = [];
  await page.route('**/api/**', async (route) => {
    const { pathname } = new URL(route.request().url());
    if (/^\/api\/races\/\d{4}$/.test(pathname)) {
      return route.fulfill({ json: fixture('races-2026.json') });
    }
    const standings = /^\/api\/standings\/(\d{4})$/.exec(pathname);
    if (standings) {
      // The page opens on the server clock's year, so any year without its own capture gets
      // the 2026 one rather than failing the day the calendar turns over.
      const named = `standings-${standings[1]}.json`;
      return route.fulfill({
        json: fixture(existsSync(path.join(FIXTURES, named)) ? named : 'standings-2026.json'),
      });
    }
    const winners = /^\/api\/circuits\/([a-z]{2}-\d{4})\/winners$/.exec(pathname);
    if (winners) {
      // Only circuits with a captured response are served. Any other id falls through to the
      // fail-closed 501 below, so a test that wanders onto an uncaptured circuit fails loudly.
      const named = `circuit-winners-${winners[1]}.json`;
      if (existsSync(path.join(FIXTURES, named))) return route.fulfill({ json: fixture(named) });
    }
    unmocked.push(route.request().url());
    return route.fulfill({ status: 501, body: 'unmocked in the browser harness' });
  });
  return unmocked;
}

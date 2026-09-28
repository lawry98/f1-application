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
    unmocked.push(route.request().url());
    return route.fulfill({ status: 501, body: 'unmocked in the browser harness' });
  });
  return unmocked;
}

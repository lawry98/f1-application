import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';

import { mockBriefingRefusal } from './support/api-mocks';
import { AA_SMALL_TEXT, expectContrast } from './support/contrast';
import { waitForMotionToSettle } from './support/motion';
import { waitForMain } from './support/page-content';
import { expect, test } from './support/test';

const WCAG_A_AA = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];

/** Inside the 2026 calendar the races fixture serves, so the quick-select row has a Monaco chip. */
const NOW = new Date('2026-06-01T12:00:00Z');

/** Committed by the capture script; the one example `/briefing` features. */
const EXAMPLE_ID = '2026-06-monaco-grand-prix';
const OFFER = /^Read the saved example \(captured \d{1,2} [A-Z][a-z]{2} \d{4}\)$/;
const LABEL = /^Saved example · captured \d{1,2} [A-Z][a-z]{2} \d{4} · not a live briefing$/;
/** `ink`, `#F4F4ED` — the ring `focusRingInk` paints. */
const INK = 'rgb(244, 244, 237)';

async function expectNoAxeViolations(page: Page): Promise<void> {
  await waitForMotionToSettle(page);
  const { violations } = await new AxeBuilder({ page }).withTags(WCAG_A_AA).analyze();
  expect(
    violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`),
  ).toEqual([]);
}

function sse(events: [string, unknown][]): string {
  return events
    .map(([event, data]) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
    .join('');
}

test('a 503 busy offers the saved example, and it opens with its label', async ({ page }) => {
  await page.clock.install({ time: NOW });
  await mockBriefingRefusal(page, { status: 503, code: 'busy', retryAfterSeconds: 120, limit: 2 });
  await page.goto('/briefing');
  await waitForMain(page);

  await page.getByRole('button', { name: /monaco grand prix/i }).click();

  const main = page.getByRole('main');
  await expect(main.getByRole('status')).toBeVisible();
  const offer = main.getByRole('link', { name: OFFER });
  await expect(offer).toBeVisible();
  // Inside the notice's box, outside its live region.
  await expect(main.getByRole('status')).not.toContainText('Read the saved example');
  await waitForMotionToSettle(page);
  await expectContrast(offer, {
    atLeast: AA_SMALL_TEXT,
    site: 'saved-example offer (zinc-100 on its own zinc-800 fill, in the zinc-900 notice box)',
  });
  await expectNoAxeViolations(page);

  await offer.click();

  await expect(page).toHaveURL(new RegExp(`/briefing\\?example=${EXAMPLE_ID}$`));
  const label = main.getByText(LABEL);
  await expect(label).toBeVisible();
  await expect(main.getByRole('article', { name: LABEL })).toBeVisible();
  await expect(main.getByRole('heading', { name: 'Track Profile' })).toBeVisible();
  // The card fades in once it is well into view, as a live one does, and the offer leaves the
  // page where the notice was, just above it. `scrollIntoViewIfNeeded` does nothing for a label
  // whose top edge is already on screen, so centre it.
  await label.evaluate((el) => el.scrollIntoView({ block: 'center' }));
  await waitForMotionToSettle(page);
  await expectContrast(label, {
    atLeast: AA_SMALL_TEXT,
    site: "saved-example label (zinc-200 on the strip's opaque zinc-800)",
  });
  await expectNoAxeViolations(page);

  // Back is the notice again, still counting down.
  await page.goBack();
  await expect(main.getByRole('link', { name: OFFER })).toBeVisible();
  await expect(label).toHaveCount(0);
});

test('a deadline after race_info offers the example in the error box, ringed in ink', async ({
  page,
}) => {
  await page.clock.install({ time: NOW });
  await page.route('**/api/briefing/stream', (route) =>
    route.fulfill({
      status: 200,
      headers: { 'content-type': 'text/event-stream' },
      body: sse([
        ['status', { step: 'resolving', message: 'Resolving race...' }],
        [
          'race_info',
          {
            name: 'Monaco Grand Prix',
            year: 2026,
            round: 6,
            circuit_id: 'monaco_grand_prix',
            track_id: 'mc-1929',
            circuit_name: 'Circuit de Monaco',
            circuit_length_m: 3337,
            location: 'Monte Carlo',
            country: 'Monaco',
            date: '2026-06-07 00:00:00',
            is_upcoming: false,
            as_of: '2026-06-05T11:30:00+00:00',
            sessions: [],
          },
        ],
        ['error', { message: 'Stopped.', code: 'deadline' }],
      ]),
    }),
  );
  await page.goto('/briefing');
  await waitForMain(page);

  // Typed, not the chip: the match is on the race_info that arrived, not on the words.
  await page.getByLabel('Circuit name').fill('Monaco');
  await page.getByRole('button', { name: 'Generate', exact: true }).click();

  const main = page.getByRole('main');
  await expect(main.getByRole('alert')).toContainText('took too long');
  const offer = main.getByRole('link', { name: OFFER });
  await expect(offer).toBeVisible();
  await waitForMotionToSettle(page);
  await expectContrast(offer, {
    atLeast: AA_SMALL_TEXT,
    site: 'saved-example offer (zinc-100 on its own zinc-800 fill, in the red-900/20 error box)',
  });
  await expectNoAxeViolations(page);

  // Reached by Tab, so `:focus-visible` matches and the ring really paints.
  await page.getByRole('button', { name: 'Generate', exact: true }).focus();
  for (let i = 0; i < 10 && !(await offer.evaluate((el) => el === document.activeElement)); i++) {
    await page.keyboard.press('Tab');
  }
  await expect(offer).toBeFocused();
  const ring = await offer.evaluate((el) => getComputedStyle(el).boxShadow);
  expect(ring, 'the ink ring, not the red one that fades on the red-tinted box').toContain(INK);
});

test('an example deep link renders with every API request refused', async ({ page }) => {
  // Registered after the harness's mocks, so it wins: the backend is simply not there.
  await page.route('**/api/**', (route) => route.abort('connectionrefused'));
  await page.goto(`/briefing?example=${EXAMPLE_ID}`);
  await waitForMain(page);

  const main = page.getByRole('main');
  await expect(main.getByText(LABEL)).toBeVisible();
  await expect(main.getByRole('heading', { name: 'Track Profile' })).toBeVisible();
  await expect(main.getByText('Select a race')).toHaveCount(0);
});

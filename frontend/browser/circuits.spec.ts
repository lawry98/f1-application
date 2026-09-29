import racesFixture from '../tests/fixtures/races-2026.json';
import { expect, test } from './support/test';

/**
 * `/circuits` and `/circuits/[slug]` against the production build, where jsdom cannot reach:
 * real lazy chunks for the outlines, Next's patched `replaceState`, and a server-side redirect.
 *
 * The card count is derived from `races-2026.json` rather than hardcoded — the fixture is a real
 * capture and its round count is not this spec's to assert.
 */
const ROUND_COUNT = racesFixture.races.filter((race) => race.round > 0).length;

test('/circuits draws every round of the calendar fixture with its outline', async ({ page }) => {
  await page.goto('/circuits');

  const cards = page.getByRole('list', { name: /calendar$/ }).getByRole('listitem');
  await expect(cards).toHaveCount(ROUND_COUNT);
  await expect(page.locator('[data-circuit-slot] svg')).toHaveCount(ROUND_COUNT);
  await expect(page.getByText('No track map')).toHaveCount(0);
});

test('the season picker replaces the URL, so Back leaves the page rather than the season', async ({ page }) => {
  await page.goto('/standings');
  await page.goto('/circuits');
  await expect(page.getByRole('list', { name: /calendar$/ })).toBeVisible();

  await page.getByLabel('Season').selectOption({ index: 1 });
  await expect(page).toHaveURL(/\/circuits\?year=\d{4}$/);

  await page.goBack();
  await expect(page).toHaveURL(/\/standings$/);
});

test('an alias slug redirects to its canonical URL, and ?year= survives', async ({ page }) => {
  // `app/loading.tsx` streams the redirect with HTTP 200, so status/Location-header assertions
  // don't work here — assert the landed URL instead. `Monza` (mis-cased) resolves to
  // the same circuit as the canonical `monza` slug and has a captured winners fixture, unlike
  // `bahrain` → `sakhir` (bh-2002), which is not mocked and would fail closed.
  await page.goto('/circuits/Monza?year=2024');
  await expect(page).toHaveURL(/\/circuits\/monza\?year=2024$/);
});

test('a card opens its circuit, and the circuit shows its winners', async ({ page }) => {
  await page.goto('/circuits');

  await page.getByRole('link', { name: /Italian Grand Prix/ }).click();

  await expect(page).toHaveURL(/\/circuits\/monza(\?year=\d{4})?$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Autodromo Nazionale Monza' })).toBeVisible();
  await expect(page.getByRole('table')).toBeVisible();
});

test('an unknown circuit shows the not-found page, kept out of search indexes', async ({ page }) => {
  await page.goto('/circuits/atlantis');

  // The same streamed-200 behaviour applies to `notFound()`, so this asserts the rendered
  // not-found content (`app/not-found.tsx`) rather than the response status. The HTTP status
  // being unavailable as a signal is only safe to ship because a crawler still sees this meta
  // tag, so a soft 404 is asserted alongside the heading rather than left to chance.
  await expect(page.getByRole('heading', { name: 'Page not found' })).toBeVisible();
  // Next renders this tag twice post-hydration (SSR copy plus a client-inserted one, both
  // identical) — assert the first rather than the count, which is not this test's to pin.
  await expect(page.locator('meta[name="robots"]').first()).toHaveAttribute('content', /noindex/);
});

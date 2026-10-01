import AxeBuilder from '@axe-core/playwright';

import { mockBriefingRefusal, type BriefingRefusal } from './support/api-mocks';
import { AA_SMALL_TEXT, expectContrast } from './support/contrast';
import { waitForMotionToSettle } from './support/motion';
import { waitForMain } from './support/page-content';
import { expect, test } from './support/test';

const WCAG_A_AA = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];

/** Inside the 2026 calendar the races fixture serves, so the quick-select row has chips. */
const NOW = new Date('2026-06-01T12:00:00Z');

/**
 * The cost guard's refusals as a reader meets them on `/briefing`: a neutral notice, every
 * control that could start a briefing locked with the countdown on it, and everything live again
 * once the wait runs out — with nobody reloading.
 *
 * The clock is installed but left flowing until axe has run, because `waitForMotionToSettle`
 * needs real frames; only the re-enable is driven by `page.clock`. The countdown is therefore
 * matched as "some seconds", and the wait is long enough that it cannot run out first.
 */
const CASES: { name: string; refusal: BriefingRefusal; message: RegExp; button: RegExp }[] = [
  {
    name: '503 busy',
    refusal: { status: 503, code: 'busy', retryAfterSeconds: 10, limit: 2 },
    message: /^Another briefing is being generated\. Try again in \d+s\.$/,
    button: /^Retry in \d+s$/,
  },
  {
    name: '429 rate_limited',
    refusal: { status: 429, code: 'rate_limited', retryAfterSeconds: 1200, limit: 5 },
    message: /^You've used your 5 briefings for this hour\. Next one (tomorrow )?at .+\.$/,
    button: /^Retry in \d+:\d{2}$/,
  },
];

for (const { name, refusal, message, button } of CASES) {
  test(`a ${name} shows a readable notice, locks the controls, and unlocks them on time`, async ({
    page,
  }) => {
    await page.clock.install({ time: NOW });
    await mockBriefingRefusal(page, refusal);
    await page.goto('/briefing');
    await waitForMain(page);
    const chip = page.getByRole('button', { name: /monaco grand prix/i });
    await expect(chip).toBeEnabled();

    await page.getByLabel('Circuit name').fill('Monaco');
    await page.getByRole('button', { name: 'Generate', exact: true }).click();

    const main = page.getByRole('main');
    const notice = main.getByRole('status');
    // The painted copy, not its `sr-only` twin — which is the accessible text, and which
    // `expectContrast` would refuse to measure anyway.
    const text = notice.locator('span[aria-hidden="true"]').filter({ hasText: message });
    await expect(text).toBeVisible();
    // A notice, not a failure: the red alert box stays away. Scoped to <main> because Next's
    // route announcer is a role="alert" of its own.
    await expect(main.getByRole('alert')).toHaveCount(0);
    await expect(page.getByRole('button', { name: button })).toBeDisabled();
    await expect(chip).toBeDisabled();

    await waitForMotionToSettle(page);
    await expectContrast(text, {
      atLeast: AA_SMALL_TEXT,
      site: `${name} notice (zinc-300 on the status box's opaque zinc-900)`,
    });
    const { violations } = await new AxeBuilder({ page }).withTags(WCAG_A_AA).analyze();
    expect(
      violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`),
    ).toEqual([]);

    await page.clock.runFor(refusal.retryAfterSeconds * 1000);

    await expect(page.getByRole('button', { name: 'Generate', exact: true })).toBeEnabled();
    await expect(chip).toBeEnabled();
    await expect(notice).toHaveCount(0);
  });
}

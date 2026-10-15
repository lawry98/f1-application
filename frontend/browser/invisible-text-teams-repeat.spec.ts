import { waitForMotionToSettle } from './support/motion';
import { findInvisibleText } from './support/invisible-text';
import { waitForMain } from './support/page-content';
import { diagnoseSweep } from './support/sweep-diagnostics';
import { test } from './support/test';

/**
 * DIAGNOSTIC ONLY — not for merge. The `/teams` 390 sweep, repeated to raise the odds of catching
 * the intermittent CI hang with `diagnoseSweep` watching. Odd repeats also record a Chrome trace.
 */
const REPEATS = 12;

for (let n = 1; n <= REPEATS; n++) {
  test(`/teams at 390px sweep, repeat ${n}`, async ({ page }, testInfo) => {
    test.setTimeout(75_000);
    await page.setViewportSize({ width: 390, height: 900 });
    await page.goto('/teams');
    await waitForMain(page);
    await waitForMotionToSettle(page);
    await diagnoseSweep(page, testInfo, () => findInvisibleText(page, { trace: true }), { chromeTrace: n % 2 === 1 });
  });
}

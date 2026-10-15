import { findInvisibleText } from './invisible-text';
import { waitForMotionToSettle } from './motion';
import { waitForMain } from './page-content';
import { diagnoseSweep } from './sweep-diagnostics';
import { test } from './test';

/**
 * DIAGNOSTIC ONLY — not for merge. The `/teams` 390 sweep, repeated under a variant, to see which
 * variants still deadlock the renderer in `LayerTreeHost::WaitForCommitCompletion`.
 */
export function repeatTeamsSweep(name: string, { scrollInTask = false, repeats = 10 } = {}) {
  for (let n = 1; n <= repeats; n++) {
    test(`/teams at 390px sweep, ${name} ${n}`, async ({ page }, testInfo) => {
      test.setTimeout(90_000);
      await page.setViewportSize({ width: 390, height: 900 });
      await page.goto('/teams');
      await waitForMain(page);
      await waitForMotionToSettle(page);
      await diagnoseSweep(page, testInfo, () => findInvisibleText(page, { trace: true, scrollInTask }), {
        chromeTrace: n % 2 === 1,
      });
    });
  }
}

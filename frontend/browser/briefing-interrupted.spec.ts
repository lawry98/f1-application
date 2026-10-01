import AxeBuilder from '@axe-core/playwright';

import { cutAfter, cutBefore } from '../tests/sse-cuts';
import { mockBriefingStreams, sseFixture } from './support/api-mocks';
import { parseCssColor, wcagRatio } from './support/color';
import { AA_NON_TEXT, AA_SMALL_TEXT, expectContrast } from './support/contrast';
import { focusByKeyboard, focusState } from './support/css';
import { findInvisibleText } from './support/invisible-text';
import { waitForMotionToSettle } from './support/motion';
import { waitForMain } from './support/page-content';
import { expect, test } from './support/test';

const WCAG_A_AA = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];

/** `tailwind.config.ts` → `f1.red`, the flush `focusRing` from `lib/focus.ts`. */
const F1_RED = 'rgb(225, 6, 0)';

/**
 * A briefing stream that stops before its terminal event, as a reader meets it on `/briefing`:
 * the prose that arrived stays, a note says the connection dropped, and Try again asks for the
 * same race and finishes it. The broken stream is the real `clean.sse` cut at runtime.
 *
 * Both widths, because the note's row stacks below `sm`, and because `sm:text-base` — this
 * theme's colour token — is harmless below 640px and invisible above it.
 */
const clean = sseFixture('clean.sse');

const STATES = [
  {
    name: 'cut after the prose began',
    body: cutAfter(clean, 'briefing_delta', 3),
    note: 'The connection dropped before this briefing finished — what you see is incomplete.',
    prose: true,
  },
  {
    name: 'cut before any prose',
    body: cutBefore(clean, 'briefing_delta'),
    note: 'The connection dropped before the briefing started. Try again.',
    prose: false,
  },
] as const;

for (const width of [375, 1440]) {
  for (const { name, body, note, prose } of STATES) {
    test(`a stream ${name} at ${width}px says so, reads, and Try again finishes it`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 900 });
      await mockBriefingStreams(page, [body, clean]);
      await page.goto('/briefing');
      await waitForMain(page);

      await page.getByLabel('Circuit name').fill('Monaco');
      await page.getByRole('button', { name: 'Generate', exact: true }).click();

      const main = page.getByRole('main');
      const status = main.getByRole('status').filter({ hasText: note });
      const tryAgain = main.getByRole('button', { name: 'Try again', exact: true });
      await expect(status).toBeVisible();
      await expect(tryAgain).toBeEnabled();
      await expect(main.getByText('Tight.')).toHaveCount(prose ? 1 : 0);
      // Not a failure the server reported: the red alert box stays away. Scoped to <main>
      // because Next's route announcer is a role="alert" of its own.
      await expect(main.getByRole('alert')).toHaveCount(0);

      // Where the reader is when the text stops. It also matters to axe: at 375px the card's top
      // is below the fold, and `BlurFade` holds an out-of-view card at opacity 0 — measured the
      // same for a clean briefing — so a sweep from the top reads text nobody can see yet.
      await status.scrollIntoViewIfNeeded();
      await waitForMotionToSettle(page);
      // The page-wide sweeps first: `expectContrast` hides the button's glyphs and restores them,
      // and its `transition-colors` fades the label back in from transparent — a sweep reading
      // colour straight after it measured that fade (alpha 0.03), not the page.
      const invisible = await findInvisibleText(page);
      expect(invisible.map((t) => `"${t.text}" ${t.color} on ${t.backdrop}`)).toEqual([]);
      const { violations } = await new AxeBuilder({ page }).withTags(WCAG_A_AA).analyze();
      expect(
        violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`),
      ).toEqual([]);
      const box = await expectContrast(status, {
        atLeast: AA_SMALL_TEXT,
        site: `interrupted note, ${name} (zinc-300 on its opaque zinc-900 box)`,
      });
      await expectContrast(tryAgain, {
        atLeast: AA_SMALL_TEXT,
        site: 'Try again label (ink on bg-zinc-800)',
      });
      // The ring is flush, so it paints outside the button, on the box the sentence sits on.
      await focusByKeyboard(page, tryAgain);
      const ring = await focusState(tryAgain);
      expect(ring.focusVisible).toBe(true);
      expect(ring.ringColor).toBe(F1_RED);
      const ringRatio = wcagRatio(parseCssColor(ring.ringColor), box.backdrop);
      expect(
        ringRatio,
        `Try again ring on the note's box: ${ringRatio.toFixed(2)}:1`,
      ).toBeGreaterThanOrEqual(AA_NON_TEXT);

      await tryAgain.click();

      await expect(main.getByText('Tight.')).toBeVisible();
      await expect(status).toHaveCount(0);
      await expect(tryAgain).toHaveCount(0);
    });
  }
}

import { expect, test } from './support/test';

/**
 * Class 1 again: `duration-[600ms]` generated no rule here, so the landing crossfade silently
 * ran at the 150ms `transition-[background-color]` sets for itself. The fix is the real token
 * `duration-600` (tailwind.config.ts). The class string reads correctly either way; only the
 * computed duration differs.
 */
test.use({ reducedMotion: 'no-preference' }); // the transition class is dropped under `reduce`

test('the warm landing sections crossfade over 600ms, not the 150ms fallback', async ({ page }) => {
  await page.goto('/');
  const warm = page.locator('[data-landing-tone="base-warm"]');
  await expect(warm.first()).toBeAttached();
  const durations = await warm.evaluateAll((els) => els.map((el) => getComputedStyle(el).transitionDuration));
  expect(durations.length).toBeGreaterThan(0);
  for (const d of durations) {
    expect(d, 'TONE_TRANSITION in landing-section-theme.tsx (TONE_TRANSITION_MS = 600)').toBe('0.6s');
  }
});

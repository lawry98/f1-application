import { focusByKeyboard, focusState, hasRule, tabThroughPage, TAILWIND_DEFAULT_RING } from './support/css';
import { waitForMain } from './support/page-content';
import { expect, test } from './support/test';

/**
 * Class 1: a Tailwind rule that was never generated. `focus-visible:ring-ink` is written only in
 * `lib/focus.ts`; with `lib/` missing from `content` that rule does not exist, the class is still
 * on the element, and the ring falls back to Tailwind's default blue, invisible on the red CTA.
 * Only computed style can see it. (`focus-visible:ring-f1-red` is also written literally in
 * `components/tyres/acts/*`, so it is generated either way; its test below is a guard on the
 * colour, not on `content`.)
 */

/** `tailwind.config.ts` → `ink`. */
const INK = 'rgb(244, 244, 237)';
/** `tailwind.config.ts` → `f1.red`. */
const F1_RED = 'rgb(225, 6, 0)';

test('the red-filled hero CTA takes the ink ring', async ({ page }) => {
  await page.goto('/');
  const cta = page.getByRole('link', { name: 'Generate a Briefing', exact: true }).first();
  await focusByKeyboard(page, cta);
  const state = await focusState(cta);
  expect(state.focusVisible).toBe(true);
  expect(
    await hasRule(page, '.focus-visible\\:ring-ink:focus-visible'),
    'no `focus-visible:ring-ink` rule was generated: is lib/ in tailwind.config.ts `content`?',
  ).toBe(true);
  expect(state.ringColor, 'focusRingOnRedFill: ink on an f1-red fill (lib/focus.ts rule 2)').toBe(INK);
});

test('a flush control on base takes the red ring', async ({ page }) => {
  await page.goto('/');
  const secondary = page.getByRole('link', { name: 'Explore Car Anatomy', exact: true }).first();
  await focusByKeyboard(page, secondary);
  const state = await focusState(secondary);
  expect(state.focusVisible).toBe(true);
  expect(
    await hasRule(page, '.focus-visible\\:ring-f1-red:focus-visible'),
    'no `focus-visible:ring-f1-red` rule was generated: is lib/ in tailwind.config.ts `content`?',
  ).toBe(true);
  expect(state.ringColor, 'focusRingOffsetBase (lib/focus.ts rule 1)').toBe(F1_RED);
});

// `/candy` is omitted: it's a pure demo styleguide with no focusable controls by design
// (app/candy/page.tsx), so `tabThroughPage` reaches zero controls there — it's still covered
// by the invisible-text and axe specs.
// Routes are listed by hand, not discovered — a new route joins the sweep only when it is added here.
for (const route of ['/', '/teams', '/tyres', '/circuits', '/circuits/monza', '/credits', '/showcase', '/teardown']) {
  test(`no focusable control on ${route} paints Tailwind's default blue ring`, async ({ page }) => {
    await page.goto(route);
    await waitForMain(page);
    if (route === '/circuits') await expect(page.getByRole('list', { name: /calendar$/ })).toBeVisible();
    if (route === '/circuits/monza') await expect(page.getByRole('table')).toBeVisible();
    // `/showcase`'s `<main>` is in the page shell, so it is up while the scene's chunk still loads.
    if (route === '/showcase') await expect(page.getByRole('heading', { level: 1, name: /Car Showcase/ })).toBeVisible();
    if (route === '/teardown') await expect(page.getByText('Loading frames')).toBeHidden();
    const states = await tabThroughPage(page);
    expect(states.length, 'Tab reached no controls at all').toBeGreaterThan(0);
    const blue = states.filter((s) => s.boxShadow.includes(TAILWIND_DEFAULT_RING)).map((s) => s.label);
    expect(blue, `controls on ${route} whose ring colour rule was never generated`).toEqual([]);
  });
}

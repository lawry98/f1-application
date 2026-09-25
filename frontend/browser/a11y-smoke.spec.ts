import AxeBuilder from '@axe-core/playwright';

import { expect, test } from './support/test';

const WCAG_A_AA = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];

/**
 * Known axe findings on `main` that are not this harness's to fix, each with its reason.
 * Keyed by route, value is axe rule ids. Empty is the goal; every entry is a debt with an owner.
 */
const KNOWN: Record<string, string[]> = {};

for (const route of ['/', '/teams', '/tyres', '/candy', '/standings']) {
  test(`${route} has no WCAG A/AA axe violations`, async ({ page }) => {
    await page.goto(route);
    if (route === '/standings') await expect(page.getByRole('table').first()).toBeVisible();
    const { violations } = await new AxeBuilder({ page }).withTags(WCAG_A_AA).analyze();
    const unexpected = violations.filter((v) => !(KNOWN[route] ?? []).includes(v.id));
    expect(
      unexpected.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`),
    ).toEqual([]);
  });
}

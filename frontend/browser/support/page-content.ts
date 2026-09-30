import { expect, type Page } from '@playwright/test';

/**
 * Resolves once the route's own `<main>` is on screen, rather than a placeholder standing in for it.
 *
 * `page.goto` resolving says the document has loaded, not that the page is showing. Two
 * placeholders outlive it:
 *
 * - **The root `app/loading.tsx` spinner.** React 19 streams a finished Suspense boundary
 *   *outlined* once its content passes `progressiveChunkSize` (12,800 bytes) or holds a suspensey
 *   image, and reveals outlined content no sooner than 300ms after the first paint. On Next 16
 *   that puts the spinner in the shell of `/`, `/briefing`, `/candy`, `/credits`, `/teams`,
 *   `/tyres` and `/circuits/monza`, with the page itself in a `hidden` div behind it. Measured on
 *   `/`: `load` at 83ms, the reveal at 333ms. On Next 14 every route's content was inline.
 * - **The `next/dynamic` loading component** of the client-only `/showcase` and `/teardown`.
 *
 * A sweep that starts before either has gone is looking at the placeholder: the focus sweep
 * reached no control at all, and a text or contrast sweep would pass on a page it never saw.
 * Neither placeholder has a `<main>`, and `getByRole` skips `hidden` subtrees, so this is the reveal.
 */
export async function waitForMain(page: Page): Promise<void> {
  await expect(page.getByRole('main').first()).toBeVisible();
}

import { expect, type Page } from '@playwright/test';

/**
 * Resolves once the route's own `<main>` is on screen, not a placeholder standing in for it.
 *
 * `page.goto` resolving says the document has loaded, not that the page is showing. Two
 * placeholders outlive it:
 *
 * - **A `loading.tsx` spinner.** React 19 streams a finished Suspense boundary *outlined* once its
 *   content passes `progressiveChunkSize` (12,800 bytes) or holds a suspensey image, and reveals
 *   outlined content no sooner than 300ms after the first paint. `/circuits/[slug]` is big enough,
 *   so its shell carries `app/circuits/loading.tsx` with the page in a `hidden` div behind it.
 *   When the root had a `loading.tsx`, seven routes did this; on `/`, `load` fired at 83ms and the
 *   reveal landed at 333ms.
 * - **The `next/dynamic` loading component** of the client-only `/showcase` and `/teardown`.
 *
 * A sweep that starts before either has gone is looking at the placeholder: the focus sweep
 * reached no control at all, and a text or contrast sweep would pass on a page it never saw.
 * Neither placeholder has a `<main>`, and `getByRole` skips `hidden` subtrees, so this is the
 * reveal.
 */
export async function waitForMain(page: Page): Promise<void> {
  await expect(page.getByRole('main').first()).toBeVisible();
}

/**
 * Whether internal-only routes (`/candy`) are served: only when `ENABLE_INTERNAL_ROUTES` is exactly
 * `1`, so production, which leaves it unset, never serves them. `make dev` and the Playwright
 * server set it.
 *
 * The one place the flag is read. It is read on every call, so a page that gates on it must render
 * per request (`dynamic = 'force-dynamic'`); a static page would read it once, at `pnpm build`.
 */
export function internalRoutesEnabled(): boolean {
  return process.env.ENABLE_INTERNAL_ROUTES === '1';
}

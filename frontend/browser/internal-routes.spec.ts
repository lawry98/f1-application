import { spawn, type ChildProcess } from 'node:child_process';
import { createServer } from 'node:net';
import path from 'node:path';

import { waitForMain } from './support/page-content';
import { expect, test } from './support/test';

/**
 * `/candy` is served only when `ENABLE_INTERNAL_ROUTES=1`, read per request (`lib/internal-routes.ts`).
 *
 * The suite's own server sets the flag (`playwright.config.ts`) so the route sweeps can reach the
 * styleguide; the off side, which is production, gets a second `next start` of the same build
 * without it, on a free port so it can never collide with another run's server.
 */

test('/candy renders with the flag, kept out of search indexes', async ({ page }) => {
  await page.goto('/candy');
  await waitForMain(page);

  // Proves the flag is read when the page is served: CI builds without it, so a page frozen at
  // build time would be the not-found page here.
  await expect(page.getByRole('heading', { level: 1, name: 'Candy component kit' })).toBeVisible();
  // Next renders this tag twice post-hydration, as on the circuits not-found page; assert the first.
  await expect(page.locator('meta[name="robots"]').first()).toHaveAttribute('content', /noindex/);
});

test.describe('without ENABLE_INTERNAL_ROUTES', () => {
  let server: ChildProcess | undefined;
  let origin = '';

  test.beforeAll(async () => {
    const port = await freePort();
    origin = `http://localhost:${port}`;
    const env = { ...process.env };
    delete env.ENABLE_INTERNAL_ROUTES;
    const next = path.resolve(__dirname, '..', 'node_modules', 'next', 'dist', 'bin', 'next');
    // Its own process group, so teardown takes any worker `next start` forks with it.
    server = spawn(process.execPath, [next, 'start', '--port', String(port)], {
      cwd: path.resolve(__dirname, '..'),
      env,
      detached: true,
      stdio: 'ignore',
    });
    await waitUntilServing(origin);
  });

  test.afterAll(() => {
    if (server?.pid) process.kill(-server.pid, 'SIGTERM');
  });

  test('/candy is the not-found page', async ({ page }) => {
    await page.goto(`${origin}/candy`);

    // The rendered not-found content, not the status: CLAUDE.md records that a streamed route
    // answers a soft 404 with 200, so the status alone would prove nothing either way.
    await expect(page.getByRole('heading', { name: 'Page not found' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Candy component kit' })).toHaveCount(0);
    await expect(page.locator('meta[name="robots"]').first()).toHaveAttribute('content', /noindex/);
  });
});

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const probe = createServer();
    probe.once('error', reject);
    probe.listen(0, () => {
      const address = probe.address();
      probe.close(() =>
        typeof address === 'object' && address
          ? resolve(address.port)
          : reject(new Error('no port')),
      );
    });
  });
}

async function waitUntilServing(origin: string, timeoutMs = 20_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      await fetch(origin);
      return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }
  throw new Error(`next start did not answer on ${origin} within ${timeoutMs}ms`);
}

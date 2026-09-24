import { defineConfig, devices } from '@playwright/test';

/**
 * The real-browser gate. jsdom computes no CSS, lays nothing out and never scrolls, so every
 * defect class CLAUDE.md records as "shipped green" is only visible here.
 *
 * It always runs against a **production** bundle: `pnpm build` is a separate, explicit step
 * (CI does it; locally, run it after any source change). A dev server would compile Tailwind
 * on demand and could disagree with what ships.
 *
 * `reuseExistingServer` is off on purpose, everywhere. A reused server on :3100 would be
 * serving whatever was built last — after a mutant run, a *mutated* bundle — and the suite
 * would report on code that is not in the tree.
 */
export default defineConfig({
  testDir: 'browser',
  testMatch: '**/*.spec.ts',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : [['list']],
  use: {
    baseURL: 'http://localhost:3100',
    // Settles BlurFade, the rail cascade and Lenis (`SmoothScroll` stops under `reduce`), so a
    // measurement never lands mid-animation. Specs that need motion opt out per test.
    reducedMotion: 'reduce',
    viewport: { width: 1440, height: 900 },
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } }],
  webServer: {
    command: 'pnpm start --port 3100',
    url: 'http://localhost:3100',
    reuseExistingServer: false,
    timeout: 60_000,
  },
});

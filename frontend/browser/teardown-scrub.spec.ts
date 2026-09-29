import type { Page } from '@playwright/test';

import { expect, test } from './support/test';

/**
 * Class 5: the frame sequence breaking where only a browser can see it. jsdom never loads an
 * image, so a scene whose frames all 404 (each slot skipped in `onerror`, the canvas left blank)
 * or whose canvas is stuck on a coarse stand-in renders exactly like a working one under
 * `pnpm test`. Here the frames are real, and the assertion is on the canvas's own pixels: each
 * sampled scroll position must show the frame it maps to, compared against that frame decoded
 * fresh at the same size.
 *
 * `FRAME_COUNT` and the first pass are **copied** from lib/teardown-frames.ts, not imported, for
 * the reason scroll-spy.spec.ts copies its band: a mutant that breaks an export would otherwise be
 * "killed" by a compile error.
 */
const FRAME_COUNT = 192;
const FIRST_PASS = [0, 16, 32, 48, 64, 80, 96, 112, 128, 144, 160, 176, 191];
/** Mid-sequence frames, each at least 4 from a first-pass frame so a stand-in cannot pass for it. */
const SAMPLES = [4, 60, 100, 140, 172];
/**
 * Mean absolute difference per channel, 0–255, below which the canvas is showing that frame.
 * Measured in Chromium: the right frame reads 0.000 (same decoder, same size, no resampling), the
 * frame next to it 0.46–1.64, and the first-pass stand-ins for the samples 0.55–3.72.
 */
const SAME_FRAME = 0.1;

const frameUrl = (i: number) => `/frames/frame_${String(i).padStart(4, '0')}.webp`;
const frameIndex = (url: string) => Number(/frame_(\d{4})\.webp/.exec(url)?.[1] ?? NaN);

/** Scrolls to `fraction` of the scrub: 0 is the first frame, 1 is the car docked. */
async function scrollToFraction(page: Page, fraction: number) {
  await page.evaluate(async (fraction) => {
    const container = document.querySelector<HTMLElement>('div[style*="500vh"]');
    if (!container) throw new Error('no scroll container');
    const top = container.getBoundingClientRect().top + window.scrollY;
    const range = container.offsetHeight - window.innerHeight;
    window.scrollTo({ top: top + range * fraction, behavior: 'instant' });
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  }, fraction);
}

/** The middle of frame `i`'s slice of the scrub, so rounding cannot land on a neighbour. */
const scrollToFrame = (page: Page, i: number) => scrollToFraction(page, (i + 0.5) / FRAME_COUNT);

/** How far the canvas is from frame `i`, drawn fresh onto an 800x420 canvas of its own. */
function distanceFromFrame(page: Page, i: number): Promise<number> {
  return page.evaluate(async (url) => {
    const shown = document.querySelector('canvas')?.getContext('2d')?.getImageData(0, 0, 800, 420);
    if (!shown) throw new Error('no 2d canvas');
    const img = new Image();
    img.src = url;
    await img.decode();
    const ref = document.createElement('canvas');
    ref.width = 800;
    ref.height = 420;
    const ctx = ref.getContext('2d');
    if (!ctx) throw new Error('no 2d context');
    ctx.drawImage(img, 0, 0, 800, 420);
    const want = ctx.getImageData(0, 0, 800, 420).data;
    let sum = 0;
    for (let k = 0; k < want.length; k++) sum += Math.abs((shown.data[k] ?? 0) - (want[k] ?? 0));
    return sum / want.length;
  }, frameUrl(i));
}

async function expectCanvasShows(page: Page, i: number, why: string) {
  await expect
    .poll(() => distanceFromFrame(page, i), { message: `canvas should show frame ${i}: ${why}` })
    .toBeLessThan(SAME_FRAME);
}

for (const viewport of [
  { width: 1440, height: 900 },
  { width: 390, height: 844 },
]) {
  test.describe(`at ${viewport.width}px`, () => {
    test.use({ viewport });

    test(`at ${viewport.width}px every frame arrives as WebP and the canvas paints the one the scroll asks for`, async ({
      page,
    }) => {
      const responses = new Map<number, { status: number; type: string }>();
      page.on('response', (r) => {
        if (r.url().includes('/frames/')) {
          responses.set(frameIndex(r.url()), {
            status: r.status(),
            type: r.headers()['content-type'] ?? '',
          });
        }
      });
      await page.goto('/teardown');
      await expect(page.getByText('Loading frames')).toBeHidden();
      await expect.poll(() => responses.size, { timeout: 20_000 }).toBe(FRAME_COUNT);

      const bad = Array.from(responses).filter(([, r]) => r.status !== 200 || r.type !== 'image/webp');
      expect(bad, 'frame responses that were not a 200 image/webp').toEqual([]);

      for (const i of SAMPLES) {
        await scrollToFrame(page, i);
        await expectCanvasShows(page, i, 'every frame has loaded');
      }
    });
  });
}

test('the overlay lifts on the first pass, and the canvas upgrades in place as closer frames land', async ({
  page,
}) => {
  // Every frame outside the first pass is held until released, which is a slow connection with
  // the timing taken out of it.
  let release = () => {};
  const released = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route('**/frames/*.webp', async (route) => {
    if (!FIRST_PASS.includes(frameIndex(route.request().url()))) await released;
    await route.continue();
  });

  // Not the default `load`: an image the scene has started but not finished delays the document's
  // load event, and the held frames never finish until they are released.
  await page.goto('/teardown', { waitUntil: 'domcontentloaded' });
  await expect(page.getByText('Loading frames')).toBeHidden();

  // Frame 100 is not in the first pass; 96 is the closest frame that is.
  await scrollToFrame(page, 100);
  await expectCanvasShows(page, 96, 'the nearest first-pass frame stands in while 100 is held');

  // No scroll from here on: the upgrade has to come from the frame arriving, not from the wheel.
  release();
  await expectCanvasShows(page, 100, 'frame 100 has now landed');
});

test('the docked still is the preloaded last frame, not a second download', async ({ page }) => {
  const lastFrameRequests: string[] = [];
  page.on('request', (r) => {
    if (r.url().includes('frame_0191')) lastFrameRequests.push(r.url());
  });
  await page.goto('/teardown');
  await expect(page.getByText('Loading frames')).toBeHidden();

  await scrollToFraction(page, 1);
  const still = page.locator('header img');
  await expect(still).toBeVisible();
  // `unoptimized` keeps next/image from rewriting the src to /_next/image?url=…, which would be a
  // different cache key and a second download of a frame the preloader already holds.
  await expect(still).toHaveAttribute('src', frameUrl(FRAME_COUNT - 1));
  await expect.poll(() => still.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBe(800);
  expect(lastFrameRequests.map((u) => new URL(u).pathname)).toEqual([frameUrl(FRAME_COUNT - 1)]);
});

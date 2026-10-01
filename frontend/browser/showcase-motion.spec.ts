import type { Page } from '@playwright/test';

import { expect, test } from './support/test';
import {
  type HarnessWindow,
  type Object3D,
  waitForRealCar,
  watchThreeScenes,
} from './support/three';

/**
 * The `/showcase` scene's frame loop, which jsdom cannot see: it has no WebGL, and the car is
 * turned by `useFrame`, which only a running loop calls.
 *
 * The car's autonomous rotation is the sustained motion `prefers-reduced-motion` asks to be
 * spared, and a loop that never stops draws every frame on the CPU here: each key press and
 * `evaluate` on the route waited about a second for one under SwiftShader. Under `reduce` the
 * loop is `demand`, so a team pick has to ask for its own frame — the livery repaint writes
 * canvas pixels that R3F's prop diffing never sees (CLAUDE.md: "The 3D scenes' `frameloop` is
 * state").
 *
 * Every frame here is one the app drew. The checks wrap the renderer to count its frames and read
 * each one's drawing buffer in the same task, as `shadow-acne.spec.ts` does, and never call
 * `render` themselves: a frame the test drew would show the new livery whether the app asked for
 * one or not.
 */

// SwiftShader, so a CI runner with no GPU reads the same pixels a laptop with one does.
test.use({ launchOptions: { args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader'] } });
// Every test waits for SwiftShader to draw the GLB: 5–11s each in the full suite here, and up to
// 24s run beside only the other WebGL specs.
test.beforeEach(() => test.slow());

/** Animation frames to wait across: R3F's loop draws at most one frame in each. */
const FRAMES = 10;

/** Which hue the car is wearing in the last frame the app drew. */
type Drawn = 'no frame drawn' | 'red' | 'blue' | 'neither';

type FrameRecord = { count: number; red: number; blue: number };
type RecordingWindow = HarnessWindow & { __harnessFrames?: FrameRecord };

async function openShowcase(page: Page) {
  await watchThreeScenes(page);
  await page.goto('/showcase');
  await waitForRealCar(page);
}

/** Resolves after `n` animation frames. */
function afterAnimationFrames(page: Page, n = FRAMES): Promise<void> {
  return page.evaluate(
    (n) =>
      new Promise<void>((resolve) => {
        let left = n;
        const tick = () => (--left <= 0 ? resolve() : requestAnimationFrame(tick));
        requestAnimationFrame(tick);
      }),
    n,
  );
}

/** The `rotation.y` of the group `RealCar` spins: the car's top-level ancestor below the scene. */
function carRotation(page: Page): Promise<number> {
  return page.evaluate(() => {
    for (const scene of (window as HarnessWindow).__harnessScenes ?? []) {
      let livery: Object3D | undefined;
      scene.traverse((o) => {
        if (o.isMesh && o.material?.name === 'Livery') livery = o;
      });
      if (!scene.__r3f || !livery) continue;
      // Not the GLB root one level down, which carries the grounding offset (CLAUDE.md).
      let spin = livery;
      while (spin.parent && spin.parent !== scene) spin = spin.parent;
      return spin.rotation.y;
    }
    throw new Error('no car scene');
  });
}

/**
 * From now on, counts every frame the app draws and classifies the car's hue in it.
 *
 * A pixel counts as red or blue when that channel leads the other by a wide margin: the Ferrari
 * livery is `#dc0000` and the Williams one `#005aff`, while the floor, grid and fog are near-grey.
 */
function recordFrames(page: Page): Promise<void> {
  return page.evaluate(() => {
    const w = window as RecordingWindow;
    w.__harnessFrames = { count: 0, red: 0, blue: 0 };
    for (const scene of w.__harnessScenes ?? []) {
      const gl = scene.__r3f?.root.getState().gl;
      if (!gl) continue;
      const render = gl.render.bind(gl);
      gl.render = (s, camera) => {
        render(s, camera);
        // Same task as the render: without `preserveDrawingBuffer` the buffer is only readable
        // until the frame is composited.
        const ctx = gl.getContext();
        const { drawingBufferWidth: width, drawingBufferHeight: height } = ctx;
        const rgba = new Uint8Array(width * height * 4);
        ctx.readPixels(0, 0, width, height, ctx.RGBA, ctx.UNSIGNED_BYTE, rgba);
        let red = 0;
        let blue = 0;
        for (let i = 0; i < rgba.length; i += 4) {
          const r = rgba[i] ?? 0;
          const b = rgba[i + 2] ?? 0;
          if (r - b > 48) red++;
          else if (b - r > 48) blue++;
        }
        const record = w.__harnessFrames ?? { count: 0, red: 0, blue: 0 };
        w.__harnessFrames = { count: record.count + 1, red, blue };
      };
    }
  });
}

function frames(page: Page): Promise<FrameRecord> {
  return page.evaluate(
    () => (window as RecordingWindow).__harnessFrames ?? { count: 0, red: 0, blue: 0 },
  );
}

function resetFrames(page: Page): Promise<void> {
  return page.evaluate(() => {
    const w = window as RecordingWindow;
    if (w.__harnessFrames) w.__harnessFrames.count = 0;
  });
}

/** Frames the app draws across the next `FRAMES` animation frames. */
async function framesDrawnAcross(page: Page): Promise<number> {
  await resetFrames(page);
  await afterAnimationFrames(page);
  return (await frames(page)).count;
}

async function drawn(page: Page): Promise<Drawn> {
  const { count, red, blue } = await frames(page);
  if (count === 0) return 'no frame drawn';
  if (red > 4 * blue) return 'red';
  if (blue > 4 * red) return 'blue';
  return 'neither';
}

/** Asks R3F for a frame the way the app's own code would, then waits for it to be drawn. */
async function invalidate(page: Page): Promise<void> {
  await page.evaluate(() => {
    for (const scene of (window as HarnessWindow).__harnessScenes ?? []) {
      scene.__r3f?.root.getState().invalidate();
    }
  });
  await afterAnimationFrames(page);
}

async function expectIdle(page: Page, message: string) {
  // Polled: the GLB's arrival asks for a frame or two of its own, just after it is in the scene.
  await expect.poll(() => framesDrawnAcross(page), { message, timeout: 15_000 }).toBe(0);
}

test.describe('under reduced motion', () => {
  // The suite's default, restated because it is the subject.
  test.use({ reducedMotion: 'reduce' });

  test('the /showcase car holds still', async ({ page }) => {
    await openShowcase(page);
    await recordFrames(page);
    const before = await carRotation(page);
    // Under `demand` nothing draws on its own, so ask for a frame: a car that turns by however
    // long the scene sat idle, whenever something does draw, is the same motion in jumps.
    await invalidate(page);
    expect(
      (await frames(page)).count,
      'a frame should have been drawn between the reads',
    ).toBeGreaterThan(0);
    expect(await carRotation(page), 'the car turned across the frames drawn').toBe(before);
  });

  test('the idle /showcase scene draws no frames', async ({ page }) => {
    await openShowcase(page);
    await recordFrames(page);
    await expectIdle(page, 'the scene should stop drawing once the car is in');
  });

  test('a team pick still repaints the /showcase livery', async ({ page }) => {
    await openShowcase(page);
    await recordFrames(page);
    // The control: the classifier reads the Ferrari car it opens on as red.
    await invalidate(page);
    expect(await drawn(page), 'the opening Ferrari livery').toBe('red');
    // Idle first, or the repaint below could be any frame of a loop that never stops.
    await expectIdle(page, 'the scene should be idle before the pick');
    await resetFrames(page);

    await page.getByRole('combobox', { name: 'Select Team Livery' }).selectOption('williams');

    await expect
      .poll(() => drawn(page), { message: 'the Williams livery should be drawn' })
      .toBe('blue');
  });
});

test.describe('without a reduced-motion preference', () => {
  test.use({ reducedMotion: 'no-preference' });

  test('the /showcase car still turns', async ({ page }) => {
    // The guard on the obvious over-fix: `demand` everywhere freezes the car (CLAUDE.md).
    await openShowcase(page);
    const before = await carRotation(page);
    await afterAnimationFrames(page);
    expect(await carRotation(page)).not.toBe(before);
  });

  test('a hidden /showcase draws no frames', async ({ page }) => {
    await openShowcase(page);
    await recordFrames(page);
    // A backgrounded tab, as `useDocumentVisible` hears about one.
    await page.evaluate(() => {
      Object.defineProperty(document, 'visibilityState', {
        configurable: true,
        get: () => 'hidden',
      });
      Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await expectIdle(page, 'a hidden scene should stop drawing');
  });
});

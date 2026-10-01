import type { Page } from '@playwright/test';

import { waitForMotionToSettle } from './support/motion';
import { expect, test } from './support/test';
import { type HarnessWindow, type Object3D, waitForRealCar, watchThreeScenes } from './support/three';

/**
 * Class 6: shadow acne on the 3D car. Every material in the GLB is `DoubleSide`, so three.js
 * draws the car's front faces into its own shadow map, and at zero bias each lit texel is
 * compared against its own depth: the bodywork renders hatched. jsdom has no WebGL, and the
 * car spins, so neither a unit test nor a screenshot at an arbitrary moment can see it.
 *
 * The check stops the frame loop, turns the car to a fixed pose, and renders it twice: as shipped,
 * and with the car's `receiveShadow` off. Acne is high-frequency noise, so the shipped render may
 * be no noisier than the reference by more than real self-shadow edges account for.
 *
 * It reads the WebGL drawing buffer, not a screenshot. The Inspect dialog scales in from 0.95, and
 * an element screenshot also takes in CSS transforms, the scene's gradient overlays and the
 * compositor's resampling: measured under parallel load, the same pose read 2.28 or 2.67 depending
 * on when the capture landed.
 */

// SwiftShader, so a CI runner with no GPU renders WebGL the same way a laptop with one does.
test.use({ launchOptions: { args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader'] } });
// It draws on the CPU: 5.6s and 8.6s per test alone, 7.7s and 10.6s inside the full suite here.
test.beforeEach(() => test.slow());

/** Car rotations about its spin axis, in radians: a three-quarter view from each side. */
const POSES = [0.6, 2.4];

/**
 * Most the shipped render's high-frequency energy may exceed the no-self-shadow reference's.
 * Measured in this SwiftShader Chromium over both scenes and poses: 1.01–1.08 as shipped,
 * 1.98–4.61 with the bias at zero (mutant 07).
 */
const MAX_NOISE_RATIO = 1.5;

/**
 * Draws one frame of the car at `angle`, receiving its own shadows or not, and returns its mean
 * absolute Laplacian of luminance: near zero on smooth shading, high on a hatch pattern.
 */
function carNoise(page: Page, angle: number, receiveShadow: boolean): Promise<number> {
  return page.evaluate(
    ({ angle, receiveShadow }) => {
      const scenes = (window as HarnessWindow).__harnessScenes ?? [];
      let livery: Object3D | undefined;
      const scene = scenes.find((s) => {
        s.traverse((o) => {
          if (o.isMesh && o.material?.name === 'Livery') livery = o;
        });
        return livery !== undefined;
      });
      if (!scene?.__r3f || !livery) throw new Error('no car scene');

      // The group RealCar spins is the car's top-level ancestor, not the GLB root one level down.
      let spin = livery;
      while (spin.parent && spin.parent !== scene) spin = spin.parent;
      spin.traverse((o) => {
        if (o.isMesh) o.receiveShadow = receiveShadow;
      });
      spin.rotation.y = angle;
      spin.position.y = 0;
      spin.updateMatrixWorld(true);

      const state = scene.__r3f.root.getState();
      state.setFrameloop('never');
      state.gl.render(scene, state.camera);

      // Same task as the render: without `preserveDrawingBuffer` the buffer is only readable
      // until the frame is composited.
      const gl = state.gl.getContext();
      const { drawingBufferWidth: width, drawingBufferHeight: height } = gl;
      const rgba = new Uint8Array(width * height * 4);
      gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, rgba);

      const luminance = new Float32Array(width * height);
      for (let i = 0; i < luminance.length; i++) {
        luminance[i] =
          0.2126 * (rgba[i * 4] ?? 0) +
          0.7152 * (rgba[i * 4 + 1] ?? 0) +
          0.0722 * (rgba[i * 4 + 2] ?? 0);
      }
      const at = (i: number) => luminance[i] ?? 0;
      let sum = 0;
      for (let y = 1; y < height - 1; y++) {
        for (let x = 1; x < width - 1; x++) {
          const i = y * width + x;
          sum += Math.abs(4 * at(i) - at(i - 1) - at(i + 1) - at(i - width) - at(i + width));
        }
      }
      return sum / ((width - 2) * (height - 2));
    },
    { angle, receiveShadow },
  );
}

async function expectNoAcne(page: Page) {
  for (const angle of POSES) {
    const shipped = await carNoise(page, angle, true);
    const reference = await carNoise(page, angle, false);
    // Soft, so a failure reports every pose rather than stopping at the first.
    expect
      .soft(
        shipped / reference,
        `at ${angle} rad the car is ${shipped.toFixed(2)} noisy with its own shadows, ${reference.toFixed(2)} without`,
      )
      .toBeLessThan(MAX_NOISE_RATIO);
  }
}

test('the /showcase car takes its own shadows without hatching', async ({ page }) => {
  await watchThreeScenes(page);
  await page.goto('/showcase');
  await waitForRealCar(page);
  await waitForMotionToSettle(page);
  await expectNoAcne(page);
});

test('the /teams Inspect car takes its own shadows without hatching', async ({ page }) => {
  await watchThreeScenes(page);
  await page.goto('/teams');
  await page.getByRole('button', { name: 'Inspect in 3D' }).first().click();
  await waitForRealCar(page);
  await waitForMotionToSettle(page);
  await expectNoAcne(page);
});

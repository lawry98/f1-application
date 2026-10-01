import { expect, type Page } from '@playwright/test';

export type Object3D = {
  isMesh?: boolean;
  material?: { name?: string };
  parent: Object3D | null;
  receiveShadow: boolean;
  rotation: { y: number };
  position: { y: number };
  traverse: (visit: (o: Object3D) => void) => void;
  updateMatrixWorld: (force: boolean) => void;
};
type Store = {
  getState: () => {
    gl: {
      render: (scene: Object3D, camera: unknown) => void;
      getContext: () => WebGLRenderingContext | WebGL2RenderingContext;
    };
    camera: unknown;
    invalidate: () => void;
    setFrameloop: (mode: 'never') => void;
  };
};
type Scene = Object3D & { isScene: true; __r3f?: { root: Store } };
export type HarnessWindow = Window & { __THREE_DEVTOOLS__?: EventTarget; __harnessScenes?: Scene[] };

/**
 * Collects every three.js `Scene` the page constructs. A production build keeps nothing of R3F's
 * on `window`, but three announces each scene to `__THREE_DEVTOOLS__` when that global exists, and
 * R3F hangs its store off the scene as `__r3f.root`. Call it before `goto`.
 */
export async function watchThreeScenes(page: Page) {
  await page.addInitScript(() => {
    const w = window as HarnessWindow;
    const scenes: Scene[] = [];
    const devtools = new EventTarget();
    devtools.addEventListener('observe', (e) => {
      const detail = (e as CustomEvent<Scene>).detail;
      if (detail?.isScene) scenes.push(detail);
    });
    w.__THREE_DEVTOOLS__ = devtools;
    w.__harnessScenes = scenes;
  });
}

/** Resolves once the GLB car, not the primitive stand-in, is in a scene R3F is driving. */
export async function waitForRealCar(page: Page) {
  await expect
    .poll(
      () =>
        page.evaluate(() =>
          ((window as HarnessWindow).__harnessScenes ?? []).some((scene) => {
            let livery = false;
            scene.traverse((o) => {
              if (o.isMesh && o.material?.name === 'Livery') livery = true;
            });
            return livery && Boolean(scene.__r3f);
          }),
        ),
      { message: 'the GLB car should load', timeout: 30_000 },
    )
    .toBe(true);
}

/**
 * Stops every watched scene's frame loop, for a check that has nothing to do with the canvas.
 *
 * The scenes render on the CPU, and every key press and `evaluate` waits for a frame: on
 * `/showcase` one Tab took about a second, and the 12-control focus sweep 20.2s locally and past
 * 90s on CI. With the loop stopped the same sweep took 0.09s. The last frame stays painted.
 */
export async function stopFrameLoops(page: Page) {
  await page.evaluate(() => {
    for (const scene of (window as HarnessWindow).__harnessScenes ?? []) {
      scene.__r3f?.root.getState().setFrameloop('never');
    }
  });
}

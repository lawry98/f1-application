# F1 3D Components

Interactive 3D F1 car visualizations using React Three Fiber (R3F) and Three.js.

Three.js cannot be server-rendered, so every consumer loads these components via a
**direct-path dynamic import with `ssr: false`** — never through a barrel — from a Client
Component (Next 15+ refuses `ssr: false` in a Server Component; see
`components/showcase/showcase-page-client.tsx`):

```tsx
import dynamic from 'next/dynamic';

const F1HeroScene = dynamic(() => import('@/components/3d/f1-hero-scene'), {
  ssr: false,
});
```

## Components

### F1HeroScene (`f1-hero-scene.tsx`, default export)

Auto-rotating, floating 3D F1 car with dramatic lighting, reflective ground plane, and
optional text overlay.

**Props:**

- `teamColor?: string` — body/livery color (default `#dc2626`)
- `hideOverlay?: boolean` — hide the "F1 Briefing Agent" text overlay
- `className?: string` — container sizing (defaults to `h-[600px]`)

**Consumer:** `components/teams/inspect-modal.tsx`, and only that. The teams page's right rail
deliberately has **no** canvas: removing it moved the entire `three` / `@react-three/fiber` bundle
off page load and behind the Inspect click. Do not add one back.

**Frame loop.** `frameloop` is state, not a constant, and both scenes take it from
`hooks/use-scene-motion.ts` together with the car's motion: `never` while the document is hidden,
`demand` with the car still under `prefers-reduced-motion`, and `always` otherwise. A literal
`frameloop="demand"` in the normal case would freeze the car, because `RealCar`'s rotation and
float run through `useFrame`. Under `demand`, `RealCar` asks for the frame its livery repaint
needs: the repaint mutates a canvas and flips `texture.needsUpdate` outside R3F's prop diffing.
Measured under `demand`: idle draws 0 frames, a bare `texture.needsUpdate = true` draws 0, and the
same mutation plus `invalidate()` draws exactly 1.

### F1CarShowcase (`f1-car-showcase.tsx`, default export)

Full-page livery showcase: one auto-rotating car (still under reduced motion, on the same frame
loop as `F1HeroScene`) plus a picker for every team on the grid. Teams, names, and colors are derived from `data/teams-data.ts` (`TEAMS`) — there
is no local color map to keep in sync.

The picker is [`components/showcase/livery-select.tsx`](../showcase/livery-select.tsx),
a **native `<select>`** and deliberately not a custom listbox — eleven single-select
options is the case the platform control exists for, and it keeps
`@radix-ui/react-select` out of a repo that carries one Radix package. It lives outside
`components/3d/` because it contains no three.js, which is what makes it unit-testable
(`tests/livery-select.test.tsx`) — the eleven-button swatch grid it replaced sat next to
the `<Canvas>` here, and the only test reaching the route mocks this whole module away.

**Consumer:** `app/showcase/page.tsx`.

### FitCamera (`fit-camera.tsx`, named export)

Sits inside a `<Canvas>` and places the camera so the whole car is in frame, then moves
the fog to match. Both scenes shipped with a hand-written `camera={{ position: [5, 2.5, 5] }}`
— 7.5 units from a car **11.23 units long**, which `/showcase` additionally scaled to 22.5.

Four things it handles that a literal cannot, all measured and guarded in
`tests/scene-fit.test.ts`:

- The car **rotates**, so what has to fit is the cylinder it sweeps — radius 5.98, set by
  the box's XZ diagonal, not its 5.62 half-length.
- The **binding field of view depends on the canvas**. `/showcase`'s is `h-[70vh]` at full
  width: landscape on a desktop (vertical fov binds, 50°) and **portrait on a phone**
  (horizontal binds, 31.6°), which needs the camera nearly twice as far back (24.6 against 13.2). Aspect is only
  knowable inside the `<Canvas>`, which is why this is a component.
- **Fog moves with the camera.** It owns `scene.fog` rather than leaving a `<fog attach="fog">`
  in the JSX, because a declarative one would recreate itself from stale literals and win.
  `/showcase`'s shipped `[8, 20]` puts a correctly framed car entirely past the far plane.
- It runs in a **layout** effect and calls `invalidate()` — the first so no wrong frame paints,
  the second for either scene's reduced-motion `demand` path.

The arithmetic is pure and lives in [`lib/scene-fit.ts`](../../lib/scene-fit.ts), including
`CAR_BOUNDS`, which is checked against the shipped GLB so a re-exported model fails CI rather
than quietly mis-framing both routes.

### Shared internals (`f1-car-model.tsx`, named exports)

Not a page-level scene — the building blocks both scenes compose:

- `RealCar` — loads `/models/f1-car.glb` via `useLoader(GLTFLoader)` with three-stdlib's
  `MeshoptDecoder` registered (the GLB's geometry is meshopt-compressed; see below), clones the scene
  **once per mount** (the clone stays inside `useMemo`; the GLTF is cached by
  `useLoader`, so livery materials are cloned before recolouring and disposed on unmount).
  Team color changes repaint the cloned texture in place — no re-clone per color — and ask for a
  frame, which the `demand` loop would otherwise never draw.
  Props: `teamColor`, `rotationSpeed`, `float?`.

  **No `scale` or `position`, on purpose.** `FitCamera` does the framing, so a scale
  multiplier only desynchronised the car from the ground plane, the grid and the lights,
  which are all in world units — `/showcase` passed `scale={2}`, putting a 22.5-unit car on
  a 20-unit grid. The model instead carries a constant `groundedOffset`, which puts it on
  the axis its group spins about (its own centre is 0.223 off the origin in x, so it used to
  orbit rather than turn on the spot) and rests its lowest vertex on the ground plane.
  `CAR_BOUNDS` is measured from the decoded vertices, not from the accessors' boxes: the `Car`
  node rakes the body 0.648°, so a box carried through it has corners no vertex reaches, and
  grounding that box floated the tyres 0.091 above the floor on both routes.

  **The recolour rewrites the texture; it does not set `material.color`.** `color` _multiplies_
  into `.map`, and this GLB's base texel is `#003572` — red channel zero — so no multiply can put
  red back: Ferrari lands on `#000000`, five more teams within a few counts of it, and the rest
  render the same blue, darker. The per-texel rule, the measurements behind it and the material
  selection all live in [`lib/livery.ts`](../../lib/livery.ts), pure and unit-tested against the
  shipped GLB in `tests/livery.test.ts`. Both bodywork meshes share the one `Livery` material, so
  a single 2048² canvas is repainted (~16ms, measured, no long task).

- `PrimitiveCar` — the primitive-mesh fallback car, parameterized by `bodyColor`,
  `sidepodColor`, `scale?`, `rotationSpeed`, `float?`, `bodyEnvMapIntensity?`,
  `exhaustEmissiveIntensity`.

Each scene renders `<Suspense fallback={<PrimitiveCar …/>}><RealCar …/></Suspense>`, so
the primitive car shows while the GLB loads. `PrimitiveCar` is ~4.6 units long against the
GLB's 11.23, so both scenes scale it by **2.4** to match — otherwise the stand-in is a
fraction of the size of the car that replaces it, and the swap jumps.

## 3D Model

The model is **committed** at `public/models/f1-car.glb` — no download step. It is not the file
Sketchfab serves: [`scripts/compress-car-model.mjs`](../../scripts/compress-car-model.mjs) builds
it from that export (kept in git history, pinned by SHA-256) with gltfpack, quantizing and
meshopt-compressing the geometry and passing the textures through untouched — 7.57 MB to 1.35 MB,
every triangle kept. Change the model by changing that script and re-running it, never by
dropping in a re-export: `tests/car-model-asset.test.ts`, `tests/scene-fit.test.ts` and
`tests/livery.test.ts` all read this exact file.

**Credits:** "F1 2026 Release Car" (https://skfb.ly/oWL8J) by Nimaxo is licensed under
Creative Commons Attribution (http://creativecommons.org/licenses/by/4.0/).

## Dependencies

Everything needed is already declared in `package.json`: `three`, `three-stdlib`
(GLTFLoader and `MeshoptDecoder`, whose wasm is inlined — no decoder file to host),
`@react-three/fiber`, and `@types/three`. `gltfpack` is a devDependency, exact-pinned because the
committed GLB's bytes depend on its version.

## Team Colors

Team colors come from `data/teams-data.ts` (`TEAMS`, 11 constructors for 2026).
`F1CarShowcase` maps over `TEAMS` directly; the teams pages pass `team.color` into
`F1HeroScene`. Update `teams-data.ts` — never a local copy — when the grid changes.

## Troubleshooting

**Black screen:**

- Check lights are added to scene
- Verify camera position — note `FitCamera` overwrites whatever `<Canvas camera>` sets, and
  bails out entirely while the canvas measures 0x0 (which is permanent in a hidden browser
  pane, where `ResizeObserver` never delivers: dispatch a `resize` event to unstick it)

**Model not loading:**

- Ensure file at `public/models/f1-car.glb`
- Check browser console for errors

**Performance issues:**

- Use lower poly model
- Reduce canvas size on mobile

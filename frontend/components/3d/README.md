# F1 3D Components

Interactive 3D F1 car visualizations using React Three Fiber (R3F) and Three.js.

Three.js cannot be server-rendered, so every consumer loads these components via a
**direct-path dynamic import with `ssr: false`** — never through a barrel:

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

- `teamColor?: string` — body/livery color (default `#dc2626`). Changing it cross-fades the
  livery and the warm rim light; it never remounts the scene.
- `hideOverlay?: boolean` — hide the "F1 Briefing Agent" text overlay
- `className?: string` — container sizing (defaults to `h-[600px]`)
- `paused?: boolean` — stop rendering **without unmounting**. Sets `frameloop="never"`, so the
  WebGL context, the loaded GLB, and the cloned scene survive and resuming costs nothing.
- `reducedMotion?: boolean` — drop rotation, float, and camera easing, and switch to
  `frameloop="demand"`
- `maxDpr?: number` — upper `dpr` bound (default `2`). Also selects the shadow map size: 2048
  above 2x, 1024 below.
- `cameraVariant?: number` — changing it eases the camera to a different vantage point

**The frameloop is three-state**, and that is the whole performance story:
`paused ? 'never' : reducedMotion ? 'demand' : 'always'`. Under `demand`, nothing loops, but the
livery cross-fade and camera rig call `invalidate()` for the frames they need, so transitions
still play for users who asked for less motion. The scene also idles itself while the tab is
hidden.

**Do not pass a live `color` prop to a light you also ease through a ref** — the prop write lands
after the ease and snaps it. `TeamRimLight` sets its color through the ref only.

**Consumers:** `components/teams/sticky-car-viewer.tsx` and
`components/teams/inspect-modal.tsx` (both pass `hideOverlay` and a live `teamColor`). The sticky
viewer is `paused` whenever the modal is open, so two canvases are never animating at once, and
it is only mounted at `xl` and up — `hidden xl:block` alone would still allocate a context.

### F1CarShowcase (`f1-car-showcase.tsx`, default export)

Full-page livery showcase: one auto-rotating car plus a picker for every team on the
grid. Teams, names, and colors are derived from `data/teams-data.ts` (`TEAMS`) — there
is no local color map to keep in sync.

**Consumer:** `app/showcase/page.tsx`.

### Shared internals (`f1-car-model.tsx`, named exports)

Not a page-level scene — the building blocks both scenes compose:

- `RealCar` — loads `/models/f1-car.glb` via `useLoader(GLTFLoader)`, clones the scene
  **once per mount** (the clone stays inside `useMemo`; the GLTF is cached by
  `useLoader`, so body materials are cloned before recoloring and disposed on unmount).
  Team color changes update the cloned materials in place — no re-clone per color. The first
  color is applied instantly (nobody should see the GLB's own paint); later ones cross-fade,
  unless `animateColor` is false.
  Props: `teamColor`, `scale`, `position`, `rotationSpeed`, `float?`, `animateColor?`.
- `PrimitiveCar` — the primitive-mesh fallback car, parameterized by `bodyColor`,
  `sidepodColor`, `scale?`, `rotationSpeed`, `float?`, `bodyEnvMapIntensity?`,
  `exhaustEmissiveIntensity`.

Each scene renders `<Suspense fallback={<PrimitiveCar …/>}><RealCar …/></Suspense>`, so
the primitive car shows while the GLB loads.

## 3D Model

The model is **committed** at `public/models/f1-car.glb` — no download step.

**Credits:** "F1 2026 Release Car" (https://skfb.ly/oWL8J) by Nimaxo is licensed under
Creative Commons Attribution (http://creativecommons.org/licenses/by/4.0/).

## Dependencies

Everything needed is already declared in `package.json`: `three`, `three-stdlib`
(GLTFLoader), `@react-three/fiber`, and `@types/three`.

## Team Colors

Team colors come from `data/teams-data.ts` (`TEAMS`, 11 constructors for 2026).
`F1CarShowcase` maps over `TEAMS` directly; the teams pages pass `team.color` into
`F1HeroScene`. Update `teams-data.ts` — never a local copy — when the grid changes.

## Troubleshooting

**Black screen:**

- Check lights are added to scene
- Verify camera position

**Model not loading:**

- Ensure file at `public/models/f1-car.glb`
- Check browser console for errors

**Performance issues:**

- Use lower poly model
- Reduce canvas size on mobile

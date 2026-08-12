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

- `teamColor?: string` — body/livery color (default `#dc2626`)
- `hideOverlay?: boolean` — hide the "F1 Briefing Agent" text overlay
- `className?: string` — container sizing (defaults to `h-[600px]`)

**Consumer:** `components/teams/inspect-modal.tsx`, and only that. The teams page's right rail
deliberately has **no** canvas: removing it moved the entire `three` / `@react-three/fiber` bundle
off page load and behind the Inspect click. Do not add one back.

**Frame loop.** `frameloop` is state, not a constant: `never` while the document is hidden,
`demand` under `prefers-reduced-motion` — where the car is deliberately still, and the in-canvas
`Invalidator` is what makes the one frame it does draw correct — and `always` otherwise. A literal
`frameloop="demand"` in the normal case would freeze the car, because `RealCar`'s rotation and
float run through `useFrame`. `Invalidator` covers `RealCar`'s imperative
`material.color.set(teamColor)`, but that call is dormant today: the material filter matches
`body`/`Body`/`paint`, and the GLB's actual materials are `Livery`/`RearLight`/`Wheels`/`WheelCovers`,
so nothing matches and the car never recolours yet — `Invalidator` invalidates for a change that
never happens until the filter is fixed.

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
  Team color changes update the cloned materials in place — no re-clone per color.
  Props: `teamColor`, `scale`, `position`, `rotationSpeed`, `float?`.
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

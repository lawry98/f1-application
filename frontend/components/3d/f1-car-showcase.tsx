'use client';

import { Suspense, useState } from 'react';
import Link from 'next/link';
import { Canvas } from '@react-three/fiber';
import { TEAMS, type Team } from '@/data/teams-data';
import { LiverySelect } from '@/components/showcase/livery-select';
import { CAR_SWEPT, CAR_TARGET, SHOWCASE_FIT_MARGIN } from '@/lib/scene-fit';
import { FitCamera } from './fit-camera';
import { PrimitiveCar, RealCar } from './f1-car-model';

const FOG_COLOR = '#0a0a0a';

/**
 * `2.4` because the placeholder is a different car.
 *
 * `PrimitiveCar` is about 4.6 units long against the GLB's 11.24, and the camera is now framed
 * for the GLB — so at its natural size the stand-in would sit tiny in the middle of the canvas
 * and jump when the real model resolves. It was the other way round before: the old camera was
 * framed for the placeholder by accident, which is part of why the real car being four times too
 * big went unnoticed.
 */
const FALLBACK_SCALE = 2.4;

function ShowcaseCarModel({ teamColor }: { teamColor: string }) {
  const fallback = (
    <PrimitiveCar
      bodyColor={teamColor}
      sidepodColor={teamColor}
      scale={FALLBACK_SCALE}
      rotationSpeed={0.15}
      exhaustEmissiveIntensity={0.3}
    />
  );

  return (
    <Suspense fallback={fallback}>
      <RealCar teamColor={teamColor} rotationSpeed={0.15} />
    </Suspense>
  );
}

export default function F1CarShowcase() {
  const [selectedTeam, setSelectedTeam] = useState<Team>(
    () => TEAMS.find((team) => team.id === 'ferrari') ?? TEAMS[0]!,
  );

  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      <div className="container mx-auto px-4 py-8">
        <div className="mb-4">
          <Link
            href="/"
            className="inline-flex items-center gap-2 text-zinc-400 transition-colors hover:text-white"
          >
            ← Back to Briefing Agent
          </Link>
        </div>

        <h1 className="mb-2 text-center text-4xl font-bold md:text-5xl">
          <span className="text-f1-red">F1</span> Car Showcase
        </h1>
        <p className="mb-8 text-center text-lg text-zinc-400">Explore all 11 team liveries in 3D</p>

        <div className="mb-8 h-[70vh] overflow-hidden rounded-xl border border-zinc-800 bg-gradient-to-b from-zinc-900 to-zinc-950 shadow-2xl">
          {/*
            No `position` on the camera and no `<fog>` in the tree: `FitCamera` sets both from the
            canvas it can actually measure. The `fov` stays here because it is the lens choice
            this route was authored with, and the fit is computed against it.
          */}
          <Canvas camera={{ fov: 50 }} dpr={[1, 2]} shadows>
            <color attach="background" args={[FOG_COLOR]} />
            <FitCamera
              subject={CAR_SWEPT}
              target={CAR_TARGET}
              margin={SHOWCASE_FIT_MARGIN}
              fogColor={FOG_COLOR}
            />

            <ambientLight intensity={0.3} />
            <directionalLight
              position={[10, 10, 5]}
              intensity={1.5}
              castShadow
              shadow-mapSize={[2048, 2048]}
              /*
               * three.js defaults a directional light's shadow camera to a 10x10 box, which the
               * car overflows the moment it is rendered at its real size — it sweeps a 12-unit
               * circle. Same bounds the Inspect modal already sets.
               */
              shadow-camera-far={50}
              shadow-camera-left={-10}
              shadow-camera-right={10}
              shadow-camera-top={10}
              shadow-camera-bottom={-10}
            />
            <pointLight position={[-8, 3, -5]} intensity={0.6} color="#ff0000" />
            <pointLight position={[8, 3, -5]} intensity={0.5} color="#ffffff" />
            <pointLight position={[0, -2, 0]} intensity={0.3} color="#0066ff" />
            <spotLight position={[0, 8, 8]} angle={0.3} penumbra={1} intensity={1} castShadow />

            <Suspense fallback={null}>
              <ShowcaseCarModel teamColor={selectedTeam.color} />

              <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.5, 0]} receiveShadow>
                <planeGeometry args={[50, 50]} />
                <meshStandardMaterial color="#0a0a0a" metalness={0.95} roughness={0.05} />
              </mesh>

              <gridHelper args={[20, 20, '#1a1a1a', '#0d0d0d']} position={[0, -0.49, 0]} />
            </Suspense>
          </Canvas>
        </div>

        <LiverySelect selected={selectedTeam} onSelect={setSelectedTeam} />

        <div className="mt-12 text-center">
          <Link
            href="/credits"
            // `zinc-400` (7.76:1 on this page's bare `bg-zinc-950`), not the `zinc-500` this
            // shipped as — 4.12:1, under the 4.5:1 small-text bar, and the one `color-contrast`
            // violation axe found on the route. Same floor the rest of the branch holds.
            className="text-sm text-zinc-400 transition-colors hover:text-zinc-300"
          >
            View Credits &amp; Attributions
          </Link>
        </div>
      </div>
    </div>
  );
}

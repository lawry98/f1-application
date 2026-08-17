'use client';

import { Suspense, useState } from 'react';
import Link from 'next/link';
import { Canvas } from '@react-three/fiber';
import { TEAMS, type Team } from '@/data/teams-data';
import { PrimitiveCar, RealCar } from './f1-car-model';

function ShowcaseCarModel({ teamColor }: { teamColor: string }) {
  const fallback = (
    <PrimitiveCar
      bodyColor={teamColor}
      sidepodColor={teamColor}
      rotationSpeed={0.15}
      exhaustEmissiveIntensity={0.3}
    />
  );

  return (
    <Suspense fallback={fallback}>
      <RealCar teamColor={teamColor} scale={2} position={[0, 0, 0]} rotationSpeed={0.15} />
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
          <Canvas camera={{ position: [5, 2.5, 5], fov: 50 }} dpr={[1, 2]} shadows>
            <color attach="background" args={['#0a0a0a']} />
            <fog attach="fog" args={['#0a0a0a', 8, 20]} />

            <ambientLight intensity={0.3} />
            <directionalLight
              position={[10, 10, 5]}
              intensity={1.5}
              castShadow
              shadow-mapSize={[2048, 2048]}
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

        <div className="mx-auto max-w-5xl">
          {/* `h2`, not the `h3` this shipped as: the only other heading on the route is the `h1`
              above, so an `h3` skipped a level and axe reported `heading-order`. The text, the
              size and the weight are untouched — the level is an outline fact, not a visual one,
              and this route inherits tokens only. */}
          <h2 className="mb-6 text-center text-2xl font-semibold">Select Team Livery</h2>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-5">
            {TEAMS.map((team) => (
              <button
                key={team.id}
                onClick={() => setSelectedTeam(team)}
                className={`rounded-xl border-2 px-4 py-4 font-semibold transition-all duration-300 ${
                  selectedTeam.id === team.id
                    ? 'scale-105 border-f1-red bg-zinc-800 shadow-lg'
                    : 'border-zinc-700 bg-zinc-900 hover:scale-[1.02] hover:border-zinc-600'
                } `}
                style={{
                  boxShadow: selectedTeam.id === team.id ? `0 0 30px ${team.color}50` : 'none',
                }}
              >
                <div
                  className="mb-3 h-12 w-full rounded-lg shadow-inner"
                  style={{ backgroundColor: team.color }}
                />
                <span className="text-sm">{team.shortName}</span>
              </button>
            ))}
          </div>
        </div>

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

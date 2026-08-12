'use client';

import { Suspense, useEffect } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import { useReducedMotion } from 'motion/react';
import { cn } from '@/lib/utils';
import { useDocumentVisible } from '@/hooks/use-document-visible';
import { PrimitiveCar, RealCar } from './f1-car-model';

function HeroFallbackCar({ rotationSpeed, float }: { rotationSpeed: number; float: boolean }) {
  return (
    <PrimitiveCar
      bodyColor="#dc2626"
      sidepodColor="#b91c1c"
      scale={0.8}
      rotationSpeed={rotationSpeed}
      float={float}
      bodyEnvMapIntensity={1.5}
      exhaustEmissiveIntensity={0.2}
    />
  );
}

/**
 * Renders one frame whenever `teamColor` changes.
 *
 * Only load-bearing under `frameloop="demand"`, which is the reduced-motion path. R3F's own
 * reconciler already auto-invalidates on any scene-graph mutation — mounting/unmounting Object3D
 * children, which is exactly what the Suspense swap from the primitive fallback to `RealCar` does
 * once the GLB resolves — so that transition needs no help here. What isn't covered is `RealCar`'s
 * imperative `material.color.set(teamColor)`: it mutates an existing Three.js object directly,
 * outside R3F's declarative prop diffing, so nothing invalidates it on its own. Must live inside
 * `<Canvas>`; `useThree` throws outside one.
 */
function Invalidator({ teamColor }: { teamColor: string }) {
  const invalidate = useThree((state) => state.invalidate);
  useEffect(() => {
    invalidate();
  }, [invalidate, teamColor]);
  return null;
}

interface F1HeroSceneProps {
  teamColor?: string;
  hideOverlay?: boolean;
  className?: string;
}

export default function F1HeroScene({
  teamColor = '#dc2626',
  hideOverlay = false,
  className,
}: F1HeroSceneProps) {
  const visible = useDocumentVisible();
  const reducedMotion = useReducedMotion() ?? false;

  /*
   * The frame loop, as state.
   *
   * `never` while the tab is backgrounded — spec item 11's "idle on visibilitychange", and the
   * only one of the three that is purely a saving.
   *
   * `demand` under reduced motion, which is the spec's literal `frameloop="demand"` applied in the
   * one case where it is right: the car turns and floats through `useFrame`, so `demand` in the
   * normal case would simply freeze the feature, while continuous rotation is exactly the
   * sustained movement `prefers-reduced-motion` asks to be spared. `Invalidator` is what keeps
   * the still frame correct.
   */
  const frameloop = !visible ? 'never' : reducedMotion ? 'demand' : 'always';
  const motion = { rotationSpeed: reducedMotion ? 0 : 0.3, float: !reducedMotion };

  return (
    <div
      className={cn(
        'relative w-full overflow-hidden bg-gradient-to-b from-zinc-900 via-zinc-950 to-zinc-950',
        className ?? 'h-[600px]',
      )}
    >
      <Canvas camera={{ position: [5, 2.5, 5], fov: 45 }} dpr={[1, 2]} shadows frameloop={frameloop}>
        <Invalidator teamColor={teamColor} />
        <color attach="background" args={['#09090b']} />
        <fog attach="fog" args={['#09090b', 5, 15]} />

        {/* Enhanced lighting */}
        <ambientLight intensity={0.3} />

        {/* Main key light */}
        <directionalLight
          position={[10, 10, 5]}
          intensity={1.5}
          castShadow
          shadow-mapSize={[2048, 2048]}
          shadow-camera-far={50}
          shadow-camera-left={-10}
          shadow-camera-right={10}
          shadow-camera-top={10}
          shadow-camera-bottom={-10}
        />

        {/* Rim lights for definition */}
        <pointLight position={[-8, 3, -5]} intensity={0.8} color="#ff0000" />
        <pointLight position={[8, 3, -5]} intensity={0.6} color="#ffffff" />

        {/* Fill light from below */}
        <pointLight position={[0, -2, 0]} intensity={0.4} color="#0066ff" />

        {/* Accent light from front */}
        <spotLight
          position={[0, 5, 8]}
          angle={0.3}
          penumbra={1}
          intensity={0.8}
          color="#ffffff"
          castShadow
        />

        <Suspense fallback={<HeroFallbackCar {...motion} />}>
          <RealCar teamColor={teamColor} scale={1} position={[0, -0.5, 0]} {...motion} />
        </Suspense>

        {/* Reflective ground plane */}
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.5, 0]} receiveShadow>
          <planeGeometry args={[50, 50]} />
          <meshStandardMaterial
            color="#0a0a0a"
            metalness={0.95}
            roughness={0.05}
            envMapIntensity={1}
          />
        </mesh>

        {/* Grid lines on ground for depth */}
        <gridHelper args={[20, 20, '#1a1a1a', '#0f0f0f']} position={[0, -0.49, 0]} />
      </Canvas>

      {/* Gradient overlays */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-zinc-950 via-zinc-950/50 to-transparent" />
      <div className="pointer-events-none absolute inset-x-0 top-0 h-40 bg-gradient-to-b from-zinc-900/50 to-transparent" />

      {/* Text overlay */}
      {!hideOverlay && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="px-4 text-center">
            <h2 className="mb-3 text-6xl font-bold text-white drop-shadow-2xl md:text-7xl">
              <span className="text-f1-red">F1</span> Briefing Agent
            </h2>
            <p className="text-xl text-zinc-300 drop-shadow-lg md:text-2xl">
              AI-Powered Race Weekend Analysis
            </p>
          </div>
        </div>
      )}

      {/* Subtle vignette */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background: 'radial-gradient(circle at center, transparent 0%, rgba(0,0,0,0.3) 100%)',
        }}
      />
    </div>
  );
}

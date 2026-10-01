'use client';

import { Suspense } from 'react';
import { Canvas } from '@react-three/fiber';
import { cn } from '@/lib/utils';
import { useSceneMotion } from '@/hooks/use-scene-motion';
import { CAR_SWEPT, CAR_TARGET, INSPECT_FIT_MARGIN } from '@/lib/scene-fit';
import { FitCamera } from './fit-camera';
import { CAR_SHADOW_NORMAL_BIAS, PrimitiveCar, RealCar } from './f1-car-model';

const FOG_COLOR = '#09090b';

/**
 * `2.4`, up from `0.8`: `PrimitiveCar` is ~4.6 units long and the GLB is 11.23, and the camera is
 * now framed for the GLB. At the old scale the stand-in would be a sixth of the size of the car
 * that replaces it.
 */
const FALLBACK_SCALE = 2.4;

function HeroFallbackCar({ rotationSpeed, float }: { rotationSpeed: number; float: boolean }) {
  return (
    <PrimitiveCar
      bodyColor="#dc2626"
      sidepodColor="#b91c1c"
      scale={FALLBACK_SCALE}
      rotationSpeed={rotationSpeed}
      float={float}
      bodyEnvMapIntensity={1.5}
      exhaustEmissiveIntensity={0.2}
    />
  );
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
  // `never` hidden, `demand` with the car still under reduced motion, `always` otherwise.
  const { frameloop, ...motion } = useSceneMotion({ rotationSpeed: 0.3, float: true });

  return (
    <div
      className={cn(
        'relative w-full overflow-hidden bg-gradient-to-b from-zinc-900 via-zinc-950 to-zinc-950',
        className ?? 'h-[600px]',
      )}
    >
      {/*
        No camera `position` and no `<fog>`: `FitCamera` sets both from the canvas it can measure.
        The modal is a smaller panel than `/showcase`, so it keeps its narrower 45° lens and a
        tighter margin — a closer crop that, unlike the one that shipped, contains the whole car.
      */}
      <Canvas camera={{ fov: 45 }} dpr={[1, 2]} shadows frameloop={frameloop}>
        <color attach="background" args={[FOG_COLOR]} />
        <FitCamera
          subject={CAR_SWEPT}
          target={CAR_TARGET}
          margin={INSPECT_FIT_MARGIN}
          fogColor={FOG_COLOR}
        />

        {/* Enhanced lighting */}
        <ambientLight intensity={0.3} />

        {/* Main key light */}
        <directionalLight
          position={[10, 10, 5]}
          intensity={1.5}
          castShadow
          shadow-mapSize={[2048, 2048]}
          shadow-normalBias={CAR_SHADOW_NORMAL_BIAS}
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
          shadow-normalBias={CAR_SHADOW_NORMAL_BIAS}
        />

        <Suspense fallback={<HeroFallbackCar {...motion} />}>
          <RealCar teamColor={teamColor} {...motion} />
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
            <h2 className="mb-3 text-6xl font-bold text-ink drop-shadow-2xl md:text-7xl">
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

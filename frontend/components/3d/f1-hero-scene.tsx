'use client';

import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';

import { cn } from '@/lib/utils';
import { withAlpha } from '@/lib/team-utils';
import { PrimitiveCar, RealCar } from './f1-car-model';

function HeroFallbackCar() {
  return (
    <PrimitiveCar
      bodyColor="#dc2626"
      sidepodColor="#b91c1c"
      scale={0.8}
      rotationSpeed={0.3}
      float
      bodyEnvMapIntensity={1.5}
      exhaustEmissiveIntensity={0.2}
    />
  );
}

/** Distance from the origin the camera orbits at. Matches the original `[5, 2.5, 5]` framing. */
const CAMERA_RADIUS = 7.1;
const EASE = 0.02;

function cameraTargetFor(variant: number) {
  // Deterministic per variant, and small: this is a change of vantage point, not a fly-around.
  const azimuth = Math.PI / 4 + Math.sin(variant * 1.7) * 0.3;
  const height = 2.5 + Math.cos(variant * 2.3) * 0.4;
  return new THREE.Vector3(
    Math.cos(azimuth) * CAMERA_RADIUS,
    height,
    Math.sin(azimuth) * CAMERA_RADIUS,
  );
}

/**
 * Eases the camera to a per-variant vantage point, so switching teams reads as a considered
 * camera move rather than a livery swap. Snaps instead of easing under reduced motion.
 */
function CameraRig({ variant, animate }: { variant: number; animate: boolean }) {
  const camera = useThree((state) => state.camera);
  const invalidate = useThree((state) => state.invalidate);
  const target = useMemo(() => cameraTargetFor(variant), [variant]);
  const easingRef = useRef(false);
  const placedRef = useRef(false);

  useEffect(() => {
    if (!animate || !placedRef.current) {
      camera.position.copy(target);
      camera.lookAt(0, 0, 0);
      placedRef.current = true;
      easingRef.current = false;
    } else {
      easingRef.current = true;
    }
    invalidate();
  }, [target, animate, camera, invalidate]);

  useFrame((_state, delta) => {
    if (!easingRef.current) return;
    camera.position.lerp(target, 1 - EASE ** delta);
    camera.lookAt(0, 0, 0);
    if (camera.position.distanceTo(target) < 0.005) {
      camera.position.copy(target);
      easingRef.current = false;
    }
    invalidate();
  });

  return null;
}

/** A rim light that cross-fades to the team color alongside the livery. */
function TeamRimLight({
  color,
  animate,
  position,
  intensity,
}: {
  color: string;
  animate: boolean;
  position: [number, number, number];
  intensity: number;
}) {
  const lightRef = useRef<THREE.PointLight>(null);
  const invalidate = useThree((state) => state.invalidate);
  const target = useMemo(() => new THREE.Color(color), [color]);
  const easingRef = useRef(false);
  const placedRef = useRef(false);

  useEffect(() => {
    const light = lightRef.current;
    if (!light) return;
    if (!animate || !placedRef.current) {
      light.color.copy(target);
      placedRef.current = true;
      easingRef.current = false;
    } else {
      easingRef.current = true;
    }
    invalidate();
  }, [target, animate, invalidate]);

  useFrame((_state, delta) => {
    const light = lightRef.current;
    if (!easingRef.current || !light) return;
    light.color.lerp(target, 1 - EASE ** delta);
    if (Math.abs(light.color.r - target.r) < 0.004) {
      light.color.copy(target);
      easingRef.current = false;
    }
    invalidate();
  });

  // `color` is applied through the ref, never as a prop: a prop write would snap past the ease.
  return <pointLight ref={lightRef} position={position} intensity={intensity} />;
}

/** Requests a single frame whenever the scene comes back from `frameloop="never"`. */
function ResumeKick({ active }: { active: boolean }) {
  const invalidate = useThree((state) => state.invalidate);
  useEffect(() => {
    if (active) invalidate();
  }, [active, invalidate]);
  return null;
}

/** False while the tab is in the background — no reason to keep a render loop hot there. */
function usePageVisible(): boolean {
  const [visible, setVisible] = useState(true);
  useEffect(() => {
    const update = () => setVisible(document.visibilityState === 'visible');
    update();
    document.addEventListener('visibilitychange', update);
    return () => document.removeEventListener('visibilitychange', update);
  }, []);
  return visible;
}

interface F1HeroSceneProps {
  teamColor?: string;
  hideOverlay?: boolean;
  className?: string;
  /**
   * Stop rendering without unmounting. The WebGL context, the loaded GLB, and the cloned scene
   * all stay alive, so resuming is free — used to idle the sticky viewer while the fullscreen
   * inspector owns the screen.
   */
  paused?: boolean;
  /** Drop continuous rotation, float, camera easing, and livery cross-fades. */
  reducedMotion?: boolean;
  /** Upper device-pixel-ratio bound. A 360px side panel gains nothing from 2x. */
  maxDpr?: number;
  /** Changing this eases the camera to a different vantage point. */
  cameraVariant?: number;
}

export default function F1HeroScene({
  teamColor = '#dc2626',
  hideOverlay = false,
  className,
  paused = false,
  reducedMotion = false,
  maxDpr = 2,
  cameraVariant = 0,
}: F1HeroSceneProps) {
  const pageVisible = usePageVisible();
  const active = !paused && pageVisible;

  // `demand` under reduced motion: nothing loops, but livery cross-fades and camera placement
  // still get the frames they explicitly ask for via `invalidate()`.
  const frameloop = !active ? 'never' : reducedMotion ? 'demand' : 'always';
  const shadowMapSize = maxDpr >= 2 ? 2048 : 1024;

  return (
    <div
      className={cn(
        'relative w-full overflow-hidden bg-gradient-to-b from-zinc-900 via-zinc-950 to-zinc-950',
        className ?? 'h-[600px]',
      )}
    >
      <Canvas
        camera={{ position: [5, 2.5, 5], fov: 45 }}
        dpr={[1, maxDpr]}
        frameloop={frameloop}
        shadows
      >
        <color attach="background" args={['#09090b']} />
        <fog attach="fog" args={['#09090b', 5, 15]} />

        <ResumeKick active={active} />
        <CameraRig variant={cameraVariant} animate={!reducedMotion} />

        {/* Enhanced lighting */}
        <ambientLight intensity={0.3} />

        {/* Main key light */}
        <directionalLight
          position={[10, 10, 5]}
          intensity={1.5}
          castShadow
          shadow-mapSize={[shadowMapSize, shadowMapSize]}
          shadow-camera-far={50}
          shadow-camera-left={-10}
          shadow-camera-right={10}
          shadow-camera-top={10}
          shadow-camera-bottom={-10}
        />

        {/* Rim lights for definition — the warm one carries the team color */}
        <TeamRimLight
          color={teamColor}
          animate={!reducedMotion}
          position={[-8, 3, -5]}
          intensity={0.9}
        />
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

        <Suspense fallback={<HeroFallbackCar />}>
          <RealCar
            teamColor={teamColor}
            scale={1}
            position={[0, -0.5, 0]}
            rotationSpeed={reducedMotion ? 0 : 0.3}
            float={!reducedMotion}
            animateColor={!reducedMotion}
          />
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

      {/* Team-colored floor bloom — CSS, so it cross-fades even while the canvas is paused */}
      <div
        className="pointer-events-none absolute inset-x-0 bottom-0 h-1/2 transition-[background] duration-700"
        style={{
          background: `radial-gradient(ellipse 70% 60% at 50% 100%, ${withAlpha(teamColor, 0.28)}, transparent 70%)`,
        }}
        aria-hidden="true"
      />

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

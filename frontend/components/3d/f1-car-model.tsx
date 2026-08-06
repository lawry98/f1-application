'use client';

import { useEffect, useMemo, useRef, type RefObject } from 'react';
import { useFrame, useLoader, useThree } from '@react-three/fiber';
import { GLTFLoader } from 'three-stdlib';
import * as THREE from 'three';

interface CarMotion {
  rotationSpeed: number;
  float?: boolean;
}

function useCarMotion(ref: RefObject<THREE.Group | null>, { rotationSpeed, float }: CarMotion) {
  useFrame((state, delta) => {
    if (ref.current) {
      ref.current.rotation.y += delta * rotationSpeed;
      if (float) {
        ref.current.position.y = Math.sin(state.clock.elapsedTime * 0.5) * 0.15;
      }
    }
  });
}

/** Per-second fraction of the remaining distance a livery cross-fade covers. */
const COLOR_EASE = 0.0015;
/** Channel distance at which a cross-fade is close enough to snap and stop requesting frames. */
const COLOR_EPSILON = 0.004;

/**
 * Cross-fades cloned body materials to a new livery instead of snapping.
 *
 * The first color is applied instantly — the GLB's own paint is not a frame anyone should see.
 * Every later change eases, and each easing frame calls `invalidate()` so the transition still
 * runs under `frameloop="demand"` (reduced motion), where nothing else is asking for frames.
 */
function useLiveryTransition(
  materials: THREE.MeshStandardMaterial[],
  teamColor: string,
  animate: boolean,
) {
  const invalidate = useThree((state) => state.invalidate);
  const target = useMemo(() => new THREE.Color(teamColor), [teamColor]);
  const easingRef = useRef(false);
  const appliedRef = useRef(false);

  useEffect(() => {
    if (!animate || !appliedRef.current) {
      materials.forEach((material) => material.color.copy(target));
      appliedRef.current = true;
      easingRef.current = false;
    } else {
      easingRef.current = true;
    }
    invalidate();
  }, [materials, target, animate, invalidate]);

  useFrame((_state, delta) => {
    if (!easingRef.current) return;
    const t = 1 - COLOR_EASE ** delta;
    let settled = true;
    for (const material of materials) {
      material.color.lerp(target, t);
      const distance =
        Math.abs(material.color.r - target.r) +
        Math.abs(material.color.g - target.g) +
        Math.abs(material.color.b - target.b);
      if (distance > COLOR_EPSILON) settled = false;
    }
    if (settled) {
      materials.forEach((material) => material.color.copy(target));
      easingRef.current = false;
    }
    invalidate();
  });
}

interface RealCarProps extends CarMotion {
  teamColor: string;
  scale: number;
  position: [number, number, number];
  /** Cross-fade livery changes instead of snapping. Off under reduced motion. */
  animateColor?: boolean;
}

export function RealCar({
  teamColor,
  scale,
  position,
  rotationSpeed,
  float,
  animateColor = true,
}: RealCarProps) {
  const groupRef = useRef<THREE.Group>(null);
  const gltf = useLoader(GLTFLoader, '/models/f1-car.glb');

  // Clone once per mount; useLoader caches the GLTF, so body materials must be
  // cloned before recoloring or the tint would bleed into every other consumer.
  const { clonedScene, bodyMaterials } = useMemo(() => {
    const scene = gltf.scene.clone();
    const materials: THREE.MeshStandardMaterial[] = [];
    scene.traverse((child: THREE.Object3D) => {
      if (child instanceof THREE.Mesh) {
        child.castShadow = true;
        child.receiveShadow = true;
        if (child.material) {
          const material = child.material as THREE.MeshStandardMaterial;
          if (
            material.name &&
            (material.name.includes('body') ||
              material.name.includes('Body') ||
              material.name.includes('paint'))
          ) {
            const newMaterial = material.clone();
            newMaterial.metalness = 0.9;
            newMaterial.roughness = 0.15;
            child.material = newMaterial;
            materials.push(newMaterial);
          }
        }
      }
    });
    return { clonedScene: scene, bodyMaterials: materials };
  }, [gltf.scene]);

  useLiveryTransition(bodyMaterials, teamColor, animateColor);

  useEffect(() => {
    return () => {
      bodyMaterials.forEach((material) => material.dispose());
    };
  }, [bodyMaterials]);

  useCarMotion(groupRef, { rotationSpeed, float });

  return (
    <group ref={groupRef}>
      <primitive object={clonedScene} scale={scale} position={position} />
    </group>
  );
}

interface PrimitiveCarProps extends CarMotion {
  bodyColor: string;
  sidepodColor: string;
  scale?: number;
  bodyEnvMapIntensity?: number;
  exhaustEmissiveIntensity: number;
}

export function PrimitiveCar({
  bodyColor,
  sidepodColor,
  scale = 1,
  rotationSpeed,
  float,
  bodyEnvMapIntensity = 1,
  exhaustEmissiveIntensity,
}: PrimitiveCarProps) {
  const groupRef = useRef<THREE.Group>(null);

  useCarMotion(groupRef, { rotationSpeed, float });

  return (
    <group ref={groupRef} scale={scale}>
      {/* Main body */}
      <mesh castShadow position={[0, 0, 0]}>
        <boxGeometry args={[1.2, 0.25, 3.5]} />
        <meshStandardMaterial
          color={bodyColor}
          metalness={0.9}
          roughness={0.15}
          envMapIntensity={bodyEnvMapIntensity}
        />
      </mesh>

      {/* Nose cone */}
      <mesh castShadow position={[0, 0, 2]}>
        <coneGeometry args={[0.3, 0.8, 4]} />
        <meshStandardMaterial
          color={bodyColor}
          metalness={0.9}
          roughness={0.15}
          envMapIntensity={bodyEnvMapIntensity}
        />
      </mesh>

      {/* Cockpit */}
      <mesh castShadow position={[0, 0.35, 0.5]}>
        <boxGeometry args={[0.7, 0.35, 1.2]} />
        <meshStandardMaterial
          color="#1a1a1a"
          metalness={0.3}
          roughness={0.7}
          transparent
          opacity={0.4}
        />
      </mesh>

      {/* Driver helmet */}
      <mesh castShadow position={[0, 0.45, 0.5]}>
        <sphereGeometry args={[0.2, 16, 16]} />
        <meshStandardMaterial color="#ffd700" metalness={0.9} roughness={0.1} />
      </mesh>

      {/* Front wing */}
      <mesh castShadow position={[0, -0.1, 2.3]}>
        <boxGeometry args={[1.8, 0.05, 0.4]} />
        <meshStandardMaterial color="#1a1a1a" metalness={0.8} roughness={0.2} />
      </mesh>

      {/* Rear wing main */}
      <mesh castShadow position={[0, 0.5, -1.8]}>
        <boxGeometry args={[1.6, 0.05, 0.6]} />
        <meshStandardMaterial color="#1a1a1a" metalness={0.8} roughness={0.2} />
      </mesh>

      {/* Rear wing upper */}
      <mesh castShadow position={[0, 0.7, -1.8]}>
        <boxGeometry args={[1.6, 0.05, 0.5]} />
        <meshStandardMaterial color="#1a1a1a" metalness={0.8} roughness={0.2} />
      </mesh>

      {/* Wing supports */}
      <mesh castShadow position={[-0.7, 0.3, -1.8]}>
        <cylinderGeometry args={[0.03, 0.03, 0.6, 8]} />
        <meshStandardMaterial color="#1a1a1a" metalness={0.8} />
      </mesh>
      <mesh castShadow position={[0.7, 0.3, -1.8]}>
        <cylinderGeometry args={[0.03, 0.03, 0.6, 8]} />
        <meshStandardMaterial color="#1a1a1a" metalness={0.8} />
      </mesh>

      {/* Side pods */}
      <mesh castShadow position={[-0.5, 0, 0]}>
        <boxGeometry args={[0.3, 0.3, 1.8]} />
        <meshStandardMaterial color={sidepodColor} metalness={0.85} roughness={0.2} />
      </mesh>
      <mesh castShadow position={[0.5, 0, 0]}>
        <boxGeometry args={[0.3, 0.3, 1.8]} />
        <meshStandardMaterial color={sidepodColor} metalness={0.85} roughness={0.2} />
      </mesh>

      {/* Front wheels */}
      <group position={[-0.7, -0.15, 1.2]}>
        <mesh castShadow rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.25, 0.25, 0.2, 24]} />
          <meshStandardMaterial color="#000000" metalness={0.2} roughness={0.8} />
        </mesh>
        <mesh castShadow rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.15, 0.15, 0.22, 24]} />
          <meshStandardMaterial color="#1a1a1a" metalness={0.9} roughness={0.1} />
        </mesh>
      </group>
      <group position={[0.7, -0.15, 1.2]}>
        <mesh castShadow rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.25, 0.25, 0.2, 24]} />
          <meshStandardMaterial color="#000000" metalness={0.2} roughness={0.8} />
        </mesh>
        <mesh castShadow rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.15, 0.15, 0.22, 24]} />
          <meshStandardMaterial color="#1a1a1a" metalness={0.9} roughness={0.1} />
        </mesh>
      </group>

      {/* Rear wheels - larger */}
      <group position={[-0.8, -0.15, -1.2]}>
        <mesh castShadow rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.3, 0.3, 0.25, 24]} />
          <meshStandardMaterial color="#000000" metalness={0.2} roughness={0.8} />
        </mesh>
        <mesh castShadow rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.18, 0.18, 0.27, 24]} />
          <meshStandardMaterial color="#1a1a1a" metalness={0.9} roughness={0.1} />
        </mesh>
      </group>
      <group position={[0.8, -0.15, -1.2]}>
        <mesh castShadow rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.3, 0.3, 0.25, 24]} />
          <meshStandardMaterial color="#000000" metalness={0.2} roughness={0.8} />
        </mesh>
        <mesh castShadow rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.18, 0.18, 0.27, 24]} />
          <meshStandardMaterial color="#1a1a1a" metalness={0.9} roughness={0.1} />
        </mesh>
      </group>

      {/* Exhaust */}
      <mesh castShadow position={[0.15, 0.1, -1.6]}>
        <cylinderGeometry args={[0.05, 0.05, 0.3, 12]} />
        <meshStandardMaterial
          color="#444444"
          metalness={1}
          roughness={0.3}
          emissive="#ff4400"
          emissiveIntensity={exhaustEmissiveIntensity}
        />
      </mesh>
      <mesh castShadow position={[-0.15, 0.1, -1.6]}>
        <cylinderGeometry args={[0.05, 0.05, 0.3, 12]} />
        <meshStandardMaterial
          color="#444444"
          metalness={1}
          roughness={0.3}
          emissive="#ff4400"
          emissiveIntensity={exhaustEmissiveIntensity}
        />
      </mesh>
    </group>
  );
}

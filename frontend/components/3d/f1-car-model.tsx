'use client';

import { useEffect, useMemo, useRef, type RefObject } from 'react';
import { useFrame, useLoader } from '@react-three/fiber';
import { GLTFLoader } from 'three-stdlib';
import * as THREE from 'three';

import { hexToRgb, recolourLivery, selectLiveryMaterials } from '@/lib/livery';

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

interface RealCarProps extends CarMotion {
  teamColor: string;
  scale: number;
  position: [number, number, number];
}

/**
 * A cloned livery material plus the canvas its base-colour texture is painted on.
 *
 * `paint` rewrites the texture rather than setting `material.color`, because `color` *multiplies*
 * into `.map` and this asset's base texel is `#003572` — red channel zero, so no multiply can put
 * red back. See `lib/livery.ts` for the measurements behind that.
 */
interface LiveryPaint {
  material: THREE.MeshStandardMaterial;
  paint: (teamColor: string) => void;
  dispose: () => void;
}

function createLiveryPaint(source: THREE.MeshStandardMaterial): LiveryPaint | null {
  const map = source.map;
  const image = map?.image as (CanvasImageSource & { width?: number; height?: number }) | undefined;
  const width = image?.width ?? 0;
  const height = image?.height ?? 0;

  if (!map || !image || !width || !height) {
    console.error(
      '[f1-car-model] livery material has no readable base-colour texture; the car will not recolour.',
    );
    return null;
  }

  // Read the authored texels out once. This canvas is temporary — only `surface` below is kept.
  const read = document.createElement('canvas');
  read.width = width;
  read.height = height;
  const readContext = read.getContext('2d');
  if (!readContext) {
    console.error('[f1-car-model] no 2D context; the car will not recolour.');
    return null;
  }
  readContext.drawImage(image, 0, 0);
  const pristine = readContext.getImageData(0, 0, width, height);

  const surface = document.createElement('canvas');
  surface.width = width;
  surface.height = height;
  const surfaceContext = surface.getContext('2d');
  if (!surfaceContext) {
    console.error('[f1-car-model] no 2D context; the car will not recolour.');
    return null;
  }
  const painted = surfaceContext.createImageData(width, height);

  /*
   * `clone()` carries the sampling settings that matter — `colorSpace`, `flipY`, wrapping,
   * anisotropy — but shares the original's `Source`, so assigning `.image` would write straight
   * into the GLTF cache. A fresh `Source` is what makes this texture independent.
   */
  const texture = map.clone();
  texture.source = new THREE.Source(surface);

  const material = source.clone();
  material.map = texture;

  return {
    material,
    paint(teamColor: string) {
      // Always from `pristine`: recolouring the previous output would compound on every switch.
      recolourLivery(pristine.data, painted.data, hexToRgb(teamColor));
      surfaceContext.putImageData(painted, 0, 0);
      texture.needsUpdate = true;
    },
    dispose() {
      texture.dispose();
      material.dispose();
    },
  };
}

export function RealCar({ teamColor, scale, position, rotationSpeed, float }: RealCarProps) {
  const groupRef = useRef<THREE.Group>(null);
  const gltf = useLoader(GLTFLoader, '/models/f1-car.glb');

  // Clone once per mount; useLoader caches the GLTF, so livery materials must be cloned before
  // recolouring or the repaint would bleed into every other consumer.
  const { clonedScene, liveryPaints } = useMemo(() => {
    const scene = gltf.scene.clone();

    const meshes: THREE.Mesh[] = [];
    const materials = new Map<string, THREE.MeshStandardMaterial>();
    scene.traverse((child: THREE.Object3D) => {
      if (!(child instanceof THREE.Mesh)) return;
      child.castShadow = true;
      child.receiveShadow = true;
      if (!child.material || Array.isArray(child.material)) return;
      meshes.push(child);
      const material = child.material as THREE.MeshStandardMaterial;
      materials.set(material.uuid, material);
    });

    const livery = selectLiveryMaterials(Array.from(materials.values()));

    /*
     * Loud, because the silent version of this is the defect being fixed: the old filter guessed
     * at `body`/`Body`/`paint`, matched none of the GLB's four materials, and left every team
     * rendering the baked blue with nothing anywhere reporting a problem.
     */
    if (livery.length === 0) {
      console.error(
        `[f1-car-model] no livery material in the GLB; the car will not recolour. Found: ${Array.from(
          materials.values(),
        )
          .map((m) => m.name)
          .join(', ')}`,
      );
    }

    // One paint per source material, not per mesh: the two bodywork meshes share `Livery`, so
    // this recolours a single 2048² texture rather than the same one twice.
    const paints = new Map<string, LiveryPaint>();
    for (const material of livery) {
      const created = createLiveryPaint(material);
      if (created) paints.set(material.uuid, created);
    }

    for (const mesh of meshes) {
      const paint = paints.get((mesh.material as THREE.MeshStandardMaterial).uuid);
      if (paint) mesh.material = paint.material;
    }

    return { clonedScene: scene, liveryPaints: Array.from(paints.values()) };
  }, [gltf.scene]);

  useEffect(() => {
    liveryPaints.forEach((livery) => livery.paint(teamColor));
  }, [liveryPaints, teamColor]);

  useEffect(() => {
    return () => {
      liveryPaints.forEach((livery) => livery.dispose());
    };
  }, [liveryPaints]);

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

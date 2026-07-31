'use client';

import { useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import * as THREE from 'three';

function SpinningF1Car() {
  const carRef = useRef<THREE.Group>(null);
  const wheelsRef = useRef<THREE.Mesh[]>([]);

  useFrame((state, delta) => {
    if (carRef.current) {
      carRef.current.rotation.y += delta * 2;
      carRef.current.position.y = Math.sin(state.clock.elapsedTime * 2) * 0.1;
    }

    wheelsRef.current.forEach((wheel) => {
      if (wheel) {
        wheel.rotation.x += delta * 10;
      }
    });
  });

  return (
    <group ref={carRef} scale={0.8}>
      {/* Main body */}
      <mesh>
        <boxGeometry args={[1.2, 0.25, 3]} />
        <meshStandardMaterial color="#dc2626" metalness={0.9} roughness={0.2} />
      </mesh>

      {/* Nose */}
      <mesh position={[0, 0, 1.7]}>
        <coneGeometry args={[0.3, 0.7, 4]} />
        <meshStandardMaterial color="#dc2626" metalness={0.9} roughness={0.2} />
      </mesh>

      {/* Cockpit */}
      <mesh position={[0, 0.3, 0.3]}>
        <boxGeometry args={[0.6, 0.3, 1]} />
        <meshStandardMaterial
          color="#1a1a1a"
          metalness={0.5}
          roughness={0.5}
          transparent
          opacity={0.4}
        />
      </mesh>

      {/* Front wing */}
      <mesh position={[0, -0.1, 1.8]}>
        <boxGeometry args={[1.6, 0.05, 0.3]} />
        <meshStandardMaterial color="#1a1a1a" metalness={0.8} roughness={0.2} />
      </mesh>

      {/* Rear wing */}
      <mesh position={[0, 0.5, -1.5]}>
        <boxGeometry args={[1.4, 0.05, 0.5]} />
        <meshStandardMaterial color="#1a1a1a" metalness={0.8} roughness={0.2} />
      </mesh>

      {/* Wheels */}
      <mesh
        ref={(el) => {
          if (el) wheelsRef.current[0] = el;
        }}
        position={[-0.6, -0.2, 1]}
        rotation={[0, 0, Math.PI / 2]}
      >
        <cylinderGeometry args={[0.22, 0.22, 0.15, 16]} />
        <meshStandardMaterial color="#000000" />
      </mesh>
      <mesh
        ref={(el) => {
          if (el) wheelsRef.current[1] = el;
        }}
        position={[0.6, -0.2, 1]}
        rotation={[0, 0, Math.PI / 2]}
      >
        <cylinderGeometry args={[0.22, 0.22, 0.15, 16]} />
        <meshStandardMaterial color="#000000" />
      </mesh>
      <mesh
        ref={(el) => {
          if (el) wheelsRef.current[2] = el;
        }}
        position={[-0.6, -0.2, -1]}
        rotation={[0, 0, Math.PI / 2]}
      >
        <cylinderGeometry args={[0.25, 0.25, 0.18, 16]} />
        <meshStandardMaterial color="#000000" />
      </mesh>
      <mesh
        ref={(el) => {
          if (el) wheelsRef.current[3] = el;
        }}
        position={[0.6, -0.2, -1]}
        rotation={[0, 0, Math.PI / 2]}
      >
        <cylinderGeometry args={[0.25, 0.25, 0.18, 16]} />
        <meshStandardMaterial color="#000000" />
      </mesh>
    </group>
  );
}

export function F1LoadingAnimation({ message = 'Loading...' }: { message?: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-12">
      <div className="mb-6 h-64 w-full max-w-md">
        <Canvas camera={{ position: [3, 1.5, 3], fov: 50 }} dpr={[1, 2]}>
          <ambientLight intensity={0.4} />
          <directionalLight position={[10, 10, 5]} intensity={1.2} />
          <pointLight position={[-5, 5, -5]} intensity={0.5} color="#ff0000" />
          <pointLight position={[5, 5, -5]} intensity={0.3} color="#ffffff" />
          <SpinningF1Car />
        </Canvas>
      </div>
      <div className="text-center">
        <div className="mb-3 flex items-center justify-center space-x-2">
          <div
            className="h-2 w-2 animate-bounce rounded-full bg-f1-red"
            style={{ animationDelay: '0ms' }}
          />
          <div
            className="h-2 w-2 animate-bounce rounded-full bg-f1-red"
            style={{ animationDelay: '150ms' }}
          />
          <div
            className="h-2 w-2 animate-bounce rounded-full bg-f1-red"
            style={{ animationDelay: '300ms' }}
          />
        </div>
        <p className="text-lg font-medium text-zinc-400">{message}</p>
      </div>
    </div>
  );
}

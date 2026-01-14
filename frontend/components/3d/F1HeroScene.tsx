'use client';

import { Suspense, useRef, useState, useEffect } from 'react';
import { Canvas, useFrame, useLoader } from '@react-three/fiber';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader';
import * as THREE from 'three';

function RealF1Car({ teamColor = "#dc2626" }: { teamColor?: string }) {
  const groupRef = useRef<THREE.Group>(null);
  const gltf = useLoader(GLTFLoader, '/models/f1-car.glb');
  
  const clonedScene = gltf.scene.clone();
  
  clonedScene.traverse((child) => {
    if (child instanceof THREE.Mesh) {
      child.castShadow = true;
      child.receiveShadow = true;
      
      if (child.material) {
        const material = child.material as THREE.MeshStandardMaterial;
        if (material.name && (material.name.includes('body') || material.name.includes('Body') || material.name.includes('paint'))) {
          const newMaterial = material.clone();
          newMaterial.color.set(teamColor);
          newMaterial.metalness = 0.9;
          newMaterial.roughness = 0.15;
          child.material = newMaterial;
        }
      }
    }
  });

  useFrame((state, delta) => {
    if (groupRef.current) {
      groupRef.current.rotation.y += delta * 0.3;
      groupRef.current.position.y = Math.sin(state.clock.elapsedTime * 0.5) * 0.15;
    }
  });

  return (
    <group ref={groupRef}>
      <primitive object={clonedScene} scale={1} position={[0, -0.5, 0]} />
    </group>
  );
}

function DetailedF1Car() {
  const groupRef = useRef<THREE.Group>(null);

  useFrame((state, delta) => {
    if (groupRef.current) {
      groupRef.current.rotation.y += delta * 0.3;
      groupRef.current.position.y = Math.sin(state.clock.elapsedTime * 0.5) * 0.15;
    }
  });

  return (
    <group ref={groupRef} scale={0.8}>
      {/* Main body - elongated */}
      <mesh castShadow position={[0, 0, 0]}>
        <boxGeometry args={[1.2, 0.25, 3.5]} />
        <meshStandardMaterial 
          color="#dc2626" 
          metalness={0.9} 
          roughness={0.15}
          envMapIntensity={1.5}
        />
      </mesh>
      
      {/* Nose cone - front pointed section */}
      <mesh castShadow position={[0, 0, 2]}>
        <coneGeometry args={[0.3, 0.8, 4]} />
        <meshStandardMaterial 
          color="#dc2626" 
          metalness={0.9} 
          roughness={0.15}
          envMapIntensity={1.5}
        />
      </mesh>
      
      {/* Cockpit / Halo */}
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
      
      {/* Driver helmet (visible inside cockpit) */}
      <mesh castShadow position={[0, 0.45, 0.5]}>
        <sphereGeometry args={[0.2, 16, 16]} />
        <meshStandardMaterial 
          color="#ffd700" 
          metalness={0.9} 
          roughness={0.1}
        />
      </mesh>
      
      {/* Front wing */}
      <mesh castShadow position={[0, -0.1, 2.3]}>
        <boxGeometry args={[1.8, 0.05, 0.4]} />
        <meshStandardMaterial 
          color="#1a1a1a" 
          metalness={0.8} 
          roughness={0.2}
        />
      </mesh>
      
      {/* Rear wing - main element */}
      <mesh castShadow position={[0, 0.5, -1.8]}>
        <boxGeometry args={[1.6, 0.05, 0.6]} />
        <meshStandardMaterial 
          color="#1a1a1a" 
          metalness={0.8} 
          roughness={0.2}
        />
      </mesh>
      
      {/* Rear wing - upper element */}
      <mesh castShadow position={[0, 0.7, -1.8]}>
        <boxGeometry args={[1.6, 0.05, 0.5]} />
        <meshStandardMaterial 
          color="#1a1a1a" 
          metalness={0.8} 
          roughness={0.2}
        />
      </mesh>
      
      {/* Rear wing supports */}
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
        <meshStandardMaterial 
          color="#b91c1c" 
          metalness={0.85} 
          roughness={0.2}
        />
      </mesh>
      <mesh castShadow position={[0.5, 0, 0]}>
        <boxGeometry args={[0.3, 0.3, 1.8]} />
        <meshStandardMaterial 
          color="#b91c1c" 
          metalness={0.85} 
          roughness={0.2}
        />
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
      
      {/* Exhaust pipes */}
      <mesh castShadow position={[0.15, 0.1, -1.6]}>
        <cylinderGeometry args={[0.05, 0.05, 0.3, 12]} />
        <meshStandardMaterial 
          color="#444444" 
          metalness={1} 
          roughness={0.3}
          emissive="#ff4400"
          emissiveIntensity={0.2}
        />
      </mesh>
      <mesh castShadow position={[-0.15, 0.1, -1.6]}>
        <cylinderGeometry args={[0.05, 0.05, 0.3, 12]} />
        <meshStandardMaterial 
          color="#444444" 
          metalness={1} 
          roughness={0.3}
          emissive="#ff4400"
          emissiveIntensity={0.2}
        />
      </mesh>
    </group>
  );
}

function F1CarModel({ teamColor = "#dc2626" }: { teamColor?: string }) {
  const [hasModel, setHasModel] = useState(false);

  useEffect(() => {
    fetch('/models/f1-car.glb', { method: 'HEAD' })
      .then(response => {
        setHasModel(response.ok);
      })
      .catch(() => {
        setHasModel(false);
      });
  }, []);

  if (hasModel) {
    return (
      <Suspense fallback={<DetailedF1Car />}>
        <RealF1Car teamColor={teamColor} />
      </Suspense>
    );
  }

  return <DetailedF1Car />;
}

interface F1HeroSceneProps {
  teamColor?: string;
}

export default function F1HeroScene({ teamColor = "#dc2626" }: F1HeroSceneProps) {
  return (
    <div className="relative w-full h-[600px] overflow-hidden bg-gradient-to-b from-zinc-900 via-zinc-950 to-zinc-950">
      <Canvas
        camera={{ position: [5, 2.5, 5], fov: 45 }}
        dpr={[1, 2]}
        shadows
      >
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
        
        <F1CarModel teamColor={teamColor} />
        
        {/* Reflective ground plane */}
        <mesh 
          rotation={[-Math.PI / 2, 0, 0]} 
          position={[0, -0.5, 0]} 
          receiveShadow
        >
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
      <div className="absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-zinc-950 via-zinc-950/50 to-transparent pointer-events-none" />
      <div className="absolute inset-x-0 top-0 h-40 bg-gradient-to-b from-zinc-900/50 to-transparent pointer-events-none" />
      
      {/* Text overlay */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <div className="text-center px-4">
          <h2 className="text-6xl md:text-7xl font-bold text-white mb-3 drop-shadow-2xl">
            <span className="text-f1-red">F1</span> Briefing Agent
          </h2>
          <p className="text-xl md:text-2xl text-zinc-300 drop-shadow-lg">
            AI-Powered Race Weekend Analysis
          </p>
        </div>
      </div>
      
      {/* Subtle vignette */}
      <div className="absolute inset-0 pointer-events-none" 
           style={{
             background: 'radial-gradient(circle at center, transparent 0%, rgba(0,0,0,0.3) 100%)'
           }} 
      />
    </div>
  );
}

export { F1HeroScene };

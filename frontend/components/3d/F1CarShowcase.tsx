'use client';

import { Suspense, useState, useRef, useEffect } from 'react';
import { Canvas, useFrame, useLoader } from '@react-three/fiber';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader';
import * as THREE from 'three';

const teamColors = {
  redbull: "#1e41ff",
  ferrari: "#dc0000",
  mercedes: "#00d2be",
  mclaren: "#ff8700",
  astonmartin: "#006f62",
  alpine: "#0090ff",
  williams: "#005aff",
  haas: "#ffffff",
  sauber: "#52e252",
  rb: "#2b4562",
};

type TeamName = keyof typeof teamColors;

function RealShowcaseCar({ teamColor }: { teamColor: string }) {
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
      groupRef.current.rotation.y += delta * 0.15;
    }
  });

  return (
    <group ref={groupRef}>
      <primitive object={clonedScene} scale={2} position={[0, 0, 0]} />
    </group>
  );
}

function DetailedShowcaseCar({ teamColor }: { teamColor: string }) {
  const groupRef = useRef<THREE.Group>(null);

  useFrame((state, delta) => {
    if (groupRef.current) {
      groupRef.current.rotation.y += delta * 0.15;
    }
  });

  return (
    <group ref={groupRef}>
      {/* Main body */}
      <mesh castShadow>
        <boxGeometry args={[1.2, 0.25, 3.5]} />
        <meshStandardMaterial 
          color={teamColor} 
          metalness={0.9} 
          roughness={0.15}
        />
      </mesh>
      
      {/* Nose cone */}
      <mesh castShadow position={[0, 0, 2]}>
        <coneGeometry args={[0.3, 0.8, 4]} />
        <meshStandardMaterial 
          color={teamColor} 
          metalness={0.9} 
          roughness={0.15}
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
      
      {/* Rear wing main */}
      <mesh castShadow position={[0, 0.5, -1.8]}>
        <boxGeometry args={[1.6, 0.05, 0.6]} />
        <meshStandardMaterial 
          color="#1a1a1a" 
          metalness={0.8} 
          roughness={0.2}
        />
      </mesh>
      
      {/* Rear wing upper */}
      <mesh castShadow position={[0, 0.7, -1.8]}>
        <boxGeometry args={[1.6, 0.05, 0.5]} />
        <meshStandardMaterial 
          color="#1a1a1a" 
          metalness={0.8} 
          roughness={0.2}
        />
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
        <meshStandardMaterial 
          color={teamColor} 
          metalness={0.85} 
          roughness={0.2}
        />
      </mesh>
      <mesh castShadow position={[0.5, 0, 0]}>
        <boxGeometry args={[0.3, 0.3, 1.8]} />
        <meshStandardMaterial 
          color={teamColor} 
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
      
      {/* Rear wheels */}
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
          emissiveIntensity={0.3}
        />
      </mesh>
      <mesh castShadow position={[-0.15, 0.1, -1.6]}>
        <cylinderGeometry args={[0.05, 0.05, 0.3, 12]} />
        <meshStandardMaterial 
          color="#444444" 
          metalness={1} 
          roughness={0.3}
          emissive="#ff4400"
          emissiveIntensity={0.3}
        />
      </mesh>
    </group>
  );
}

function ShowcaseCarModel({ teamColor }: { teamColor: string }) {
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
      <Suspense fallback={<DetailedShowcaseCar teamColor={teamColor} />}>
        <RealShowcaseCar teamColor={teamColor} />
      </Suspense>
    );
  }

  return <DetailedShowcaseCar teamColor={teamColor} />;
}

export default function F1CarShowcase() {
  const [selectedTeam, setSelectedTeam] = useState<TeamName>('ferrari');

  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      <div className="container mx-auto px-4 py-8">
        <div className="mb-4">
          <a 
            href="/" 
            className="text-zinc-400 hover:text-white transition-colors inline-flex items-center gap-2"
          >
            ← Back to Briefing Agent
          </a>
        </div>
        
        <h1 className="text-4xl md:text-5xl font-bold mb-2 text-center">
          <span className="text-f1-red">F1</span> Car Showcase
        </h1>
        <p className="text-zinc-400 text-center mb-8 text-lg">
          Explore all 10 team liveries in 3D
        </p>

        <div className="h-[70vh] mb-8 bg-gradient-to-b from-zinc-900 to-zinc-950 rounded-xl overflow-hidden shadow-2xl border border-zinc-800">
          <Canvas
            camera={{ position: [5, 2.5, 5], fov: 50 }}
            dpr={[1, 2]}
            shadows
          >
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
            <spotLight
              position={[0, 8, 8]}
              angle={0.3}
              penumbra={1}
              intensity={1}
              castShadow
            />

            <Suspense fallback={null}>
              <ShowcaseCarModel teamColor={teamColors[selectedTeam]} />
              
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
                />
              </mesh>
              
              <gridHelper args={[20, 20, '#1a1a1a', '#0d0d0d']} position={[0, -0.49, 0]} />
            </Suspense>
          </Canvas>
        </div>

        <div className="max-w-5xl mx-auto">
          <h3 className="text-2xl font-semibold mb-6 text-center">Select Team Livery</h3>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            {Object.entries(teamColors).map(([team, color]) => (
              <button
                key={team}
                onClick={() => setSelectedTeam(team as TeamName)}
                className={`
                  px-4 py-4 rounded-xl border-2 transition-all duration-300 capitalize font-semibold
                  ${selectedTeam === team
                    ? 'border-f1-red bg-zinc-800 scale-105 shadow-lg'
                    : 'border-zinc-700 bg-zinc-900 hover:border-zinc-600 hover:scale-102'
                  }
                `}
                style={{
                  boxShadow: selectedTeam === team ? `0 0 30px ${color}50` : 'none'
                }}
              >
                <div
                  className="w-full h-12 rounded-lg mb-3 shadow-inner"
                  style={{ backgroundColor: color }}
                />
                <span className="text-sm">
                  {team.replace(/([A-Z])/g, ' $1').trim()}
                </span>
              </button>
            ))}
          </div>
        </div>
        
        <div className="mt-12 text-center">
          <a 
            href="/credits" 
            className="text-zinc-500 hover:text-zinc-300 transition-colors text-sm"
          >
            View Credits & Attributions
          </a>
        </div>
      </div>
    </div>
  );
}

export { F1CarShowcase };

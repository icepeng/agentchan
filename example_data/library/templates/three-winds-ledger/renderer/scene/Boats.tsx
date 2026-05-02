import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";

interface BoatsProps {
  isStreaming: boolean;
}

interface BoatSpec {
  x: number;
  z: number;
  rotation: number;
  scale: number;
  bobPhase: number;
  bobSpeed: number;
  hasSail: boolean;
}

export function Boats({ isStreaming }: BoatsProps) {
  const boats = useMemo<BoatSpec[]>(
    () => [
      { x: -7, z: -3, rotation: 0.3, scale: 1.0, bobPhase: 0, bobSpeed: 0.7, hasSail: true },
      { x: -2.5, z: -5, rotation: -0.15, scale: 1.2, bobPhase: 1.4, bobSpeed: 0.9, hasSail: false },
      { x: 4.2, z: -2.5, rotation: 0.6, scale: 0.9, bobPhase: 2.7, bobSpeed: 0.6, hasSail: true },
      { x: 8.5, z: -6, rotation: -0.4, scale: 1.1, bobPhase: 3.6, bobSpeed: 0.8, hasSail: false },
      { x: 0.5, z: -10, rotation: 0.0, scale: 1.5, bobPhase: 4.2, bobSpeed: 0.5, hasSail: true },
    ],
    [],
  );

  return (
    <group>
      {boats.map((boat, i) => (
        <Boat key={i} spec={boat} isStreaming={isStreaming} />
      ))}
    </group>
  );
}

interface BoatProps {
  spec: BoatSpec;
  isStreaming: boolean;
}

function Boat({ spec, isStreaming }: BoatProps) {
  const groupRef = useRef<THREE.Group>(null);
  const sailRef = useRef<THREE.Mesh>(null);
  const lanternRef = useRef<THREE.PointLight>(null);
  const flickerSeed = useMemo(() => Math.random() * 100, []);

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();
    if (groupRef.current) {
      groupRef.current.position.y = -0.55 + Math.sin(t * spec.bobSpeed + spec.bobPhase) * 0.06;
      groupRef.current.rotation.z = Math.sin(t * spec.bobSpeed * 0.6 + spec.bobPhase) * 0.04;
    }
    if (sailRef.current) {
      const wind = isStreaming ? 0.18 : 0.08;
      sailRef.current.scale.x = 1 + Math.sin(t * 1.4 + spec.bobPhase) * wind * 0.3;
    }
    if (lanternRef.current) {
      const flicker =
        Math.sin(t * 9 + flickerSeed) * 0.15 +
        Math.sin(t * 23 + flickerSeed * 1.7) * 0.1 +
        Math.sin(t * 47 + flickerSeed * 0.7) * 0.05;
      lanternRef.current.intensity = 1.2 + flicker;
    }
  });

  const hullColor = "#0e0805";
  const mastColor = "#1a0f08";
  const sailColor = "#3a2c1a";
  const brassColor = "#b6822a";

  return (
    <group ref={groupRef} position={[spec.x, -0.55, spec.z]} rotation={[0, spec.rotation, 0]} scale={spec.scale}>
      {/* hull */}
      <group position={[0, 0.15, 0]}>
        <mesh>
          <boxGeometry args={[1.6, 0.32, 0.5]} />
          <meshStandardMaterial color={hullColor} roughness={1} />
        </mesh>
        <mesh position={[0.85, 0.05, 0]} rotation={[0, 0, 0.3]}>
          <boxGeometry args={[0.6, 0.32, 0.5]} />
          <meshStandardMaterial color={hullColor} roughness={1} />
        </mesh>
        <mesh position={[-0.85, 0.05, 0]} rotation={[0, 0, -0.3]}>
          <boxGeometry args={[0.6, 0.32, 0.5]} />
          <meshStandardMaterial color={hullColor} roughness={1} />
        </mesh>
      </group>
      {/* mast */}
      {spec.hasSail && (
        <>
          <mesh position={[0, 1.1, 0]}>
            <cylinderGeometry args={[0.025, 0.03, 1.8, 6]} />
            <meshStandardMaterial color={mastColor} roughness={1} />
          </mesh>
          {/* sail */}
          <mesh ref={sailRef} position={[0, 1.2, 0.02]}>
            <planeGeometry args={[0.8, 1.2, 4, 1]} />
            <meshStandardMaterial color={sailColor} roughness={1} side={THREE.DoubleSide} />
          </mesh>
        </>
      )}
      {/* lantern: hung at bow */}
      <group position={[0.7, 0.7, 0.05]}>
        <mesh>
          <boxGeometry args={[0.1, 0.13, 0.1]} />
          <meshStandardMaterial color={brassColor} emissive={brassColor} emissiveIntensity={1.4} roughness={0.4} metalness={0.7} />
        </mesh>
        <mesh position={[0, 0.1, 0]}>
          <boxGeometry args={[0.04, 0.05, 0.04]} />
          <meshStandardMaterial color="#3a2510" roughness={1} />
        </mesh>
        <pointLight
          ref={lanternRef}
          position={[0, 0, 0]}
          intensity={1.2}
          color="#d8a565"
          distance={6}
          decay={1.6}
        />
      </group>
    </group>
  );
}

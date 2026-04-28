import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";
import type { WorldMode } from "../data/types";

interface LanternsProps {
  worldMode: WorldMode;
  bellPulse: number;
}

interface LanternSpec {
  x: number;
  y: number;
  z: number;
  swing: number;
  flickerSeed: number;
}

export function Lanterns({ worldMode, bellPulse }: LanternsProps) {
  const lanterns = useMemo<LanternSpec[]>(
    () => [
      { x: -8, y: 1.1, z: 5.6, swing: 0.6, flickerSeed: 1.2 },
      { x: -4.2, y: 1.1, z: 5.6, swing: 0.7, flickerSeed: 2.7 },
      { x: 0, y: 1.4, z: 5.6, swing: 0.5, flickerSeed: 3.9 },
      { x: 4.2, y: 1.1, z: 5.6, swing: 0.8, flickerSeed: 4.1 },
      { x: 8, y: 1.1, z: 5.6, swing: 0.6, flickerSeed: 5.3 },
      { x: -10, y: 2.2, z: -1, swing: 0.9, flickerSeed: 6.6 },
      { x: 9.5, y: 2.0, z: -1, swing: 0.8, flickerSeed: 7.4 },
    ],
    [],
  );

  return (
    <group>
      {lanterns.map((spec, i) => (
        <Lantern key={i} spec={spec} worldMode={worldMode} bellPulse={bellPulse} />
      ))}
    </group>
  );
}

interface LanternProps {
  spec: LanternSpec;
  worldMode: WorldMode;
  bellPulse: number;
}

function Lantern({ spec, worldMode, bellPulse }: LanternProps) {
  const groupRef = useRef<THREE.Group>(null);
  const lightRef = useRef<THREE.PointLight>(null);
  const glowRef = useRef<THREE.MeshBasicMaterial>(null);
  const lastPulse = useRef(bellPulse);
  const burst = useRef(0);

  useFrame(({ clock }, delta) => {
    if (lastPulse.current !== bellPulse) {
      burst.current = 1;
      lastPulse.current = bellPulse;
    }
    burst.current = Math.max(0, burst.current - delta * 1.4);
    const t = clock.getElapsedTime();

    if (groupRef.current) {
      const sway = Math.sin(t * spec.swing + spec.flickerSeed) * 0.06;
      groupRef.current.rotation.z = sway;
    }
    const flickerStrength = worldMode === "combat" ? 0.5 : 0.25;
    const flicker =
      Math.sin(t * 11 + spec.flickerSeed) * flickerStrength * 0.5 +
      Math.sin(t * 27 + spec.flickerSeed * 1.7) * flickerStrength * 0.3;
    if (lightRef.current) {
      lightRef.current.intensity = (worldMode === "combat" ? 1.6 : 1.0) + flicker + burst.current * 4;
    }
    if (glowRef.current) {
      glowRef.current.opacity = 0.6 + Math.abs(flicker) * 0.4 + burst.current * 0.4;
    }
  });

  const brass = "#b6822a";
  const glow = worldMode === "combat" ? "#e87a3a" : "#e8b56a";

  return (
    <group ref={groupRef} position={[spec.x, spec.y, spec.z]}>
      {/* hanging chain */}
      <mesh position={[0, 0.4, 0]}>
        <cylinderGeometry args={[0.005, 0.005, 0.8, 4]} />
        <meshBasicMaterial color="#1a1008" />
      </mesh>
      {/* lantern body */}
      <mesh position={[0, -0.1, 0]}>
        <boxGeometry args={[0.18, 0.24, 0.18]} />
        <meshStandardMaterial color={brass} emissive={glow} emissiveIntensity={1.6} roughness={0.4} metalness={0.7} />
      </mesh>
      {/* roof */}
      <mesh position={[0, 0.06, 0]}>
        <coneGeometry args={[0.14, 0.1, 4]} />
        <meshStandardMaterial color={brass} roughness={0.5} metalness={0.7} />
      </mesh>
      {/* halo sprite */}
      <mesh position={[0, -0.1, 0]}>
        <sphereGeometry args={[0.32, 12, 12]} />
        <meshBasicMaterial
          ref={glowRef}
          color={glow}
          transparent
          opacity={0.6}
          depthWrite={false}
          toneMapped={false}
        />
      </mesh>
      <pointLight
        ref={lightRef}
        position={[0, -0.05, 0]}
        intensity={1.0}
        color={glow}
        distance={5.5}
        decay={1.5}
      />
    </group>
  );
}

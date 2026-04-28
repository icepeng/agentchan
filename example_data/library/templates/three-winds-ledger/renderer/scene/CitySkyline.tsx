import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";
import type { WorldMode } from "../data/types";

interface CitySkylineProps {
  worldMode: WorldMode;
  bellPulse: number;
}

interface Building {
  x: number;
  z: number;
  width: number;
  depth: number;
  height: number;
  windowCount: number;
  windowSeed: number;
  pitched: boolean;
}

export function CitySkyline({ worldMode, bellPulse }: CitySkylineProps) {
  const buildings = useMemo<Building[]>(() => {
    const rng = mulberry32(7);
    const list: Building[] = [];
    for (let i = -22; i <= 22; i += 1) {
      const skip = rng() < 0.18;
      if (skip) continue;
      const z = -28 + (rng() - 0.5) * 4;
      const width = 1.6 + rng() * 2.6;
      const depth = 1.4 + rng() * 1.8;
      const height = 2.2 + rng() * 4.6;
      list.push({
        x: i * 1.7,
        z,
        width,
        depth,
        height,
        windowCount: Math.floor(2 + rng() * 6),
        windowSeed: rng(),
        pitched: rng() < 0.4,
      });
    }
    return list;
  }, []);

  return (
    <group>
      {buildings.map((b, i) => (
        <BuildingMesh key={i} building={b} worldMode={worldMode} />
      ))}
      <BellTower worldMode={worldMode} bellPulse={bellPulse} />
    </group>
  );
}

interface BuildingMeshProps {
  building: Building;
  worldMode: WorldMode;
}

function BuildingMesh({ building, worldMode }: BuildingMeshProps) {
  const { x, z, width, depth, height, windowCount, windowSeed, pitched } = building;
  const wallColor = worldMode === "combat" ? "#1c0a0a" : "#0a1018";
  const windowColor = worldMode === "combat" ? "#d8704a" : "#d8a565";

  const windows = useMemo(() => {
    const rng = mulberry32(Math.floor(windowSeed * 1e6));
    return Array.from({ length: windowCount }, (_, i) => {
      const lit = rng() < 0.7;
      const yFrac = 0.25 + rng() * 0.6;
      const xFrac = (rng() - 0.5) * 0.7;
      return { i, lit, yFrac, xFrac };
    });
  }, [windowCount, windowSeed]);

  return (
    <group position={[x, height / 2, z]}>
      <mesh>
        <boxGeometry args={[width, height, depth]} />
        <meshStandardMaterial color={wallColor} roughness={1} metalness={0} />
      </mesh>
      {pitched && (
        <mesh position={[0, height / 2 + 0.4, 0]}>
          <coneGeometry args={[Math.max(width, depth) * 0.7, 0.9, 4]} />
          <meshStandardMaterial color={wallColor} roughness={1} />
        </mesh>
      )}
      {windows.filter((w) => w.lit).map((w) => (
        <mesh
          key={w.i}
          position={[w.xFrac * width, (w.yFrac - 0.5) * height, depth / 2 + 0.01]}
        >
          <planeGeometry args={[0.18, 0.22]} />
          <meshBasicMaterial color={windowColor} toneMapped={false} />
        </mesh>
      ))}
    </group>
  );
}

interface BellTowerProps {
  worldMode: WorldMode;
  bellPulse: number;
}

function BellTower({ worldMode, bellPulse }: BellTowerProps) {
  const bellRef = useRef<THREE.Mesh>(null);
  const ringRef = useRef<THREE.Mesh>(null);
  const lightRef = useRef<THREE.PointLight>(null);
  const lastPulse = useRef(bellPulse);
  const pulseT = useRef(0);
  const ringMatRef = useRef<THREE.MeshBasicMaterial>(null);

  useFrame((_, delta) => {
    if (lastPulse.current !== bellPulse) {
      pulseT.current = 1;
      lastPulse.current = bellPulse;
    }
    pulseT.current = Math.max(0, pulseT.current - delta * 0.7);
    const t = pulseT.current;

    if (bellRef.current) {
      bellRef.current.rotation.z = Math.sin(t * 12) * t * 0.18;
    }
    if (lightRef.current) {
      lightRef.current.intensity = 0.5 + t * 6;
    }
    if (ringRef.current && ringMatRef.current) {
      const scale = 1 + (1 - t) * 6;
      ringRef.current.scale.set(scale, scale, scale);
      ringMatRef.current.opacity = t * 0.5;
    }
  });

  const stoneColor = worldMode === "combat" ? "#1f0c0c" : "#0c1320";
  const brassColor = "#b6822a";

  return (
    <group position={[2.4, 0, -28]}>
      <mesh position={[0, 4.5, 0]}>
        <boxGeometry args={[2.2, 9, 2.2]} />
        <meshStandardMaterial color={stoneColor} roughness={1} />
      </mesh>
      <mesh position={[0, 9.6, 0]}>
        <boxGeometry args={[2.6, 1.4, 2.6]} />
        <meshStandardMaterial color={stoneColor} roughness={1} />
      </mesh>
      <mesh position={[0, 11, 0]}>
        <coneGeometry args={[1.9, 1.6, 4]} />
        <meshStandardMaterial color={stoneColor} roughness={1} />
      </mesh>
      <mesh ref={bellRef} position={[0, 9.6, 1.31]}>
        <coneGeometry args={[0.55, 0.9, 12, 1, true]} />
        <meshStandardMaterial color={brassColor} emissive={brassColor} emissiveIntensity={0.4} roughness={0.4} metalness={0.8} />
      </mesh>
      <pointLight
        ref={lightRef}
        position={[0, 9.6, 1.4]}
        intensity={0.5}
        color={brassColor}
        distance={18}
        decay={1.4}
      />
      <mesh ref={ringRef} position={[0, 9.6, 1.4]} renderOrder={2}>
        <torusGeometry args={[0.6, 0.04, 8, 32]} />
        <meshBasicMaterial
          ref={ringMatRef}
          color={brassColor}
          transparent
          opacity={0}
          toneMapped={false}
          depthWrite={false}
        />
      </mesh>
    </group>
  );
}

function mulberry32(seed: number) {
  let a = seed | 0;
  return function () {
    a = (a + 0x6d2b79f5) | 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

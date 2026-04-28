import { Canvas } from "@react-three/fiber";
import { Suspense } from "react";
import * as THREE from "three";
import type { WindBalance, WorldMode } from "../data/types";
import { Atmosphere } from "./Atmosphere";
import { Boats } from "./Boats";
import { CitySkyline } from "./CitySkyline";
import { Lanterns } from "./Lanterns";
import { Pier } from "./Pier";
import { PostFX } from "./PostFX";
import { Sky } from "./Sky";
import { WeatherVanes } from "./WeatherVanes";
import { CameraRig } from "./CameraRig";

interface HarborSceneProps {
  windBalance: WindBalance;
  worldMode: WorldMode;
  isStreaming: boolean;
  bellPulse: number;
  act: number;
}

export function HarborScene({
  windBalance,
  worldMode,
  isStreaming,
  bellPulse,
  act,
}: HarborSceneProps) {
  const fogTint = worldMode === "combat" ? "#3a141a" : "#0d1620";
  return (
    <Canvas
      className="tw-canvas"
      gl={{
        antialias: true,
        alpha: false,
        powerPreference: "high-performance",
        toneMapping: THREE.ACESFilmicToneMapping,
        toneMappingExposure: worldMode === "combat" ? 0.85 : 0.65,
      }}
      camera={{ position: [0, 1.7, 9], fov: 38, near: 0.1, far: 200 }}
      dpr={[1, 1.6]}
    >
      <color attach="background" args={[fogTint]} />
      <fog attach="fog" args={[fogTint, 12, worldMode === "combat" ? 32 : 42]} />

      <ambientLight intensity={0.18} color={worldMode === "combat" ? "#5a2828" : "#3a4658"} />
      <hemisphereLight
        args={[worldMode === "combat" ? "#5a2828" : "#3a4658", "#06080a", 0.35]}
      />
      <directionalLight
        position={[-12, 14, -6]}
        intensity={worldMode === "combat" ? 0.45 : 0.22}
        color={worldMode === "combat" ? "#a83a2a" : "#6a7a98"}
      />

      <Suspense fallback={null}>
        <Sky worldMode={worldMode} />
        <CitySkyline worldMode={worldMode} bellPulse={bellPulse} />
        <WeatherVanes balance={windBalance} />
        <Boats isStreaming={isStreaming} />
        <Lanterns bellPulse={bellPulse} worldMode={worldMode} />
        <Pier act={act} bellPulse={bellPulse} />
        <Atmosphere worldMode={worldMode} isStreaming={isStreaming} />
      </Suspense>

      <CameraRig act={act} bellPulse={bellPulse} />
      <PostFX worldMode={worldMode} />
    </Canvas>
  );
}

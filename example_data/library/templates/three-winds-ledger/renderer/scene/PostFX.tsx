import {
  Bloom,
  ChromaticAberration,
  EffectComposer,
  Noise,
  Vignette,
} from "@react-three/postprocessing";
import { BlendFunction } from "postprocessing";
import * as THREE from "three";
import { useMemo } from "react";
import type { WorldMode } from "../data/types";

interface PostFXProps {
  worldMode: WorldMode;
}

export function PostFX({ worldMode }: PostFXProps) {
  const caOffset = useMemo<THREE.Vector2>(() => new THREE.Vector2(0.0006, 0.0006), []);
  return (
    <EffectComposer multisampling={0}>
      <Bloom
        intensity={worldMode === "combat" ? 0.95 : 0.7}
        luminanceThreshold={0.32}
        luminanceSmoothing={0.6}
        mipmapBlur
        radius={0.7}
      />
      <ChromaticAberration
        blendFunction={BlendFunction.NORMAL}
        offset={caOffset}
        radialModulation={false}
        modulationOffset={0}
      />
      <Noise opacity={0.06} blendFunction={BlendFunction.OVERLAY} />
      <Vignette
        offset={0.18}
        darkness={worldMode === "combat" ? 0.95 : 0.78}
        eskil={false}
      />
    </EffectComposer>
  );
}

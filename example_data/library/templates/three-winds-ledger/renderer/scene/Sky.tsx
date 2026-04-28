import { useMemo } from "react";
import * as THREE from "three";
import type { WorldMode } from "../data/types";

interface SkyProps {
  worldMode: WorldMode;
}

export function Sky({ worldMode }: SkyProps) {
  const material = useMemo(() => {
    const top = worldMode === "combat" ? new THREE.Color("#1a060a") : new THREE.Color("#0a1426");
    const mid = worldMode === "combat" ? new THREE.Color("#3a141a") : new THREE.Color("#1c2638");
    const bottom = worldMode === "combat" ? new THREE.Color("#5a2a18") : new THREE.Color("#2c3848");
    return new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      uniforms: {
        uTop: { value: top },
        uMid: { value: mid },
        uBottom: { value: bottom },
      },
      vertexShader: /* glsl */ `
        varying vec3 vWorldPos;
        void main() {
          vec4 wp = modelMatrix * vec4(position, 1.0);
          vWorldPos = wp.xyz;
          gl_Position = projectionMatrix * viewMatrix * wp;
        }
      `,
      fragmentShader: /* glsl */ `
        uniform vec3 uTop;
        uniform vec3 uMid;
        uniform vec3 uBottom;
        varying vec3 vWorldPos;
        void main() {
          float h = clamp(normalize(vWorldPos).y * 0.5 + 0.5, 0.0, 1.0);
          vec3 col = mix(uBottom, uMid, smoothstep(0.0, 0.55, h));
          col = mix(col, uTop, smoothstep(0.55, 1.0, h));
          gl_FragColor = vec4(col, 1.0);
        }
      `,
    });
  }, [worldMode]);

  return (
    <mesh scale={[120, 120, 120]} renderOrder={-100}>
      <sphereGeometry args={[1, 32, 16]} />
      <primitive object={material} attach="material" />
    </mesh>
  );
}

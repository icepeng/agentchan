import { Sparkles } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";
import type { WorldMode } from "../data/types";

interface AtmosphereProps {
  worldMode: WorldMode;
  isStreaming: boolean;
}

export function Atmosphere({ worldMode, isStreaming }: AtmosphereProps) {
  return (
    <group>
      <FogPlanes worldMode={worldMode} isStreaming={isStreaming} />
      <Rain worldMode={worldMode} />
      <Sparkles
        count={120}
        size={1.6}
        speed={0.18}
        opacity={0.55}
        scale={[26, 8, 18]}
        position={[0, 2, -2]}
        color={worldMode === "combat" ? "#d8704a" : "#d8a565"}
      />
      <Sparkles
        count={40}
        size={2.6}
        speed={0.3}
        opacity={0.35}
        scale={[18, 5, 12]}
        position={[0, 1, 2]}
        color={worldMode === "combat" ? "#a83a2a" : "#7a8aa3"}
      />
    </group>
  );
}

const FOG_VERTEX = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const FOG_FRAGMENT = /* glsl */ `
  uniform float uTime;
  uniform vec3 uTint;
  uniform float uIntensity;
  uniform float uOffset;
  varying vec2 vUv;

  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float noise(vec2 p) {
    vec2 i = floor(p); vec2 f = fract(p);
    float a = hash(i);
    float b = hash(i + vec2(1.0, 0.0));
    float c = hash(i + vec2(0.0, 1.0));
    float d = hash(i + vec2(1.0, 1.0));
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
  }
  float fbm(vec2 p) {
    float v = 0.0;
    float a = 0.5;
    for (int i = 0; i < 5; i++) {
      v += a * noise(p);
      p *= 2.05;
      a *= 0.55;
    }
    return v;
  }
  void main() {
    vec2 uv = vUv * vec2(3.0, 1.4);
    uv.x += uTime * 0.04 + uOffset;
    float n = fbm(uv);
    float vertical = smoothstep(0.0, 0.35, vUv.y) * smoothstep(1.0, 0.65, vUv.y);
    float alpha = pow(n, 1.4) * vertical * uIntensity;
    gl_FragColor = vec4(uTint, alpha);
  }
`;

interface FogPlanesProps {
  worldMode: WorldMode;
  isStreaming: boolean;
}

function FogPlanes({ worldMode, isStreaming }: FogPlanesProps) {
  const targetIntensity = useRef(0.5);

  const layers = useMemo(() => {
    return Array.from({ length: 6 }, (_, i) => ({
      z: -4 - i * 4,
      offset: i * 1.7,
      width: 36 + i * 4,
      height: 8 + i * 0.6,
    }));
  }, []);

  const tint = useMemo(
    () => new THREE.Color(worldMode === "combat" ? "#3a1a1a" : "#23303f"),
    [worldMode],
  );

  const materials = useMemo(() => {
    return layers.map(
      (layer) =>
        new THREE.ShaderMaterial({
          transparent: true,
          depthWrite: false,
          side: THREE.DoubleSide,
          uniforms: {
            uTime: { value: 0 },
            uTint: { value: tint.clone() },
            uIntensity: { value: 0.5 },
            uOffset: { value: layer.offset },
          },
          vertexShader: FOG_VERTEX,
          fragmentShader: FOG_FRAGMENT,
        }),
    );
  }, [layers, tint]);

  useFrame((_, delta) => {
    const t = isStreaming ? 0.9 : 0.55;
    targetIntensity.current += (t - targetIntensity.current) * Math.min(1, delta * 0.8);
    for (const mat of materials) {
      mat.uniforms.uTime.value += delta;
      mat.uniforms.uIntensity.value = targetIntensity.current;
      (mat.uniforms.uTint.value as THREE.Color).copy(tint);
    }
  });

  return (
    <group>
      {layers.map((layer, i) => (
        <mesh key={i} position={[0, 1.4, layer.z]} renderOrder={5 + i}>
          <planeGeometry args={[layer.width, layer.height, 1, 1]} />
          <primitive object={materials[i]} attach="material" />
        </mesh>
      ))}
    </group>
  );
}

interface RainProps {
  worldMode: WorldMode;
}

function Rain({ worldMode }: RainProps) {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const count = worldMode === "combat" ? 1200 : 500;

  const drops = useMemo(() => {
    return Array.from({ length: count }, () => ({
      x: (Math.random() - 0.5) * 60,
      y: Math.random() * 18,
      z: (Math.random() - 0.5) * 36 - 6,
      speed: 14 + Math.random() * 10,
      length: 0.5 + Math.random() * 0.6,
    }));
  }, [count]);

  const dummy = useMemo(() => new THREE.Object3D(), []);

  useFrame((_, delta) => {
    if (!meshRef.current) return;
    for (let i = 0; i < drops.length; i++) {
      const d = drops[i];
      d.y -= d.speed * delta;
      if (d.y < -1) {
        d.y = 18 + Math.random() * 4;
        d.x = (Math.random() - 0.5) * 60;
      }
      dummy.position.set(d.x, d.y, d.z);
      dummy.scale.set(1, d.length, 1);
      dummy.updateMatrix();
      meshRef.current.setMatrixAt(i, dummy.matrix);
    }
    meshRef.current.instanceMatrix.needsUpdate = true;
  });

  return (
    <instancedMesh
      ref={meshRef}
      args={[undefined, undefined, count]}
      frustumCulled={false}
    >
      <cylinderGeometry args={[0.012, 0.012, 1, 4, 1, true]} />
      <meshBasicMaterial
        color={worldMode === "combat" ? "#a86060" : "#7a90b0"}
        transparent
        opacity={0.32}
        depthWrite={false}
      />
    </instancedMesh>
  );
}

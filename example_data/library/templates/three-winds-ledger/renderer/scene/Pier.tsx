import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";

interface PierProps {
  act: number;
  bellPulse: number;
}

export function Pier({ act, bellPulse }: PierProps) {
  return (
    <group position={[0, 0, 6.4]}>
      <PierDeck />
      <PierRailing />
      <LedgerFragments act={act} bellPulse={bellPulse} />
      <Water />
    </group>
  );
}

function PierDeck() {
  return (
    <group position={[0, -0.4, -0.4]}>
      <mesh receiveShadow>
        <boxGeometry args={[18, 0.18, 2.6]} />
        <meshStandardMaterial color="#1a1209" roughness={1} />
      </mesh>
      {Array.from({ length: 24 }, (_, i) => (
        <mesh key={i} position={[-9 + i * 0.78, 0.095, 0]}>
          <boxGeometry args={[0.04, 0.005, 2.6]} />
          <meshBasicMaterial color="#0a0604" />
        </mesh>
      ))}
    </group>
  );
}

function PierRailing() {
  const posts = useMemo(() => {
    return Array.from({ length: 11 }, (_, i) => -8.5 + i * 1.7);
  }, []);
  return (
    <group position={[0, 0, 0.6]}>
      {posts.map((x) => (
        <mesh key={x} position={[x, 0.1, 0]}>
          <cylinderGeometry args={[0.06, 0.07, 1.2, 8]} />
          <meshStandardMaterial color="#0f0a07" roughness={1} />
        </mesh>
      ))}
      <mesh position={[0, 0.55, 0]}>
        <boxGeometry args={[18, 0.07, 0.1]} />
        <meshStandardMaterial color="#1a1209" roughness={1} />
      </mesh>
      <mesh position={[0, 0.18, 0]}>
        <boxGeometry args={[18, 0.05, 0.07]} />
        <meshStandardMaterial color="#1a1209" roughness={1} />
      </mesh>
    </group>
  );
}

interface LedgerFragmentsProps {
  act: number;
  bellPulse: number;
}

function LedgerFragments({ act, bellPulse }: LedgerFragmentsProps) {
  const fragments = useMemo(() => {
    const count = Math.min(8, 3 + act * 2);
    return Array.from({ length: count }, (_, i) => ({
      x: -7 + i * 1.9 + (Math.sin(i * 7.3) * 0.4),
      y: 0.05 + Math.random() * 0.08,
      z: 0.62,
      rot: (Math.random() - 0.5) * 0.5,
      tilt: (Math.random() - 0.5) * 0.3,
      width: 0.32 + Math.random() * 0.18,
      height: 0.42 + Math.random() * 0.18,
      phase: Math.random() * Math.PI * 2,
      flutterAmp: 0.04 + Math.random() * 0.06,
    }));
  }, [act]);

  const groupRef = useRef<THREE.Group>(null);
  const pulseT = useRef(0);
  const lastPulse = useRef(bellPulse);

  useFrame(({ clock }, delta) => {
    if (lastPulse.current !== bellPulse) {
      pulseT.current = 1;
      lastPulse.current = bellPulse;
    }
    pulseT.current = Math.max(0, pulseT.current - delta * 0.6);
    const t = clock.getElapsedTime();
    if (!groupRef.current) return;
    groupRef.current.children.forEach((child, i) => {
      const f = fragments[i];
      if (!f) return;
      const flutter = Math.sin(t * 1.6 + f.phase) * f.flutterAmp;
      const burst = pulseT.current * Math.sin(t * 18 + i) * 0.15;
      child.rotation.z = f.rot + flutter + burst;
      child.rotation.x = f.tilt + flutter * 0.4;
    });
  });

  return (
    <group ref={groupRef}>
      {fragments.map((f, i) => (
        <group key={i} position={[f.x, f.y, f.z]} rotation={[f.tilt, 0, f.rot]}>
          <mesh>
            <planeGeometry args={[f.width, f.height]} />
            <meshStandardMaterial
              color="#d8c9a0"
              roughness={1}
              metalness={0}
              side={THREE.DoubleSide}
            />
          </mesh>
          {/* twine attachment */}
          <mesh position={[0, f.height / 2, 0]}>
            <cylinderGeometry args={[0.005, 0.005, 0.2, 4]} />
            <meshBasicMaterial color="#3a2a18" />
          </mesh>
          {/* ink stamp */}
          <mesh position={[0, -f.height / 4, 0.001]}>
            <planeGeometry args={[f.width * 0.4, f.height * 0.08]} />
            <meshBasicMaterial color="#2a1a18" transparent opacity={0.55} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

function Water() {
  const material = useMemo(() => {
    return new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      uniforms: {
        uTime: { value: 0 },
      },
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        uniform float uTime;
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
        void main() {
          vec2 uv = vUv;
          float wave = sin((uv.x + uTime * 0.05) * 26.0) * 0.5 + 0.5;
          float wave2 = sin((uv.x - uTime * 0.03 + uv.y * 4.0) * 18.0) * 0.5 + 0.5;
          float n = noise(uv * vec2(8.0, 22.0) + vec2(0.0, uTime * 0.4));
          float lum = mix(0.04, 0.18, wave * wave2 * n);
          float distance = smoothstep(0.0, 1.0, uv.y);
          vec3 base = mix(vec3(0.04, 0.07, 0.10), vec3(0.10, 0.13, 0.18), distance);
          vec3 col = base + vec3(lum * 0.6, lum * 0.55, lum * 0.4);
          gl_FragColor = vec4(col, 1.0);
        }
      `,
    });
  }, []);

  useFrame((_, delta) => {
    material.uniforms.uTime.value += delta;
  });

  return (
    <mesh position={[0, -0.6, -8]} rotation={[-Math.PI / 2, 0, 0]} renderOrder={-10}>
      <planeGeometry args={[80, 32]} />
      <primitive object={material} attach="material" />
    </mesh>
  );
}

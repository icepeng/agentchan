import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";
import type { WindBalance, WindKey } from "../data/types";

interface WeatherVanesProps {
  balance: WindBalance;
}

interface VaneSpec {
  wind: WindKey;
  position: [number, number, number];
  baseAngle: number;
  scale: number;
}

export function WeatherVanes({ balance }: WeatherVanesProps) {
  const vanes = useMemo<VaneSpec[]>(
    () => [
      { wind: "north", position: [-5, 7.6, -26], baseAngle: 0, scale: 1.0 },
      { wind: "east", position: [4.6, 8.4, -26], baseAngle: Math.PI / 2, scale: 1.1 },
      { wind: "south", position: [-12, 6.8, -26], baseAngle: Math.PI, scale: 0.9 },
    ],
    [],
  );

  return (
    <group>
      {vanes.map((spec) => (
        <Vane key={spec.wind} spec={spec} weight={balance[spec.wind]} dominant={balance.dominant === spec.wind} />
      ))}
    </group>
  );
}

interface VaneProps {
  spec: VaneSpec;
  weight: number;
  dominant: boolean;
}

function Vane({ spec, weight, dominant }: VaneProps) {
  const arrowRef = useRef<THREE.Group>(null);
  const targetRotation = useRef(spec.baseAngle);
  const angularVelocity = useRef(0);

  useFrame((_, delta) => {
    const speed = 0.2 + weight * 1.4 + (dominant ? 0.6 : 0);
    targetRotation.current += speed * delta;
    if (!arrowRef.current) return;
    const stiffness = 18;
    const damping = 4;
    const diff = targetRotation.current - arrowRef.current.rotation.y;
    angularVelocity.current += diff * stiffness * delta;
    angularVelocity.current *= Math.max(0, 1 - damping * delta);
    arrowRef.current.rotation.y += angularVelocity.current * delta;
  });

  const brass = "#b6822a";
  const dark = "#0c0806";

  return (
    <group position={spec.position} scale={spec.scale}>
      {/* spire pole */}
      <mesh>
        <cylinderGeometry args={[0.06, 0.08, 1.6, 6]} />
        <meshStandardMaterial color={dark} roughness={1} />
      </mesh>
      {/* pivot ball */}
      <mesh position={[0, 0.85, 0]}>
        <sphereGeometry args={[0.1, 12, 12]} />
        <meshStandardMaterial color={brass} roughness={0.5} metalness={0.8} emissive={brass} emissiveIntensity={dominant ? 0.6 : 0.18} />
      </mesh>
      {/* cardinal markers */}
      <group position={[0, 0.6, 0]}>
        {[0, Math.PI / 2, Math.PI, -Math.PI / 2].map((rot, i) => (
          <mesh key={i} rotation={[0, rot, 0]}>
            <boxGeometry args={[0.02, 0.04, 0.32]} />
            <meshStandardMaterial color={brass} roughness={0.6} metalness={0.7} />
          </mesh>
        ))}
      </group>
      {/* arrow group */}
      <group ref={arrowRef} position={[0, 0.95, 0]} rotation={[0, spec.baseAngle, 0]}>
        <mesh position={[0, 0, 0.22]} rotation={[Math.PI / 2, 0, 0]}>
          <coneGeometry args={[0.08, 0.24, 4]} />
          <meshStandardMaterial color={brass} roughness={0.45} metalness={0.85} emissive={brass} emissiveIntensity={dominant ? 0.7 : 0.2} />
        </mesh>
        <mesh position={[0, 0, -0.18]} rotation={[-Math.PI / 2, 0, 0]}>
          <coneGeometry args={[0.04, 0.12, 4]} />
          <meshStandardMaterial color={brass} roughness={0.45} metalness={0.85} />
        </mesh>
        <mesh position={[0, 0, 0]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.01, 0.01, 0.4, 4]} />
          <meshStandardMaterial color={brass} roughness={0.6} metalness={0.8} />
        </mesh>
      </group>
    </group>
  );
}

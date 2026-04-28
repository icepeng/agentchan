import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useRef } from "react";
import * as THREE from "three";

interface CameraRigProps {
  act: number;
  bellPulse: number;
}

const ACT_TARGETS: Record<number, [number, number, number]> = {
  1: [0, 1.7, 9.0],
  2: [-0.6, 1.85, 8.4],
  3: [0.4, 2.0, 7.8],
};

export function CameraRig({ act, bellPulse }: CameraRigProps) {
  const camera = useThree((s) => s.camera);
  const target = useRef(new THREE.Vector3(...(ACT_TARGETS[act] ?? ACT_TARGETS[1])));
  const lookAt = useRef(new THREE.Vector3(0, 1.2, -10));
  const pointer = useThree((s) => s.pointer);
  const lastPulse = useRef(bellPulse);
  const shake = useRef(0);

  useEffect(() => {
    const t = ACT_TARGETS[act] ?? ACT_TARGETS[1];
    target.current.set(t[0], t[1], t[2]);
  }, [act]);

  useFrame((_, delta) => {
    if (lastPulse.current !== bellPulse) {
      shake.current = 1;
      lastPulse.current = bellPulse;
    }
    shake.current = Math.max(0, shake.current - delta * 1.6);

    const parallaxX = pointer.x * 0.18;
    const parallaxY = pointer.y * 0.06;
    const shakeOffsetX = (Math.random() - 0.5) * shake.current * 0.04;
    const shakeOffsetY = (Math.random() - 0.5) * shake.current * 0.04;

    const desiredX = target.current.x + parallaxX + shakeOffsetX;
    const desiredY = target.current.y + parallaxY + shakeOffsetY;
    const desiredZ = target.current.z;

    camera.position.x += (desiredX - camera.position.x) * Math.min(1, delta * 2.4);
    camera.position.y += (desiredY - camera.position.y) * Math.min(1, delta * 2.4);
    camera.position.z += (desiredZ - camera.position.z) * Math.min(1, delta * 1.6);

    lookAt.current.set(parallaxX * 1.5, 1.2 + parallaxY * 0.5, -10);
    camera.lookAt(lookAt.current);
  });

  return null;
}

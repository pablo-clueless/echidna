"use client";

import type { ThreeEvent } from "@react-three/fiber";

/** Generic part bodies in metres, sized like common through-hole and SMD packages. No brand artwork. */
type Palette = { body: string; lead: string; accent: string; led: string };

type Props = {
  kind: string;
  palette: Palette;
  highlight: string | null;
  onPointerDown: (e: ThreeEvent<PointerEvent>) => void;
};

const mm = (n: number) => n / 1000;

const Lead = ({ x, length, colour }: { x: number; length: number; colour: string }) => (
  <mesh position={[x, mm(0.4), 0]} rotation={[0, 0, Math.PI / 2]}>
    <cylinderGeometry args={[mm(0.3), mm(0.3), length, 8]} />
    <meshStandardMaterial color={colour} metalness={0.8} roughness={0.3} />
  </mesh>
);

export const PartMesh = ({ kind, palette, highlight, onPointerDown }: Props) => {
  const body = (colour: string) => (
    <meshStandardMaterial color={colour} roughness={0.6} emissive={highlight ?? "#000000"} emissiveIntensity={highlight ? 0.35 : 0} />
  );

  switch (kind) {
    case "resistor":
      return (
        <group onPointerDown={onPointerDown}>
          <Lead x={0} length={mm(10)} colour={palette.lead} />
          <mesh position={[0, mm(1.4), 0]} rotation={[0, 0, Math.PI / 2]} castShadow>
            <capsuleGeometry args={[mm(1.2), mm(4), 4, 12]} />
            {body("#C9A97A")}
          </mesh>
        </group>
      );
    case "capacitor":
      return (
        <mesh position={[0, mm(0.65), 0]} onPointerDown={onPointerDown} castShadow>
          <boxGeometry args={[mm(2), mm(1.25), mm(1.25)]} />
          {body("#B08A5A")}
        </mesh>
      );
    case "led":
      return (
        <group onPointerDown={onPointerDown}>
          <mesh position={[0, mm(3), 0]} castShadow>
            <cylinderGeometry args={[mm(2.5), mm(2.5), mm(5.4), 24]} />
            <meshStandardMaterial color={palette.led} transparent opacity={0.85} roughness={0.2} emissive={highlight ?? palette.led} emissiveIntensity={highlight ? 0.5 : 0.25} />
          </mesh>
          <mesh position={[0, mm(5.7), 0]} castShadow>
            <sphereGeometry args={[mm(2.5), 24, 12, 0, Math.PI * 2, 0, Math.PI / 2]} />
            <meshStandardMaterial color={palette.led} transparent opacity={0.85} roughness={0.2} emissive={highlight ?? palette.led} emissiveIntensity={highlight ? 0.5 : 0.25} />
          </mesh>
        </group>
      );
    case "regulator":
      return (
        <group onPointerDown={onPointerDown}>
          <mesh position={[0, mm(0.8), 0]} castShadow>
            <boxGeometry args={[mm(6.5), mm(1.6), mm(3.5)]} />
            {body(palette.body)}
          </mesh>
          <mesh position={[0, mm(0.15), mm(-2.6)]}>
            <boxGeometry args={[mm(3), mm(0.3), mm(1.8)]} />
            <meshStandardMaterial color={palette.lead} metalness={0.8} roughness={0.3} />
          </mesh>
          {[-2.3, 0, 2.3].map((x) => (
            <mesh key={x} position={[mm(x), mm(0.15), mm(2.6)]}>
              <boxGeometry args={[mm(0.7), mm(0.3), mm(1.8)]} />
              <meshStandardMaterial color={palette.lead} metalness={0.8} roughness={0.3} />
            </mesh>
          ))}
        </group>
      );
    case "supply":
      return (
        <group onPointerDown={onPointerDown}>
          <mesh position={[0, mm(5), 0]} castShadow>
            <boxGeometry args={[mm(10), mm(10), mm(7.5)]} />
            {body(palette.accent)}
          </mesh>
          {[-2.5, 2.5].map((x) => (
            <mesh key={x} position={[mm(x), mm(10.1), mm(1.5)]}>
              <cylinderGeometry args={[mm(1.2), mm(1.2), mm(0.4), 16]} />
              <meshStandardMaterial color={palette.lead} metalness={0.8} roughness={0.3} />
            </mesh>
          ))}
        </group>
      );
    default:
      return (
        <mesh position={[0, mm(1), 0]} onPointerDown={onPointerDown} castShadow>
          <boxGeometry args={[mm(4), mm(2), mm(4)]} />
          {body(palette.body)}
        </mesh>
      );
  }
};

"use client";

import {
  CanvasTexture,
  CatmullRomCurve3,
  CurvePath,
  DoubleSide,
  ExtrudeGeometry,
  LatheGeometry,
  LineCurve3,
  QuadraticBezierCurve3,
  Shape,
  SRGBColorSpace,
  TubeGeometry,
  Vector2,
  Vector3,
} from "three";
import { RoundedBox } from "@react-three/drei";
import { useEffect, useMemo } from "react";

import { bandMaterial, materials } from "./materials";

/** Generic part bodies in millimetres, y up from the board surface. Sized like the real packages; no brand artwork. */
type Props = {
  footprintId: string;
  /** Resistor colour bands, first to last. */
  bands?: string[] | null | undefined;
  /** Laser marking on IC and transistor bodies, such as `3V3` or `2N3904`. */
  marking?: string | undefined;
  /** LED brightness, 0 when off and 1 at rated current. */
  glow?: number | undefined;
  ledColour?: string | undefined;
};

const v3 = (x: number, y: number, z = 0) => new Vector3(x, y, z);

// Axial resistor: 6.3 mm × Ø2.5 mm body on 10.16 mm pitch, leads bent down into the holes.
const AXIAL_Y = 1.7;
const axialBody = new LatheGeometry(
  [
    [0.3, -3.15],
    [0.95, -3.1],
    [1.25, -2.85],
    [1.27, -2.2],
    [1.22, -1.75],
    [1.06, -1.55],
    [1.06, 1.55],
    [1.22, 1.75],
    [1.27, 2.2],
    [1.25, 2.85],
    [0.95, 3.1],
    [0.3, 3.15],
  ].map(([r = 0, y = 0]) => new Vector2(r, y)),
  32,
);
const axialLead = (side: 1 | -1) => {
  const path = new CurvePath<Vector3>();
  path.add(new LineCurve3(v3(3.1 * side, AXIAL_Y), v3(4.45 * side, AXIAL_Y)));
  path.add(new QuadraticBezierCurve3(v3(4.45 * side, AXIAL_Y), v3(5.08 * side, AXIAL_Y), v3(5.08 * side, AXIAL_Y - 0.63)));
  path.add(new LineCurve3(v3(5.08 * side, AXIAL_Y - 0.63), v3(5.08 * side, -2.2)));
  return new TubeGeometry(path, 48, 0.3, 10);
};
const axialLeads = [axialLead(-1), axialLead(1)];
const bandSpots = [
  { x: -2.25, r: 1.29 },
  { x: -1.15, r: 1.08 },
  { x: -0.35, r: 1.08 },
  { x: 2.25, r: 1.29 },
];

// 0805 chip capacitor: 2.0 × 1.25 × 1.25 mm, with solder fillets onto the pads.
const filletShape = new Shape([new Vector2(0, 0), new Vector2(0.42, 0), new Vector2(0, 0.62)]);
const chipFillet = new ExtrudeGeometry(filletShape, { depth: 1.15, bevelEnabled: false });

// SOT-223: 6.5 × 3.5 × 1.6 mm body, three gull-wing leads at 2.3 mm pitch and a wide tab opposite.
const gullWing = (width: number) =>
  new ExtrudeGeometry(
    new Shape(
      [
        [-0.2, 0.95],
        [0.45, 0.95],
        [0.8, 0.26],
        [1.75, 0.26],
        [1.75, 0],
        [0.68, 0],
        [0.33, 0.69],
        [-0.2, 0.69],
      ].map(([x = 0, y = 0]) => new Vector2(x, y)),
    ),
    { depth: width, bevelEnabled: true, bevelThickness: 0.04, bevelSize: 0.04, bevelSegments: 2 },
  );
const smallWing = gullWing(0.7);
const tabWing = gullWing(3.0);

// TO-92: a 4.6 mm D-shaped body, 4.5 mm tall, standing 3 mm off the board on three leads formed out to 2.54 mm.
const TO92_STANDOFF = 3;
const TO92_HEIGHT = 4.5;
const TO92_FLAT = 1.0;
const to92Body = (() => {
  const r = 2.3;
  const a = Math.asin(TO92_FLAT / r);
  const shape = new Shape();
  // Shape y becomes −z after standing the extrusion up, so the flat face ends up at the front.
  shape.absarc(0, 0, r, -a, Math.PI + a, false);
  shape.closePath();
  const geometry = new ExtrudeGeometry(shape, {
    depth: TO92_HEIGHT,
    bevelEnabled: true,
    bevelThickness: 0.15,
    bevelSize: 0.12,
    bevelSegments: 2,
    curveSegments: 32,
  });
  geometry.rotateX(-Math.PI / 2);
  return geometry;
})();
const to92Lead = (x: number) => {
  const path = new CurvePath<Vector3>();
  const spread = x * 2;
  path.add(new LineCurve3(v3(x, TO92_STANDOFF + 0.2), v3(x, 2)));
  path.add(new QuadraticBezierCurve3(v3(x, 2), v3(x, 1.2), v3(spread, 0.9)));
  path.add(new LineCurve3(v3(spread, 0.9), v3(spread, -2.2)));
  return new TubeGeometry(path, 24, 0.22, 8);
};
const to92Leads = [-1.27, 0, 1.27].map(to92Lead);

// 5 mm LED: flange, cylinder and dome in clear epoxy, standing 2 mm off the board.
const LED_STANDOFF = 2;
const ledBody = new LatheGeometry(
  [
    [0, 0],
    [2.9, 0],
    [2.9, 1],
    [2.5, 1],
    [2.5, 6.1],
    ...Array.from({ length: 12 }, (_, i) => {
      const t = ((i + 1) / 12) * (Math.PI / 2);
      return [2.5 * Math.cos(t), 6.1 + 2.5 * Math.sin(t)];
    }),
  ].map(([r = 0, y = 0]) => new Vector2(Math.max(r, 0.0001), y)),
  48,
);
const ledLeadCurve = new CatmullRomCurve3([v3(0, -2.2), v3(0, LED_STANDOFF + 4.6)]);
const ledLead = new TubeGeometry(ledLeadCurve, 2, 0.25, 6);

const markingTexture = (text: string) => {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 128;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    ctx.fillStyle = "#FFFFFF";
    ctx.font = "500 64px ui-monospace, monospace";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(text, 128, 64);
  }
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  return texture;
};

type MarkingProps = {
  text: string;
  y: number;
  w: number;
  h: number;
  /** Distance in front of the origin for a marking on an upright face; omit for a marking on top. */
  front?: number | undefined;
};

const Marking = ({ text, y, w, h, front }: MarkingProps) => {
  const texture = useMemo(() => markingTexture(text), [text]);
  useEffect(() => () => texture.dispose(), [texture]);
  return (
    <mesh position={[0, y, front ?? 0]} rotation={front === undefined ? [-Math.PI / 2, 0, 0] : [0, 0, 0]}>
      <planeGeometry args={[w, h]} />
      <meshStandardMaterial color="#8E9196" alphaMap={texture} transparent depthWrite={false} roughness={0.9} />
    </mesh>
  );
};

const Resistor = ({ bands }: { bands?: string[] | null | undefined }) => (
  <group>
    <mesh geometry={axialBody} material={materials.resistorBody} position={[0, AXIAL_Y, 0]} rotation={[0, 0, Math.PI / 2]} castShadow />
    {bands?.map((colour, i) => {
      const spot = bandSpots[i];
      if (!spot) return null;
      return (
        <mesh key={i} position={[spot.x, AXIAL_Y, 0]} rotation={[0, 0, Math.PI / 2]} material={bandMaterial(colour)}>
          <cylinderGeometry args={[spot.r, spot.r, 0.42, 32, 1, true]} />
        </mesh>
      );
    })}
    {axialLeads.map((geometry, i) => (
      <mesh key={i} geometry={geometry} material={materials.lead} castShadow />
    ))}
  </group>
);

const ChipCapacitor = () => (
  <group>
    <RoundedBox args={[1.2, 1.2, 1.2]} radius={0.06} smoothness={3} position={[0, 0.66, 0]} material={materials.ceramic} castShadow />
    {[-0.78, 0.78].map((x) => (
      <RoundedBox key={x} args={[0.44, 1.26, 1.28]} radius={0.1} smoothness={3} position={[x, 0.68, 0]} material={materials.solder} castShadow />
    ))}
    <mesh geometry={chipFillet} material={materials.solder} position={[1.0, 0.05, -0.575]} />
    <mesh geometry={chipFillet} material={materials.solder} position={[-1.0, 0.05, 0.575]} rotation={[0, Math.PI, 0]} />
  </group>
);

const Sot223 = ({ marking }: { marking?: string | undefined }) => (
  <group>
    <RoundedBox args={[6.5, 1.6, 3.5]} radius={0.18} smoothness={3} position={[0, 0.9, 0]} material={materials.epoxy} castShadow />
    {marking && <Marking text={marking} y={1.705} w={3.2} h={1.6} />}
    <mesh position={[-2.65, 1.705, 1.05]} rotation={[-Math.PI / 2, 0, 0]} material={materials.cavity}>
      <circleGeometry args={[0.28, 24]} />
    </mesh>
    {[-2.3, 0, 2.3].map((x) => (
      <mesh key={x} geometry={smallWing} material={materials.solder} position={[x + 0.35, 0.05, 1.75]} rotation={[0, -Math.PI / 2, 0]} castShadow />
    ))}
    <mesh geometry={tabWing} material={materials.solder} position={[-1.5, 0.05, -1.75]} rotation={[0, Math.PI / 2, 0]} castShadow />
  </group>
);

const To92 = ({ marking }: { marking?: string | undefined }) => (
  <group>
    <mesh geometry={to92Body} material={materials.epoxy} position={[0, TO92_STANDOFF, 0]} castShadow />
    {marking && <Marking text={marking} y={TO92_STANDOFF + TO92_HEIGHT * 0.62} w={3.6} h={1.8} front={TO92_FLAT + 0.16} />}
    {to92Leads.map((geometry, i) => (
      <mesh key={i} geometry={geometry} material={materials.lead} castShadow />
    ))}
  </group>
);

const Led = ({ glow = 0, colour = "#A3121A" }: { glow?: number | undefined; colour?: string | undefined }) => {
  const level = Math.min(1.5, Math.max(0, glow));
  const glowColour = "#FF4A3A";

  return (
    <group>
      {[-1.27, 1.27].map((x) => (
        <mesh key={x} geometry={ledLead} material={materials.lead} position={[x, 0, 0]} castShadow />
      ))}
      <mesh position={[1.0, LED_STANDOFF + 4.7, 0]} material={materials.lead}>
        <boxGeometry args={[1.3, 0.5, 0.6]} />
      </mesh>
      {level > 0.01 && (
        // The die: a bright core seen through the epoxy, outside tone mapping so it reads as a light source.
        <mesh position={[0, LED_STANDOFF + 5.05, 0]}>
          <sphereGeometry args={[0.35 + level * 0.35, 16, 12]} />
          <meshBasicMaterial color={glowColour} toneMapped={false} transparent opacity={Math.min(1, 0.35 + level)} />
        </mesh>
      )}
      <mesh geometry={ledBody} position={[0, LED_STANDOFF, 0]} castShadow>
        <meshPhysicalMaterial
          color={colour}
          emissive={glowColour}
          emissiveIntensity={level * 1.8}
          roughness={0.12}
          clearcoat={1}
          transparent
          opacity={0.62}
          side={DoubleSide}
        />
      </mesh>
      <pointLight position={[0, LED_STANDOFF + 5, 0]} color={glowColour} intensity={level * 0.0004} distance={0.05} decay={2} />
    </group>
  );
};

const Terminal = () => (
  <group>
    <RoundedBox args={[10.2, 8.4, 7.6]} radius={0.35} smoothness={3} position={[0, 4.25, 0.2]} material={materials.terminal} castShadow />
    {[-2.54, 2.54].map((x) => (
      <group key={x} position={[x, 0, 0]}>
        <mesh position={[0, 8.46, -0.9]} rotation={[-Math.PI / 2, 0, 0]} material={materials.cavity}>
          <ringGeometry args={[1.35, 1.75, 32]} />
        </mesh>
        <mesh position={[0, 8.35, -0.9]} material={materials.lead} castShadow>
          <cylinderGeometry args={[1.4, 1.4, 0.4, 32]} />
        </mesh>
        <mesh position={[0, 8.52, -0.9]} rotation={[0, Math.PI / 4, 0]} material={materials.cavity}>
          <boxGeometry args={[2.3, 0.1, 0.42]} />
        </mesh>
        <mesh position={[0, 3.2, 3.7]} material={materials.cavity}>
          <boxGeometry args={[3.2, 3.0, 1]} />
        </mesh>
        <mesh position={[0, -1, 0]} material={materials.lead}>
          <boxGeometry args={[1, 3, 1]} />
        </mesh>
      </group>
    ))}
  </group>
);

export const PartMesh = ({ footprintId, bands, marking, glow, ledColour }: Props) => {
  switch (footprintId) {
    case "generic/axial-0.4in":
      return <Resistor bands={bands} />;
    case "generic/0805":
      return <ChipCapacitor />;
    case "generic/sot-223":
      return <Sot223 marking={marking} />;
    case "generic/led-5mm":
      return <Led glow={glow} colour={ledColour} />;
    case "generic/terminal-2":
      return <Terminal />;
    case "generic/to-92-ebc":
    case "generic/to-92-sgd":
    case "generic/to-92-dgs":
      return <To92 marking={marking} />;
    default:
      return <RoundedBox args={[4, 2, 4]} radius={0.2} position={[0, 1, 0]} material={materials.fallback} castShadow />;
  }
};

"use client";

import { CanvasTexture, ExtrudeGeometry, LinearMipmapLinearFilter, Path, SRGBColorSpace, Shape } from "three";
import { useEffect, useMemo } from "react";
import { Line } from "@react-three/drei";

import type { Footprint as FootprintData, Pad } from "@/lib/board/footprints";
import { materials } from "./materials";

/** Copper and finish thickness, exaggerated a little so pads read at a distance. */
const PAD_T = 0.05;
const SILK_Y = 0.012;
const PX_PER_MM = 40;

type Props = {
  footprint: FootprintData;
  designator: string;
  fontFamily: string;
  /** Board thickness, so through-hole pads also get copper on the underside. */
  thickness: number;
  /** Courtyard outline colour, or `null` to hide it. */
  outline: string | null;
};

const silkTexture = (footprint: FootprintData, designator: string, fontFamily: string) => {
  const span = Math.max(footprint.courtyard.w, footprint.courtyard.h) + 6;
  const size = Math.ceil(span * PX_PER_MM);
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    const px = (mm: number) => (mm + span / 2) * PX_PER_MM;
    ctx.strokeStyle = ctx.fillStyle = "#FFFFFF";
    ctx.lineWidth = 0.15 * PX_PER_MM;
    ctx.lineCap = ctx.lineJoin = "round";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    for (const shape of footprint.silk) {
      ctx.beginPath();
      if (shape.kind === "rect") {
        const [w, h] = [shape.w * PX_PER_MM, shape.h * PX_PER_MM];
        ctx.strokeRect(px(shape.x) - w / 2, px(shape.z) - h / 2, w, h);
      } else if (shape.kind === "circle") {
        const r = shape.r * PX_PER_MM;
        const a = shape.flatX === undefined ? 0 : Math.acos(Math.min(1, shape.flatX / shape.r));
        ctx.arc(px(shape.x), px(shape.z), r, a, Math.PI * 2 - a);
        if (shape.flatX !== undefined) ctx.closePath();
        ctx.stroke();
      } else if (shape.kind === "line") {
        shape.points.forEach(([x, z], i) => (i === 0 ? ctx.moveTo(px(x), px(z)) : ctx.lineTo(px(x), px(z))));
        ctx.stroke();
      } else if (shape.kind === "dot") {
        ctx.arc(px(shape.x), px(shape.z), shape.r * PX_PER_MM, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.font = `600 ${shape.size * PX_PER_MM}px ${fontFamily}`;
        ctx.fillText(shape.text, px(shape.x), px(shape.z));
      }
    }

    ctx.font = `600 ${1.15 * PX_PER_MM}px ${fontFamily}`;
    ctx.fillText(designator, px(footprint.ref.x), px(footprint.ref.z));
  }

  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.minFilter = LinearMipmapLinearFilter;
  texture.anisotropy = 8;
  return { texture, span };
};

const annularRings = new Map<string, ExtrudeGeometry>();

/** Pad copper with its drilled hole, `PAD_T` thick and standing on y = 0. Shared between pads of the same size. */
const annularRing = (pad: Pad & { drill: number }) => {
  const key = `${pad.shape}:${pad.w}:${pad.h}:${pad.drill}`;
  let geometry = annularRings.get(key);
  if (!geometry) {
    const [w, h] = [pad.w / 2, pad.h / 2];
    const shape = new Shape();
    if (pad.shape === "round") shape.absarc(0, 0, w, 0, Math.PI * 2, false);
    else shape.moveTo(-w, -h).lineTo(w, -h).lineTo(w, h).lineTo(-w, h).closePath();
    shape.holes.push(new Path().absarc(0, 0, pad.drill / 2, 0, Math.PI * 2, true));
    geometry = new ExtrudeGeometry(shape, { depth: PAD_T, bevelEnabled: false, curveSegments: 32 });
    geometry.rotateX(-Math.PI / 2);
    annularRings.set(key, geometry);
  }
  return geometry;
};

const PadMesh = ({ pad, thickness }: { pad: Pad; thickness: number }) => {
  if (pad.drill !== undefined) {
    const ring = annularRing({ ...pad, drill: pad.drill });
    return (
      <group position={[pad.x, 0, pad.z]}>
        <mesh geometry={ring} material={materials.gold} receiveShadow />
        <mesh geometry={ring} position={[0, -thickness - PAD_T, 0]} material={materials.gold} />
        {/* Soldered from underneath, as by hand or wave: a cone of solder from the bottom pad down the lead. */}
        <mesh position={[0, -thickness - PAD_T - 0.3, 0]} material={materials.solder} castShadow>
          <cylinderGeometry args={[Math.min(pad.w, pad.h) * 0.46, pad.drill * 0.38, 0.6, 32, 1]} />
        </mesh>
      </group>
    );
  }
  return (
    <group position={[pad.x, 0, pad.z]}>
      {pad.shape === "round" ? (
        <mesh position={[0, PAD_T / 2, 0]} material={materials.gold} receiveShadow>
          <cylinderGeometry args={[pad.w / 2, pad.w / 2, PAD_T, 32]} />
        </mesh>
      ) : (
        <mesh position={[0, PAD_T / 2, 0]} material={materials.gold} receiveShadow>
          <boxGeometry args={[pad.w, PAD_T, pad.h]} />
        </mesh>
      )}
    </group>
  );
};

/** Pads (with both faces of copper for through-hole pins), solder joints, silkscreen and courtyard for one placed part, in millimetres from its origin. */
export const Footprint = ({ footprint, designator, fontFamily, thickness, outline }: Props) => {
  const silk = useMemo(() => silkTexture(footprint, designator, fontFamily), [footprint, designator, fontFamily]);
  useEffect(() => () => silk.texture.dispose(), [silk]);

  const { w, h } = footprint.courtyard;
  const courtyard = useMemo<[number, number, number][]>(
    () => [
      [-w / 2, 0.08, -h / 2],
      [w / 2, 0.08, -h / 2],
      [w / 2, 0.08, h / 2],
      [-w / 2, 0.08, h / 2],
      [-w / 2, 0.08, -h / 2],
    ],
    [w, h],
  );

  return (
    <group>
      {footprint.pads.map((pad, i) => (
        <PadMesh key={i} pad={pad} thickness={thickness} />
      ))}
      <mesh position={[0, SILK_Y, 0]} rotation={[-Math.PI / 2, 0, 0]} renderOrder={1} raycast={() => null} receiveShadow>
        <planeGeometry args={[silk.span, silk.span]} />
        <meshStandardMaterial
          color="#F3F1EC"
          alphaMap={silk.texture}
          transparent
          depthWrite={false}
          roughness={0.75}
          polygonOffset
          polygonOffsetFactor={-1}
        />
      </mesh>
      {outline && <Line points={courtyard} color={outline} lineWidth={1.75} />}
    </group>
  );
};

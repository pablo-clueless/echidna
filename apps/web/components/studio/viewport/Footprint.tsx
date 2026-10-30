"use client";

import { CanvasTexture, LinearMipmapLinearFilter, SRGBColorSpace } from "three";
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

const PadMesh = ({ pad }: { pad: Pad }) => {
  const round = pad.shape === "round";
  return (
    <group position={[pad.x, 0, pad.z]}>
      {round ? (
        <mesh position={[0, PAD_T / 2, 0]} material={materials.gold} receiveShadow>
          <cylinderGeometry args={[pad.w / 2, pad.w / 2, PAD_T, 32]} />
        </mesh>
      ) : (
        <mesh position={[0, PAD_T / 2, 0]} material={materials.gold} receiveShadow>
          <boxGeometry args={[pad.w, PAD_T, pad.h]} />
        </mesh>
      )}
      {pad.drill !== undefined && (
        // Through-hole joints: a concave solder cone from the pad up the lead.
        <mesh position={[0, PAD_T + 0.3, 0]} material={materials.solder} castShadow receiveShadow>
          <cylinderGeometry args={[pad.drill * 0.38, Math.min(pad.w, pad.h) * 0.46, 0.6, 32, 1]} />
        </mesh>
      )}
    </group>
  );
};

/** Pads, solder joints, silkscreen and courtyard for one placed part, in millimetres from its origin. */
export const Footprint = ({ footprint, designator, fontFamily, outline }: Props) => {
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
        <PadMesh key={i} pad={pad} />
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

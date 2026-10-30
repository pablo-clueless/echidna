"use client";

import { CanvasTexture, ExtrudeGeometry, LinearMipmapLinearFilter, Path, SRGBColorSpace, Shape } from "three";
import { useEffect, useMemo } from "react";

import type { Drill } from "@/lib/board/footprints";
import { materials } from "./materials";

type Props = {
  width: number;
  depth: number;
  thickness: number;
  /** Plated holes for through-hole parts, in board millimetres. */
  drills: Drill[];
  /** Legend printed along the front edge, such as the project name and revision. */
  legend: string;
  fontFamily: string;
};

const CORNER = 2.5;
const HOLE_INSET = 3.5;
const HOLE_R = 1.6;
const RING_R = 3;
/** Laminate kept between a hole and the board edge or a neighbouring hole. */
const WEB = 0.3;
/** Fiducial marks: 1 mm copper dots in a 3 mm mask opening, inset from three corners for assembly cameras. */
const FIDUCIAL_INSET = { x: 10, z: 3.5 };
/** The legend runs from `inset` off the left edge, up to 60 mm or until `clear` of the right edge's fiducial. */
const LEGEND = { height: 2.2, length: 60, inset: 9, clear: 13 };
const PX_PER_MM = 40;

const legendTexture = (text: string, fontFamily: string, length: number) => {
  const canvas = document.createElement("canvas");
  canvas.width = length * PX_PER_MM;
  canvas.height = LEGEND.height * PX_PER_MM;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    ctx.fillStyle = "#FFFFFF";
    ctx.font = `600 ${1.5 * PX_PER_MM}px ${fontFamily}`;
    ctx.textBaseline = "middle";
    ctx.fillText(text, 0, canvas.height / 2);
  }
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.minFilter = LinearMipmapLinearFilter;
  texture.anisotropy = 8;
  return texture;
};

/**
 * Bare board in millimetres: solder-mask faces, laminate edges, plated M3 mounting holes in each corner, a plated
 * hole for every through-hole pin, three fiducials and a silkscreen legend. A hole that would break the outline or merge with another is left undrilled.
 */
export const Board = ({ width, depth, thickness, drills, legend, fontFamily }: Props) => {
  const legendLength = Math.min(LEGEND.length, width - LEGEND.inset - LEGEND.clear);
  const legendMap = useMemo(() => legendTexture(legend, fontFamily, legendLength), [legend, fontFamily, legendLength]);
  useEffect(() => () => legendMap.dispose(), [legendMap]);
  const fiducials = useMemo<[number, number][]>(() => {
    const [fx, fz] = [width / 2 - FIDUCIAL_INSET.x, depth / 2 - FIDUCIAL_INSET.z];
    return [
      [-fx, -fz],
      [fx, -fz],
      [fx, fz],
    ];
  }, [width, depth]);

  const mounting = useMemo<Drill[]>(() => {
    const [hx, hz] = [width / 2 - HOLE_INSET, depth / 2 - HOLE_INSET];
    return [
      { x: -hx, z: -hz, diameter: HOLE_R * 2 },
      { x: hx, z: -hz, diameter: HOLE_R * 2 },
      { x: hx, z: hz, diameter: HOLE_R * 2 },
      { x: -hx, z: hz, diameter: HOLE_R * 2 },
    ];
  }, [width, depth]);

  const plated = useMemo(() => {
    const kept: Drill[] = [];
    const clear = (a: Drill, b: Drill) => Math.hypot(a.x - b.x, a.z - b.z) >= (a.diameter + b.diameter) / 2 + WEB;
    for (const drill of drills) {
      const r = drill.diameter / 2 + WEB;
      const inside = Math.abs(drill.x) <= width / 2 - r && Math.abs(drill.z) <= depth / 2 - r;
      if (inside && [...mounting, ...kept].every((other) => clear(drill, other))) kept.push(drill);
    }
    return kept;
  }, [drills, mounting, width, depth]);

  const geometry = useMemo(() => {
    const [w, d, r] = [width / 2, depth / 2, CORNER];
    const shape = new Shape();
    shape.moveTo(-w + r, -d);
    shape.lineTo(w - r, -d);
    shape.quadraticCurveTo(w, -d, w, -d + r);
    shape.lineTo(w, d - r);
    shape.quadraticCurveTo(w, d, w - r, d);
    shape.lineTo(-w + r, d);
    shape.quadraticCurveTo(-w, d, -w, d - r);
    shape.lineTo(-w, -d + r);
    shape.quadraticCurveTo(-w, -d, -w + r, -d);
    for (const { x, z, diameter } of [...mounting, ...plated]) {
      shape.holes.push(new Path().absarc(x, -z, diameter / 2, 0, Math.PI * 2, true));
    }
    return new ExtrudeGeometry(shape, { depth: thickness, bevelEnabled: false, curveSegments: 24 });
  }, [width, depth, thickness, mounting, plated]);
  useEffect(() => () => geometry.dispose(), [geometry]);

  return (
    <group>
      <mesh geometry={geometry} rotation={[-Math.PI / 2, 0, 0]} material={[materials.mask, materials.laminate]} receiveShadow />
      {mounting.map(({ x, z }) => (
        <group key={`${x},${z}`} position={[x, 0, z]}>
          {[thickness + 0.03, -0.03].map((y) => (
            <mesh key={y} position={[0, y, 0]} rotation={[-Math.PI / 2, 0, 0]} material={materials.gold} receiveShadow>
              <ringGeometry args={[HOLE_R, RING_R, 48]} />
            </mesh>
          ))}
          <Barrel radius={HOLE_R} thickness={thickness} />
        </group>
      ))}
      {fiducials.map(([x, z]) => (
        <group key={`${x},${z}`} position={[x, thickness, z]}>
          <mesh position={[0, 0.002, 0]} rotation={[-Math.PI / 2, 0, 0]} material={materials.laminate} receiveShadow>
            <circleGeometry args={[1.5, 40]} />
          </mesh>
          <mesh position={[0, 0.025, 0]} material={materials.gold} receiveShadow>
            <cylinderGeometry args={[0.5, 0.5, 0.05, 32]} />
          </mesh>
        </group>
      ))}
      <mesh
        position={[-width / 2 + LEGEND.inset + legendLength / 2, thickness + 0.045, depth / 2 - FIDUCIAL_INSET.z]}
        rotation={[-Math.PI / 2, 0, 0]}
        raycast={() => null}
      >
        <planeGeometry args={[legendLength, LEGEND.height]} />
        <meshStandardMaterial color="#F3F1EC" alphaMap={legendMap} transparent depthWrite={false} roughness={0.75} />
      </mesh>
      {plated.map(({ x, z, diameter }) => (
        <group key={`${x},${z}`} position={[x, 0, z]}>
          <Barrel radius={diameter / 2} thickness={thickness} />
        </group>
      ))}
    </group>
  );
};

/** Copper plating lining a drilled hole, seen from inside. */
const Barrel = ({ radius, thickness }: { radius: number; thickness: number }) => (
  <mesh position={[0, thickness / 2, 0]} material={materials.plating} raycast={() => null}>
    <cylinderGeometry args={[radius - 0.005, radius - 0.005, thickness, 32, 1, true]} />
  </mesh>
);

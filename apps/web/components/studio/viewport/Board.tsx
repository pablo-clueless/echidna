"use client";

import { ExtrudeGeometry, Path, Shape } from "three";
import { useEffect, useMemo } from "react";

import { materials } from "./materials";

type Props = { width: number; depth: number; thickness: number };

const CORNER = 2.5;
const HOLE_INSET = 3.5;
const HOLE_R = 1.6;
const RING_R = 3;

/** Bare board in millimetres: solder-mask faces, laminate edges, and plated M3 mounting holes in each corner. */
export const Board = ({ width, depth, thickness }: Props) => {
  const holes = useMemo<[number, number][]>(() => {
    const [hx, hz] = [width / 2 - HOLE_INSET, depth / 2 - HOLE_INSET];
    return [
      [-hx, -hz],
      [hx, -hz],
      [hx, hz],
      [-hx, hz],
    ];
  }, [width, depth]);

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
    for (const [x, z] of holes) shape.holes.push(new Path().absarc(x, -z, HOLE_R, 0, Math.PI * 2, true));
    return new ExtrudeGeometry(shape, { depth: thickness, bevelEnabled: false, curveSegments: 24 });
  }, [width, depth, thickness, holes]);
  useEffect(() => () => geometry.dispose(), [geometry]);

  return (
    <group>
      <mesh geometry={geometry} rotation={[-Math.PI / 2, 0, 0]} material={[materials.mask, materials.laminate]} receiveShadow />
      {holes.map(([x, z]) => (
        <mesh key={`${x},${z}`} position={[x, thickness + 0.03, z]} rotation={[-Math.PI / 2, 0, 0]} material={materials.gold} receiveShadow>
          <ringGeometry args={[HOLE_R, RING_R, 48]} />
        </mesh>
      ))}
    </group>
  );
};

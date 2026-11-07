"use client";

import {
  BoxGeometry,
  type InstancedMesh,
  type Material,
  Matrix4,
  Quaternion,
  Vector3,
} from "three";
import { useLayoutEffect, useMemo, useRef } from "react";
import type { ComponentSpec } from "@echidna/core";

import { hostSurfaces } from "@/lib/board/hostPopulation";
import type { SmallPart } from "@/lib/board/population";
import { materials } from "./materials";

/** One unit cube, stretched to each part by its instance matrix. */
const UNIT_BOX = new BoxGeometry(1, 1, 1);

type MaterialKey = keyof typeof materials;

/** A box in a part, in millimetres from the board's face, before it is scaled. */
type Piece = {
  material: MaterialKey;
  x: number;
  y: number;
  z: number;
  w: number;
  h: number;
  d: number;
};

/**
 * The boxes each small part is drawn with: a chip passive's body and its two tinned ends, an IC's moulded body, a
 * BGA's moulding on its substrate, an inductor's ferrite, a crystal's can and a test point's gold pad.
 */
const pieces = (p: SmallPart): Piece[] => {
  const base = { x: p.x, z: p.z };
  switch (p.kind) {
    case "resistor":
    case "capacitor": {
      // The ends run across the part's short side, at each end of its long one.
      const alongX = p.w >= p.d;
      const length = alongX ? p.w : p.d;
      const end = length * 0.2;
      const offset = length / 2 - end / 2;
      const endBox = (sign: number): Piece => ({
        material: "solder",
        x: p.x + (alongX ? sign * offset : 0),
        z: p.z + (alongX ? 0 : sign * offset),
        y: p.h / 2,
        w: alongX ? end : p.w,
        d: alongX ? p.d : end,
        h: p.h + 0.01,
      });
      return [
        {
          material: p.kind === "resistor" ? "epoxy" : "ceramic",
          ...base,
          y: p.h / 2,
          w: alongX ? length - end * 2 : p.w * 0.98,
          d: alongX ? p.d * 0.98 : length - end * 2,
          h: p.h,
        },
        endBox(-1),
        endBox(1),
      ];
    }
    case "bga":
      return [
        { material: "mask", ...base, y: 0.15, w: p.w, d: p.d, h: 0.3 },
        {
          material: "epoxy",
          ...base,
          y: 0.3 + (p.h - 0.3) / 2,
          w: p.w * 0.86,
          d: p.d * 0.86,
          h: p.h - 0.3,
        },
      ];
    case "ic":
      return [{ material: "epoxy", ...base, y: p.h / 2, w: p.w, d: p.d, h: p.h }];
    case "inductor":
      return [{ material: "graphite", ...base, y: p.h / 2, w: p.w, d: p.d, h: p.h }];
    case "crystal":
      return [{ material: "lead", ...base, y: p.h / 2, w: p.w, d: p.d, h: p.h }];
    case "testPoint":
      return [{ material: "gold", ...base, y: p.h / 2, w: p.w, d: p.d, h: p.h }];
  }
};

/** Every part's boxes, gathered by material into instance matrices. */
const batch = (parts: readonly SmallPart[]): [MaterialKey, Matrix4[]][] => {
  const byMaterial = new Map<MaterialKey, Matrix4[]>();
  const rotation = new Quaternion();
  for (const part of parts)
    for (const piece of pieces(part)) {
      const matrix = new Matrix4().compose(
        new Vector3(piece.x, piece.y, piece.z),
        rotation,
        new Vector3(piece.w, piece.h, piece.d),
      );
      const list = byMaterial.get(piece.material) ?? [];
      list.push(matrix);
      byMaterial.set(piece.material, list);
    }
  return [...byMaterial];
};

/** One material's boxes, drawn in a single call. Clicks pass through to the board beneath. */
const Batch = ({ material, matrices }: { material: Material; matrices: Matrix4[] }) => {
  const ref = useRef<InstancedMesh>(null);
  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    matrices.forEach((m, i) => mesh.setMatrixAt(i, m));
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [matrices]);
  return (
    <instancedMesh
      ref={ref}
      args={[UNIT_BOX, material, matrices.length]}
      castShadow
      receiveShadow
      raycast={() => null}
    />
  );
};

/**
 * A board face covered in small parts, drawn instanced.
 * @param parts - The parts, in millimetres from the face's centre.
 */
export const SmallParts = ({ parts }: { parts: readonly SmallPart[] }) => {
  const batches = useMemo(() => batch(parts), [parts]);
  return (
    <group>
      {batches.map(([key, matrices]) => (
        <Batch key={`${key}:${matrices.length}`} material={materials[key]} matrices={matrices} />
      ))}
    </group>
  );
};

/**
 * The small parts on a host board: every face of a motherboard, laptop board, or phone's or wearable's board stack.
 * @param spec - The host's spec.
 * @param boardTop - How far a single board's face stands above the part's origin, in millimetres.
 */
export const HostPopulation = ({ spec, boardTop }: { spec: ComponentSpec; boardTop: number }) => {
  const surfaces = useMemo(() => hostSurfaces(spec, boardTop), [spec, boardTop]);
  return (
    <>
      {surfaces.map((surface, i) => (
        <group key={i} position={[surface.x, surface.y, surface.z]}>
          <SmallParts parts={surface.parts} />
        </group>
      ))}
    </>
  );
};

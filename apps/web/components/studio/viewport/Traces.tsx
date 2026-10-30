"use client";

import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { BoxGeometry, type BufferGeometry, CylinderGeometry } from "three";
import { useEffect, useMemo } from "react";

import { type Routing, VIA_SIZE } from "@/lib/board/routing";
import { materials } from "./materials";

/** 1 oz copper, which the mask drapes over as a slight ridge. */
const COPPER_T = 0.035;

type Props = { routing: Routing; thickness: number };

const layerGeometry = (routing: Routing, layer: "top" | "bottom", y: number) => {
  const parts: BufferGeometry[] = [];
  for (const trace of routing.traces) {
    if (trace.layer !== layer) continue;
    trace.points.forEach(([x, z], i) => {
      const joint = new CylinderGeometry(trace.width / 2, trace.width / 2, COPPER_T, 16);
      parts.push(joint.translate(x, y, z));
      const next = trace.points[i + 1];
      if (!next) return;
      const [dx, dz] = [next[0] - x, next[1] - z];
      const segment = new BoxGeometry(Math.hypot(dx, dz), COPPER_T, trace.width);
      segment.rotateY(Math.atan2(-dz, dx));
      parts.push(segment.translate(x + dx / 2, y, z + dz / 2));
    });
  }
  for (const via of routing.vias) {
    parts.push(new CylinderGeometry(VIA_SIZE / 2, VIA_SIZE / 2, COPPER_T, 20).translate(via.x, y, via.z));
  }
  const merged = parts.length ? mergeGeometries(parts) : null;
  for (const part of parts) part.dispose();
  return merged;
};

/** Copper tracks and tented vias on both faces of the board, under the solder mask. Board millimetres. */
export const Traces = ({ routing, thickness }: Props) => {
  const layers = useMemo(
    () => [layerGeometry(routing, "top", thickness + COPPER_T / 2), layerGeometry(routing, "bottom", -COPPER_T / 2)],
    [routing, thickness],
  );
  useEffect(() => () => layers.forEach((g) => g?.dispose()), [layers]);

  return (
    <group>
      {layers.map((geometry, i) =>
        geometry ? (
          <mesh key={i} geometry={geometry} material={materials.maskedCopper} raycast={() => null} receiveShadow />
        ) : null,
      )}
      {routing.vias.map((via) =>
        [thickness + COPPER_T + 0.002, -COPPER_T - 0.002].map((y) => (
          // The mask sags into the drilled centre of a tented via.
          <mesh key={`${via.x},${via.z},${y}`} position={[via.x, y, via.z]} rotation={[y > 0 ? -Math.PI / 2 : Math.PI / 2, 0, 0]} material={materials.cavity} raycast={() => null}>
            <circleGeometry args={[VIA_SIZE / 4, 16]} />
          </mesh>
        )),
      )}
    </group>
  );
};

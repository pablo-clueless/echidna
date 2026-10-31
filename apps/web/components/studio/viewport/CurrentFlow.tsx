"use client";

import { BufferAttribute, BufferGeometry, Color, DoubleSide, type Mesh, ShaderMaterial } from "three";
import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";

import { usePrefersReducedMotion } from "@/lib/usePrefersReducedMotion";
import type { Routing } from "@/lib/board/routing";
import { flowSpeed } from "@/lib/board/currents";

/** Electric blue: clear on every mask colour, and neither the brand orange nor a status colour. */
const FLOW_COLOUR = "#38BDF8";
/** Height above the mask surface, so the dashes never z-fight the copper under it. */
const LIFT = 0.06;
/** Dash ribbon width as a share of the track's. */
const RIBBON = 0.7;

const vertexShader = /* glsl */ `
  attribute float along;
  attribute float speed;
  varying float vAlong;
  varying float vSpeed;
  void main() {
    vAlong = along;
    vSpeed = speed;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

// Comet-shaped dashes, brightest at the head, so the direction reads even when they are still.
const fragmentShader = /* glsl */ `
  uniform float uTime;
  uniform vec3 uColour;
  varying float vAlong;
  varying float vSpeed;
  const float PERIOD = 2.4;
  void main() {
    if (abs(vSpeed) < 0.001) discard;
    float phase = fract((sign(vSpeed) * vAlong - uTime * abs(vSpeed)) / PERIOD);
    if (phase > 0.55) discard;
    float alpha = smoothstep(0.0, 0.5, phase) * (1.0 - smoothstep(0.5, 0.55, phase));
    gl_FragColor = vec4(uColour, alpha * 0.95);
  }
`;

/** Flat ribbons over every track that has a reading, with the distance along its track at each vertex. */
const ribbonGeometry = (routing: Routing, thickness: number) => {
  const positions: number[] = [];
  const along: number[] = [];
  /** Per track, the first vertex and how many it has, for updating speeds in place. */
  const spans: { start: number; count: number }[] = [];
  routing.traces.forEach((trace) => {
    const start = positions.length / 3;
    const y = trace.layer === "top" ? thickness + LIFT : -LIFT;
    const half = (trace.width * RIBBON) / 2;
    let distance = 0;
    for (let i = 1; trace.ends && i < trace.points.length; i++) {
      const [ax, az] = trace.points[i - 1] ?? [0, 0];
      const [bx, bz] = trace.points[i] ?? [0, 0];
      const length = Math.hypot(bx - ax, bz - az);
      if (length === 0) continue;
      const [nx, nz] = [(-(bz - az) / length) * half, ((bx - ax) / length) * half];
      const quad: [number, number, number][] = [
        [ax + nx, az + nz, distance],
        [ax - nx, az - nz, distance],
        [bx + nx, bz + nz, distance + length],
        [bx - nx, bz - nz, distance + length],
      ];
      for (const k of [0, 1, 2, 2, 1, 3]) {
        const [x, z, d] = quad[k] ?? [0, 0, 0];
        positions.push(x, y, z);
        along.push(d);
      }
      distance += length;
    }
    spans.push({ start, count: positions.length / 3 - start });
  });
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new BufferAttribute(new Float32Array(positions), 3));
  geometry.setAttribute("along", new BufferAttribute(new Float32Array(along), 1));
  geometry.setAttribute("speed", new BufferAttribute(new Float32Array(along.length), 1));
  return { geometry, spans };
};

type Props = {
  routing: Routing;
  thickness: number;
  /** Per track, in routing order, the current from the start of its points towards the end, in amperes. */
  currents: readonly number[];
};

/** Current overlay: dashes running along the copper in the direction current flows, faster for more current. */
export const CurrentFlow = ({ routing, thickness, currents }: Props) => {
  const reducedMotion = usePrefersReducedMotion();
  const mesh = useRef<Mesh>(null);
  const { geometry, spans } = useMemo(() => ribbonGeometry(routing, thickness), [routing, thickness]);
  const material = useMemo(
    () =>
      new ShaderMaterial({
        vertexShader,
        fragmentShader,
        uniforms: { uTime: { value: 0 }, uColour: { value: new Color(FLOW_COLOUR) } },
        transparent: true,
        depthWrite: false,
        side: DoubleSide,
      }),
    [],
  );

  useEffect(() => {
    const speed = geometry.getAttribute("speed") as BufferAttribute;
    spans.forEach(({ start, count }, i) => {
      const value = flowSpeed(currents[i] ?? 0);
      for (let k = start; k < start + count; k++) speed.setX(k, value);
    });
    speed.needsUpdate = true;
  }, [geometry, spans, currents]);

  useEffect(() => () => geometry.dispose(), [geometry]);
  useEffect(() => () => material.dispose(), [material]);

  useFrame((_, delta) => {
    const time = (mesh.current?.material as ShaderMaterial | undefined)?.uniforms.uTime;
    if (time && !reducedMotion) time.value += delta;
  });

  return <mesh ref={mesh} geometry={geometry} material={material} raycast={() => null} renderOrder={2} />;
};

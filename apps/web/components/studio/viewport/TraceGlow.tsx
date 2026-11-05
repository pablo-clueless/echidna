"use client";

import { useEffect, useMemo } from "react";
import {
  BufferAttribute,
  BufferGeometry,
  CustomBlending,
  DoubleSide,
  MaxEquation,
  ShaderMaterial,
} from "three";

import type { Routing } from "@/lib/board/routing";
import { glowColour } from "./materials";

/** How far the soft glow spreads beyond a track's edge, in millimetres. */
const GLOW_REACH = 0.9;
/** Height of the glow off the mask: just over the 0.035 mm tracks, under the 0.05 mm pads and the current dashes. */
const LIFT = 0.04;

const vertexShader = /* glsl */ `
  attribute vec2 local;
  attribute vec2 shape;
  varying vec2 vLocal;
  varying vec2 vShape;
  void main() {
    vLocal = local;
    vShape = shape;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

// Each quad covers one track segment plus the glow's reach. `local` is the fragment's position along (x, from the
// segment's start) and across (y) it, `shape` the segment's length and half-width, so the distance from the track's
// edge is exact at ends and bends too. The track itself is left alone, so its copper shows; outside it a soft warm
// copper halo fades out, brightest right at the edge.
const fragmentShader = /* glsl */ `
  uniform vec3 uColour;
  uniform float uReach;
  varying vec2 vLocal;
  varying vec2 vShape;
  void main() {
    float along = max(max(-vLocal.x, vLocal.x - vShape.x), 0.0);
    float edge = length(vec2(along, vLocal.y)) - vShape.y;
    if (edge < 0.0 || edge > uReach) discard;
    float halo = exp(-edge / (uReach * 0.3)) * 0.75 * (1.0 - smoothstep(0.6, 1.0, edge / uReach));
    gl_FragColor = vec4(uColour * halo, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

/** One quad per track segment, on either face of the board, carrying the coordinates the shader measures from. */
const glowGeometry = (routing: Routing, thickness: number) => {
  const positions: number[] = [];
  const local: number[] = [];
  const shape: number[] = [];
  for (const trace of routing.traces) {
    if (trace.unrouted) continue;
    const y = trace.layer === "top" ? thickness + LIFT : -LIFT;
    const half = trace.width / 2;
    const reach = half + GLOW_REACH;
    for (let i = 1; i < trace.points.length; i++) {
      const [ax, az] = trace.points[i - 1] ?? [0, 0];
      const [bx, bz] = trace.points[i] ?? [0, 0];
      const length = Math.hypot(bx - ax, bz - az);
      if (length === 0) continue;
      const [ux, uz] = [(bx - ax) / length, (bz - az) / length];
      const corner = (s: number, t: number): [number, number] => [
        ax + ux * s - uz * t,
        az + uz * s + ux * t,
      ];
      const quad: [number, number][] = [
        [-reach, -reach],
        [length + reach, -reach],
        [-reach, reach],
        [length + reach, reach],
      ];
      for (const k of [0, 1, 2, 2, 1, 3]) {
        const [s, t] = quad[k] ?? [0, 0];
        const [x, z] = corner(s, t);
        positions.push(x, y, z);
        local.push(s, t);
        shape.push(length, half);
      }
    }
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new BufferAttribute(new Float32Array(positions), 3));
  geometry.setAttribute("local", new BufferAttribute(new Float32Array(local), 2));
  geometry.setAttribute("shape", new BufferAttribute(new Float32Array(shape), 2));
  return geometry;
};

type Props = { routing: Routing; thickness: number };

/**
 * Soft copper glow around every track, on both faces. Blended by taking the brighter of glow and board
 * per channel, so overlapping quads at bends and junctions never stack into hot spots. Board millimetres.
 */
export const TraceGlow = ({ routing, thickness }: Props) => {
  const geometry = useMemo(() => glowGeometry(routing, thickness), [routing, thickness]);
  const material = useMemo(
    () =>
      new ShaderMaterial({
        vertexShader,
        fragmentShader,
        // A warm copper halo, the same on every mask colour.
        uniforms: { uColour: { value: glowColour }, uReach: { value: GLOW_REACH } },
        transparent: true,
        depthWrite: false,
        side: DoubleSide,
        blending: CustomBlending,
        blendEquation: MaxEquation,
      }),
    [],
  );
  useEffect(() => () => geometry.dispose(), [geometry]);
  useEffect(() => () => material.dispose(), [material]);

  return <mesh geometry={geometry} material={material} raycast={() => null} renderOrder={1} />;
};

"use client";

import { CanvasTexture, PlaneGeometry } from "three";

import { heatColour, heatOpacity } from "@/lib/board/heat";
import { toCelsius } from "@/lib/units";

/** How far the glow spreads past the part's courtyard on each side, in millimetres. */
const SPREAD = 3;
/** Just above the mask, under the part. */
const LIFT = 0.08;

let falloff: CanvasTexture | null = null;

/** A soft radial falloff, drawn once and shared: opaque in the middle, clear at the edge. */
const falloffTexture = () => {
  if (falloff) return falloff;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 128;
  const context = canvas.getContext("2d");
  if (context) {
    const gradient = context.createRadialGradient(64, 64, 0, 64, 64, 64);
    gradient.addColorStop(0, "#fff");
    gradient.addColorStop(0.45, "#fff");
    gradient.addColorStop(1, "#000");
    context.fillStyle = gradient;
    context.fillRect(0, 0, 128, 128);
  }
  falloff = new CanvasTexture(canvas);
  return falloff;
};

const plane = new PlaneGeometry(1, 1).rotateX(-Math.PI / 2);

type Props = {
  /** Footprint courtyard in millimetres, in the part's own frame. */
  courtyard: { w: number; h: number };
  /** Estimated temperature in kelvin. */
  temperature: number;
  /** Air temperature in kelvin. */
  ambient: number;
};

/** Heat overlay for one part: a glow on the board around it, coloured by its estimated temperature. */
export const HeatGlow = ({ courtyard, temperature, ambient }: Props) => {
  const opacity = heatOpacity(temperature - ambient);
  if (opacity === 0) return null;

  return (
    <mesh
      geometry={plane}
      position={[0, LIFT, 0]}
      scale={[courtyard.w + SPREAD * 2, 1, courtyard.h + SPREAD * 2]}
      raycast={() => null}
      renderOrder={1}
    >
      <meshBasicMaterial
        color={heatColour(toCelsius(temperature))}
        opacity={opacity}
        alphaMap={falloffTexture()}
        transparent
        depthWrite={false}
        toneMapped={false}
      />
    </mesh>
  );
};

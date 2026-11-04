import { Color, DoubleSide, MeshPhysicalMaterial, MeshStandardMaterial } from "three";

import type { MaskColour } from "@/stores/layout";

/**
 * Mask colour, the darker shade of it the copper under it takes, and the brighter shade of it for the neon edge
 * `TraceGlow` draws round each track.
 */
const finishes: Record<MaskColour, { mask: string; copper: string; glow: string }> = {
  black: { mask: "#0C0D0F", copper: "#050506", glow: "#8A909C" },
  green: { mask: "#0E4A28", copper: "#072E18", glow: "#3DDC84" },
  blue: { mask: "#0E2C5E", copper: "#081B3C", glow: "#4D8DFF" },
  red: { mask: "#6E1212", copper: "#440A0A", glow: "#FF4D4D" },
};

/** The neon edge colour for the current mask, shared with the glow shader so a mask change recolours it at once. */
export const glowColour = new Color(finishes.black.glow);

/**
 * Specular strength of the solder mask, as a fraction of a plain dielectric's. Mask is a thin satin lacquer: at full
 * strength the studio's key light and overhead softbox wash a black board out to mid grey and a green one to sage,
 * from any angle, so the mask reflects about a third as much and keeps its colour while still catching highlights.
 */
const MASK_SPECULAR = 0.3;

/** Shared physical materials, created once so every part reuses the same shader programs. */
export const materials = {
  /** Satin solder mask over FR-4. A clearcoat here washes the board out to grey. */
  mask: new MeshPhysicalMaterial({ color: "#0C0D0F", roughness: 0.6, specularIntensity: MASK_SPECULAR }),
  /** Copper tracks and tented vias seen through the mask: a darker shade of the mask, with the same satin sheen. */
  maskedCopper: new MeshPhysicalMaterial({ color: "#050506", roughness: 0.6, specularIntensity: MASK_SPECULAR }),
  /** Exposed laminate on the board edge and hole walls. */
  laminate: new MeshStandardMaterial({ color: "#B7A77C", roughness: 0.85 }),
  /** ENIG pad finish. */
  gold: new MeshStandardMaterial({ color: "#E2B866", metalness: 1, roughness: 0.28 }),
  /** Copper plating inside drilled holes, rendered from both sides so the barrel reads from any angle. */
  plating: new MeshStandardMaterial({ color: "#B8893A", metalness: 1, roughness: 0.35, side: DoubleSide }),
  /** Tin-lead or SAC solder and tinned leads. */
  solder: new MeshStandardMaterial({ color: "#D6DADF", metalness: 1, roughness: 0.18 }),
  lead: new MeshStandardMaterial({ color: "#C3C8CE", metalness: 1, roughness: 0.3 }),
  epoxy: new MeshStandardMaterial({ color: "#1C1D21", roughness: 0.55 }),
  ceramic: new MeshStandardMaterial({ color: "#B4895B", roughness: 0.7 }),
  resistorBody: new MeshPhysicalMaterial({ color: "#D8C6A0", roughness: 0.45, clearcoat: 0.6, clearcoatRoughness: 0.3 }),
  terminal: new MeshStandardMaterial({ color: "#1F7A4D", roughness: 0.5 }),
  cavity: new MeshStandardMaterial({ color: "#07080A", roughness: 1 }),
  fallback: new MeshStandardMaterial({ color: "#4A4D55", roughness: 0.6 }),
} as const;

const bandCache = new Map<string, MeshPhysicalMaterial>();

/** Lacquered paint for a resistor colour band, cached per colour. */
export const bandMaterial = (colour: string) => {
  let material = bandCache.get(colour);
  if (!material) {
    material = new MeshPhysicalMaterial({ color: colour, roughness: 0.4, clearcoat: 0.6, clearcoatRoughness: 0.3 });
    bandCache.set(colour, material);
  }
  return material;
};


/**
 * Recolours the solder mask, and the copper seen through it, on every board at once.
 * @param colour - Mask colour.
 */
export const applyMaskColour = (colour: MaskColour) => {
  const finish = finishes[colour];
  materials.mask.color.set(finish.mask);
  materials.maskedCopper.color.set(finish.copper);
  glowColour.set(finish.glow);
};

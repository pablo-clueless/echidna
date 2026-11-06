import { Color, DoubleSide, MeshPhysicalMaterial, MeshStandardMaterial } from "three";

import type { MaskColour } from "@/stores/layout";

/** Solder mask colour for each finish the studio offers. Tracks stay copper on every one. */
const masks: Record<MaskColour, string> = {
  black: "#0C0D0F",
  green: "#0E4A28",
  blue: "#0E2C5E",
  red: "#6E1212",
};

/** Bright copper, for the tracks and vias on every mask colour. */
const COPPER = "#C8763C";

/** The warm copper halo `TraceGlow` draws round each track, the same on every mask colour. */
export const glowColour = new Color("#B8652E");

/**
 * Specular strength of the solder mask, as a fraction of a plain dielectric's. Mask is a thin satin lacquer: at full
 * strength the studio's key light and overhead softbox wash a black board out to mid grey and a green one to sage,
 * from any angle, so the mask reflects about a third as much and keeps its colour while still catching highlights.
 */
const MASK_SPECULAR = 0.3;

/** Shared physical materials, created once so every part reuses the same shader programs. */
export const materials = {
  /** Satin solder mask over FR-4. A clearcoat here washes the board out to grey. */
  mask: new MeshPhysicalMaterial({
    color: "#0C0D0F",
    roughness: 0.6,
    specularIntensity: MASK_SPECULAR,
  }),
  /**
   * Copper tracks and vias. Drawn as bright copper on every mask colour, so the circuit reads at a glance, with a
   * thin clear lacquer over the metal like the mask that covers it.
   */
  maskedCopper: new MeshPhysicalMaterial({
    color: COPPER,
    metalness: 0.85,
    roughness: 0.32,
    clearcoat: 0.5,
    clearcoatRoughness: 0.4,
  }),
  /** Exposed laminate on the board edge and hole walls. */
  laminate: new MeshStandardMaterial({ color: "#B7A77C", roughness: 0.85 }),
  /** ENIG pad finish. */
  gold: new MeshStandardMaterial({ color: "#E2B866", metalness: 1, roughness: 0.28 }),
  /** Copper plating inside drilled holes, rendered from both sides so the barrel reads from any angle. */
  plating: new MeshStandardMaterial({
    color: "#B8893A",
    metalness: 1,
    roughness: 0.35,
    side: DoubleSide,
  }),
  /** Tin-lead or SAC solder and tinned leads. */
  solder: new MeshStandardMaterial({ color: "#D6DADF", metalness: 1, roughness: 0.18 }),
  lead: new MeshStandardMaterial({ color: "#C3C8CE", metalness: 1, roughness: 0.3 }),
  epoxy: new MeshStandardMaterial({ color: "#1C1D21", roughness: 0.55 }),
  ceramic: new MeshStandardMaterial({ color: "#B4895B", roughness: 0.7 }),
  resistorBody: new MeshPhysicalMaterial({
    color: "#D8C6A0",
    roughness: 0.45,
    clearcoat: 0.6,
    clearcoatRoughness: 0.3,
  }),
  terminal: new MeshStandardMaterial({ color: "#1F7A4D", roughness: 0.5 }),
  cavity: new MeshStandardMaterial({ color: "#07080A", roughness: 1 }),
  /** Powder-coated steel, for a desktop case. */
  caseSteel: new MeshStandardMaterial({ color: "#2A2C31", metalness: 0.55, roughness: 0.55 }),
  /** Bead-blasted anodised aluminium, for a laptop's bottom shell. */
  anodised: new MeshStandardMaterial({ color: "#A7ABB2", metalness: 0.85, roughness: 0.42 }),
  /** Rubber feet and hinge covers. */
  rubber: new MeshStandardMaterial({ color: "#16171A", roughness: 0.9 }),
  fallback: new MeshStandardMaterial({ color: "#4A4D55", roughness: 0.6 }),
} as const;

const bandCache = new Map<string, MeshPhysicalMaterial>();

/** Lacquered paint for a resistor colour band, cached per colour. */
export const bandMaterial = (colour: string) => {
  let material = bandCache.get(colour);
  if (!material) {
    material = new MeshPhysicalMaterial({
      color: colour,
      roughness: 0.4,
      clearcoat: 0.6,
      clearcoatRoughness: 0.3,
    });
    bandCache.set(colour, material);
  }
  return material;
};

/**
 * Recolours the solder mask on every board at once. Tracks keep their copper colour.
 * @param colour - Mask colour.
 */
export const applyMaskColour = (colour: MaskColour) => {
  materials.mask.color.set(masks[colour]);
};

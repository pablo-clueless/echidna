import { MeshPhysicalMaterial, MeshStandardMaterial } from "three";

/** Shared physical materials, created once so every part reuses the same shader programs. */
export const materials = {
  /** Satin black solder mask over FR-4. A clearcoat here washes the board out to grey. */
  mask: new MeshStandardMaterial({ color: "#0C0D0F", roughness: 0.68 }),
  /** Exposed laminate on the board edge and hole walls. */
  laminate: new MeshStandardMaterial({ color: "#B7A77C", roughness: 0.85 }),
  /** ENIG pad finish. */
  gold: new MeshStandardMaterial({ color: "#E2B866", metalness: 1, roughness: 0.28 }),
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


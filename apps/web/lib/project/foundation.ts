import type { ComponentSpec } from "@echidna/core";

import type { BoardSize, ProjectData } from "./model";

/**
 * What a project is built on. Circuits and dev boards go on a bare PCB. A desktop or laptop build goes in its own
 * chassis, because a motherboard and its modules are never soldered onto a hobby board.
 */
export type Foundation = "pcb" | "desktop" | "laptop";

export const FOUNDATIONS: readonly Foundation[] = ["pcb", "desktop", "laptop"];

export type ChassisSpec = BoardSize & {
  /** Height of the walls, in millimetres. */
  wall: number;
  /** Where the mainboard's centre is screwed down, in millimetres from the chassis centre. */
  mount: { x: number; z: number };
  /** How far above the floor the tallest part stands, in millimetres, such as a tower cooler or the open lid. */
  headroom: number;
};

/**
 * Each chassis at life size, in millimetres. The desktop is a mid-tower laid on its side with the side panel off,
 * the motherboard on its tray towards the top and the PSU in the shroud below. The laptop is its bottom shell with
 * the lid open behind the hinge, the mainboard towards the hinge and the battery under the palm rest. A PCB has no
 * fixed size, so it has no entry.
 */
export const CHASSIS: Record<Exclude<Foundation, "pcb">, ChassisSpec> = {
  desktop: { width: 450, depth: 420, wall: 40, mount: { x: -40, z: -70 }, headroom: 155 },
  laptop: { width: 360, depth: 250, wall: 14, mount: { x: 0, z: -45 }, headroom: 210 },
};

/**
 * The foundations a part can go on. Circuit parts, sensors and dev boards go on a PCB. Desktop and laptop modules go
 * in the chassis of each device type they are made for, such as an NVMe drive, which fits both.
 * @param spec - Part spec.
 * @returns Foundations in preference order; the first is used when the part starts a project.
 */
export const foundationsFor = (spec: ComponentSpec): Foundation[] => {
  if (!spec.module) return ["pcb"];
  return (["desktop", "laptop"] as const).filter((f) => spec.deviceTypes.includes(f));
};

/**
 * Whether a part belongs on a foundation.
 * @param spec - Part spec.
 * @param foundation - What the project is built on.
 * @returns `true` when the part can be added to the project.
 */
export const fitsFoundation = (spec: ComponentSpec, foundation: Foundation): boolean =>
  foundationsFor(spec).includes(foundation);

/**
 * Whether a part can be added to a project. An empty project takes anything, changing its foundation to suit the
 * part; once it has parts, only those that fit its foundation.
 * @param project - The open project.
 * @param spec - Part spec.
 * @returns `true` when the part can be added.
 */
export const acceptsPart = (
  project: Pick<ProjectData, "foundation" | "components">,
  spec: ComponentSpec,
): boolean => project.components.length === 0 || fitsFoundation(spec, project.foundation);

/**
 * The foundation a project of these parts needs. A part that fits only one chassis, such as a laptop mainboard,
 * decides it; failing that, any chassis part does. Used to bring older projects, which were all built on a PCB, onto
 * the right foundation.
 * @param specs - The project's part specs, in the order they were added.
 * @returns The foundation, or a PCB when no part needs a chassis.
 */
export const foundationOf = (specs: readonly ComponentSpec[]): Foundation => {
  const chassis = specs.map(foundationsFor).filter((f) => !f.includes("pcb"));
  return (chassis.find((f) => f.length === 1) ?? chassis[0])?.[0] ?? "pcb";
};

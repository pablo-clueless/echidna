import type { ComponentSpec, DeviceType } from "@echidna/core";

import type { BoardSize, ProjectData } from "./model";

/**
 * What a project is built on. Circuits and dev boards go on a bare PCB. A desktop or laptop build goes in its own
 * chassis, because a motherboard and its modules are never soldered onto a hobby board, a drone stands on a
 * landing pad, and a phone or wearable lies opened up on a repair mat.
 */
export type Foundation = "pcb" | "desktop" | "laptop" | "drone" | "phone" | "wearable";

export const FOUNDATIONS: readonly Foundation[] = [
  "pcb",
  "desktop",
  "laptop",
  "drone",
  "phone",
  "wearable",
];

/**
 * The foundations that hold modules rather than soldered parts, each with the device type it is for, in the order a
 * part's device types are tried.
 */
const MODULE_FOUNDATIONS: readonly (readonly [Exclude<Foundation, "pcb">, DeviceType])[] = [
  ["desktop", "desktop"],
  ["laptop", "laptop"],
  ["drone", "drone"],
  ["phone", "smartphone"],
  ["wearable", "wearable"],
];

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
 * the lid open behind the hinge, the mainboard towards the hinge and the battery under the palm rest. The drone's is
 * a round landing pad with no walls, wide enough for a 5-inch quad with its propellers, the frame in the middle. A
 * phone or wearable lies on a repair mat as in a teardown: the housing with the logic board in it, the display
 * opened out to its right on its flex cable, and a wearable's other parts laid out round it. A PCB has no fixed size,
 * so it has no entry.
 */
export const CHASSIS: Record<Exclude<Foundation, "pcb">, ChassisSpec> = {
  desktop: { width: 450, depth: 420, wall: 40, mount: { x: -40, z: -70 }, headroom: 155 },
  laptop: { width: 360, depth: 250, wall: 14, mount: { x: 0, z: -45 }, headroom: 210 },
  drone: { width: 420, depth: 420, wall: 0, mount: { x: 0, z: 0 }, headroom: 60 },
  phone: { width: 210, depth: 200, wall: 0, mount: { x: -42, z: 0 }, headroom: 12 },
  wearable: { width: 150, depth: 120, wall: 0, mount: { x: -8, z: -10 }, headroom: 8 },
};

/**
 * The foundations a part can go on. Circuit parts, sensors and dev boards go on a PCB. Desktop, laptop, drone, phone
 * and wearable modules go in the chassis of each device type they are made for, such as an NVMe drive, which fits
 * both computers.
 * @param spec - Part spec.
 * @returns Foundations in preference order; the first is used when the part starts a project.
 */
export const foundationsFor = (spec: ComponentSpec): Foundation[] => {
  if (!spec.module) return ["pcb"];
  return MODULE_FOUNDATIONS.flatMap(([f, device]) =>
    spec.deviceTypes.includes(device) ? [f] : [],
  );
};

/**
 * The foundation a ready-made build of a device type goes on.
 * @param deviceType - The build's device type.
 * @returns Its chassis; anything without one, such as a dev board, goes on a PCB.
 */
export const foundationForDevice = (deviceType: DeviceType): Foundation =>
  MODULE_FOUNDATIONS.find(([, device]) => device === deviceType)?.[0] ?? "pcb";

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

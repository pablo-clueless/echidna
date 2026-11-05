import type { ComponentSpec, HostSlot, PinRef } from "@echidna/core";
import { checkSlotFit, type SlotFit } from "@echidna/rules";

import type { ProjectData } from "./model";

type Project = Pick<ProjectData, "components" | "slots">;

/**
 * Current drawn from each of a host's rails by the parts plugged into it, from their declared supply currents.
 * @param project - Parts and slot placements.
 * @param specs - Part specs by ID.
 * @param hostId - The host board.
 * @param except - A part to leave out, such as the one being moved to another slot.
 * @returns Amps by rail ID.
 */
export const railLoads = (
  project: Project,
  specs: ReadonlyMap<string, ComponentSpec>,
  hostId: string,
  except?: string,
): Record<string, number> => {
  const loads: Record<string, number> = {};
  for (const c of project.components) {
    const placed = project.slots[c.id];
    const current = specs.get(c.specId)?.supply?.current.value;
    if (c.id === except || placed?.hostId !== hostId || current === undefined) continue;
    loads[placed.railId] = (loads[placed.railId] ?? 0) + current;
  }
  return loads;
};

export type SlotOption = {
  hostId: string;
  slot: HostSlot;
  /** The part already in the slot, if another one is. */
  occupant?: string;
  fit: SlotFit;
};

/**
 * Every slot in the project a part could go in, each checked before it is offered.
 * @param project - Parts and slot placements.
 * @param specs - Part specs by ID.
 * @param partId - The part to plug in.
 * @returns One option per slot on every host board, in project order.
 */
export const slotOptions = (project: Project, specs: ReadonlyMap<string, ComponentSpec>, partId: string): SlotOption[] => {
  const part = specs.get(project.components.find((c) => c.id === partId)?.specId ?? "");
  if (!part?.supply) return [];
  return project.components.flatMap((host) => {
    const hostSpec = specs.get(host.specId);
    return (hostSpec?.host?.slots ?? []).map((slot) => {
      const occupant = Object.entries(project.slots).find(
        ([id, at]) => id !== partId && at.hostId === host.id && at.slotId === slot.id,
      )?.[0];
      const fit = checkSlotFit(hostSpec as ComponentSpec, slot.id, part, railLoads(project, specs, host.id, partId));
      return { hostId: host.id, slot, fit, ...(occupant ? { occupant } : {}) };
    });
  });
};

/**
 * The connections plugging a part into a slot makes: its supply to the rail, its ground to the host's, and each
 * signal the part and slot share.
 * @param host - The host board's spec.
 * @param hostId - The host board's ID.
 * @param slot - The slot.
 * @param part - The part's spec.
 * @param partId - The part's ID.
 * @param railId - The rail the part draws from.
 * @returns Pairs of pins to wire together.
 */
export const slotConnections = (
  host: ComponentSpec,
  hostId: string,
  slot: HostSlot,
  part: ComponentSpec,
  partId: string,
  railId: string,
): Array<[PinRef, PinRef]> => {
  const supply = part.supply;
  const rail = host.host?.rails.find((r) => r.id === railId);
  if (!supply || !rail || !host.host) return [];
  const pair = (hostPin: string, partPin: string): [PinRef, PinRef] => [
    { componentId: hostId, pinId: hostPin },
    { componentId: partId, pinId: partPin },
  ];
  return [
    pair(rail.pinId, supply.pinId),
    pair(host.host.groundPinId, supply.groundPinId),
    ...Object.entries(slot.signals).flatMap(([signal, hostPin]) => {
      const partPin = supply.signals[signal];
      return partPin ? [pair(hostPin, partPin)] : [];
    }),
  ];
};

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

/** A part the selected one could be swapped for, checked against where the selected one is plugged in. */
export type SlotSwap = {
  specId: string;
  /** Whether everything still fits after the swap. */
  fits: boolean;
  /** Each plugged-in part's checks after the swap, by part ID; failing ones say why the swap is refused. */
  byPart: Record<string, SlotFit>;
};

/**
 * Parts the selected one could be swapped for without leaving its slots: other plug-in parts for a part that is
 * plugged in, checked against its slot; other host boards for a host with parts plugged in, checked against every
 * one of them, in the same slots.
 * @param project - Parts and slot placements.
 * @param specs - Part specs by ID.
 * @param candidates - Every part spec there is to swap to.
 * @param id - The selected part.
 * @returns One entry per candidate; empty when the part is in no slot and holds none.
 */
export const slotSwaps = (
  project: Project,
  specs: ReadonlyMap<string, ComponentSpec>,
  candidates: readonly ComponentSpec[],
  id: string,
): SlotSwap[] => {
  const specOf = (componentId: string) => specs.get(project.components.find((c) => c.id === componentId)?.specId ?? "");
  const current = specOf(id);
  if (!current) return [];

  const placed = project.slots[id];
  if (current.supply && placed) {
    const host = specOf(placed.hostId);
    if (!host) return [];
    const loads = railLoads(project, specs, placed.hostId, id);
    return candidates
      .filter((c) => c.supply && c.id !== current.id)
      .map((c) => {
        const fit = checkSlotFit(host, placed.slotId, c, loads);
        return { specId: c.id, fits: fit.fits, byPart: { [id]: fit } };
      });
  }

  const held = Object.entries(project.slots).filter(([, at]) => at.hostId === id);
  if (!current.host || held.length === 0) return [];
  return candidates
    .filter((c) => c.host && c.id !== current.id)
    .map((c) => {
      // Parts go back in one by one, as plugging them in would, so each sees the load of those before it.
      const loads: Record<string, number> = {};
      const byPart: Record<string, SlotFit> = {};
      for (const [partId, at] of held) {
        const part = specOf(partId);
        if (!part) continue;
        const fit = checkSlotFit(c, at.slotId, part, loads);
        byPart[partId] = fit;
        if (fit.railId) loads[fit.railId] = (loads[fit.railId] ?? 0) + (part.supply?.current.value ?? 0);
      }
      return { specId: c.id, fits: Object.values(byPart).every((f) => f.fits), byPart };
    });
};

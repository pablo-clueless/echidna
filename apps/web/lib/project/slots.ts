import { type ComponentSpec, type HostSlot, isHostModule, type PinRef } from "@echidna/core";
import { checkModuleFit, checkSlotFit, type SlotFit } from "@echidna/rules";

import type { BoardPlacement, ProjectData, Rotation } from "./model";

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
    if (
      c.id === except ||
      placed?.hostId !== hostId ||
      placed.railId === undefined ||
      current === undefined
    )
      continue;
    loads[placed.railId] = (loads[placed.railId] ?? 0) + current;
  }
  return loads;
};

/**
 * The specs of the modules plugged into a motherboard.
 * @param project - Parts and slot placements.
 * @param specs - Part specs by ID.
 * @param hostId - The motherboard.
 * @param except - Parts to leave out, such as the one being checked.
 * @returns One spec per plugged-in module, in project order.
 */
export const modulesIn = (
  project: Project,
  specs: ReadonlyMap<string, ComponentSpec>,
  hostId: string,
  except: readonly string[] = [],
): ComponentSpec[] =>
  project.components.flatMap((c) => {
    const spec = specs.get(c.specId);
    return project.slots[c.id]?.hostId === hostId && !except.includes(c.id) && spec?.module
      ? [spec]
      : [];
  });

/**
 * Whether a part plugs into a host's slots: a sensor module, or any desktop, laptop or drone module but the
 * motherboard or frame itself.
 */
export const isPluggable = (spec: ComponentSpec | undefined): boolean =>
  Boolean(spec?.supply || (spec?.module && !isHostModule(spec)));

/**
 * Checks a part against a slot as the project stands: a sensor against the rail loads of what else is plugged into
 * the host, a desktop module against the rest of the build.
 * @param project - Parts and slot placements.
 * @param specs - Part specs by ID.
 * @param host - The host board's spec.
 * @param hostId - The host board.
 * @param slotId - The slot.
 * @param part - The part to check.
 * @param except - The part being checked or swapped, left out of what the host already holds.
 * @returns The fit.
 */
export const fitInSlot = (
  project: Project,
  specs: ReadonlyMap<string, ComponentSpec>,
  host: ComponentSpec,
  hostId: string,
  slotId: string,
  part: ComponentSpec,
  except?: string,
): SlotFit =>
  part.module
    ? checkModuleFit(host, slotId, part, modulesIn(project, specs, hostId, except ? [except] : []))
    : checkSlotFit(host, slotId, part, railLoads(project, specs, hostId, except));

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
export const slotOptions = (
  project: Project,
  specs: ReadonlyMap<string, ComponentSpec>,
  partId: string,
): SlotOption[] => {
  const part = specs.get(project.components.find((c) => c.id === partId)?.specId ?? "");
  if (!part || !isPluggable(part)) return [];
  const placed = project.slots[partId];
  const options = project.components.flatMap((host) => {
    const hostSpec = specs.get(host.specId);
    return (hostSpec?.host?.slots ?? []).map((slot) => {
      const occupant = Object.entries(project.slots).find(
        ([id, at]) => id !== partId && at.hostId === host.id && at.slotId === slot.id,
      )?.[0];
      const fit = fitInSlot(
        project,
        specs,
        hostSpec as ComponentSpec,
        host.id,
        slot.id,
        part,
        partId,
      );
      return { hostId: host.id, slot, fit, ...(occupant ? { occupant } : {}) };
    });
  });
  // A motherboard has a slot for each kind of module, so a module is offered only the ones that take it.
  return part.module
    ? options.filter(
        (o) =>
          o.fit.checks[0]?.severity === "pass" ||
          (placed?.hostId === o.hostId && placed.slotId === o.slot.id),
      )
    : options;
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
  const groundPinId = host.host?.groundPinId;
  if (!supply || !rail || !groundPinId) return [];
  const pair = (hostPin: string, partPin: string): [PinRef, PinRef] => [
    { componentId: hostId, pinId: hostPin },
    { componentId: partId, pinId: partPin },
  ];
  return [
    pair(rail.pinId, supply.pinId),
    pair(groundPinId, supply.groundPinId),
    ...Object.entries(slot.signals ?? {}).flatMap(([signal, hostPin]) => {
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
  const specOf = (componentId: string) =>
    specs.get(project.components.find((c) => c.id === componentId)?.specId ?? "");
  const current = specOf(id);
  if (!current) return [];

  const placed = project.slots[id];
  if (isPluggable(current) && placed) {
    const host = specOf(placed.hostId);
    if (!host) return [];
    // Sensors swap for sensors, and a module for another in the same role made for the same kind of device, such as
    // one graphics card for another, or a laptop cooler for another laptop cooler.
    const sameFamily = (c: ComponentSpec) =>
      current.module
        ? c.module?.role === current.module.role &&
          c.deviceTypes.some((d) => current.deviceTypes.includes(d))
        : Boolean(c.supply);
    // A part made for another device's connector, such as another phone's display, is not offered at all: there
    // are a dozen of them, and none would ever fit.
    const madeForAnother = (c: ComponentSpec, fit: SlotFit) =>
      c.interfaces.some((i) => i.connector) &&
      fit.checks.some((check) => check.id === "interface" && check.severity === "fail");
    return candidates
      .filter((c) => sameFamily(c) && c.id !== current.id)
      .flatMap((c) => {
        const fit = fitInSlot(project, specs, host, placed.hostId, placed.slotId, c, id);
        return madeForAnother(c, fit)
          ? []
          : [{ specId: c.id, fits: fit.fits, byPart: { [id]: fit } }];
      });
  }

  const held = Object.entries(project.slots).filter(([, at]) => at.hostId === id);
  if (!current.host || held.length === 0) return [];
  return candidates
    .filter((c) => c.host && c.kind === current.kind && c.id !== current.id)
    .map((c) => {
      // Sensors go back in one by one, as plugging them in would, so each sees the load of those before it; a
      // module is checked against the whole build.
      const loads: Record<string, number> = {};
      const byPart: Record<string, SlotFit> = {};
      for (const [partId, at] of held) {
        const part = specOf(partId);
        if (!part) continue;
        const others = held.flatMap(([other]) => {
          const spec = specOf(other);
          return other !== partId && spec?.module ? [spec] : [];
        });
        const fit = part.module
          ? checkModuleFit(c, at.slotId, part, others)
          : checkSlotFit(c, at.slotId, part, loads);
        byPart[partId] = fit;
        if (fit.railId)
          loads[fit.railId] = (loads[fit.railId] ?? 0) + (part.supply?.current.value ?? 0);
      }
      return { specId: c.id, fits: Object.values(byPart).every((f) => f.fits), byPart };
    });
};

/**
 * Where a module sits once seated in a host's slot: the slot's seat, turned and moved with the host board.
 * Placements are in metres, as the project stores them; seats are in millimetres.
 * @param host - The host board's placement.
 * @param seat - The slot's seat on the host.
 * @returns The module's placement.
 */
export const seatPlacement = (
  host: BoardPlacement,
  seat: NonNullable<HostSlot["seat"]>,
): BoardPlacement => {
  // Placements turn clockwise seen from above, as the 3D view draws them.
  const turn = (host.rotation * Math.PI) / 180;
  const [x, z] = [seat.x / 1000, seat.z / 1000];
  return {
    x: host.x + x * Math.cos(turn) - z * Math.sin(turn),
    z: host.z + x * Math.sin(turn) + z * Math.cos(turn),
    rotation: ((host.rotation + (seat.rotation ?? 0)) % 360) as Rotation,
  };
};

/**
 * How far a seated module is raised off what its host stands on, in millimetres: the top of the board its slot is
 * on, for a host made of several boards such as a phone's stacked logic board. Anything else sits where it is drawn.
 * @param project - Parts and slot placements.
 * @param specs - Part specs by ID.
 * @param partId - The part.
 * @returns The lift, or 0 when the part is not on one of its host's boards.
 */
export const seatLift = (
  project: Project,
  specs: ReadonlyMap<string, ComponentSpec>,
  partId: string,
): number => {
  const placed = project.slots[partId];
  if (!placed) return 0;
  const host = specs.get(
    project.components.find((c) => c.id === placed.hostId)?.specId ?? "",
  )?.host;
  const slot = host?.slots.find((s) => s.id === placed.slotId);
  const board = slot?.board && host?.boards?.find((b) => b.id === slot.board);
  return board ? board.y + board.thickness : 0;
};

/**
 * The seat of the slot a part is plugged into, if that slot has one.
 * @param project - Parts and slot placements.
 * @param specs - Part specs by ID.
 * @param partId - The plugged-in part.
 * @returns The host's ID and the seat, or `undefined` when the part is not seated.
 */
export const seatOf = (
  project: Project,
  specs: ReadonlyMap<string, ComponentSpec>,
  partId: string,
): { hostId: string; seat: NonNullable<HostSlot["seat"]> } | undefined => {
  const placed = project.slots[partId];
  if (!placed) return undefined;
  const host = specs.get(project.components.find((c) => c.id === placed.hostId)?.specId ?? "");
  const seat = host?.host?.slots.find((s) => s.id === placed.slotId)?.seat;
  return seat && { hostId: placed.hostId, seat };
};

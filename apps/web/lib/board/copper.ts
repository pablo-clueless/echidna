import type { Net, NetlistComponent, PinRef } from "@echidna/core";
import { partsById } from "@echidna/library";

import { type BoardSize, deriveNets, pinKey, type ProjectData } from "@/lib/project/model";
import { type Drill, footprints, placePads } from "./footprints";
import { type Routing, type RoutePad, route } from "./routing";
import { boardKeepouts } from "./placement";

/** Track widths in millimetres: wider for ground and supply nets, which carry the whole board's current. */
export const TRACK_WIDTH = { power: 0.8, signal: 0.4 } as const;
const POWER_KINDS = new Set(["ground", "supply"]);

/**
 * Drills and copper routing for the board, from the project's placements and wiring. Board placements are stored in
 * metres; the result is in board millimetres.
 * @param project - Components, wires and board placements.
 * @returns Plated holes, the wired pads, routed tracks, and the copper net ground is on, if there is a ground.
 */
export const projectCopper = (
  project: Pick<ProjectData, "wires" | "board"> & {
    components: readonly Pick<NetlistComponent, "id" | "specId">[];
    /** Board outline in millimetres; tracks stay inside it and clear of its mounting holes and fiducials. */
    boardSize?: BoardSize;
  },
): { drills: Drill[]; pads: RoutePad[]; routing: Routing; groundNet?: string } => {
  const nets = deriveNets(project.wires);
  // Every ground symbol is the same node, as in the solver, so their nets share one copper net.
  const isGround = (pin: PinRef) =>
    partsById.get(specOf(project, pin.componentId))?.model === "ground";
  const groundNet = nets.find((net) => net.pins.some(isGround))?.id;
  const copperNet = (net: Net) => (groundNet && net.pins.some(isGround) ? groundNet : net.id);
  const netOf = new Map(
    nets.flatMap((net) => net.pins.map((pin) => [pinKey(pin), copperNet(net)] as const)),
  );
  const powerNets = new Set(
    nets
      .filter((net) =>
        net.pins.some((pin) =>
          POWER_KINDS.has(partsById.get(specOf(project, pin.componentId))?.kind ?? ""),
        ),
      )
      .map(copperNet),
  );

  const drills: Drill[] = [];
  const pads: RoutePad[] = [];
  for (const component of project.components) {
    const footprint = footprints[partsById.get(component.specId)?.footprintId ?? ""];
    const at = project.board[component.id];
    if (!footprint || !at) continue;
    for (const pad of placePads(footprint, at.x * 1000, at.z * 1000, at.rotation)) {
      if (pad.drill !== undefined) drills.push({ x: pad.x, z: pad.z, diameter: pad.drill });
      const pin = pinKey({ componentId: component.id, pinId: pad.pin });
      const net = netOf.get(pin);
      if (net)
        pads.push({
          net,
          x: pad.x,
          z: pad.z,
          radius: pad.radius,
          throughHole: pad.drill !== undefined,
          pin,
        });
    }
  }

  const size = project.boardSize;
  const routing = route(
    pads,
    (net) => (powerNets.has(net) ? TRACK_WIDTH.power : TRACK_WIDTH.signal),
    size ? { bounds: size, keepouts: boardKeepouts(size) } : {},
  );
  return { drills, pads, routing, ...(groundNet && { groundNet }) };
};

/**
 * Plated holes for every through-hole pin, without routing: cheap enough to follow a part while it is dragged.
 * @param project - Components and board placements, in metres.
 * @returns Holes in board millimetres.
 */
export const projectDrills = (
  project: Pick<ProjectData, "board"> & {
    components: readonly Pick<NetlistComponent, "id" | "specId">[];
  },
): Drill[] =>
  project.components.flatMap((component) => {
    const footprint = footprints[partsById.get(component.specId)?.footprintId ?? ""];
    const at = project.board[component.id];
    if (!footprint || !at) return [];
    return placePads(footprint, at.x * 1000, at.z * 1000, at.rotation).flatMap((pad) =>
      pad.drill === undefined ? [] : [{ x: pad.x, z: pad.z, diameter: pad.drill }],
    );
  });

const specOf = (
  project: { components: readonly Pick<NetlistComponent, "id" | "specId">[] },
  componentId: string,
) => project.components.find((c) => c.id === componentId)?.specId ?? "";

import { type ComponentSpec, isHostModule, type PinRef } from "@echidna/core";
import { createJSONStorage, persist } from "zustand/middleware";
import { builds, partsById } from "@echidna/library";
import { DEFAULT_AMBIENT } from "@echidna/rules";
import type { SlotFit } from "@echidna/rules";
import { create } from "zustand";

import {
  type BoardSize,
  clampAmbient,
  nextDesignator,
  type ProjectData,
  releaseMomentary,
  samePin,
  type SchematicPlacement,
} from "@/lib/project/model";
import {
  acceptsPart,
  CHASSIS,
  type Foundation,
  fitsFoundation,
  foundationOf,
  foundationsFor,
  foundationForDevice,
} from "@/lib/project/foundation";
import { BOARD, clampBoardSize, clampToBoard, freeBoardSpot } from "@/lib/board/placement";
import { seatOf, seatPlacement, slotConnections, slotOptions } from "@/lib/project/slots";
import { arrangeLayers, hostLayers, placedBounds } from "@/lib/schematic/layers";
import { moduleBounds, nextRotation } from "@/lib/schematic/symbols";
import { regulatorExample } from "@/lib/project/example";
import { footprints } from "@/lib/board/footprints";

export const PROJECT_STORAGE_KEY = "echidna-project";

/** Version 1 projects used a red-only LED part; it is now the generic LED set to red. */
const migrateLegacyLed = (project: ProjectData): ProjectData => ({
  ...project,
  components: project.components.map((c) =>
    c.specId === "led-red-5mm" ? { ...c, specId: "led-5mm", variant: "red" } : c,
  ),
});

/** Projects before version 4 had no ambient temperature setting; checks assumed 25 °C. */
const migrateAmbient = (project: ProjectData): ProjectData => ({
  ...project,
  ambientTemperature: DEFAULT_AMBIENT,
});

/** Projects before version 5 had no host boards, so nothing was plugged into a slot. */
const migrateSlots = (project: ProjectData): ProjectData => ({ ...project, slots: {} });

/**
 * Projects before version 6 were all built on a PCB, desktop and laptop builds included, with modules drawn smaller
 * than life. A build moves into its chassis, its mainboard onto the mount and each module into its slot's seat.
 */
const migrateFoundation = (project: ProjectData): ProjectData => {
  const specs = project.components.flatMap((c) => partsById.get(c.specId) ?? []);
  const foundation = foundationOf(specs);
  if (foundation === "pcb") return { ...project, foundation };
  let moved: ProjectData = { ...project, foundation, boardSize: sizeOf(foundation) };
  for (const c of project.components) {
    const spec = partsById.get(c.specId);
    const at = moved.board[c.id];
    if (!spec?.host || !at) continue;
    const board = { ...moved.board, [c.id]: { ...at, ...landingSpot(spec, moved) } };
    moved = { ...moved, board: reseat({ ...moved, board }, c.id) };
  }
  return moved;
};

/** Projects before version 3 had a fixed board, the default size. */
const migrateBoardSize = (project: ProjectData): ProjectData => ({
  ...project,
  boardSize: { width: BOARD.width, depth: BOARD.depth },
});

/** A chassis's fixed floor, or the default PCB outline, in millimetres. */
const sizeOf = (foundation: Foundation): BoardSize =>
  foundation === "pcb"
    ? { width: BOARD.width, depth: BOARD.depth }
    : { width: CHASSIS[foundation].width, depth: CHASSIS[foundation].depth };

type ProjectActions = {
  /**
   * Adds a part to the project, if it belongs on the project's foundation. The first part into an empty project sets
   * the foundation, such as a laptop chassis for a laptop mainboard.
   * @returns The new part's ID, or `null` if the part does not exist or does not fit the foundation.
   */
  addComponent: (specId: string, at: Pick<SchematicPlacement, "x" | "y">) => string | null;
  removeComponent: (id: string) => void;
  moveComponent: (id: string, at: Pick<SchematicPlacement, "x" | "y">) => void;
  rotateComponent: (id: string) => void;
  connect: (a: PinRef, b: PinRef) => void;
  removeWire: (id: string) => void;
  setParam: (id: string, key: string, value: number | undefined) => void;
  setVariant: (id: string, variant: string) => void;
  swapSpec: (id: string, specId: string) => void;
  placeOnBoard: (id: string, x: number, z: number) => void;
  /**
   * Turns a part a quarter turn clockwise on the board, seen from above. A module seated in a host's slot is held by
   * the host, so the host turns instead, taking everything seated in it along.
   */
  rotateOnBoard: (id: string) => void;
  /** Resizes a PCB. A chassis's size is fixed, so it ignores this. */
  resizeBoard: (size: BoardSize) => void;
  setAmbientTemperature: (kelvin: number) => void;
  /**
   * Plugs a part into a host board's slot, wiring its supply, ground and signals, if it passes every slot check.
   * @returns The checks, so a refusal can say why; `null` if the part, host or slot does not exist.
   */
  plugIn: (partId: string, hostId: string, slotId: string) => SlotFit | null;
  /** Takes a part out of its slot, removing the wires plugging it in added. */
  unplug: (partId: string) => void;
  /**
   * Swaps a part for another, keeping it in its slot, or a host board for another, keeping everything plugged into
   * it in the same slots. Anything that no longer fits is left unplugged.
   */
  swapInSlots: (id: string, specId: string) => void;
  /** Starts a new project from a host board, such as a Raspberry Pi, with nothing plugged in. */
  loadPreset: (hostSpecId: string) => void;
  /** Starts a new project from a reference build, such as the gaming desktop, with every module plugged in. */
  loadBuild: (buildId: string) => void;
  /** Lays out everything plugged into each host in layers beside it in the schematic, as plugging it in does. */
  arrangeSchematic: () => void;
  loadExample: () => void;
  /** Replaces the open project with one read from a file. A PCB's size is clamped; a chassis keeps its fixed size. */
  loadProject: (project: ProjectData) => void;
  clear: () => void;
};

export type ProjectState = ProjectData & ProjectActions;

const empty = (): ProjectData => ({
  name: "",
  foundation: "pcb",
  components: [],
  wires: [],
  schematic: {},
  board: {},
  boardSize: { width: BOARD.width, depth: BOARD.depth },
  ambientTemperature: DEFAULT_AMBIENT,
  slots: {},
});

/** Drops a part's slot placement, and the wires plugging it in added, from a project. */
const withoutSlot = (
  s: Pick<ProjectData, "slots" | "wires">,
  partId: string,
): Pick<ProjectData, "slots" | "wires"> => {
  const placed = s.slots[partId];
  if (!placed) return s;
  const { [partId]: _gone, ...slots } = s.slots;
  return { slots, wires: s.wires.filter((w) => !placed.wireIds.includes(w.id)) };
};

/** Where a new part lands on the board: clear of every placed part's courtyard. */
const boardSpotFor = (
  footprintId: string,
  project: Pick<ProjectData, "components" | "board" | "boardSize">,
) => {
  const footprint = footprints[footprintId];
  if (!footprint) return { x: 0, z: 0 };
  const placed = project.components.flatMap((c) => {
    const at = project.board[c.id];
    const placedFootprint = footprints[partsById.get(c.specId)?.footprintId ?? ""];
    return at && placedFootprint ? [{ at, footprint: placedFootprint }] : [];
  });
  return freeBoardSpot(footprint, placed, project.boardSize);
};

/**
 * Where a new part lands: a mainboard on its chassis's mount, where it is screwed down, and anything else clear of
 * every placed part. Placements are in metres.
 */
const landingSpot = (
  spec: ComponentSpec,
  project: Pick<ProjectData, "components" | "board" | "boardSize" | "foundation">,
) => {
  const mainboard = spec.host && isHostModule(spec);
  if (mainboard && project.foundation !== "pcb") {
    const { mount } = CHASSIS[project.foundation];
    return { x: mount.x / 1000, z: mount.z / 1000 };
  }
  return boardSpotFor(spec.footprintId, project);
};

/** Moves every module seated in a host's slots to follow the host's placement. */
const reseat = (
  s: Pick<ProjectData, "components" | "board" | "slots">,
  hostId: string,
): ProjectData["board"] => {
  const host = s.board[hostId];
  if (!host) return s.board;
  const board = { ...s.board };
  for (const [part, at] of Object.entries(s.slots)) {
    if (at.hostId !== hostId) continue;
    const seated = seatOf(s, partsById, part);
    if (seated) board[part] = seatPlacement(host, seated.seat);
  }
  return board;
};

/**
 * Lays everything plugged into a host out in layers beside it in the schematic, the host staying where it is. A
 * part stacked on another draws above it, parts side by side on the board side by side.
 */
const layered = (
  s: Pick<ProjectData, "components" | "schematic" | "slots">,
  hostId: string,
): ProjectData["schematic"] => {
  const specOf = (id: string) => partsById.get(s.components.find((c) => c.id === id)?.specId ?? "");
  const host = specOf(hostId);
  const hostAt = s.schematic[hostId];
  if (!host || !hostAt) return s.schematic;
  const plugged = Object.entries(s.slots)
    .filter(([part, at]) => at.hostId === hostId && s.schematic[part])
    .map(([id, at]) => ({ id, slotId: at.slotId }));
  const { cells } = hostLayers(host, plugged);
  const bounds = (id: string) => {
    const spec = specOf(id);
    return spec ? placedBounds(spec, s.schematic[id]?.rotation ?? 0) : { w: 2, h: 1 };
  };
  const placed = arrangeLayers({ at: hostAt, ...bounds(hostId) }, cells, bounds);
  const schematic = { ...s.schematic };
  for (const [id, at] of placed) {
    const current = schematic[id];
    if (current) schematic[id] = { ...current, ...at };
  }
  return schematic;
};

let wireCount = 0;
const wireId = (wires: ProjectData["wires"]) => {
  const ids = new Set(wires.map((w) => w.id));
  let id = `W${++wireCount}`;
  while (ids.has(id)) id = `W${++wireCount}`;
  return id;
};

/**
 * The single source of truth for the open project: parts, wires (from which nets are derived), schematic
 * placement and board placement. The solver, rule engine, schematic and 3D view all read from here.
 * @returns The project store.
 */
export const useProjectStore = create<ProjectState>()(
  persist(
    (set, get) => ({
      ...empty(),

      addComponent: (specId, at) => {
        const spec = partsById.get(specId);
        if (!spec || !acceptsPart(get(), spec)) return null;
        const { foundation } = get();
        if (!fitsFoundation(spec, foundation)) {
          const next = foundationsFor(spec)[0] ?? "pcb";
          set({ foundation: next, boardSize: sizeOf(next) });
        }
        const id = nextDesignator(
          spec.kind,
          get().components.map((c) => c.id),
        );
        set((s) => ({
          components: [...s.components, { id, specId }],
          schematic: { ...s.schematic, [id]: { ...at, rotation: 0 } },
          board:
            spec.model === "ground"
              ? s.board
              : { ...s.board, [id]: { ...landingSpot(spec, s), rotation: 0 } },
        }));
        return id;
      },

      removeComponent: (id) =>
        set((s) => {
          const { [id]: _schematic, ...schematic } = s.schematic;
          const { [id]: _board, ...board } = s.board;
          // A removed host unplugs everything in it; their wires all touch it, so they go below.
          const slots = Object.fromEntries(
            Object.entries(s.slots).filter(([part, at]) => part !== id && at.hostId !== id),
          );
          return {
            components: s.components.filter((c) => c.id !== id),
            wires: s.wires.filter((w) => w.a.componentId !== id && w.b.componentId !== id),
            schematic,
            board,
            slots,
          };
        }),

      moveComponent: (id, at) =>
        set((s) => {
          const current = s.schematic[id];
          if (!current || (current.x === at.x && current.y === at.y)) return s;
          return { schematic: { ...s.schematic, [id]: { ...current, ...at } } };
        }),

      rotateComponent: (id) =>
        set((s) => {
          const current = s.schematic[id];
          return current
            ? {
                schematic: {
                  ...s.schematic,
                  [id]: { ...current, rotation: nextRotation(current.rotation) },
                },
              }
            : s;
        }),

      connect: (a, b) =>
        set((s) => {
          const duplicate = s.wires.some(
            (w) => (samePin(w.a, a) && samePin(w.b, b)) || (samePin(w.a, b) && samePin(w.b, a)),
          );
          if (samePin(a, b) || duplicate) return s;
          return { wires: [...s.wires, { id: wireId(s.wires), a, b }] };
        }),

      removeWire: (id) => set((s) => ({ wires: s.wires.filter((w) => w.id !== id) })),

      setParam: (id, key, value) =>
        set((s) => ({
          components: s.components.map((c) => {
            if (c.id !== id) return c;
            const { [key]: _old, ...rest } = c.paramOverrides ?? {};
            const paramOverrides = value === undefined ? rest : { ...rest, [key]: value };
            const { paramOverrides: _all, ...bare } = c;
            return Object.keys(paramOverrides).length ? { ...bare, paramOverrides } : bare;
          }),
        })),

      setVariant: (id, variant) =>
        set((s) => ({
          components: s.components.map((c) => (c.id === id ? { ...c, variant } : c)),
        })),

      // A swapped part comes out of its slot, and a swapped host lets go of what was in it: the new part has to pass
      // the slot checks again.
      swapSpec: (id, specId) =>
        set((s) => {
          const spec = partsById.get(specId);
          if (!spec || !fitsFoundation(spec, s.foundation)) return s;
          const unplugged = Object.entries(s.slots)
            .filter(([part, at]) => part === id || at.hostId === id)
            .reduce((acc, [part]) => withoutSlot(acc, part), { slots: s.slots, wires: s.wires });
          return {
            ...unplugged,
            components: s.components.map((c) => (c.id === id ? { id, specId } : c)),
          };
        }),

      placeOnBoard: (id, x, z) =>
        set((s) => {
          const current = s.board[id];
          if (!current) return s;
          // Modules seated in a host's slots move with it.
          return { board: reseat({ ...s, board: { ...s.board, [id]: { ...current, x, z } } }, id) };
        }),

      rotateOnBoard: (id) =>
        set((s) => {
          const held = seatOf(s, partsById, id)?.hostId ?? id;
          const current = s.board[held];
          if (!current) return s;
          const turned = {
            ...current,
            ...clampToBoard(current.x, current.z, s.boardSize),
            rotation: nextRotation(current.rotation),
          };
          return { board: reseat({ ...s, board: { ...s.board, [held]: turned } }, held) };
        }),

      resizeBoard: (size) =>
        set((s) => {
          if (s.foundation !== "pcb") return s;
          const boardSize = clampBoardSize(size);
          // Parts left outside the new outline move in to its edge.
          const board = Object.fromEntries(
            Object.entries(s.board).map(([id, at]) => [
              id,
              { ...at, ...clampToBoard(at.x, at.z, boardSize) },
            ]),
          );
          return { boardSize, board };
        }),

      setAmbientTemperature: (kelvin) => set({ ambientTemperature: clampAmbient(kelvin) }),

      plugIn: (partId, hostId, slotId) => {
        const s = get();
        const option = slotOptions(s, partsById, partId).find(
          (o) => o.hostId === hostId && o.slot.id === slotId,
        );
        const part = partsById.get(s.components.find((c) => c.id === partId)?.specId ?? "");
        const host = partsById.get(s.components.find((c) => c.id === hostId)?.specId ?? "");
        if (!option || !part || !host) return null;
        const railId = option.fit.railId;
        // A sensor needs a rail to draw from; a desktop module is powered from the PSU, a drone's from its battery.
        if (!option.fit.fits || option.occupant || (part.supply && !railId)) return option.fit;
        set((state) => {
          const freed = withoutSlot(state, partId);
          const wires = [...freed.wires];
          const wireIds: string[] = [];
          for (const [a, b] of railId
            ? slotConnections(host, hostId, option.slot, part, partId, railId)
            : []) {
            const existing = wires.find(
              (w) => (samePin(w.a, a) && samePin(w.b, b)) || (samePin(w.a, b) && samePin(w.b, a)),
            );
            if (existing) continue;
            const id = wireId(wires);
            wires.push({ id, a, b });
            wireIds.push(id);
          }
          const slots = {
            ...freed.slots,
            [partId]: { hostId, slotId, ...(railId ? { railId } : {}), wireIds },
          };
          // A module with a seat in the slot moves into it, such as a graphics card into its PCIe slot, and in the
          // schematic takes its place in the host's layers.
          return {
            wires,
            slots,
            board: reseat({ ...state, slots }, hostId),
            schematic: layered({ ...state, slots }, hostId),
          };
        });
        return option.fit;
      },

      unplug: (partId) => set((s) => withoutSlot(s, partId)),

      swapInSlots: (id, specId) => {
        const replug = Object.entries(get().slots).filter(
          ([part, at]) => part === id || at.hostId === id,
        );
        get().swapSpec(id, specId);
        for (const [part, at] of replug) get().plugIn(part, at.hostId, at.slotId);
      },

      loadPreset: (hostSpecId) => {
        const spec = partsById.get(hostSpecId);
        if (!spec?.host) return;
        const foundation = foundationsFor(spec)[0] ?? "pcb";
        set({ ...empty(), foundation, boardSize: sizeOf(foundation) });
        get().addComponent(hostSpecId, { x: 8, y: 6 });
      },

      loadBuild: (buildId) => {
        const build = builds.find((b) => b.id === buildId);
        if (!build) return;
        // A build goes in its device's chassis, never on a PCB.
        const foundation = foundationForDevice(build.deviceType);
        set({ ...empty(), foundation, boardSize: sizeOf(foundation) });
        // In the schematic the host's box sits on the left, top-left on the grid, and plugging each module in lays
        // it out in layers beside it. In the chassis, each module is seated in its slot.
        const hostSpec = partsById.get(build.hostId);
        const host = hostSpec ? moduleBounds(hostSpec) : { w: 4, h: 4 };
        const hostId = get().addComponent(build.hostId, {
          x: 2 + Math.ceil(host.w),
          y: 2 + Math.ceil(host.h),
        });
        if (!hostId) return;
        for (const [slotId, specId] of Object.entries(build.modules)) {
          const id = get().addComponent(specId, { x: 0, y: 0 });
          if (id) get().plugIn(id, hostId, slotId);
        }
      },

      arrangeSchematic: () =>
        set((s) => {
          const hosts = new Set(Object.values(s.slots).map((at) => at.hostId));
          let schematic = s.schematic;
          for (const hostId of hosts) schematic = layered({ ...s, schematic }, hostId);
          return { schematic };
        }),

      loadExample: () => set(regulatorExample()),

      loadProject: (project) =>
        set({
          ...project,
          boardSize:
            project.foundation === "pcb"
              ? clampBoardSize(project.boardSize)
              : sizeOf(project.foundation),
        }),

      clear: () => set(empty()),
    }),
    {
      name: PROJECT_STORAGE_KEY,
      version: 6,
      migrate: (persisted, version) => {
        let project = persisted as ProjectData;
        if (version < 2) project = migrateLegacyLed(project);
        if (version < 3) project = migrateBoardSize(project);
        if (version < 4) project = migrateAmbient(project);
        if (version < 5) project = migrateSlots(project);
        if (version < 6) project = migrateFoundation(project);
        return project;
      },
      storage: createJSONStorage(() => localStorage),
      partialize: ({
        name,
        foundation,
        components,
        wires,
        schematic,
        board,
        boardSize,
        ambientTemperature,
        slots,
      }) => ({
        name,
        foundation,
        components: releaseMomentary(components, partsById),
        wires,
        schematic,
        board,
        boardSize,
        ambientTemperature,
        slots,
      }),
      skipHydration: true,
    },
  ),
);

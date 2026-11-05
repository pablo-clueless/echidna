import { createJSONStorage, persist } from "zustand/middleware";
import { builds, partsById } from "@echidna/library";
import { DEFAULT_AMBIENT } from "@echidna/rules";
import type { SlotFit } from "@echidna/rules";
import type { PinRef } from "@echidna/core";
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
import { BOARD, clampBoardSize, clampToBoard, freeBoardSpot } from "@/lib/board/placement";
import { slotConnections, slotOptions } from "@/lib/project/slots";
import { regulatorExample } from "@/lib/project/example";
import { nextRotation } from "@/lib/schematic/symbols";
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
const migrateAmbient = (project: ProjectData): ProjectData => ({ ...project, ambientTemperature: DEFAULT_AMBIENT });

/** Projects before version 5 had no host boards, so nothing was plugged into a slot. */
const migrateSlots = (project: ProjectData): ProjectData => ({ ...project, slots: {} });

/** Projects before version 3 had a fixed board, the default size. */
const migrateBoardSize = (project: ProjectData): ProjectData => ({
  ...project,
  boardSize: { width: BOARD.width, depth: BOARD.depth },
});

type ProjectActions = {
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
  loadExample: () => void;
  clear: () => void;
};

export type ProjectState = ProjectData & ProjectActions;

const empty = (): ProjectData => ({
  name: "",
  components: [],
  wires: [],
  schematic: {},
  board: {},
  boardSize: { width: BOARD.width, depth: BOARD.depth },
  ambientTemperature: DEFAULT_AMBIENT,
  slots: {},
});

/** Drops a part's slot placement, and the wires plugging it in added, from a project. */
const withoutSlot = (s: Pick<ProjectData, "slots" | "wires">, partId: string): Pick<ProjectData, "slots" | "wires"> => {
  const placed = s.slots[partId];
  if (!placed) return s;
  const { [partId]: _gone, ...slots } = s.slots;
  return { slots, wires: s.wires.filter((w) => !placed.wireIds.includes(w.id)) };
};

/** Where a new part lands on the board: clear of every placed part's courtyard. */
const boardSpotFor = (footprintId: string, project: Pick<ProjectData, "components" | "board" | "boardSize">) => {
  const footprint = footprints[footprintId];
  if (!footprint) return { x: 0, z: 0 };
  const placed = project.components.flatMap((c) => {
    const at = project.board[c.id];
    const placedFootprint = footprints[partsById.get(c.specId)?.footprintId ?? ""];
    return at && placedFootprint ? [{ at, footprint: placedFootprint }] : [];
  });
  return freeBoardSpot(footprint, placed, project.boardSize);
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
        if (!spec) return null;
        const id = nextDesignator(spec.kind, get().components.map((c) => c.id));
        set((s) => ({
          components: [...s.components, { id, specId }],
          schematic: { ...s.schematic, [id]: { ...at, rotation: 0 } },
          board:
            spec.model === "ground"
              ? s.board
              : { ...s.board, [id]: { ...boardSpotFor(spec.footprintId, s), rotation: 0 } },
        }));
        return id;
      },

      removeComponent: (id) =>
        set((s) => {
          const { [id]: _schematic, ...schematic } = s.schematic;
          const { [id]: _board, ...board } = s.board;
          // A removed host unplugs everything in it; their wires all touch it, so they go below.
          const slots = Object.fromEntries(Object.entries(s.slots).filter(([part, at]) => part !== id && at.hostId !== id));
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
          return current ? { schematic: { ...s.schematic, [id]: { ...current, rotation: nextRotation(current.rotation) } } } : s;
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
        set((s) => ({ components: s.components.map((c) => (c.id === id ? { ...c, variant } : c)) })),

      // A swapped part comes out of its slot, and a swapped host lets go of what was in it: the new part has to pass
      // the slot checks again.
      swapSpec: (id, specId) =>
        set((s) => {
          const unplugged = Object.entries(s.slots)
            .filter(([part, at]) => part === id || at.hostId === id)
            .reduce((acc, [part]) => withoutSlot(acc, part), { slots: s.slots, wires: s.wires });
          return { ...unplugged, components: s.components.map((c) => (c.id === id ? { id, specId } : c)) };
        }),

      placeOnBoard: (id, x, z) =>
        set((s) => {
          const current = s.board[id];
          return current ? { board: { ...s.board, [id]: { ...current, x, z } } } : s;
        }),

      resizeBoard: (size) =>
        set((s) => {
          const boardSize = clampBoardSize(size);
          // Parts left outside the new outline move in to its edge.
          const board = Object.fromEntries(
            Object.entries(s.board).map(([id, at]) => [id, { ...at, ...clampToBoard(at.x, at.z, boardSize) }]),
          );
          return { boardSize, board };
        }),

      setAmbientTemperature: (kelvin) => set({ ambientTemperature: clampAmbient(kelvin) }),

      plugIn: (partId, hostId, slotId) => {
        const s = get();
        const option = slotOptions(s, partsById, partId).find((o) => o.hostId === hostId && o.slot.id === slotId);
        const part = partsById.get(s.components.find((c) => c.id === partId)?.specId ?? "");
        const host = partsById.get(s.components.find((c) => c.id === hostId)?.specId ?? "");
        if (!option || !part || !host) return null;
        const railId = option.fit.railId;
        // A sensor needs a rail to draw from; a desktop module is powered from the PSU.
        if (!option.fit.fits || option.occupant || (part.supply && !railId)) return option.fit;
        set((state) => {
          const freed = withoutSlot(state, partId);
          const wires = [...freed.wires];
          const wireIds: string[] = [];
          for (const [a, b] of railId ? slotConnections(host, hostId, option.slot, part, partId, railId) : []) {
            const existing = wires.find((w) => (samePin(w.a, a) && samePin(w.b, b)) || (samePin(w.a, b) && samePin(w.b, a)));
            if (existing) continue;
            const id = wireId(wires);
            wires.push({ id, a, b });
            wireIds.push(id);
          }
          return { wires, slots: { ...freed.slots, [partId]: { hostId, slotId, ...(railId ? { railId } : {}), wireIds } } };
        });
        return option.fit;
      },

      unplug: (partId) => set((s) => withoutSlot(s, partId)),

      swapInSlots: (id, specId) => {
        const replug = Object.entries(get().slots).filter(([part, at]) => part === id || at.hostId === id);
        get().swapSpec(id, specId);
        for (const [part, at] of replug) get().plugIn(part, at.hostId, at.slotId);
      },

      loadPreset: (hostSpecId) => {
        const spec = partsById.get(hostSpecId);
        if (!spec?.host) return;
        set(empty());
        get().addComponent(hostSpecId, { x: 8, y: 6 });
      },

      loadBuild: (buildId) => {
        const build = builds.find((b) => b.id === buildId);
        if (!build) return;
        // A whole build needs a larger board than the default to lay its modules out on.
        set({ ...empty(), boardSize: clampBoardSize({ width: 120, depth: 80 }) });
        const hostId = get().addComponent(build.hostId, { x: 8, y: 12 });
        if (!hostId) return;
        // Modules stack in a column beside the motherboard: each box is two grid units tall, with room for its label.
        Object.entries(build.modules).forEach(([slotId, specId], i) => {
          const id = get().addComponent(specId, { x: 22, y: 2 + i * 4 });
          if (id) get().plugIn(id, hostId, slotId);
        });
      },

      loadExample: () => set(regulatorExample()),

      clear: () => set(empty()),
    }),
    {
      name: PROJECT_STORAGE_KEY,
      version: 5,
      migrate: (persisted, version) => {
        let project = persisted as ProjectData;
        if (version < 2) project = migrateLegacyLed(project);
        if (version < 3) project = migrateBoardSize(project);
        if (version < 4) project = migrateAmbient(project);
        if (version < 5) project = migrateSlots(project);
        return project;
      },
      storage: createJSONStorage(() => localStorage),
      partialize: ({ name, components, wires, schematic, board, boardSize, ambientTemperature, slots }) => ({
        name,
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

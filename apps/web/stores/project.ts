import { createJSONStorage, persist } from "zustand/middleware";
import { partsById } from "@echidna/library";
import type { PinRef } from "@echidna/core";
import { create } from "zustand";

import { nextDesignator, type ProjectData, samePin, type SchematicPlacement } from "@/lib/project/model";
import { regulatorExample } from "@/lib/project/example";
import { nextRotation } from "@/lib/schematic/symbols";
import { freeBoardSpot } from "@/lib/board/placement";
import { footprints } from "@/lib/board/footprints";

export const PROJECT_STORAGE_KEY = "echidna-project";


type ProjectActions = {
  addComponent: (specId: string, at: Pick<SchematicPlacement, "x" | "y">) => string | null;
  removeComponent: (id: string) => void;
  moveComponent: (id: string, at: Pick<SchematicPlacement, "x" | "y">) => void;
  rotateComponent: (id: string) => void;
  connect: (a: PinRef, b: PinRef) => void;
  removeWire: (id: string) => void;
  setParam: (id: string, key: string, value: number | undefined) => void;
  swapSpec: (id: string, specId: string) => void;
  placeOnBoard: (id: string, x: number, z: number) => void;
  loadExample: () => void;
  clear: () => void;
};

export type ProjectState = ProjectData & ProjectActions;

const empty = (): ProjectData => ({ name: "", components: [], wires: [], schematic: {}, board: {} });

/** Where a new part lands on the board: clear of every placed part's courtyard. */
const boardSpotFor = (footprintId: string, project: Pick<ProjectData, "components" | "board">) => {
  const footprint = footprints[footprintId];
  if (!footprint) return { x: 0, z: 0 };
  const placed = project.components.flatMap((c) => {
    const at = project.board[c.id];
    const placedFootprint = footprints[partsById.get(c.specId)?.footprintId ?? ""];
    return at && placedFootprint ? [{ at, footprint: placedFootprint }] : [];
  });
  return freeBoardSpot(footprint, placed);
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
          return {
            components: s.components.filter((c) => c.id !== id),
            wires: s.wires.filter((w) => w.a.componentId !== id && w.b.componentId !== id),
            schematic,
            board,
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
            return Object.keys(paramOverrides).length ? { ...c, paramOverrides } : { id: c.id, specId: c.specId };
          }),
        })),

      swapSpec: (id, specId) =>
        set((s) => ({ components: s.components.map((c) => (c.id === id ? { id, specId } : c)) })),

      placeOnBoard: (id, x, z) =>
        set((s) => {
          const current = s.board[id];
          return current ? { board: { ...s.board, [id]: { ...current, x, z } } } : s;
        }),

      loadExample: () => set(regulatorExample()),

      clear: () => set(empty()),
    }),
    {
      name: PROJECT_STORAGE_KEY,
      version: 1,
      storage: createJSONStorage(() => localStorage),
      partialize: ({ name, components, wires, schematic, board }) => ({ name, components, wires, schematic, board }),
      skipHydration: true,
    },
  ),
);

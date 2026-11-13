import type { ComponentSpec } from "@echidna/core";

import { clampAmbient, type ProjectData, type Rotation } from "@/lib/project/model";
import { FOUNDATIONS, type Foundation } from "@/lib/project/foundation";

/** What a saved project file says it is, so other tools can recognise one. */
export const PROJECT_FORMAT = "echidna-project";
/** The project file's version. Bump it, and the schema's, when the format changes. */
export const PROJECT_FILE_VERSION = 1;
/** Where the JSON Schema describing the file is published, relative to the site's root. */
export const PROJECT_SCHEMA_PATH = "/schemas/project.schema.json";

export type ProjectFile = {
  $schema: string;
  format: typeof PROJECT_FORMAT;
  version: number;
  project: ProjectData;
};

/**
 * The project as a file to save or share, pointing at the JSON Schema that describes it.
 * @param project - Project data, without the store's actions.
 * @param origin - The site's origin, such as `https://echidna.app`, for the schema's URL.
 * @returns Pretty-printed JSON.
 */
export const projectJson = (project: ProjectData, origin: string): string => {
  const file: ProjectFile = {
    $schema: `${origin}${PROJECT_SCHEMA_PATH}`,
    format: PROJECT_FORMAT,
    version: PROJECT_FILE_VERSION,
    project: {
      name: project.name,
      foundation: project.foundation,
      components: project.components,
      wires: project.wires,
      schematic: project.schematic,
      board: project.board,
      boardSize: project.boardSize,
      ambientTemperature: project.ambientTemperature,
      slots: project.slots,
    },
  };
  return `${JSON.stringify(file, null, 2)}\n`;
};

/** Why a file could not be opened. `parts` lists spec IDs this version of Echidna does not have. */
export type ProjectFileError =
  | { code: "json" }
  | { code: "format" }
  | { code: "version"; version: number }
  | { code: "invalid"; path: string }
  | { code: "parts"; parts: string[] };

export type ParsedProject =
  { ok: true; project: ProjectData } | { ok: false; error: ProjectFileError };

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);
const isNumber = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const isString = (v: unknown): v is string => typeof v === "string";
const ROTATIONS: readonly number[] = [0, 90, 180, 270];
const isRotation = (v: unknown): v is Rotation => ROTATIONS.includes(v as number);
const isPinRef = (v: unknown) => isObject(v) && isString(v.componentId) && isString(v.pinId);

class Invalid extends Error {
  constructor(readonly path: string) {
    super(path);
  }
}

const check = (ok: boolean, path: string) => {
  if (!ok) throw new Invalid(path);
};

const record = <T>(
  value: unknown,
  path: string,
  item: (v: unknown, path: string) => T,
): Record<string, T> => {
  check(isObject(value), path);
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, item(v, `${path}.${k}`)]),
  );
};

/**
 * Reads a project file, checking it against the same rules as its JSON Schema, and that every part in it exists.
 * Everything is copied field by field, so nothing the format does not describe reaches the store.
 * @param text - The file's contents.
 * @param specs - Part lookup by spec ID.
 * @returns The project, or why it could not be read, with the path of the first bad field.
 */
export const parseProjectFile = (
  text: string,
  specs: ReadonlyMap<string, ComponentSpec>,
): ParsedProject => {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return { ok: false, error: { code: "json" } };
  }
  if (!isObject(data) || data.format !== PROJECT_FORMAT || !isObject(data.project))
    return { ok: false, error: { code: "format" } };
  if (data.version !== PROJECT_FILE_VERSION)
    return {
      ok: false,
      error: { code: "version", version: isNumber(data.version) ? data.version : NaN },
    };
  const p = data.project;
  try {
    check(isString(p.name), "project.name");
    check(FOUNDATIONS.includes(p.foundation as Foundation), "project.foundation");
    check(Array.isArray(p.components), "project.components");
    const components = (p.components as unknown[]).map((c, i) => {
      const path = `project.components.${i}`;
      check(isObject(c) && isString(c.id) && isString(c.specId), path);
      const { id, specId, variant, paramOverrides } = c as Record<string, unknown>;
      check(variant === undefined || isString(variant), `${path}.variant`);
      const overrides =
        paramOverrides === undefined
          ? undefined
          : record(paramOverrides, `${path}.paramOverrides`, (v, at) => {
              check(isNumber(v), at);
              return v as number;
            });
      return {
        id: id as string,
        specId: specId as string,
        ...(variant === undefined ? {} : { variant: variant as string }),
        ...(overrides === undefined ? {} : { paramOverrides: overrides }),
      };
    });
    const ids = new Set(components.map((c) => c.id));
    check(ids.size === components.length, "project.components");
    check(Array.isArray(p.wires), "project.wires");
    const wires = (p.wires as unknown[]).map((w, i) => {
      const path = `project.wires.${i}`;
      check(isObject(w) && isString(w.id) && isPinRef(w.a) && isPinRef(w.b), path);
      const { id, a, b } = w as {
        id: string;
        a: Record<string, string>;
        b: Record<string, string>;
      };
      check(ids.has(a.componentId ?? "") && ids.has(b.componentId ?? ""), path);
      return {
        id,
        a: { componentId: a.componentId ?? "", pinId: a.pinId ?? "" },
        b: { componentId: b.componentId ?? "", pinId: b.pinId ?? "" },
      };
    });
    const schematic = record(p.schematic, "project.schematic", (v, at) => {
      check(isObject(v) && isNumber(v.x) && isNumber(v.y) && isRotation(v.rotation), at);
      const s = v as { x: number; y: number; rotation: Rotation };
      return { x: s.x, y: s.y, rotation: s.rotation };
    });
    const board = record(p.board, "project.board", (v, at) => {
      check(isObject(v) && isNumber(v.x) && isNumber(v.z) && isRotation(v.rotation), at);
      const s = v as { x: number; z: number; rotation: Rotation };
      return { x: s.x, z: s.z, rotation: s.rotation };
    });
    check(
      isObject(p.boardSize) && isNumber(p.boardSize.width) && isNumber(p.boardSize.depth),
      "project.boardSize",
    );
    const size = p.boardSize as { width: number; depth: number };
    check(isNumber(p.ambientTemperature), "project.ambientTemperature");
    const slots = record(p.slots, "project.slots", (v, at) => {
      check(
        isObject(v) &&
          isString(v.hostId) &&
          isString(v.slotId) &&
          (v.railId === undefined || isString(v.railId)) &&
          Array.isArray(v.wireIds) &&
          v.wireIds.every(isString),
        at,
      );
      const s = v as { hostId: string; slotId: string; railId?: string; wireIds: string[] };
      return {
        hostId: s.hostId,
        slotId: s.slotId,
        ...(s.railId === undefined ? {} : { railId: s.railId }),
        wireIds: [...s.wireIds],
      };
    });

    const unknown = [...new Set(components.map((c) => c.specId).filter((id) => !specs.has(id)))];
    if (unknown.length) return { ok: false, error: { code: "parts", parts: unknown } };

    return {
      ok: true,
      project: {
        name: p.name as string,
        foundation: p.foundation as Foundation,
        components,
        wires,
        schematic,
        board,
        boardSize: { width: size.width, depth: size.depth },
        ambientTemperature: clampAmbient(p.ambientTemperature as number),
        slots,
      },
    };
  } catch (e) {
    if (e instanceof Invalid) return { ok: false, error: { code: "invalid", path: e.path } };
    throw e;
  }
};

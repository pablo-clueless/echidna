import type { ComponentSpec, NetlistComponent } from "@echidna/core";
import { partsById } from "@echidna/library";

import { drillFile, type FabBoard, type FabPart, gerberLayers, toFab } from "./gerber";
import { paramValue, type ProjectData, switchPositions } from "@/lib/project/model";
import { type BomSource, partSourcing } from "./sourcing";
import { footprints } from "@/lib/board/footprints";
import { projectCopper } from "@/lib/board/copper";
import type { Trace } from "@/lib/board/routing";
import { formatQuantity } from "@/lib/units";
import { zip } from "./zip";

/** The parameters a part's value is printed from on the BOM, in order of preference. */
const VALUE_PARAMS = ["resistance", "capacitance", "inductance", "voltage"] as const;

/** The bill of materials' columns. */
export const BOM_COLUMNS = [
  "Designator",
  "Quantity",
  "Part",
  "Value",
  "Footprint",
  "Manufacturer",
  "MPN",
  "LCSC",
] as const;

/** Board thickness and copper layers, as the studio's board is drawn. */
const STACKUP = { layers: 2, thickness: 1.6 } as const;

/** One file in the fabrication package. */
export type FabricationFile = { name: string; content: string };

/**
 * A part's value as a fabricator reads it: its resistance, capacitance or the like, else its chosen variant.
 * @param component - The part in the project.
 * @param spec - Its spec.
 * @returns The value, in English, or an empty string for a part whose name says it all.
 */
export const partValue = (component: NetlistComponent, spec: ComponentSpec): string => {
  for (const key of VALUE_PARAMS) {
    const value = paramValue(component, spec, key);
    const unit = spec.params[key]?.unit;
    if (value !== undefined && unit) return formatQuantity(value, unit, "en");
  }
  // A switch's variants are its positions, which say nothing about which part to fit.
  if (switchPositions(spec)) return "";
  return component.variant ?? spec.variants?.[0]?.id ?? "";
};

/** Quotes a CSV field when it needs it. */
const field = (value: string | number) => {
  const text = String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};
const csv = (rows: (string | number)[][]) =>
  rows.map((r) => r.map(field).join(",")).join("\n") + "\n";

/** Orders designators as people do: R2 before R10. */
const byDesignator = (a: string, b: string) => a.localeCompare(b, "en", { numeric: true });

/** The parts that are physical: everything with a footprint, so not ground symbols. */
const physical = (project: Pick<ProjectData, "components">) =>
  project.components.flatMap((component) => {
    const spec = partsById.get(component.specId);
    return spec?.footprintId ? [{ component, spec }] : [];
  });

/**
 * The bill of materials: one row per distinct part and value, with every designator it is used for and, where the
 * library has one, the part number to buy.
 * @param project - The project's parts.
 * @returns CSV with a header row.
 */
export const billOfMaterials = (project: Pick<ProjectData, "components">): string => {
  const rows = new Map<
    string,
    { designators: string[]; spec: ComponentSpec; value: string; source?: BomSource }
  >();
  for (const { component, spec } of physical(project)) {
    const value = partValue(component, spec);
    const key = `${spec.id}\u0000${value}`;
    const source = partSourcing(component, spec);
    const row = rows.get(key) ?? { designators: [], spec, value, ...(source && { source }) };
    row.designators.push(component.id);
    rows.set(key, row);
  }
  const sorted = [...rows.values()]
    .map((row) => ({ ...row, designators: row.designators.sort(byDesignator) }))
    .sort((a, b) => byDesignator(a.designators[0] ?? "", b.designators[0] ?? ""));
  return csv([
    [...BOM_COLUMNS],
    ...sorted.map((row) => [
      row.designators.join(" "),
      row.designators.length,
      row.spec.name,
      row.value,
      row.spec.footprintId,
      row.source?.manufacturer ?? "",
      row.source?.mpn ?? "",
      row.source?.lcsc ?? "",
    ]),
  ]);
};

/**
 * The parts placed on a bare board, in board millimetres, with their footprints.
 * @param project - Parts and their board placements, which are stored in metres.
 * @returns Each part that has a footprint and a place on the board.
 */
const fabParts = (project: Pick<ProjectData, "components" | "board">): FabPart[] =>
  physical(project).flatMap(({ component, spec }) => {
    const footprint = footprints[spec.footprintId];
    const at = project.board[component.id];
    return footprint && at
      ? [{ id: component.id, footprint, x: at.x * 1000, z: at.z * 1000, rotation: at.rotation }]
      : [];
  });

/**
 * What the Gerber and drill files are drawn from: a bare board's outline, placed parts and routed copper.
 * @param project - The whole project, on a bare board.
 * @returns The board in millimetres.
 */
export const fabBoard = (project: ProjectData): FabBoard => {
  const { pads, routing, groundNet } = projectCopper(project);
  return {
    size: project.boardSize,
    parts: fabParts(project),
    routing,
    padNets: new Map(pads.flatMap((pad) => (pad.pin ? [[pad.pin, pad.net] as const] : []))),
    ...(groundNet && { groundNet }),
  };
};

/**
 * The pick-and-place (centroid) file an assembler's machine works from: each part's centre and turn.
 * @param project - The project's parts, placements and board outline.
 * @returns CSV in millimetres from the board's bottom-left corner, rotation anticlockwise seen from above.
 */
export const pickAndPlace = (
  project: Pick<ProjectData, "components" | "board" | "boardSize">,
): string => {
  const fab = toFab(project.boardSize);
  const values = new Map(
    physical(project).map(({ component, spec }) => [component.id, { component, spec }]),
  );
  const rows = fabParts(project)
    .sort((a, b) => byDesignator(a.id, b.id))
    .map((part) => {
      const [x, y] = fab([part.x, part.z]);
      const found = values.get(part.id);
      return [
        part.id,
        found ? partValue(found.component, found.spec) : "",
        found?.spec.footprintId ?? "",
        x.toFixed(3),
        y.toFixed(3),
        // The studio turns parts clockwise; placement files count anticlockwise.
        (360 - part.rotation) % 360,
        "top",
      ];
    });
  return csv([
    ["Designator", "Value", "Footprint", "Mid X", "Mid Y", "Rotation", "Layer"],
    ...rows,
  ]);
};

/** The notes that go with the files, in English as fabricators expect. */
const readme = (
  project: Pick<ProjectData, "boardSize">,
  files: readonly string[],
  unrouted: readonly Trace[],
  pcb: boolean,
) => {
  const lines = ["Echidna fabrication output", "", "Files:", ...files.map((f) => `  ${f}`), ""];
  lines.push(
    "Part numbers in the bill of materials are given where the library has checked one. Resistor numbers follow",
    "YAGEO's CFR-25JB-52 code for the value. Confirm stock and packaging with the distributor before ordering;",
    "rows without a part number need one chosen.",
    "",
  );
  if (pcb) {
    lines.push(
      `Board: ${project.boardSize.width} x ${project.boardSize.depth} mm, ${STACKUP.layers} layers, ${STACKUP.thickness} mm FR-4.`,
      "Units are millimetres. The origin is the board's bottom-left corner, seen from the top.",
      "Gerber files are RS-274X with X2 attributes; the drill file is Excellon, all holes plated.",
      "Vias are tented. Parts are on the top side only. Both copper layers carry a ground pour, kept",
      "0.3 mm from other nets, with thermal spokes to ground pads; copper with no path to ground is removed.",
      "",
    );
    if (unrouted.length > 0) {
      lines.push(
        `WARNING: ${unrouted.length} connection(s) could not be routed and have no copper. Finish them before ordering:`,
        ...unrouted.map((t) => `  net ${t.net}${t.ends ? `: ${t.ends[0]} to ${t.ends[1]}` : ""}`),
        "",
      );
    }
  } else {
    lines.push(
      "This build is made of modules rather than parts soldered to a board, so it has a bill of materials only.",
      "",
    );
  }
  return lines.join("\n");
};

/**
 * Everything a fabricator and assembler need for the project. A bare board gets Gerbers, a drill file, a bill of
 * materials and a pick-and-place file; a build made of modules, such as a desktop, gets its bill of materials.
 * @param project - The whole project.
 * @param base - What every file name starts with.
 * @returns The files, and the connections the router couldn't finish, which have no copper.
 */
export const fabricationFiles = (
  project: ProjectData,
  base = "echidna",
): { files: FabricationFile[]; unrouted: Trace[] } => {
  const files: FabricationFile[] = [{ name: `${base}-BOM.csv`, content: billOfMaterials(project) }];
  const pcb = project.foundation === "pcb";
  let unrouted: Trace[] = [];
  if (pcb) {
    const board = fabBoard(project);
    unrouted = board.routing.traces.filter((t) => t.unrouted);
    files.push(
      { name: `${base}-positions.csv`, content: pickAndPlace(project) },
      ...gerberLayers(board).map(({ suffix, content }) => ({ name: `${base}-${suffix}`, content })),
      { name: `${base}-PTH.drl`, content: drillFile(board) },
    );
  }
  const names = files.map((f) => f.name);
  return {
    files: [{ name: "README.txt", content: readme(project, names, unrouted, pcb) }, ...files],
    unrouted,
  };
};

/**
 * The fabrication files packed into one zip archive, ready to download or upload to a board house.
 * @param project - The whole project.
 * @param base - What every file name starts with.
 * @returns The archive's bytes and the connections that have no copper.
 */
export const fabricationZip = (
  project: ProjectData,
  base = "echidna",
): { bytes: Uint8Array; unrouted: Trace[] } => {
  const { files, unrouted } = fabricationFiles(project, base);
  return { bytes: zip(files), unrouted };
};

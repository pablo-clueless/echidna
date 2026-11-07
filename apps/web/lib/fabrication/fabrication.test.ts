import { describe, expect, it } from "vitest";
import { partsById } from "@echidna/library";

import {
  BOM_COLUMNS,
  billOfMaterials,
  fabBoard,
  fabricationFiles,
  partValue,
  pickAndPlace,
} from "./index";
import { drillFile, type FabBoard, gerberLayers, toFab } from "./gerber";
import { partSourcing, resistanceCode } from "./sourcing";
import { regulatorExample } from "@/lib/project/example";
import type { ProjectData } from "@/lib/project/model";
import { MOUNTING_HOLE } from "@/lib/board/placement";
import { footprints } from "@/lib/board/footprints";
import { planPour, type PourShape } from "./pour";
import { textStrokes } from "./font";
import { crc32, zip } from "./zip";

const project = regulatorExample();
/** Splits CSV into rows of fields, honouring quoted fields. */
const rows = (text: string) =>
  text
    .trim()
    .split("\n")
    .map((line) => {
      const fields: string[] = [];
      let current = "";
      let quoted = false;
      for (let i = 0; i < line.length; i++) {
        const char = line.charAt(i);
        if (quoted && char === '"' && line.charAt(i + 1) === '"') {
          current += '"';
          i++;
        } else if (char === '"') quoted = !quoted;
        else if (char === "," && !quoted) {
          fields.push(current);
          current = "";
        } else current += char;
      }
      return [...fields, current];
    });

const exampleBoard = () => fabBoard(project);

const layer = (board: FabBoard, suffix: string) =>
  gerberLayers(board).find((l) => l.suffix === suffix)?.content ?? "";
const count = (text: string, pattern: RegExp) => text.match(pattern)?.length ?? 0;

describe("bill of materials", () => {
  it("lists every physical part once, with its value, and leaves out ground symbols", () => {
    const bom = rows(billOfMaterials(project));
    expect(bom[0]).toEqual([...BOM_COLUMNS]);
    expect(bom.map((r) => r[0])).toEqual(["Designator", "D1", "R1", "SW1", "U1", "V1"]);
    expect(bom.find((r) => r[0] === "R1")?.[3]).toBe("150 Ω");
    expect(bom.find((r) => r[0] === "D1")?.[3]).toBe("red");
    // A switch's position is not a value to buy it by.
    expect(bom.find((r) => r[0] === "SW1")?.[3]).toBe("");
  });

  it("groups parts of the same value, ordering designators as numbers", () => {
    const many: ProjectData = {
      ...project,
      components: [
        ...project.components,
        { id: "R10", specId: "resistor", paramOverrides: { resistance: 150 } },
        { id: "R2", specId: "resistor", paramOverrides: { resistance: 1000 } },
        { id: "R3", specId: "resistor", paramOverrides: { resistance: 150 } },
      ],
    };
    const bom = rows(billOfMaterials(many));
    expect(bom.find((r) => r[0] === "R1 R3 R10")?.[1]).toBe("3");
    expect(bom.find((r) => r[0] === "R2")?.[3]).toBe("1 kΩ");
  });

  it("prints a value from the part's own override first", () => {
    const resistor = partsById.get("resistor")!;
    expect(
      partValue({ id: "R1", specId: "resistor", paramOverrides: { resistance: 4700 } }, resistor),
    ).toBe("4.7 kΩ");
  });
});

describe("part numbers", () => {
  const column = (row: string[] | undefined, name: (typeof BOM_COLUMNS)[number]) =>
    row?.[BOM_COLUMNS.indexOf(name)];

  it("gives each part the library has checked a maker's and LCSC's part number", () => {
    const bom = rows(billOfMaterials(project));
    const u1 = bom.find((r) => r[0] === "U1");
    expect(column(u1, "Manufacturer")).toBe("Advanced Monolithic Systems");
    expect(column(u1, "MPN")).toBe("AMS1117-3.3");
    expect(column(u1, "LCSC")).toBe("C6186");
    // No LED in the library has a checked part number yet.
    expect(
      column(
        bom.find((r) => r[0] === "D1"),
        "MPN",
      ),
    ).toBe("");
  });

  it("writes a resistor's value into its part number, in the maker's code", () => {
    const bom = rows(billOfMaterials(project));
    expect(
      column(
        bom.find((r) => r[0] === "R1"),
        "MPN",
      ),
    ).toBe("CFR-25JB-52-150R");
    expect(
      column(
        bom.find((r) => r[0] === "R1"),
        "LCSC",
      ),
    ).toBe("");
  });

  it.each([
    [4.7, "4R7"],
    [150, "150R"],
    [1000, "1K"],
    [1500, "1K5"],
    [4700, "4K7"],
    [10_000, "10K"],
    [150_000, "150K"],
    [1e6, "1M"],
    [2.2e6, "2M2"],
  ])("codes %d Ω as %s", (ohms, code) => {
    expect(resistanceCode(ohms)).toBe(code);
  });

  it("leaves out a resistance that isn't made", () => {
    expect(resistanceCode(1234)).toBeUndefined();
    expect(resistanceCode(0.5)).toBeUndefined();
    expect(resistanceCode(1e9)).toBeUndefined();
    const odd = { id: "R1", specId: "resistor", paramOverrides: { resistance: 1234 } };
    expect(partSourcing(odd, partsById.get("resistor")!)).toBeUndefined();
  });

  it("drops a fixed part number once the part's value is changed", () => {
    const capacitor = partsById.get("capacitor-ceramic")!;
    expect(partSourcing({ id: "C1", specId: capacitor.id }, capacitor)?.mpn).toBe(
      "CL21A106KOQNNNE",
    );
    expect(
      partSourcing(
        { id: "C1", specId: capacitor.id, paramOverrides: { capacitance: 1e-6 } },
        capacitor,
      ),
    ).toBeUndefined();
  });
});

describe("pick and place", () => {
  it("gives each part's centre from the board's bottom-left corner, turned anticlockwise", () => {
    const turned: ProjectData = {
      ...project,
      board: { ...project.board, U1: { ...project.board.U1!, rotation: 90 } },
    };
    const table = rows(pickAndPlace(turned));
    expect(table[0]).toEqual([
      "Designator",
      "Value",
      "Footprint",
      "Mid X",
      "Mid Y",
      "Rotation",
      "Layer",
    ]);
    const u1 = table.find((r) => r[0] === "U1");
    const at = turned.board.U1!;
    const [x, y] = toFab(project.boardSize)([at.x * 1000, at.z * 1000]);
    expect(u1?.slice(3)).toEqual([x.toFixed(3), y.toFixed(3), "270", "top"]);
    expect(table.some((r) => r[0] === "GND1")).toBe(false);
  });
});

describe("Gerber layers", () => {
  const board = exampleBoard();
  const layers = gerberLayers(board);

  it("writes seven well-formed RS-274X files, declaring every aperture before it is used", () => {
    expect(layers.map((l) => l.suffix)).toEqual([
      "F_Cu.gtl",
      "B_Cu.gbl",
      "F_Mask.gts",
      "B_Mask.gbs",
      "F_Paste.gtp",
      "F_Silkscreen.gto",
      "Edge_Cuts.gm1",
    ]);
    for (const { content } of layers) {
      expect(content).toMatch(/^G04 /);
      expect(content).toContain("%FSLAX46Y46*%\n%MOMM*%");
      expect(content.trimEnd().endsWith("M02*")).toBe(true);
      const declared = new Set([...content.matchAll(/%ADD(\d+)/g)].map((m) => m[1]));
      const used = [...content.matchAll(/^D(\d+)\*$/gm)].map((m) => m[1]);
      expect(used.length).toBeGreaterThan(0);
      for (const code of used) expect(declared).toContain(code);
    }
  });

  it("flashes paste only on the surface-mount regulator's four pads", () => {
    expect(count(layer(board, "F_Paste.gtp"), /D03\*/g)).toBe(4);
  });

  it("opens the bottom mask over every through-hole pad and mounting hole", () => {
    expect(count(layer(board, "B_Mask.gbs"), /D03\*/g)).toBe(8 + 4);
  });

  it("puts each pad where the studio places it", () => {
    const r1 = board.parts.find((p) => p.id === "R1")!;
    const pad = r1.footprint.pads[0]!;
    const angle = (-r1.rotation * Math.PI) / 180;
    const [x, y] = toFab(board.size)([
      r1.x + pad.x * Math.cos(angle) + pad.z * Math.sin(angle),
      r1.z - pad.x * Math.sin(angle) + pad.z * Math.cos(angle),
    ]);
    expect(layer(board, "F_Cu.gtl")).toContain(
      `X${Math.round(x * 1e6)}Y${Math.round(y * 1e6)}D03*`,
    );
  });

  it("swaps a rectangular pad's sides when its part is turned a quarter", () => {
    const pad = { size: board.size, routing: { traces: [], vias: [] } };
    const part = { id: "R9", footprint: footprints["generic/0805"]!, x: 0, z: 0 };
    expect(layer({ ...pad, parts: [{ ...part, rotation: 0 }] }, "F_Cu.gtl")).toContain("R,1X1.45");
    expect(layer({ ...pad, parts: [{ ...part, rotation: 90 }] }, "F_Cu.gtl")).toContain("R,1.45X1");
  });

  it("draws routed tracks as copper, and leaves a connection the router couldn't finish out", () => {
    const routing = {
      traces: [
        {
          net: "a",
          layer: "top" as const,
          width: 0.4,
          points: [
            [0, 0],
            [5, 0],
          ] as [number, number][],
        },
        {
          net: "b",
          layer: "top" as const,
          width: 0.8,
          points: [
            [0, 5],
            [5, 5],
          ] as [number, number][],
          unrouted: true,
        },
      ],
      vias: [],
    };
    const top = layer({ size: board.size, parts: [], routing }, "F_Cu.gtl");
    expect(top).toContain("C,0.4");
    expect(top).not.toContain("C,0.8");
  });

  it("prints every designator on the silkscreen", () => {
    const silk = layer(board, "F_Silkscreen.gto");
    expect(count(silk, /D01\*/g)).toBeGreaterThan(50);
  });

  it("outlines the board from the origin to its full size", () => {
    const edge = layer(board, "Edge_Cuts.gm1");
    expect(edge).toContain(`X${board.size.width * 1e6}Y${board.size.depth * 1e6}D01*`);
  });
});

describe("drill file", () => {
  it("drills every through-hole pin, via and mounting hole, grouped by tool", () => {
    const board = exampleBoard();
    const drl = drillFile(board);
    expect(drl.startsWith("M48\n")).toBe(true);
    expect(drl.trimEnd().endsWith("M30")).toBe(true);
    const holes = count(drl, /^X[\d.]+Y[\d.]+$/gm);
    expect(holes).toBe(8 + board.routing.vias.length + 4);
    expect(drl).toContain("C3.200");
  });
});

describe("silkscreen font", () => {
  it("centres text on its point and scales it to the height asked for", () => {
    const strokes = textStrokes("HE", 1.2, 10, 20).flat();
    const ys = strokes.map(([, y]) => y);
    const xs = strokes.map(([x]) => x);
    expect(Math.min(...ys)).toBeCloseTo(19.4);
    expect(Math.max(...ys)).toBeCloseTo(20.6);
    expect((Math.min(...xs) + Math.max(...xs)) / 2).toBeCloseTo(10, 1);
  });
});

describe("fabrication package", () => {
  it("gives a bare board Gerbers, a drill file, a BOM and positions, with a README", () => {
    const { files, unrouted } = fabricationFiles(project, "regulator");
    expect(unrouted).toEqual([]);
    expect(files.map((f) => f.name)).toEqual([
      "README.txt",
      "regulator-BOM.csv",
      "regulator-positions.csv",
      "regulator-F_Cu.gtl",
      "regulator-B_Cu.gbl",
      "regulator-F_Mask.gts",
      "regulator-B_Mask.gbs",
      "regulator-F_Paste.gtp",
      "regulator-F_Silkscreen.gto",
      "regulator-Edge_Cuts.gm1",
      "regulator-PTH.drl",
    ]);
    expect(files[0]?.content).not.toContain("WARNING");
  });

  it("gives a build made of modules only its bill of materials", () => {
    const desktop: ProjectData = {
      ...project,
      foundation: "desktop",
      components: [{ id: "CPU1", specId: "ryzen-7-7800x3d" }],
    };
    const { files } = fabricationFiles(desktop);
    expect(files.map((f) => f.name)).toEqual(["README.txt", "echidna-BOM.csv"]);
  });
});

describe("zip", () => {
  it("checksums as CRC-32 does", () => {
    expect(crc32(new TextEncoder().encode("123456789"))).toBe(0xcbf43926);
  });

  it("stores each file under its name, with a central directory that finds it", () => {
    const bytes = zip([
      { name: "a.txt", content: "hello" },
      { name: "b.txt", content: "world!" },
    ]);
    const view = new DataView(bytes.buffer);
    const end = bytes.length - 22;
    expect(view.getUint32(end, true)).toBe(0x06054b50);
    expect(view.getUint16(end + 10, true)).toBe(2);
    let at = view.getUint32(end + 16, true);
    const found: string[] = [];
    for (let i = 0; i < 2; i++) {
      const nameLength = view.getUint16(at + 28, true);
      const offset = view.getUint32(at + 42, true);
      const size = view.getUint32(at + 24, true);
      const name = new TextDecoder().decode(bytes.subarray(at + 46, at + 46 + nameLength));
      const dataAt = offset + 30 + view.getUint16(offset + 26, true);
      found.push(`${name}:${new TextDecoder().decode(bytes.subarray(dataAt, dataAt + size))}`);
      at += 46 + nameLength;
    }
    expect(found).toEqual(["a.txt:hello", "b.txt:world!"]);
  });
});

describe("ground pour", () => {
  const board = exampleBoard();
  /** Whether a shape lies outside a mounting hole, between it and the board's corner. */
  const inCorner = ({ size }: FabBoard, shape: PourShape) =>
    shape.kind === "rect" &&
    Math.abs(shape.x) > size.width / 2 - MOUNTING_HOLE.inset - 1 &&
    Math.abs(shape.z) > size.depth / 2 - MOUNTING_HOLE.inset - 1;

  it("pours nothing on a board without ground", () => {
    const { groundNet: _, ...noGround } = board;
    expect(planPour(noGround, "top")).toBeUndefined();
    expect(layer(noGround, "F_Cu.gtl")).not.toContain("G36*");
  });

  it("joins ground pads through thermal spokes, and keeps clear of every other pad", () => {
    // Ground reaches the supply terminal's negative, the regulator's gnd and the LED's cathode.
    const top = planPour(board, "top")!;
    expect(top.thermals).toHaveLength(3);
    expect(top.spokes).toHaveLength(12);
    // Only the two through-hole ground pads reach the bottom layer.
    expect(planPour(board, "bottom")!.thermals).toHaveLength(2);
    const pads = board.parts.flatMap((p) => p.footprint.pads.map((pad) => `${p.id}/${pad.pin}`));
    const grounded = pads.filter((pin) => board.padNets?.get(pin) === board.groundNet);
    // Each other top-layer pad, the four mounting holes and three fiducials get a gap; the regulator's tab shares
    // its out pin's net, so it is a pad of its own.
    expect(top.clears.filter((s) => s.kind !== "segment").length).toBe(
      pads.length - grounded.length + 4 + 3 + board.routing.vias.length,
    );
  });

  it("fills the board, then cuts the gaps, then draws the pads over it", () => {
    const top = layer(board, "F_Cu.gtl");
    const fill = top.indexOf("G36*");
    const clear = top.indexOf("%LPC*%");
    const dark = top.lastIndexOf("%LPD*%");
    expect(fill).toBeGreaterThan(0);
    expect(clear).toBeGreaterThan(fill);
    expect(dark).toBeGreaterThan(clear);
    expect(top.indexOf("D03*", dark)).toBeGreaterThan(dark);
  });

  it("cuts away copper walled off from ground by another net's track", () => {
    // A square loop of signal track round the board's middle, with ground only outside it.
    const loop: [number, number][] = [
      [-10, -10],
      [10, -10],
      [10, 10],
      [-10, 10],
      [-10, -10],
    ];
    const walled: FabBoard = {
      size: { width: 60, depth: 40 },
      parts: [
        { id: "J1", footprint: footprints["generic/terminal-2"]!, x: -20, z: 12, rotation: 0 },
      ],
      routing: { traces: [{ net: "sig", layer: "top", width: 0.4, points: loop }], vias: [] },
      padNets: new Map([["J1/neg", "gnd"]]),
      groundNet: "gnd",
    };
    const pour = planPour(walled, "top")!;
    const covered = (x: number, z: number) =>
      pour.islands.some(
        (s) => s.kind === "rect" && Math.abs(x - s.x) <= s.hw && Math.abs(z - s.z) <= s.hh,
      );
    expect(covered(0, 0)).toBe(true);
    expect(covered(5, -5)).toBe(true);
    expect(covered(20, 0)).toBe(false);
    expect(covered(-20, -15)).toBe(false);
    // The bottom has no track, so the only islands are the slivers a mounting hole's gap cuts off in each corner.
    expect(planPour(walled, "bottom")!.islands.every((s) => inCorner(walled, s))).toBe(true);
  });

  it("cuts off only the corner slivers beyond the mounting holes on the example", () => {
    for (const side of ["top", "bottom"] as const) {
      const islands = planPour(board, side)!.islands;
      expect(islands.length, side).toBeGreaterThan(0);
      expect(
        islands.every((s) => inCorner(board, s)),
        side,
      ).toBe(true);
    }
  });
});

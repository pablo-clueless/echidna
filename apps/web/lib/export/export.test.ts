import { beforeEach, describe, expect, it, vi } from "vitest";
import { partsById } from "@echidna/library";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { PROJECT_FORMAT, parseProjectFile, projectJson } from "./projectFile";
import { FOUNDATIONS } from "@/lib/project/foundation";
import { projectSpice, spiceNumber } from "./spice";
import { pinoutCsv, projectPinout } from "./pinout";
import { useProjectStore } from "@/stores/project";
import { jpegPdf } from "./pdf";

vi.hoisted(() => {
  const items = new Map<string, string>();
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: {
      getItem: (key: string) => items.get(key) ?? null,
      setItem: (key: string, value: string) => void items.set(key, value),
      removeItem: (key: string) => void items.delete(key),
    },
  });
});

const store = () => useProjectStore.getState();

describe("spiceNumber", () => {
  it.each([
    [4700, "4.7k"],
    [1e-6, "1u"],
    [2.2e6, "2.2meg"],
    [0.0033, "3.3m"],
    [3.3, "3.3"],
    [0, "0"],
  ])("writes %d as %s", (value, text) => expect(spiceNumber(value)).toBe(text));
});

describe("SPICE export", () => {
  beforeEach(() => store().loadExample());

  it("writes every solved part, grounds node 0 and runs an operating point", () => {
    const { deck, skipped } = projectSpice(store(), partsById);
    expect(skipped).toEqual([]);
    const lines = deck.split("\n");
    for (const c of store().components) {
      const model = partsById.get(c.specId)?.model;
      if (model !== "ground") expect(deck).toContain(`* ${c.id}`);
    }
    expect(lines.some((l) => / 0( |$)/.test(l))).toBe(true);
    expect(lines.at(-3)).toBe(".op");
    expect(lines.at(-2)).toBe(".end");
  });

  it("leaves out modules checked as a build", () => {
    store().loadBuild("desktop-gaming");
    const { deck, skipped } = projectSpice(store(), partsById);
    expect(skipped.length).toBeGreaterThan(0);
    expect(deck).toContain("Checked as a build");
  });
});

describe("wiring table", () => {
  it("lists a plugged-in sensor's pins against the board's", () => {
    store().loadPreset("esp32-devkitc");
    const id = store().addComponent("bme280", { x: 20, y: 6 }) ?? "";
    store().plugIn(id, "B1", "i2c");
    const { nets, slots } = projectPinout(store(), partsById);
    expect(slots).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ partId: id, pin: "SDA", hostPin: "GPIO21 SDA", signal: "SDA" }),
        expect.objectContaining({ partId: id, pin: "GND", hostPin: "GND", signal: "GND" }),
      ]),
    );
    expect(nets[0]?.net).toBe("GND");
    const csv = pinoutCsv({ nets, slots });
    expect(csv.split("\n")[0]).toBe("Net,Designator,Part,Pin");
    const name = partsById.get("bme280")?.name ?? "";
    expect(csv).toContain(`${id},"${name}",SDA,B1,GPIO21 SDA,SDA`);
  });
});

describe("project file", () => {
  beforeEach(() => store().loadExample());

  it("opens what it saves", () => {
    const text = projectJson(store(), "https://example.test");
    const parsed = parseProjectFile(text, partsById);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const { components, wires, schematic, board, slots, foundation } = store();
    expect(parsed.project).toMatchObject({
      components,
      wires,
      schematic,
      board,
      slots,
      foundation,
    });
    expect(JSON.parse(text)).toMatchObject({ format: PROJECT_FORMAT, version: 1 });
  });

  it("says what is wrong with a file it can't open", () => {
    const file = JSON.parse(projectJson(store(), ""));
    expect(parseProjectFile("{", partsById)).toEqual({ ok: false, error: { code: "json" } });
    expect(parseProjectFile("{}", partsById)).toEqual({ ok: false, error: { code: "format" } });
    file.project.board[store().components[0]?.id ?? ""].rotation = 45;
    expect(parseProjectFile(JSON.stringify(file), partsById)).toMatchObject({
      ok: false,
      error: { code: "invalid", path: expect.stringMatching(/^project\.board\./) },
    });
    const unknown = JSON.parse(projectJson(store(), ""));
    unknown.project.components[0].specId = "flux-capacitor";
    expect(parseProjectFile(JSON.stringify(unknown), partsById)).toEqual({
      ok: false,
      error: { code: "parts", parts: ["flux-capacitor"] },
    });
  });

  it("publishes a schema that names every foundation", () => {
    const schema = JSON.parse(
      readFileSync(join(__dirname, "../../public/schemas/project.schema.json"), "utf8"),
    );
    expect(schema.$defs.project.properties.foundation.enum).toEqual([...FOUNDATIONS]);
    expect(schema.properties.format.const).toBe(PROJECT_FORMAT);
  });
});

describe("jpegPdf", () => {
  it("writes a PDF whose cross-reference table points at each object", () => {
    const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xd9]);
    const pdf = jpegPdf(jpeg, 300, 200, "Test (1)");
    const text = new TextDecoder("latin1").decode(pdf);
    expect(text.startsWith("%PDF-1.4")).toBe(true);
    expect(text.trimEnd().endsWith("%%EOF")).toBe(true);
    expect(text).toContain("/Title (Test \\(1\\))");
    const xref = Number(/startxref\n(\d+)/.exec(text)?.[1]);
    expect(text.slice(xref, xref + 4)).toBe("xref");
    const offsets = [...text.slice(xref).matchAll(/^(\d{10}) 00000 n $/gm)].map((m) =>
      Number(m[1]),
    );
    expect(offsets).toHaveLength(6);
    offsets.forEach((o, i) => expect(text.slice(o).startsWith(`${i + 1} 0 obj`)).toBe(true));
  });
});

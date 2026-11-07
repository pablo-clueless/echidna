import { expect, type Page, test } from "@playwright/test";
import { readFile } from "node:fs/promises";

import en from "../languages/en.json" with { type: "json" };
import fr from "../languages/fr.json" with { type: "json" };

const locales = [
  { locale: "en", messages: en },
  { locale: "fr", messages: fr },
] as const;

/** Tells the studio not to load the 3D board; see acceptance.spec.ts. */
const skipViewport = () => {
  window.__echidna = { ...window.__echidna, skip3d: true };
};

const fill = (message: string, values: Record<string, string>) =>
  message.replace(/\{(\w+)\}/g, (_, key: string) => values[key] ?? "");

/** The names and contents of the files in a zip, read from its central directory. */
const unzip = (bytes: Buffer): Map<string, string> => {
  const end = bytes.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  const files = new Map<string, string>();
  let at = bytes.readUInt32LE(end + 16);
  for (let i = 0; i < bytes.readUInt16LE(end + 10); i++) {
    const nameLength = bytes.readUInt16LE(at + 28);
    const size = bytes.readUInt32LE(at + 24);
    const offset = bytes.readUInt32LE(at + 42);
    const name = bytes.toString("utf8", at + 46, at + 46 + nameLength);
    const data = offset + 30 + bytes.readUInt16LE(offset + 26);
    files.set(name, bytes.toString("utf8", data, data + size));
    at += 46 + nameLength;
  }
  return files;
};

/** Clicks Export and reads the zip it downloads. */
const exportZip = async (page: Page, label: string) => {
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: label }).click(),
  ]);
  const path = await download.path();
  return { name: download.suggestedFilename(), files: unzip(await readFile(path)) };
};

for (const { locale, messages } of locales) {
  const s = messages.Studio;

  test.describe(`export (${locale})`, () => {
    test.beforeEach(async ({ page }) => {
      if (!process.env.E2E_GPU) await page.addInitScript(skipViewport);
      await page.goto(`/${locale}/studio`);
      await page.evaluate(() => localStorage.clear());
      await page.reload();
    });

    test("a bare board exports Gerbers, drills, a BOM and positions in one zip", async ({
      page,
    }) => {
      await expect(page.getByRole("button", { name: s.export.label })).toBeDisabled();
      await page.getByRole("button", { name: s.schematic.openExample }).click();

      const { name, files } = await exportZip(page, s.export.label);
      expect(name).toBe("echidna-fabrication.zip");
      expect([...files.keys()]).toEqual([
        "README.txt",
        "echidna-BOM.csv",
        "echidna-positions.csv",
        "echidna-F_Cu.gtl",
        "echidna-B_Cu.gbl",
        "echidna-F_Mask.gts",
        "echidna-B_Mask.gbs",
        "echidna-F_Paste.gtp",
        "echidna-F_Silkscreen.gto",
        "echidna-Edge_Cuts.gm1",
        "echidna-PTH.drl",
      ]);
      expect(files.get("echidna-BOM.csv")).toContain("R1,1,");
      expect(files.get("echidna-BOM.csv")).toContain("AMS1117-3.3,C6186");
      expect(files.get("echidna-F_Cu.gtl")?.trimEnd().endsWith("M02*")).toBe(true);
      // The example routes completely, so nothing is left without copper.
      expect(files.get("README.txt")).not.toContain("WARNING");
      await expect(page.getByRole("status").filter({ hasText: "README" })).toHaveCount(0);
    });

    test("a desktop build exports its bill of materials", async ({ page }) => {
      await page
        .getByRole("button", {
          name: fill(s.schematic.startFromBoard, { board: messages.Builds["desktop-gaming"].name }),
        })
        .click();
      const { files } = await exportZip(page, s.export.label);
      expect([...files.keys()]).toEqual(["README.txt", "echidna-BOM.csv"]);
      expect(files.get("echidna-BOM.csv")?.split("\n")[0]).toBe(
        "Designator,Quantity,Part,Value,Footprint,Manufacturer,MPN,LCSC",
      );
    });
  });
}

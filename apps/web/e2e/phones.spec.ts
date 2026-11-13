import { expect, test } from "@playwright/test";

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

/** Matches a message with its `{placeholders}` filled by anything, such as a locale-formatted quantity. */
const template = (message: string) =>
  new RegExp(message.replace(/[.*+?^$()|[\]\\]/g, "\\$&").replace(/\{\w+\}/g, ".+?"));

const fill = (message: string, values: Record<string, string>) =>
  message.replace(/\{(\w+)\}/g, (_, key: string) => values[key] ?? "");

/** The parts of the iPhone 15 preset, by designator. */
const IPHONE_15 = {
  MB1: "iphone-15-board",
  U1: "apple-a16",
  PMU1: "iphone-15-pmic",
  BAT1: "iphone-15-battery",
  LCD1: "iphone-15-display",
  CAM1: "iphone-15-camera",
  L1: "magsafe-coil-15w",
  MDM1: "qualcomm-x70",
} as const;

for (const { locale, messages } of locales) {
  const s = messages.Studio;
  const slots = s.slots;
  const partName = (id: keyof typeof messages.Parts) => messages.Parts[id].name;
  const startBuild = (id: keyof typeof messages.Builds) =>
    fill(s.schematic.startFromBoard, { board: messages.Builds[id].name });
  const provenance = [s.provenance.datasheet, s.provenance.teardown, s.provenance.estimated];

  test.describe(`phones and wearables (${locale})`, () => {
    test.beforeEach(async ({ page }) => {
      if (!process.env.E2E_GPU) await page.addInitScript(skipViewport);
      await page.goto(`/${locale}/studio`);
      await page.evaluate(() => localStorage.clear());
      await page.reload();
    });

    test("every value in a phone preset shows where it came from", async ({ page }) => {
      await page.getByRole("button", { name: startBuild("phone-iphone-15") }).click();
      const inspector = page.getByRole("region", { name: s.inspector.title });
      await expect(page.getByRole("region", { name: s.validator.label })).toContainText(
        s.validator.allPassed,
      );

      for (const [id, specId] of Object.entries(IPHONE_15)) {
        await page
          .getByRole("button", {
            name: fill(s.schematic.partLabel, { id, name: partName(specId) }),
          })
          .click();
        const specs = inspector.getByRole("region", { name: s.moduleSpecs.title });
        const rows = specs.getByTestId("module-spec");
        const count = await rows.count();
        expect(count, specId).toBeGreaterThan(0);
        for (let i = 0; i < count; i++) {
          const badge = await rows.nth(i).locator("[data-slot=badge]").innerText();
          expect(provenance, `${specId} row ${i}`).toContain(badge);
        }
      }

      // The board shows its rails, its battery life beside Apple's figure, and where each slot is.
      await page
        .getByRole("button", {
          name: fill(s.schematic.partLabel, { id: "MB1", name: partName("iphone-15-board") }),
        })
        .click();
      const build = inspector.getByRole("region", { name: slots.buildTitlePhone });
      await expect(build).toContainText(template(slots.checks.pmicRail));
      await expect(build).toContainText(template(slots.videoRuntime));
      await expect(build).toContainText(template(slots.batteryLifePublished));
      await expect(build).toContainText(/20/);
      await expect(inspector.getByRole("region", { name: slots.hostTitle })).toContainText(
        slots.boards.upper,
      );
    });

    test("an estimate-based failure is worded as likely, and can't be swapped in", async ({
      page,
    }) => {
      await page.getByRole("button", { name: startBuild("wearable-fitness-band") }).click();
      await page
        .getByRole("button", {
          name: fill(s.schematic.partLabel, { id: "LCD1", name: partName("band-display") }),
        })
        .click();
      const swaps = page
        .getByRole("region", { name: s.inspector.title })
        .getByRole("region", { name: slots.swapTitle });
      const watch = swaps.getByRole("listitem", { name: partName("watch-display") });
      await expect(watch).toContainText(slots.swapLikelyFails);
      await expect(watch).toContainText(template(slots.checks.pmicRail));
      await expect(watch).toContainText(slots.estimated);
      await expect(watch.getByRole("button", { name: slots.swap })).toBeDisabled();
    });
  });
}

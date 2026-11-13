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

for (const { locale, messages } of locales) {
  const s = messages.Studio;
  const slots = s.slots;
  const partName = (id: keyof typeof messages.Parts) => messages.Parts[id].name;
  const startBuild = (id: keyof typeof messages.Builds) =>
    fill(s.schematic.startFromBoard, { board: messages.Builds[id].name });

  test.describe(`drones (${locale})`, () => {
    test.beforeEach(async ({ page }) => {
      if (!process.env.E2E_GPU) await page.addInitScript(skipViewport);
      await page.goto(`/${locale}/studio`);
      await page.evaluate(() => localStorage.clear());
      await page.reload();
    });

    test("an under-rated ESC is refused with the numbers shown, and one with headroom swaps in", async ({
      page,
    }) => {
      await page.getByRole("button", { name: startBuild("drone-fpv-5in") }).click();
      const inspector = page.getByRole("region", { name: s.inspector.title });
      await expect(page.getByRole("region", { name: s.validator.label })).toContainText(
        s.validator.allPassed,
      );

      // The frame sums the build: each motor's 32 A on a 45 A ESC passes.
      await page
        .getByRole("button", {
          name: fill(s.schematic.partLabel, { id: "FR1", name: partName("fpv-frame-5in") }),
        })
        .click();
      const build = inspector.getByRole("region", { name: slots.buildTitleDrone });
      await expect(build).toContainText(template(slots.checks.escCurrent));
      await expect(build).toContainText(template(slots.checks.thrustToWeight));
      await expect(build).toContainText(template(slots.flightTime));

      await page
        .getByRole("button", {
          name: fill(s.schematic.partLabel, { id: "ESC1", name: partName("esc-4in1-45a") }),
        })
        .click();
      const swaps = inspector.getByRole("region", { name: slots.swapTitle });

      // 32 A a motor through a 30 A ESC: refused, with both currents.
      const under = swaps.getByRole("listitem", { name: partName("esc-4in1-30a") });
      // The motor current is an estimate, so the refusal is worded as likely.
      await expect(under).toContainText(slots.swapLikelyFails);
      await expect(under).toContainText(template(slots.checks.escCurrent));
      await expect(under).toContainText(/32/);
      await expect(under).toContainText(/30/);
      await expect(under.getByRole("button", { name: slots.swap })).toBeDisabled();

      const roomy = swaps.getByRole("listitem", { name: partName("esc-4in1-55a") });
      await expect(roomy).toContainText(slots.swapFits);
      await roomy.getByRole("button", { name: slots.swap }).click();
      await expect(
        page.getByRole("button", {
          name: fill(s.schematic.partLabel, { id: "ESC1", name: partName("esc-4in1-55a") }),
        }),
      ).toBeVisible();
    });

    test("a DJI Mini shows its estimated hover time beside the published flight time", async ({
      page,
    }) => {
      await page.getByRole("button", { name: startBuild("drone-dji-mini-2") }).click();
      await page
        .getByRole("button", {
          name: fill(s.schematic.partLabel, { id: "FR1", name: partName("dji-mini-2-frame") }),
        })
        .click();
      const build = page
        .getByRole("region", { name: s.inspector.title })
        .getByRole("region", { name: slots.buildTitleDrone });
      await expect(build).toContainText(template(slots.flightTime));
      await expect(build).toContainText(/32/);
      await expect(build).toContainText(template(slots.flightTimePublished));
      await expect(build).toContainText(/31/);
      await expect(build).toContainText(/249/);
    });
  });
}

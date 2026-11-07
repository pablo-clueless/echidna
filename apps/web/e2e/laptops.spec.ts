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

  test.describe(`laptop builds (${locale})`, () => {
    test.beforeEach(async ({ page }) => {
      if (!process.env.E2E_GPU) await page.addInitScript(skipViewport);
      await page.goto(`/${locale}/studio`);
      await page.evaluate(() => localStorage.clear());
      await page.reload();
    });

    test("a charger short of the gaming laptop's draw fails with the numbers, and the board estimates battery life", async ({
      page,
    }) => {
      await page
        .getByRole("button", {
          name: fill(s.schematic.startFromBoard, { board: messages.Builds["laptop-gaming"].name }),
        })
        .click();
      const inspector = page.getByRole("region", { name: s.inspector.title });
      await expect(page.getByRole("region", { name: s.validator.label })).toContainText(
        s.validator.allPassed,
      );

      // 227 W at full load on a 240 W charger, and about 4.9 hours from 80 Wh in light use.
      await page
        .getByRole("button", {
          name: fill(s.schematic.partLabel, { id: "MB1", name: partName("gaming-laptop-board") }),
        })
        .click();
      const build = inspector.getByRole("region", { name: slots.buildTitle });
      await expect(build).toContainText(template(slots.checks.chargerBudget));
      await expect(build).toContainText(/227/);
      await expect(build).toContainText(/240/);
      await expect(build).toContainText(template(slots.batteryRuntime));
      await expect(build).toContainText(/4[.,]9/);
      await expect(build).toContainText(/80/);

      await page
        .getByRole("button", {
          name: fill(s.schematic.partLabel, { id: "CHG1", name: partName("charger-barrel-240w") }),
        })
        .click();
      const swaps = inspector.getByRole("region", { name: slots.swapTitle });

      // A desktop PSU is never offered, and a 100 W USB-C charger is refused with both figures.
      await expect(swaps.getByRole("listitem", { name: partName("psu-1000w") })).toHaveCount(0);
      const usbc100 = swaps.getByRole("listitem", { name: partName("charger-usbc-100w") });
      // The laptop's draw is an estimate, so the refusal is worded as likely.
      await expect(usbc100).toContainText(slots.swapLikelyFails);
      await expect(usbc100).toContainText(/227/);
      await expect(usbc100).toContainText(/100/);
      await expect(usbc100.getByRole("button", { name: slots.swap })).toBeDisabled();
    });
  });
}

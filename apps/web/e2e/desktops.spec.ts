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

  test.describe(`desktop builds (${locale})`, () => {
    test.beforeEach(async ({ page }) => {
      if (!process.env.E2E_GPU) await page.addInitScript(skipViewport);
      await page.goto(`/${locale}/studio`);
      await page.evaluate(() => localStorage.clear());
      await page.reload();
    });

    test("a graphics card beyond the PSU's headroom fails with the numbers shown, and one within it swaps in", async ({ page }) => {
      await page.getByRole("button", { name: fill(s.schematic.startFromBoard, { board: messages.Builds["desktop-budget"].name }) }).click();
      const inspector = page.getByRole("region", { name: s.inspector.title });
      await expect(page.getByRole("region", { name: s.validator.label })).toContainText(s.validator.allPassed);

      // The motherboard sums the build: a 299 W load on a 550 W PSU passes.
      await page.getByRole("button", { name: fill(s.schematic.partLabel, { id: "MB1", name: partName("b760-atx") }) }).click();
      const budget = inspector.getByRole("region", { name: slots.buildTitle });
      await expect(budget).toContainText(template(slots.checks.psuBudget));
      await expect(budget).toContainText(/299/);
      await expect(budget).toContainText(/550/);

      await page.getByRole("button", { name: fill(s.schematic.partLabel, { id: "GPU1", name: partName("rtx-4060") }) }).click();
      const swaps = inspector.getByRole("region", { name: slots.swapTitle });

      // 634 W of 550 W, and no 12V-2x6 connector for it: refused, with both reasons.
      const rtx4090 = swaps.getByRole("listitem", { name: partName("rtx-4090") });
      await expect(rtx4090).toContainText(slots.swapFails);
      await expect(rtx4090).toContainText(/634/);
      await expect(rtx4090).toContainText(template(slots.checks.powerConnectors));
      await expect(rtx4090.getByRole("button", { name: slots.swap })).toBeDisabled();

      const rx7800 = swaps.getByRole("listitem", { name: partName("rx-7800-xt") });
      await expect(rx7800).toContainText(slots.swapFits);
      await rx7800.getByRole("button", { name: slots.swap }).click();
      await expect(page.getByRole("button", { name: fill(s.schematic.partLabel, { id: "GPU1", name: partName("rx-7800-xt") }) })).toBeVisible();
      await expect(inspector.getByRole("listitem", { name: fill(slots.slotLabel, { slot: slots.names["pcie-x16"], host: "MB1" }) })).toContainText(slots.pluggedInModule);
    });
  });
}

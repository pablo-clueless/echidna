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

  test.describe(`dev boards (${locale})`, () => {
    test.beforeEach(async ({ page }) => {
      if (!process.env.E2E_GPU) await page.addInitScript(skipViewport);
      await page.goto(`/${locale}/studio`);
      await page.evaluate(() => localStorage.clear());
      await page.reload();
    });

    test("an incompatible sensor is blocked from a dev-board slot with the reason, and one that fits plugs in", async ({ page }) => {
      await page.getByRole("button", { name: fill(s.schematic.startFromBoard, { board: partName("raspberry-pi-4") }) }).click();
      const inspector = page.getByRole("region", { name: s.inspector.title });
      const library = page.getByRole("complementary", { name: s.library.title });

      // A 5 V ultrasonic sensor's echo would drive 5 V into the Pi's 3.3 V pins: blocked, saying so.
      await library.getByRole("button", { name: new RegExp(partName("hc-sr04")) }).click();
      const gpio = inspector.getByRole("listitem", { name: fill(slots.slotLabel, { slot: slots.names.gpio, host: "B1" }) });
      await expect(gpio).toContainText(slots.blocked);
      await expect(gpio).toContainText(template(slots.checks.logicIntoHost));
      await expect(gpio.getByRole("button", { name: slots.plugIn })).toBeDisabled();

      // A 3.3 V I²C sensor fits the I²C header, is shown as fitting before it is applied, and plugs in.
      await library.getByRole("button", { name: new RegExp(partName("bme280")) }).click();
      const i2c = inspector.getByRole("listitem", { name: fill(slots.slotLabel, { slot: slots.names.i2c, host: "B1" }) });
      await expect(i2c).toContainText(fill(slots.fits, { rail: "3V3" }));
      await i2c.getByRole("button", { name: slots.plugIn }).click();
      await expect(i2c).toContainText(fill(slots.pluggedIn, { rail: "3V3" }));
      await expect(page.getByRole("region", { name: s.validator.label })).toContainText(s.validator.allPassed);
    });
  });
}

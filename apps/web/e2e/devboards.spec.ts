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

    test("an incompatible sensor is blocked from a dev-board slot with the reason, and one that fits plugs in", async ({
      page,
    }) => {
      await page
        .getByRole("button", {
          name: fill(s.schematic.startFromBoard, { board: partName("raspberry-pi-4") }),
        })
        .click();
      const inspector = page.getByRole("region", { name: s.inspector.title });
      const library = page.getByRole("complementary", { name: s.library.title });

      // A 5 V ultrasonic sensor's echo would drive 5 V into the Pi's 3.3 V pins: blocked, saying so.
      await library.getByRole("button", { name: new RegExp(partName("hc-sr04")) }).click();
      const gpio = inspector.getByRole("listitem", {
        name: fill(slots.slotLabel, { slot: slots.names.gpio, host: "B1" }),
      });
      await expect(gpio).toContainText(slots.blocked);
      await expect(gpio).toContainText(template(slots.checks.logicIntoHost));
      await expect(gpio.getByRole("button", { name: slots.plugIn })).toBeDisabled();

      // A 3.3 V I²C sensor fits the I²C header, is shown as fitting before it is applied, and plugs in.
      await library.getByRole("button", { name: new RegExp(partName("bme280")) }).click();
      const i2c = inspector.getByRole("listitem", {
        name: fill(slots.slotLabel, { slot: slots.names.i2c, host: "B1" }),
      });
      await expect(i2c).toContainText(fill(slots.fits, { rail: "3V3" }));
      await i2c.getByRole("button", { name: slots.plugIn }).click();
      await expect(i2c).toContainText(fill(slots.pluggedIn, { rail: "3V3" }));
      await expect(page.getByRole("region", { name: s.validator.label })).toContainText(
        s.validator.allPassed,
      );
    });

    test("swapping the host board says beforehand which boards keep the plugged-in sensor, and why the others don't", async ({
      page,
    }) => {
      await page
        .getByRole("button", {
          name: fill(s.schematic.startFromBoard, { board: partName("raspberry-pi-4") }),
        })
        .click();
      const inspector = page.getByRole("region", { name: s.inspector.title });
      await page
        .getByRole("complementary", { name: s.library.title })
        .getByRole("button", { name: new RegExp(partName("bme280")) })
        .click();
      await inspector
        .getByRole("listitem", {
          name: fill(slots.slotLabel, { slot: slots.names.i2c, host: "B1" }),
        })
        .getByRole("button", { name: slots.plugIn })
        .click();

      await page
        .getByRole("button", {
          name: fill(s.schematic.partLabel, { id: "B1", name: partName("raspberry-pi-4") }),
        })
        .click();
      const swaps = inspector.getByRole("region", { name: slots.swapTitle });

      // The Uno's 5 V I²C would overdrive the 3.3 V sensor, so the swap is refused and says which part it is about.
      const uno = swaps.getByRole("listitem", { name: partName("arduino-uno-r4") });
      await expect(uno).toContainText(slots.swapFails);
      await expect(uno).toContainText(/S1/);
      await expect(uno.getByRole("button", { name: slots.swap })).toBeDisabled();

      const esp32 = swaps.getByRole("listitem", { name: partName("esp32-devkitc") });
      await expect(esp32).toContainText(slots.swapFits);
      await esp32.getByRole("button", { name: slots.swap }).click();
      await expect(
        page.getByRole("button", {
          name: fill(s.schematic.partLabel, { id: "B1", name: partName("esp32-devkitc") }),
        }),
      ).toBeVisible();
      await expect(page.getByRole("region", { name: s.validator.label })).toContainText(
        s.validator.allPassed,
      );
    });
  });
}

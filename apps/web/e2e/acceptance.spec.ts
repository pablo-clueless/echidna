import { expect, type Page, test } from "@playwright/test";

import en from "../messages/en.json" with { type: "json" };
import fr from "../messages/fr.json" with { type: "json" };

/** The Phase 1 acceptance budget: verdicts on screen within 100 ms of the edit. */
const BUDGET_MS = 100;

const locales = [
  { locale: "en", messages: en, smaller: "68", smallest: "47" },
  { locale: "fr", messages: fr, smaller: "0,068k", smallest: "47" },
] as const;

/**
 * Commits a new resistance and measures, inside the page, the time from the Enter key to the validator
 * showing a D1 issue with the expected verdict.
 */
const commitAndTime = async (page: Page, value: string, validatorLabel: string, verdict: string) => {
  const field = page.locator('input[name="resistance"]');
  await field.click();
  await field.fill(value);
  await page.evaluate(
    ({ label, verdict }) => {
      const w = window as unknown as { __timing: Promise<number> };
      w.__timing = new Promise((resolve) => {
        let start = 0;
        const input = document.querySelector('input[name="resistance"]');
        input?.addEventListener("keydown", () => (start = performance.now()), { capture: true, once: true });
        const check = () => {
          const drawer = document.querySelector(`section[aria-label="${label}"]`);
          const row = [...(drawer?.querySelectorAll("button") ?? [])].find(
            (b) => b.textContent?.includes("D1") && b.textContent.includes(verdict),
          );
          if (start && row) {
            observer.disconnect();
            resolve(performance.now() - start);
          }
        };
        const observer = new MutationObserver(check);
        observer.observe(document.body, { subtree: true, childList: true, characterData: true });
      });
    },
    { label: validatorLabel, verdict },
  );
  await field.press("Enter");
  return page.evaluate(() => (window as unknown as { __timing: Promise<number> }).__timing);
};

for (const { locale, messages, smaller, smallest } of locales) {
  const s = messages.Studio;

  test.describe(`acceptance (${locale})`, () => {
    test.beforeEach(async ({ page }) => {
      await page.goto(`/${locale}/studio`);
      await page.evaluate(() => localStorage.clear());
      await page.reload();
    });

    test("a smaller series resistor overloads the LED, flagged within 100 ms", async ({ page }) => {
      await page.getByRole("button", { name: s.schematic.openExample }).click();
      const validator = page.getByRole("region", { name: s.validator.label });
      await expect(validator).toContainText(s.validator.allPassed);

      const resistorName = messages.Parts.resistor.name;
      await page.getByRole("button", { name: s.schematic.partLabel.replace("{id}", "R1").replace("{name}", resistorName) }).click();
      await expect(page.locator('input[name="resistance"]')).toBeVisible();

      const warnMs = await commitAndTime(page, smaller, s.validator.label, s.validator.warn);
      await expect(validator).toContainText(s.rules.currentRating.name);
      expect(warnMs, `warning shown in ${warnMs.toFixed(1)} ms`).toBeLessThan(BUDGET_MS);

      const failMs = await commitAndTime(page, smallest, s.validator.label, s.validator.fail);
      expect(failMs, `fail shown in ${failMs.toFixed(1)} ms`).toBeLessThan(BUDGET_MS);

      console.log(`[${locale}] warning in ${warnMs.toFixed(1)} ms, fail in ${failMs.toFixed(1)} ms`);
    });
  });
}

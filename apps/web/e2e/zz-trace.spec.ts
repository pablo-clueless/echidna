import { test } from "@playwright/test";

if (process.env.GPU) test.use({ launchOptions: { args: ["--enable-gpu", "--ignore-gpu-blocklist", "--use-angle=d3d11"] } });

// Temporary: times a resistor edit from Enter to the validator showing the new verdict. Not part of the suite.
test("time resistor edit", async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto(`/en/studio`);
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.getByRole("button", { name: /example/i }).click();
  await page.getByText("All checks passed").waitFor();
  console.log("renderer", await page.evaluate(() => {
    const gl = document.querySelector("canvas")?.getContext("webgl2");
    const ext = gl?.getExtension("WEBGL_debug_renderer_info");
    return ext ? gl!.getParameter(ext.UNMASKED_RENDERER_WEBGL) : "?";
  }));
  await page.getByRole("button", { name: /R1/ }).first().click();
  const field = page.locator('input[name="resistance"]');
  const samples: number[] = [];
  for (const [i, value] of ["68", "220", "47", "330", "68", "220", "47", "330"].entries()) {
    await field.click();
    await field.fill(value);
    await page.waitForTimeout(800);
    const waiting = page.evaluate(
      () =>
        new Promise<number>((resolve) => {
          const start = performance.now();
          const panel = document.querySelector('section[aria-label="Validator"]')!;
          const before = panel.textContent;
          const obs = new MutationObserver(() => {
            if (panel.textContent !== before) {
              obs.disconnect();
              // Wait for the frame that paints it.
              requestAnimationFrame(() => setTimeout(() => resolve(performance.now() - start)));
            }
          });
          obs.observe(panel, { subtree: true, childList: true, characterData: true });
          (window as unknown as { __go: () => void }).__go = () => {};
        }),
    );
    await field.press("Enter");
    const ms = await waiting;
    const solved = await page.locator('section[aria-label="Validator"]').getByText(/Solved in/i).first().textContent().catch(() => "?");
    console.log(`edit ${Math.round(ms)}ms, ${solved}`);
    if (i > 0) samples.push(ms);
  }
  samples.sort((a, b) => a - b);
  console.log(`EDIT_MS ${JSON.stringify(samples.map(Math.round))} median=${Math.round(samples[samples.length >> 1]!)}`);
});

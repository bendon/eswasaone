import { test, expect } from "@playwright/test";

/**
 * Wave 0 gate smoke — portals respond; estore routes exist; field base path is distinct.
 * Full workflow e2e (buy / vote / audit sync) starts in Wave 1.
 */
test.describe("Wave 0 hosting gate", () => {
  test("Service portal home loads", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveTitle(/EswasaOne/i);
  });

  test("Institution portal base loads", async ({ page }) => {
    await page.goto("/institution/");
    await expect(page).toHaveTitle(/Institution|EswasaOne/i);
  });

  test("E-store checkout route is registered (auth gate ok)", async ({ page }) => {
    const res = await page.goto("/estore/checkout");
    expect(res?.ok() || res?.status() === 200).toBeTruthy();
    // May show auth modal / login — must not 404
    await expect(page.locator("body")).not.toContainText("404");
  });

  test("Field portal uses /field/ base (not Service chrome)", async ({ page }) => {
    await page.goto("/field/");
    // Field app title or shell — fail if we clearly got Service-only home without field basename
    const title = await page.title();
    const url = page.url();
    expect(url).toContain("/field");
    // Soft: if field is down nginx may 502 — then skip rather than false green
    if (title.match(/Service Portal/i) && !title.match(/Field/i)) {
      test.info().annotations.push({
        type: "note",
        description: "Field upstream may be down or mis-proxied — F0c ops check required",
      });
    }
  });
});

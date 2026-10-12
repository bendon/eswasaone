import { expect, test } from "@playwright/test";
import { HR_PAGES, portal } from "./support";

/**
 * §14.11: with demo off, no HR tab shows an empty table or an enabled form for an unwired feature.
 * A page passes when every table has rows or sits beside an empty-state message, and nothing says
 * "demo"/"sample". Unwired panels render NotConnectedPanel (role=status) or "Awaiting ESWASA".
 */
const EMPTY_STATE = /no .*yet|nothing|not connected|awaiting eswasa|none|empty/i;

for (const path of HR_PAGES) {
  test(`page ${path} has no dead table and no demo data`, async ({ browser }) => {
    const page = await portal(browser, "hr_manager");
    await page.goto(path);
    await page.waitForLoadState("networkidle");
    const main = page.locator("main, #root").first();
    await expect(main).not.toContainText(/demo data|sample data|lorem ipsum/i);
    await expect(main).not.toContainText(/something went wrong/i);
    const tables = page.locator("table");
    for (let i = 0; i < (await tables.count()); i++) {
      const table = tables.nth(i);
      const rows = await table.locator("tbody tr").count();
      if (rows > 0) continue;
      const around = (await table.locator("xpath=..").innerText()).trim();
      expect(around, `${path}: table ${i} is empty with no explanation`).toMatch(EMPTY_STATE);
    }
    const notConnected = page.locator(".crm-empty[role=status]");
    for (let i = 0; i < (await notConnected.count()); i++) {
      const panel = notConnected.nth(i);
      await expect(panel.locator("xpath=ancestor::form//button[@type='submit' and not(@disabled)]")).toHaveCount(0);
    }
  });
}

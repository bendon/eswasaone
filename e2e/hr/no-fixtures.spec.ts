import { expect, test } from "@playwright/test";
import { api, core, HR_PAGES, ok, portal } from "./support";

/** §14.1: no ERPNext sample structure (Dispatch, Production, Purchase, Sales, "All Departments") anywhere in HR. */
const FIXTURE_NAMES = /\b(Dispatch|Production|Purchase|Sales|All Departments)\b/;

test.describe("HR shows no ERPNext fixture structure", () => {
  test("Core HR lists carry none of the sample departments", async () => {
    const hr = await core("hr_manager");
    for (const path of ["/hr/departments", "/hr/designations", "/hr/employees", "/hr/organisation/overview", "/hr/establishment", "/hr/orgchart"]) {
      const body = JSON.stringify(await ok(await hr.get(api(path))));
      expect(body, path).not.toMatch(FIXTURE_NAMES);
    }
  });

  for (const path of HR_PAGES) {
    test(`page ${path} shows none of them`, async ({ browser }) => {
      const page = await portal(browser, "hr_manager");
      await page.goto(path);
      await page.waitForLoadState("networkidle");
      await expect(page.locator("main, #root").first()).not.toContainText(FIXTURE_NAMES);
    });
  }
});

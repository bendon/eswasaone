import { expect, test } from "@playwright/test";
import { desk, expectRefused, needSeed, persona, stamp } from "./support";

/** §14.6 + plan 07: no signed declaration for the year means no assignment and no decision. */
test.describe("impartiality guard", () => {
  test("an auditor without this year's declaration can't lead a visit", async () => {
    const c = needSeed("competence");
    const auditor = persona("auditor_undeclared");
    const officer = await desk("cert_officer");
    const code = stamp();
    const res = await officer.post("/api/resource/Field%20Visit", {
      data: { visit_code: code, title: `${code} declaration guard`, scheme: c.scheme, planned_date: c.visit_date,
              lead_auditor: auditor.user, customer: "E2E Customer" },
    });
    await expectRefused(res, /declaration/i);
  });

  test("the same auditor is accepted for a visit once declared (control)", async () => {
    const c = needSeed("competence");
    const auditor = persona("expiring"); // declared, authorised to day 60
    const officer = await desk("cert_officer");
    const code = stamp();
    const res = await officer.post("/api/resource/Field%20Visit", {
      data: { visit_code: code, title: `${code} control`, scheme: c.scheme, planned_date: c.visit_date,
              lead_auditor: auditor.user, customer: "E2E Customer" },
    });
    expect(res.ok(), await res.text()).toBeTruthy();
  });
});

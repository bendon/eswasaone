import { test } from "@playwright/test";
import { desk, expectRefused, needSeed, persona, stamp } from "./support";

/** §14.5 + plan 07: an authorisation that ends before the visit date refuses the assignment, with the reason. */
test("a lead auditor whose authorisation ends before the visit is refused", async () => {
  const c = needSeed("competence");
  const auditor = persona("auditor_expiring");
  const officer = await desk("cert_officer");
  const code = stamp();
  const res = await officer.post("/api/resource/Field%20Visit", {
    data: { visit_code: code, title: `${code} competence guard`, scheme: c.scheme, planned_date: c.visit_date,
            lead_auditor: auditor.user, customer: "E2E Customer" },
  });
  await expectRefused(res, /authoris/i);
});

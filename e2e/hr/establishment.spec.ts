import { expect, test } from "@playwright/test";
import { act, api, approvals, core, desk, expectRefused, isoDay, needSeed, ok, persona, stamp } from "./support";

/** §14.4: an offer beyond the Staffing Plan is refused; a plan amendment needs the Executive Director. */
test.describe("establishment", () => {
  test("an offer beyond the approved posts is refused", async () => {
    const est = needSeed("establishment");
    const seed = needSeed("designation");
    const hr = await desk("hr_manager");
    const res = await hr.post("/api/resource/Job%20Offer", {
      data: {
        job_applicant: est.beyond_plan,
        applicant_name: "E2E Applicant 2",
        designation: seed,
        company: needSeed("company"),
        offer_date: isoDay(0),
        status: "Awaiting Response",
      },
    });
    await expectRefused(res, /vacanc|staffing plan/i);
  });

  test("a Staffing Plan change waits for the Executive Director; another HR Manager can't decide it", async () => {
    const department = needSeed("department");
    const designation = needSeed("designation");
    persona("ed");
    const hr = await core("hr_manager");
    const hr2 = await core("hr_manager_2");
    const ed = await core("ed");
    const change = await ok<{ id: string }>(
      await hr.post(api("/hr/establishment/changes"), {
        data: { department, designation, change: "Add", count: 1, reason: `${stamp()} e2e: one more post`, confirm: true },
      }),
    );
    const forEd = (await approvals(ed)).find((a) => a.name === change.id);
    expect(forEd, "the Executive Director has the change in Approvals").toBeTruthy();
    expect((await approvals(hr2)).some((a) => a.name === change.id)).toBeFalsy();
    await expectRefused(await act(hr2, { doctype: forEd!.doctype, name: change.id }, "approve"));
    await expectRefused(await act(hr, { doctype: forEd!.doctype, name: change.id }, "approve"));
  });
});

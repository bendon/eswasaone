import { expect, test } from "@playwright/test";
import { api, approvals, core, desk, expectRefused, isoDay, needSeed, ok } from "./support";

/** §14.3 + plan 01: nobody approves their own leave, in the portal or in Desk; an HR User who isn't the approver can't either. */
test.describe("no self-approval", () => {
  test("Time off /act refuses an HR User who isn't the approver, and the applicant", async () => {
    const leave = needSeed("leave");
    const employee = await core("employee");
    const hrUser = await core("hr_user");
    const day = isoDay(28);
    const created = await ok<{ id: string }>(
      await employee.post(api("/hr/leave"), {
        data: { leave_type: leave.leave_type, from_date: day, to_date: day, confirm: true },
      }),
    );
    await expectRefused(await hrUser.post(api(`/hr/leave/${created.id}/act`), { data: { decision: "approve", confirm: true } }));
    await expectRefused(await employee.post(api(`/hr/leave/${created.id}/act`), { data: { decision: "approve", confirm: true } }));
    // A reject without a note is refused too (the page sends none; README frontend conflict 1).
    const manager = await core("line_manager");
    await expectRefused(await manager.post(api(`/hr/leave/${created.id}/act`), { data: { decision: "reject", confirm: true } }));
  });

  test("the line manager (their own approver) can't approve their own leave in the portal or Desk", async () => {
    const leave = needSeed("leave");
    const manager = await core("line_manager");
    const day = isoDay(35);
    const created = await ok<{ id: string }>(
      await manager.post(api("/hr/leave"), {
        data: { leave_type: leave.leave_type, from_date: day, to_date: day, confirm: true },
      }),
    );
    await expectRefused(await manager.post(api(`/hr/leave/${created.id}/act`), { data: { decision: "approve", confirm: true } }));
    const item = (await approvals(manager)).find((a) => a.name === created.id);
    if (item) {
      await expectRefused(
        await manager.post(api(`/approvals/${encodeURIComponent(item.doctype)}/${item.name}/act`), {
          data: { action: "approve", confirm: true },
        }),
      );
    }
    const d = await desk("line_manager");
    const res = await d.put(`/api/resource/Leave%20Application/${created.id}`, { data: { status: "Approved", docstatus: 1 } });
    await expectRefused(res);
    const after = await ok<{ data: { status: string; docstatus: number } }>(
      await (await desk("hr_manager")).get(`/api/resource/Leave%20Application/${created.id}`),
    );
    expect(after.data.docstatus).toBe(0);
  });
});

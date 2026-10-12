import { expect, test } from "@playwright/test";
import { api, approvals, core, desk, expectRefused, ok, persona, stamp } from "./support";

type AccessRequest = { id: string; status: string; rolesGranted?: string; requesterUsername: string };

/** Plan 02: request a module, reviewed on the HR page or in Approvals; the role is granted; no one approves their own. */
test.describe("module access requests", () => {
  test("an employee's request is approved by HR and the role is granted", async () => {
    const who = persona("employee");
    const employee = await core("employee");
    const hr = await core("hr_manager");
    const req = await ok<AccessRequest>(
      await employee.post(api("/hr/access-requests"), {
        data: { moduleId: "certification", moduleLabel: "Certification", note: `${stamp()} e2e`, confirm: true },
      }),
    );
    expect(req.status).toBe("pending");
    expect((await approvals(hr)).some((a) => a.name === req.id), "also in Approvals").toBeTruthy();
    const done = await ok<AccessRequest>(
      await hr.patch(api(`/hr/access-requests/${req.id}`), { data: { decision: "approved", confirm: true } }),
    );
    expect(done.status).toBe("approved");
    expect(done.rolesGranted).toBeTruthy();
    const me = await ok<{ docs: { roles: { role: string }[] }[] }>(
      await (await desk("employee")).get("/api/method/frappe.desk.form.load.getdoc", { params: { doctype: "User", name: who.user } }),
    );
    expect(me.docs[0].roles.map((r) => r.role)).toContain(done.rolesGranted);
  });

  test("an HR Manager can't approve their own request", async () => {
    const hr = await core("hr_manager");
    const req = await ok<AccessRequest>(
      await hr.post(api("/hr/access-requests"), {
        data: { moduleId: "metrology", moduleLabel: "Metrology", note: `${stamp()} e2e own`, confirm: true },
      }),
    );
    await expectRefused(await hr.patch(api(`/hr/access-requests/${req.id}`), { data: { decision: "approved", confirm: true } }));
    const other = await core("hr_manager_2");
    const done = await ok<AccessRequest>(
      await other.patch(api(`/hr/access-requests/${req.id}`), { data: { decision: "rejected", reviewNote: "e2e cleanup", confirm: true } }),
    );
    expect(done.status).toBe("rejected");
  });
});

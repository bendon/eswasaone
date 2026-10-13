import { expect, test } from "@playwright/test";
import { act, api, approvals, core, expectRefused, isoDay, ok, persona } from "./support";

type Bulk = { name: string; status: string; people: number; rows: { employee: string; result?: string | null }[] };

/** J16 (additions plan 06): office closure leave for one person, approved by another HR Manager, applied by the worker. */
test("office closure leave is previewed, approved in Approvals and applied", async () => {
  const hr = await core("hr_manager");
  const other = await core("hr_manager_2");
  const employee = persona("employee");
  const leave = await ok<{ leave_types: string[] }>(await hr.get(api("/hr/bulk/options")));
  const leave_type = leave.leave_types[0];
  test.skip(!leave_type, "no leave types on the site");

  // Closure dates are ESWASA's (A7); a working day well ahead keeps clear of real leave.
  const parameters = { leave_type, from_date: isoDay(120), to_date: isoDay(120), reason: "e2e J16 closure" };
  const selection = { employees: [employee.employee] };
  const preview = await ok<{ count: number }>(
    await hr.post(api("/hr/bulk/preview"), { data: { kind: "Office closure leave", parameters, selection } }),
  );
  expect(preview.count).toBe(1);

  const bulk = await ok<Bulk>(
    await hr.post(api("/hr/bulk"), { data: { kind: "Office closure leave", parameters, selection, submit: true, confirm: true } }),
  );
  expect(bulk.status).toBe("Waiting");
  // Bulk termination doesn't exist.
  await expectRefused(await hr.post(api("/hr/bulk/preview"), { data: { kind: "Termination", parameters, selection } }));

  const card = (await approvals(other)).find((a) => a.name === bulk.name);
  expect(card?.title).toMatch(/^Approve bulk office closure leave: 1 person/i);
  await expectRefused(await act(hr, card!, "Approve"));
  await ok(await act(other, card!, "Approve"));

  // The long-queue worker applies it.
  await expect
    .poll(async () => (await ok<Bulk>(await hr.get(api(`/hr/bulk/${bulk.name}`)))).status, { timeout: 60_000 })
    .toMatch(/^(Applied|Partly applied)$/);
});

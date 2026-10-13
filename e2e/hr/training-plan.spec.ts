import { expect, test } from "@playwright/test";
import { act, api, approvals, core, expectRefused, ok, persona, stamp } from "./support";

type Plan = { name: string; status: string; department: string; year: string };

/** J15 (additions plan 05): a need goes into a department plan that another HR Manager approves. */
test("a training plan is approved by an HR Manager who didn't prepare it", async () => {
  const hr = await core("hr_manager");
  const other = await core("hr_manager_2");
  const employee = persona("employee");
  const topic = `${stamp()} e2e J15`;

  const needs = await ok<{ needs: { name: string; topic: string; department?: string | null }[] }>(
    await hr.post(api("/hr/training/needs"), { data: { employee: employee.employee, topic, confirm: true } }),
  );
  const need = needs.needs.find((n) => n.topic === topic);
  expect(need).toBeTruthy();

  const list = await ok<{ years: string[]; departments: string[] }>(await hr.get(api("/hr/training/plans")));
  const department = need!.department ?? list.departments[0];
  const year = list.years[0];
  test.skip(!department || !year, "no department or Fiscal Year on the site");
  const res = await hr.post(api("/hr/training/plans"), {
    data: {
      department,
      year,
      lines: [{ topic, quarter: "Q1", needs: [need!.name], estimated_direct: 0, estimated_indirect: 0 }],
      submit: true,
      confirm: true,
    },
  });
  test.skip(res.status() === 422 && /already|one plan/i.test(await res.text()), `a ${year} plan already exists for ${department}`);
  const plan = await ok<Plan>(res);
  expect(plan.status).toBe("Waiting");

  // The preparer has no card; the other HR Manager decides it in Approvals.
  expect((await approvals(hr)).find((a) => a.name === plan.name)).toBeUndefined();
  const card = (await approvals(other)).find((a) => a.name === plan.name);
  expect(card?.title).toMatch(/^Approve training plan/);
  await expectRefused(await act(hr, card!, "Approve"));
  await ok(await act(other, card!, "Approve"));
  expect((await ok<Plan>(await hr.get(api(`/hr/training/plans/${plan.name}`)))).status).toBe("Approved");
});

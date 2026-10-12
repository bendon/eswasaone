import { expect, test } from "@playwright/test";
import { act, api, approvals, core, isoDay, needSeed, ok } from "./support";

/** §14.2: only the line manager gets the leave ToDo; approving in Approvals updates My HR and HR Time off. */
test("leave goes to the line manager only, and the decision shows everywhere", async () => {
  const leave = needSeed("leave");
  const employee = await core("employee");
  const manager = await core("line_manager");
  const hr = await core("hr_manager");
  const hrUser = await core("hr_user");

  const day = isoDay(21);
  const created = await ok<{ id: string; status: string }>(
    await employee.post(api("/hr/leave"), {
      data: { leave_type: leave.leave_type, from_date: day, to_date: day, reason: "E2E routing", confirm: true },
    }),
  );
  expect(created.status).toBe("Open");

  const mine = (await approvals(manager)).find((a) => a.doctype === "Leave Application" && a.name === created.id);
  expect(mine, "the line manager has the request in Approvals").toBeTruthy();
  for (const other of [hr, hrUser, employee]) {
    expect((await approvals(other)).some((a) => a.name === created.id), "nobody else is asked").toBeFalsy();
  }

  await ok(await act(manager, mine!, "approve"));

  const me = await ok<{ leave: { id: string; status: string }[] }>(await employee.get(api("/hr/me")));
  expect(me.leave.find((l) => l.id === created.id)?.status).toBe("Approved");
  const board = await ok<{ items: { id: string; status: string }[] }>(await hr.get(api("/hr/leave/requests")));
  expect(board.items.find((l) => l.id === created.id)?.status).toBe("Approved");
  // The leave calendar panel isn't wired (README frontend conflict 4); the API carries the approved day.
  const cal = await ok<Record<string, unknown>>(await hr.get(api(`/hr/leave/calendar?start=${day}&end=${day}`)));
  expect(JSON.stringify(cal)).toContain(created.id);
});

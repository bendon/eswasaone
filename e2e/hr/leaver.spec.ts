import { expect, test } from "@playwright/test";
import { desk, needSeed, ok } from "./support";

/** §14.9: on the last day the login is disabled and open ToDos move to the line manager with the reason. */
test("a leaver's login is disabled and their tasks move to the line manager", async () => {
  const l = needSeed("leaver");
  const hr = await desk("hr_manager");
  const employee = await ok<{ data: { status: string } }>(await hr.get(`/api/resource/Employee/${l.employee}`));
  expect(employee.data.status).toBe("Left");
  const todo = await ok<{ data: { allocated_to: string; description: string; status: string } }>(
    await hr.get(`/api/resource/ToDo/${l.todo}`),
  );
  expect(todo.data.allocated_to).toBe(l.manager_user);
  expect(todo.data.status).toBe("Open");
  expect(todo.data.description).toMatch(/left|leaver|last day/i);
  // A disabled login can't use the API at all.
  const leaver = await desk("leaver");
  const res = await leaver.get("/api/method/frappe.auth.get_logged_user");
  expect(res.status()).toBeGreaterThanOrEqual(400);
});

import { expect, test } from "@playwright/test";
import { api, core, ok, persona } from "./support";

/** §14.8: a line manager gets 403 on /sensitive; an HR Manager gets the data and a log row is written. */
test("protected details: refused to the line manager, logged for HR", async () => {
  const subject = persona("employee").employee;
  const manager = await core("line_manager");
  const hr = await core("hr_manager");
  const body = { level: 1, reason: "E2E privacy check", confirm: true };

  const refused = await manager.post(api(`/hr/employees/${subject}/sensitive`), { data: body });
  expect(refused.status()).toBe(403);

  const before = await ok<{ items: unknown[] }>(await hr.get(api(`/hr/employees/${subject}/access-log`)));
  const seen = await ok<{ fields: unknown[] }>(await hr.post(api(`/hr/employees/${subject}/sensitive`), { data: body }));
  expect(Array.isArray(seen.fields)).toBeTruthy();
  const after = await ok<{ items: unknown[] }>(await hr.get(api(`/hr/employees/${subject}/access-log`)));
  expect(after.items.length).toBe(before.items.length + 1);
  expect(JSON.stringify(after.items[0])).toContain("E2E privacy check");
});

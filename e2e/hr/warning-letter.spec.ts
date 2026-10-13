import { expect, test } from "@playwright/test";
import { api, core, isoDay, ok, persona, stamp } from "./support";

type Offences = { items: { code: string; active?: boolean }[]; warning_months: Record<string, number | null> };
type Case = { id: string; stage: string; sanction?: string | null; warning_expires_on?: string | null; warning_status?: string | null; warning_letter?: string | null };

/** J13 (additions plan 01 + 03): an outcome with a written warning gets an expiry, a warning letter and shows on the record. */
test("a written warning expires on time and carries its letter", async () => {
  const hr = await core("hr_manager");
  const owner = persona("hr_manager");
  const employee = persona("employee");
  const code = await ok<Offences>(await hr.get(api("/hr/disciplinary/offences")));
  const offence = code.items.find((o) => o.active !== false)?.code;
  const months = code.warning_months["Written warning"];
  test.skip(!offence || !months, "Awaiting ESWASA (A1): no disciplinary code or written warning validity");

  let c = await ok<Case>(
    await hr.post(api("/hr/cases"), {
      data: { kind: "disciplinary", employee: employee.employee, owner: owner.user, description: `${stamp()} e2e J13`, offence, confirm: true },
    }),
  );
  for (const to_stage of ["Investigation", "Hearing scheduled"]) {
    c = await ok<Case>(await hr.post(api(`/hr/cases/disciplinary/${c.id}/act`), { data: { to_stage, note: "e2e step", confirm: true } }));
  }
  c = await ok<Case>(
    await hr.post(api(`/hr/cases/disciplinary/${c.id}/act`), {
      data: { to_stage: "Outcome issued", note: "e2e outcome", outcome: "Written warning issued", offence, sanction: "Written warning", confirm: true },
    }),
  );
  expect(c.warning_status).toBe("Active");
  expect(c.warning_expires_on && c.warning_expires_on > isoDay()).toBeTruthy();

  const warnings = await ok<{ items: { case: string; status: string }[] }>(await hr.get(api(`/hr/employees/${employee.employee}/warnings`)));
  expect(warnings.items.find((w) => w.case === c.id)?.status).toBe("Active");
  // The warnings list never carries the allegation.
  expect(JSON.stringify(warnings)).not.toContain("e2e J13");

  const letters = await hr.post(api(`/hr/employees/${employee.employee}/letters`), { data: { letter_type: "Warning", source_name: c.id, confirm: true } });
  test.skip(letters.status() === 422 && /awaiting eswasa/i.test(await letters.text()), "Awaiting ESWASA (A3): no warning letter wording");
  await ok(letters);
  const after = await ok<Case>(await hr.get(api(`/hr/cases/disciplinary/${c.id}`)));
  expect(after.warning_letter).toBeTruthy();
});

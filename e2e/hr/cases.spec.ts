import { expect, test } from "@playwright/test";
import { api, core, ok, stamp } from "./support";

/** §14.10: cases stay with their owner. A Certification Officer gets no rows, and nothing in Ask/Esi. */
test("a Certification Officer can't see a grievance anywhere", async () => {
  const employee = await core("employee");
  const officer = await core("cert_officer");
  const marker = stamp();
  const receipt = await ok<{ id: string }>(
    await employee.post(api("/hr/me/concerns"), {
      data: { description: `${marker} e2e concern about workload`, talk_first: false, confirm: true },
    }),
  );

  const list = await officer.get(api("/hr/cases"));
  if (list.ok()) {
    const body = JSON.stringify(await list.json());
    expect(body).not.toContain(receipt.id);
    expect(body).not.toContain(marker);
  } else {
    expect([401, 403]).toContain(list.status());
  }
  const detail = await officer.get(api(`/hr/cases/grievance/${receipt.id}`));
  expect([403, 404]).toContain(detail.status());

  const ask = await officer.post(api("/agent/ask"), { data: { message: `Show me grievance ${receipt.id}` } });
  if (ask.ok()) {
    const text = JSON.stringify(await ask.json()).replace(new RegExp(`Show me grievance ${receipt.id}`, "g"), "");
    expect(text).not.toContain(marker);
    expect(text).not.toMatch(/workload/i);
  }
});

import { expect, test } from "@playwright/test";
import { api, core, expectRefused, ok, persona, stamp } from "./support";

type Item = { name: string; tag?: string | null; status: string };

/** J14 (additions plan 02): an issued item is acknowledged by its holder and is out until HR takes it back. */
test("an issued item is acknowledged, counted as out, then returned", async () => {
  const hr = await core("hr_manager");
  const staff = await core("employee");
  const employee = persona("employee");
  const types = await ok<{ types: string[]; awaiting?: string | null }>(await hr.get(api("/hr/items/types")));
  test.skip(!types.types.length, "Awaiting ESWASA (A2): no item types");

  const tag = stamp();
  const issued = await ok<{ items: Item[] }>(
    await hr.post(api(`/hr/employees/${employee.employee}/items`), { data: { item_type: types.types[0], tag, confirm: true } }),
  );
  const item = issued.items.find((i) => i.tag === tag);
  expect(item?.status).toBe("Issued");

  // The holder acknowledges; nobody else can.
  await expectRefused(await hr.post(api(`/hr/me/items/${item!.name}/acknowledge`), { data: { confirm: true } }));
  const mine = await ok<{ items: Item[] }>(await staff.post(api(`/hr/me/items/${item!.name}/acknowledge`), { data: { confirm: true } }));
  expect(mine.items.find((i) => i.name === item!.name)?.status).toBe("Acknowledged");

  const out = await ok<{ items: Item[] }>(await hr.get(api("/hr/items?status=out")));
  expect(out.items.map((i) => i.name)).toContain(item!.name);

  const back = await ok<{ items: Item[] }>(
    await hr.post(api(`/hr/items/${item!.name}/return`), { data: { outcome: "Returned", condition_in: "Good", confirm: true } }),
  );
  expect(back.items.find((i) => i.name === item!.name)?.status).toBe("Returned");
});

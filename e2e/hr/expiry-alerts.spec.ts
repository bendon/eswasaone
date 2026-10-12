import { expect, test } from "@playwright/test";
import { desk, deskList, needSeed, persona } from "./support";

/** §14.7: 60 days before valid_to raises one alert each for the employee, the line manager and HR. */
test("an authorisation 60 days from expiry alerts the person, their manager and HR, once each", async () => {
  const c = needSeed("competence");
  const person = persona("expiring");
  const manager = persona("line_manager");
  const hrManager = persona("hr_manager");
  const hr = await desk("hr_manager");
  const alerts = await deskList<{ name: string }>(hr, "HR Alert", [["subject_doctype", "=", "Staff Authorisation"], ["subject_name", "=", c.alerting], ["key", "like", `R-H3:${c.alerting}:${c.alert_valid_to}:%`]], ["name"]);
  expect(alerts.length, "one HR Alert for the threshold").toBe(1);
  const todos = await deskList<{ allocated_to: string }>(
    hr, "ToDo", [["reference_type", "=", "HR Alert"], ["reference_name", "=", alerts[0].name]], ["allocated_to"],
  );
  const to = todos.map((t) => t.allocated_to);
  for (const user of [person.user, manager.user, hrManager.user]) {
    expect(to.filter((u) => u === user), `${user} gets exactly one`).toHaveLength(1);
  }
});

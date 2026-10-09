/**
 * Approvals handlers for calibration jobs and LIMS test requests.
 */
import { registerTaskHandler } from "../tasks/handlers";
import { dutyList } from "../workflow/engine";
import { actOnJob, actOnTest, jobActions, jobOot, metStore, testActions } from "./store";

registerTaskHandler({
  doctype: "Calibration Job",
  currentState: (t) => metStore.read().jobs[t.name]?.state ?? null,
  // Quote, receipt and assignment need their own forms on the job page.
  actions: (t, actor) => jobActions(t.name, actor).filter((a) => !["quote", "receive", "assign", "dispatch"].includes(a.action)),
  act: async (t, action, actor, input) => {
    await actOnJob(t.name, action, actor, input);
  },
  preview: (t) => {
    const j = metStore.read().jobs[t.name];
    if (!j) return null;
    return {
      facts: [
        { label: "Customer", value: j.customer },
        { label: "Items", value: j.items.map((i) => `${i.description} (${i.serial})`).join("; ") },
        { label: "Location", value: j.location === "onsite" ? `On site — ${j.site ?? ""}` : "Lab" },
        { label: "Metrologist", value: j.metrologist ?? "—" },
        { label: "Points", value: `${j.worksheet.points.length}${jobOot(j) ? " · out of tolerance found" : ""}` },
        { label: "References", value: j.worksheet.refs.join(", ") || "—" },
      ],
      history: j.history.slice(-3).reverse(),
      duties: dutyList(j),
    };
  },
});

registerTaskHandler({
  doctype: "LIMS Test Request",
  currentState: (t) => metStore.read().tests[t.name]?.state ?? null,
  actions: (t, actor) => testActions(t.name, actor).filter((a) => a.action !== "assign"),
  act: async (t, action, actor, input) => {
    await actOnTest(t.name, action, actor, input);
  },
  preview: (t) => {
    const r = metStore.read().tests[t.name];
    if (!r) return null;
    return {
      summary: r.remarks,
      facts: [
        { label: "Sample", value: `${r.seal} — ${r.product}` },
        { label: "Tests", value: r.tests },
        { label: "For", value: r.parent?.label ?? "—" },
        { label: "Analyst", value: r.analyst ?? "—" },
        { label: "Results", value: r.results.map((x) => `${x.param}: ${x.value}${x.unit ?? ""} ${x.pass ? "✓" : "✗"}`).join("; ") || "—" },
        { label: "Conclusion", value: r.conclusion ?? "—" },
      ],
      history: r.history.slice(-3).reverse(),
      duties: dutyList(r),
    };
  },
});

/**
 * Approvals handlers for Field Visit and Sample tasks — preview and act from the inbox.
 */
import { registerTaskHandler } from "../tasks/handlers";
import { dutyList } from "../workflow/engine";
import { VISIT_TYPES } from "./defs";
import { actOnVisit, fieldStore, visitActions } from "./store";

registerTaskHandler({
  doctype: "Field Visit",
  currentState: (t) => fieldStore.read().visits[t.name]?.state ?? null,
  actions: (t, actor) => visitActions(t.name, actor).filter((a) => a.action !== "assign"),
  act: async (t, action, actor, input) => {
    await actOnVisit(t.name, action, actor, input);
  },
  preview: (t) => {
    const v = fieldStore.read().visits[t.name];
    if (!v) return null;
    return {
      summary: v.notes || v.scope,
      facts: [
        { label: "Type", value: VISIT_TYPES[v.type].label },
        { label: "Client", value: v.client },
        { label: "Date", value: new Date(v.planned_date).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }) },
        { label: "Lead", value: v.lead ?? "Not assigned" },
        { label: "Findings", value: String(v.findings.length) },
        { label: "Samples", value: String(v.sample_ids.length) },
        ...(v.abort ? [{ label: "Aborted", value: v.abort.reason }] : []),
      ],
      history: v.history.slice(-3).reverse(),
      duties: dutyList(v),
    };
  },
});

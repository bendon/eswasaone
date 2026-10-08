/**
 * Approvals handlers for standards work items, proposals and TC membership applications.
 */
import { registerTaskHandler } from "../tasks/handlers";
import { dutyList } from "../workflow/engine";
import { actOnProposal, actOnWorkItem, decideTcApplication, proposalActions, stdStore, wiActions } from "./store";

registerTaskHandler({
  doctype: "Standard Work Item",
  currentState: (t) => stdStore.read().items[t.name]?.state ?? null,
  // Opening comment / ballot needs a period and publishing needs the checklist: done on the record page.
  actions: (t, actor) => wiActions(t.name, actor).filter((a) => !["open_comment", "open_ballot", "publish"].includes(a.action)),
  act: async (t, action, actor, input) => {
    await actOnWorkItem(t.name, action, actor, input);
  },
  preview: (t) => {
    const s = stdStore.read();
    const w = s.items[t.name];
    if (!w) return null;
    const comments = Object.values(s.comments).filter((c) => c.work_item_id === w.id);
    return {
      summary: w.scope,
      facts: [
        { label: "Reference", value: w.ref },
        { label: "Committee", value: `${s.tcs[w.tc_id]?.number} ${s.tcs[w.tc_id]?.name}` },
        { label: "Latest draft", value: w.drafts[w.drafts.length - 1]?.label ?? "—" },
        { label: "Comments", value: `${comments.length} (${comments.filter((c) => !c.disposition).length} without disposition)` },
        { label: "Project leader", value: w.project_leader || "—" },
      ],
      history: w.history.slice(-3).reverse(),
      duties: dutyList(w),
    };
  },
});

registerTaskHandler({
  doctype: "Standards Proposal",
  currentState: (t) => stdStore.read().proposals[t.name]?.state ?? null,
  actions: (t, actor) => proposalActions(t.name, actor).filter((a) => a.action === "reject"),
  act: async (t, action, actor, input) => {
    await actOnProposal(t.name, action, actor, input);
  },
  preview: (t) => {
    const p = stdStore.read().proposals[t.name];
    if (!p) return null;
    return { summary: p.justification, facts: [{ label: "Title", value: p.title }, { label: "Scope", value: p.scope }, { label: "International refs", value: p.intl_refs || "—" }, { label: "Proposer", value: `${p.proposer.name}${p.proposer.org ? `, ${p.proposer.org}` : ""}` }, { label: "Urgency", value: p.urgency }], history: p.history.slice(-3).reverse() };
  },
});

registerTaskHandler({
  doctype: "TC Application",
  currentState: (t) => {
    for (const tc of Object.values(stdStore.read().tcs)) {
      const a = tc.applications.find((x) => x.id === t.name);
      if (a) return a.state;
    }
    return null;
  },
  actions: () => [
    { action: "approve", label: "Approve membership", primary: true, consequence: "Adds the applicant as a voting member with a 3-year term." },
    { action: "reject", label: "Decline", requires: "reason", danger: true, consequence: "Declines the application; the applicant sees your reason." },
  ],
  act: async (t, action, actor, input) => {
    const tc = Object.values(stdStore.read().tcs).find((x) => x.applications.some((a) => a.id === t.name));
    if (!tc) throw new Error("Application not found.");
    decideTcApplication(tc.id, t.name, action === "approve", input.reason ?? "", actor);
  },
  preview: (t) => ({ facts: Object.entries(t.facts ?? {}).map(([label, value]) => ({ label, value })), history: [] }),
});

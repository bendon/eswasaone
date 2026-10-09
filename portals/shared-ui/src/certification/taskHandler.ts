/**
 * Approvals handlers for certification records: applications, NC responses, the register and mark requests.
 */
import { registerTaskHandler } from "../tasks/handlers";
import { completeTask } from "../tasks/store";
import { dutyList } from "../workflow/engine";
import { actOnApplication, actOnCertificate, actOnMark, appActions, certActions, certStore, markActions, reviewNc, verifyNc } from "./store";

registerTaskHandler({
  doctype: "Certification Application",
  currentState: (t) => (t.state === "Stale" ? (t.closed_at ? "closed" : "Stale") : certStore.read().apps[t.name]?.state ?? null),
  // Quote, technical review and decisions need their own screens on the record page.
  actions: (t, actor) =>
    t.state === "Stale"
      ? [{ action: "ack", label: "Acknowledge", primary: true, consequence: "Closes the stale alert. Chase the customer or withdraw the file from the record page." }]
      : appActions(t.name, actor).filter((a) => !["issue_quote", "complete_review", "review_more_info"].includes(a.action)),
  act: async (t, action, actor, input) => {
    if (action === "ack") return void (await completeTask(t.id, actor, "Acknowledged"));
    await actOnApplication(t.name, action, actor, input);
  },
  preview: (t) => {
    const a = certStore.read().apps[t.name];
    if (!a) return null;
    return {
      summary: a.technical_review ? `Technical review: recommend ${a.technical_review.recommendation} — ${a.technical_review.justification}` : a.scope,
      facts: [
        { label: "Organisation", value: a.org },
        { label: "Scheme", value: a.standard },
        { label: "Employees / sites", value: `${a.employees} / ${a.sites.length}` },
        { label: "Documents", value: `${a.documents.filter((d) => d.status === "acceptable").length}/${a.documents.length} acceptable` },
        { label: "Findings", value: `${a.findings.filter((n) => n.state !== "Verified closed").length} open of ${a.findings.length}` },
        { label: "Officer", value: a.officer ?? "Unclaimed" },
      ],
      history: a.history.slice(-3).reverse(),
      duties: dutyList(a),
    };
  },
});

const ncOf = (name: string) => {
  const [appId, ncId] = name.split(":");
  const a = certStore.read().apps[appId];
  return { a, n: a?.findings.find((x) => x.id === ncId), appId, ncId };
};

registerTaskHandler({
  doctype: "Nonconformity",
  currentState: (t) => ncOf(t.name).n?.state ?? null,
  actions: (t) => {
    const { n } = ncOf(t.name);
    if (n?.state === "Response submitted")
      return [
        { action: "accept", label: "Accept response", primary: true, consequence: n.severity === "major" ? "Accepts the corrective action. A major still needs verification on evidence before it closes." : "Accepts and closes the minor finding." , rule: "R-C2" },
        { action: "reject", label: "Reject response", requires: "reason", danger: true, consequence: "Sends it back to the customer with your reason; their clock keeps running." },
      ];
    if (n?.state === "Accepted") return [{ action: "verify", label: "Verify closed", primary: true, requires: "note", consequence: "Records the objective evidence that the major is closed." }];
    return [];
  },
  act: async (t, action, actor, input) => {
    const { appId, ncId } = ncOf(t.name);
    if (action === "verify") verifyNc(appId, ncId, input.note ?? input.reason ?? "", actor);
    else reviewNc(appId, ncId, action === "accept", input.reason ?? input.note ?? "", actor);
  },
  preview: (t) => {
    const { a, n } = ncOf(t.name);
    if (!a || !n) return null;
    return {
      summary: n.statement,
      facts: [
        { label: "Organisation", value: a.org },
        { label: "Clause", value: `${n.clause} (${n.severity})` },
        { label: "Root cause", value: n.response?.root_cause ?? "—" },
        { label: "Correction", value: n.response?.correction ?? "—" },
        { label: "Corrective action", value: n.response?.corrective_action ?? "—" },
        { label: "Evidence", value: n.response?.evidence.join(", ") || "—" },
      ],
      history: a.history.filter((h) => h.action.includes(n.id)).slice(-3).reverse(),
    };
  },
});

registerTaskHandler({
  doctype: "Certification",
  currentState: (t) => (t.state.startsWith("Request") || ["Suspension proposed", "Major at surveillance"].includes(t.state) ? (t.closed_at ? "closed" : t.state) : certStore.read().certs[t.name]?.state ?? null),
  actions: (t, actor) => {
    const base = certActions(t.name, actor);
    if (t.state.startsWith("Request") || ["Suspension proposed", "Major at surveillance"].includes(t.state))
      return [...base.filter((a) => a.action === "suspend"), { action: "done", label: "Mark handled", primary: true, consequence: "Closes this task." }];
    return base;
  },
  act: async (t, action, actor, input) => {
    if (action === "done") return void (await completeTask(t.id, actor, "Handled", input.reason));
    await actOnCertificate(t.name, action, actor, { ...input, expected_state: certStore.read().certs[t.name]?.state ?? input.expected_state });
    if (t.state.startsWith("Request") || t.state === "Suspension proposed" || t.state === "Major at surveillance") await completeTask(t.id, actor, action);
  },
  preview: (t) => {
    const c = certStore.read().certs[t.name];
    if (!c) return null;
    return {
      facts: [
        { label: "Holder", value: c.org },
        { label: "Certificate", value: `${c.number} (${c.state})` },
        { label: "Scope", value: c.scope },
        { label: "Next", value: c.cycle.find((x) => !x.done_at)?.label ?? "—" },
        ...Object.entries(t.facts ?? {}).map(([label, value]) => ({ label, value })),
      ],
      history: c.history.slice(-3).reverse(),
      duties: dutyList(c),
    };
  },
});

registerTaskHandler({
  doctype: "Mark Use Request",
  currentState: (t) => certStore.read().marks[t.name]?.state ?? null,
  actions: (t, actor) => markActions(t.name, actor),
  act: async (t, action, actor, input) => {
    await actOnMark(t.name, action, actor, input);
  },
  preview: (t) => {
    const m = certStore.read().marks[t.name];
    if (!m) return null;
    return { summary: m.description, facts: [{ label: "Holder", value: m.org }, { label: "Usage", value: m.usage }, { label: "Artwork", value: m.artwork }, { label: "Certificate", value: m.certificate_id }], history: m.history.slice(-3).reverse() };
  },
});

/**
 * Approvals handlers for governance tasks — preview the record and act from the inbox.
 */
import { registerTaskHandler, type TaskPreview } from "../tasks/handlers";
import { dutyList } from "../workflow/engine";
import {
  actOnAction,
  actOnMeeting,
  actOnRisk,
  actionActionsFor,
  govStore,
  meetingActions,
  riskActions,
  riskScoreOf,
  updateSection,
} from "./store";

const last3 = <T,>(xs: T[]) => xs.slice(-3).reverse();

registerTaskHandler({
  doctype: "Board Meeting",
  currentState: (t) => govStore.read().meetings[t.name]?.state ?? null,
  actions: (t, actor) => meetingActions(t.name, actor),
  act: async (t, action, actor, input) => {
    await actOnMeeting(t.name, action, actor, input);
  },
  preview: (t): TaskPreview | null => {
    const s = govStore.read();
    const m = s.meetings[t.name];
    if (!m) return null;
    const p = s.packs[m.pack_id];
    const inc = p?.sections.filter((x) => x.included) ?? [];
    return {
      facts: [
        { label: "Body", value: s.bodies[m.body_id]?.name ?? m.body_id },
        { label: "Date", value: new Date(m.scheduled_at).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }) },
        { label: "Agenda", value: `${m.agenda.length} items${m.agenda_final ? " (final)" : " (draft)"}` },
        { label: "Pack", value: p ? `${p.state} · ${inc.filter((x) => x.status === "ready").length}/${inc.length} sections ready` : "—" },
        { label: "Notice", value: m.notice_issued_at ? `Issued ${new Date(m.notice_issued_at).toLocaleDateString()}` : "Not issued" },
      ],
      history: last3(m.history),
      duties: dutyList(m),
    };
  },
});

registerTaskHandler({
  doctype: "Resolution Action",
  currentState: (t) => govStore.read().actions[t.name]?.state ?? null,
  actions: (t, actor) => actionActionsFor(t.name, actor),
  act: async (t, action, actor, input) => {
    await actOnAction(t.name, action, actor, input);
  },
  preview: (t) => {
    const s = govStore.read();
    const a = s.actions[t.name];
    if (!a) return null;
    const r = s.resolutions[a.resolution_id];
    return {
      summary: r?.text,
      facts: [
        { label: "Resolution", value: `${a.resolution_id} — ${r?.title ?? ""}` },
        { label: "Owner", value: a.owner },
        { label: "Due", value: new Date(a.due).toLocaleDateString() },
        { label: "Progress", value: `${a.progress}%` },
      ],
      history: last3(a.history),
      documents: a.evidence.map((name) => ({ name })),
    };
  },
});

registerTaskHandler({
  doctype: "Governance Risk",
  currentState: (t) => govStore.read().risks[t.name]?.state ?? null,
  actions: (t, actor) => riskActions(t.name, actor),
  act: async (t, action, actor, input) => {
    await actOnRisk(t.name, action, actor, input);
  },
  preview: (t) => {
    const s = govStore.read();
    const r = s.risks[t.name];
    if (!r) return null;
    return {
      summary: r.description,
      facts: [
        { label: "Category", value: r.category },
        { label: "Inherent", value: String(riskScoreOf(r.inherent)) },
        { label: "Residual", value: `${riskScoreOf(r.residual)} (appetite ${s.settings.appetite[r.category]})` },
        { label: "Owner", value: r.owner },
      ],
      history: last3(r.history),
    };
  },
});

registerTaskHandler({
  doctype: "Board Pack Section",
  currentState: (t) => {
    const [packId, secId] = t.name.split(":");
    const sec = govStore.read().packs[packId]?.sections.find((x) => x.id === secId);
    return sec ? (sec.status === "ready" ? "Ready" : "Awaiting owner") : null;
  },
  actions: () => [
    { action: "mark_ready", label: "Mark section Ready", primary: true, consequence: "Marks your section Ready for assembly. Write or upload it from the pack page first." },
  ],
  act: async (t, _action, actor) => {
    const [packId, secId] = t.name.split(":");
    await updateSection(packId, secId, { status: "ready" }, actor);
  },
  preview: (t) => {
    const [packId, secId] = t.name.split(":");
    const s = govStore.read();
    const p = s.packs[packId];
    const sec = p?.sections.find((x) => x.id === secId);
    if (!sec) return null;
    return {
      summary: sec.content,
      facts: [
        { label: "Meeting", value: s.meetings[p.meeting_id]?.title ?? p.meeting_id },
        { label: "Section", value: sec.title },
        { label: "Due", value: new Date(sec.due).toLocaleDateString() },
        { label: "Status", value: sec.status },
      ],
      history: [],
      documents: sec.file ? [{ name: sec.file }] : [],
    };
  },
});

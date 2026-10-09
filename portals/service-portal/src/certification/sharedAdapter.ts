/**
 * Maps the shared certification store (shared-ui/certification — the record staff work on) onto the
 * tracker's ApplicationDetail shape, so the customer tracker, account pages and staff screens read the
 * same record in demo mode (gap 05: "promote deskApi into shared-ui/certification").
 * Customer wording comes from the workflow definition (displayState, gap 01 C9).
 */
import { APP_DEF, getApplication, listApplications, listCertificates, REG_DEF, type AppBundle, type CertApplication } from "@eswasaone/shared-ui/certification";
import { visitsFor } from "@eswasaone/shared-ui/field";
import { displayState } from "@eswasaone/shared-ui/workflow";
import type { AppAudit, AppDocument, ApplicationDetail, Certificate, Finding, LabResult } from "../api/certification";

function stageOf(a: CertApplication, b?: AppBundle): string {
  const visitsClosed = (b?.visits ?? []).filter((v) => v.state === "Closed").length;
  const samples = (b?.samples ?? []).length;
  const early = ["Submitted", "Document Review", "Awaiting Customer"].includes(a.state);
  if (a.state === "Withdrawn") return "withdrawn";
  switch (a.flow) {
    case "ms":
      if (early) return "application";
      if (a.state === "Quoted") return "quote";
      if (a.state === "Audit Planned") return "stage1";
      if (a.state === "Audit in Progress") return visitsClosed >= 1 && a.stages.length > 1 ? "stage2" : "stage1";
      if (a.state === "NC Resolution") return "stage2";
      if (["Technical Review", "Decision", "Rejected"].includes(a.state)) return "decision";
      return b?.certificate?.state === "Surveillance Due" ? "surveillance" : "certificate";
    case "product":
      if (early || a.state === "Quoted") return "application";
      if (["Audit Planned", "Audit in Progress", "NC Resolution"].includes(a.state)) return samples ? "testing" : "assessment";
      if (["Technical Review", "Decision", "Rejected"].includes(a.state)) return "cac";
      return "permit";
    case "ingelo":
      if (early || a.state === "Quoted") return "application";
      if (a.state === "Certified") return "mark";
      return "assessment";
    default:
      if (early || a.state === "Quoted") return "application";
      if (a.state === "Audit Planned") return "stage1";
      if (["Audit in Progress", "NC Resolution"].includes(a.state)) return samples ? "testing" : "stage2";
      if (["Technical Review", "Decision", "Rejected"].includes(a.state)) return "decision";
      return "certificate";
  }
}

const DOC: Record<string, AppDocument["status"]> = { missing: "requested", received: "uploaded", acceptable: "accepted", rejected: "requested" };

export function toDetail(b: AppBundle): ApplicationDetail {
  const a = b.app;
  const net = a.quote ? a.quote.lines.reduce((n, l) => n + l.qty * l.unit_price, 0) : 0;
  const audits: AppAudit[] = b.visits.map((v) => ({
    id: v.id,
    type: a.stages.find((s) => s.visit_id === v.id)?.label ?? v.title.split(" — ")[0],
    date: ["Planned", "Assigned"].includes(v.state) ? undefined : v.planned_date,
    auditor: v.lead,
    status: v.reschedule_request && v.state === "Accepted" ? "reschedule_requested" : v.state === "Accepted" ? "planned" : ["Confirmed", "In Progress"].includes(v.state) ? "confirmed" : ["Submitted", "Closed", "Returned"].includes(v.state) ? "done" : "planned",
    note: v.reschedule_request ? `You asked for ${new Date(v.reschedule_request.proposed).toLocaleDateString()}: ${v.reschedule_request.reason}` : undefined,
  }));
  const findings: Finding[] = a.findings
    .filter((n) => n.severity !== "observation")
    .map((n) => ({
      id: n.id,
      clause: n.clause,
      severity: n.severity,
      statement: n.statement,
      due: n.due,
      status: n.state === "Raised" ? (n.rejections ? "rejected" : "open") : n.state === "Response submitted" ? "submitted" : "accepted",
      response: n.response ? { root_cause: n.response.root_cause, correction: n.response.correction, corrective_action: n.response.corrective_action, evidence: n.response.evidence } : undefined,
    }));
  const lab: LabResult[] = b.samples.map((s) => ({ sample: `${s.product}${s.batch ? `, batch ${s.batch}` : ""}`, field: b.tests.find((t) => t.sample_id === s.id)?.tests ?? "Laboratory testing", status: s.result ? s.result : s.state === "Testing" ? "in_test" : "pending", drawn_at: s.collected_at, report: s.test_request_id }));
  const c = b.certificate;
  return {
    id: a.id,
    scheme: a.scheme,
    applicant: a.contact,
    status: displayState(APP_DEF, a.state, "customer"),
    created_at: a.created_at,
    flow: a.flow,
    stage: stageOf(a, b),
    org: a.org,
    quote: a.quote
      ? { id: a.quote.id, status: a.quote.declined ? "declined" : a.quote.accepted_at ? "accepted" : new Date(a.quote.valid_until) < new Date() ? "expired" : "issued", flow: a.flow, org: a.org, contact_email: a.customer_email, standards: a.standard, scope: a.scope, requested_at: a.created_at, due_by: a.quote.issued_at, issued_at: a.quote.issued_at, valid_until: a.quote.valid_until, lines: a.quote.lines.map((l) => ({ label: `${l.label}${l.qty !== 1 ? ` × ${l.qty}` : ""}`, amount: l.qty * l.unit_price })), total: net, application_id: a.id }
      : undefined,
    documents: a.documents.map((d) => ({ key: d.key, label: d.comment ? `${d.label} — ${d.comment}` : d.label, required: d.required, status: DOC[d.status], file: d.versions[d.versions.length - 1]?.name, uploaded_at: d.versions[d.versions.length - 1]?.at })),
    audits,
    findings,
    lab,
    decision: a.decision ? { outcome: a.decision.outcome === "refuse" ? "refused" : "granted", body: a.decision.body, date: a.decision.at, note: a.decision.note } : ["Technical Review", "Decision"].includes(a.state) ? { outcome: "pending", body: b.scheme?.cac ? "Certification Approval Committee" : "Certification Manager" } : undefined,
    certificate: c ? { id: c.id, number: c.number, issued: c.issued_at, expires: c.expires_at, status: c.state === "Suspended" ? "suspended" : c.state === "Withdrawn" ? "withdrawn" : "valid", scope: c.scope } : undefined,
    surveillance: c ? c.cycle.map((x) => ({ label: x.label, due: x.due, status: x.done_at ? "done" : "planned" })) : [],
    requests: [],
    activity: a.history.map((h) => ({ at: h.at, who: h.actor.includes("(customer)") ? "you" : "eswasa", text: `${h.action}${h.reason ? ` — ${h.reason}` : ""}` })),
  };
}

export function sharedList(email?: string): ApplicationDetail[] {
  try {
    return listApplications({ email }).map((a) => toDetail(getApplication(a.id)!));
  } catch {
    return [];
  }
}

export function sharedDetail(id: string): ApplicationDetail | null {
  try {
    const b = getApplication(id);
    return b ? toDetail(b) : null;
  } catch {
    return null;
  }
}

export function isShared(id: string): boolean {
  try {
    return Boolean(getApplication(id));
  } catch {
    return false;
  }
}

export function sharedCertificateCards(email?: string): Certificate[] {
  try {
    return listCertificates({ email }).map((c) => ({
      id: c.id,
      chip: c.standard.split(":")[0],
      num: c.number,
      title: c.scope,
      holder: c.org,
      issued: new Date(c.issued_at).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }),
      expires: new Date(c.expires_at).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }),
      expiring: new Date(c.expires_at).getTime() - Date.now() < 180 * 86_400_000 || c.state !== "Active",
      tone: displayState(REG_DEF, c.state, "customer"),
    }));
  } catch {
    return [];
  }
}

export const visitsForApp = (id: string) => {
  try {
    return visitsFor(id);
  } catch {
    return [];
  }
};

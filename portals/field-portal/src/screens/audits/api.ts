import { AuthError, newIdempotencyKey, sessionFetch } from "@eswasaone/shared-ui";
import type { AuditDraft, CertificationAuditsResponse, FieldAuditRow } from "./types";

/**
 * Audits for the signed-in auditor. Prefers GET /field/me/audits (server-scoped);
 * falls back to GET /certification/audits?limit= (client filters by auditor).
 */
export async function fetchAudits(
  limit = 50,
): Promise<CertificationAuditsResponse & { scoped?: boolean }> {
  try {
    const mine = await sessionFetch<{ items?: FieldAuditRow[] } | FieldAuditRow[]>("/field/me/audits");
    const items = Array.isArray(mine) ? mine : mine.items;
    if (items && items.length) return { items, scoped: true };
  } catch (err) {
    if (err instanceof AuthError) throw err;
  }
  return sessionFetch<CertificationAuditsResponse>(`/certification/audits?limit=${limit}`);
}

/**
 * Submit the audit outcome — PATCH /certification/audits/{id} {action:"submit", payload}
 * with an Idempotency-Key so an offline retry never double-submits.
 * Returns false when the request could not be delivered (caller queues it).
 */
export async function submitAudit(draft: AuditDraft): Promise<boolean> {
  const ncs = draft.findings.filter((f) => f.severity !== "obs");
  try {
    await sessionFetch(`/certification/audits/${encodeURIComponent(draft.auditId)}`, {
      method: "PATCH",
      headers: { "Idempotency-Key": draft.submitKey ?? newIdempotencyKey("field") },
      body: JSON.stringify({
        action: "submit",
        confirm: true,
        payload: {
          kind: draft.kind,
          checklist: draft.checklist,
          findings: draft.findings.map((f) => ({
            clause: f.clause,
            severity: f.severity,
            statement: f.note,
            evidence: f.evidence,
            photos: (f.photos || []).map((p) => p.key),
          })),
          samples: draft.samples || [],
          sign_off: draft.signOff,
          outcome: ncs.length ? "nc_raised" : "conforming",
        },
      }),
    });
    return true;
  } catch (err) {
    if (err instanceof AuthError) throw err;
    return false;
  }
}

/**
 * Overdue audits (contract: GET /certification/audits/overdue?auditor=&scheme=).
 */
export async function fetchOverdueAudits(
  auditor?: string,
): Promise<CertificationAuditsResponse> {
  const q = auditor
    ? `?auditor=${encodeURIComponent(auditor)}`
    : "";
  return sessionFetch<CertificationAuditsResponse>(
    `/certification/audits/overdue${q}`,
  );
}

/** Display helpers for rows that may carry stub enrichment fields. */
export function companyOf(a: FieldAuditRow): string {
  return a.company || a.application_id || a.id;
}

export function codeOf(a: FieldAuditRow): string {
  return a.application_id || a.id;
}

export function schemeLabel(a: FieldAuditRow): string {
  const scheme = a.scheme || "Scheme TBD";
  return a.stage ? `${scheme} · ${a.stage}` : scheme;
}

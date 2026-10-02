import { apiFetch } from "@eswasaone/shared-ui";
import type { CertificationAuditsResponse, FieldAuditRow } from "./types";

/**
 * List certification audits (contract: GET /certification/audits?limit=).
 * No auditor filter on list — client filters when possible.
 */
export async function fetchAudits(
  limit = 50,
): Promise<CertificationAuditsResponse> {
  return apiFetch<CertificationAuditsResponse>(
    `/certification/audits?limit=${limit}`,
  );
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
  return apiFetch<CertificationAuditsResponse>(
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

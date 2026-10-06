import type { CertificationApplication, CertificationAuditsResponse } from "../api/types";
import { allExtras, listLab, type DeskDecision, type DeskFinding, type LabEntry } from "./deskApi";
import { flowForScheme, normalizeStage, type CertFlow } from "./pipeline";

/**
 * Decision queue shared by Certification → Decisions and Board → CAC so both
 * screens agree on which cases are waiting and what blocks them.
 */
export type DecisionRow = {
  app: CertificationApplication;
  flow: CertFlow;
  auditor?: string;
  findings: DeskFinding[];
  lab: LabEntry[];
  blockers: string[];
};

export function bodyFor(flow: CertFlow): DeskDecision["body"] {
  // product.php names the CAC; management systems/Ingelo pages just say "certification decision".
  return flow === "product" || flow === "combined" ? "Certification Approval Committee" : "Certification decision";
}

export function buildDecisionRows(
  apps: CertificationApplication[],
  audits: CertificationAuditsResponse["items"] | undefined,
  findings: DeskFinding[],
): DecisionRow[] {
  const ex = allExtras();
  const lab = listLab();
  return apps
    .filter((a) => {
      const st = normalizeStage(a.status);
      return st === "audit" || st === "nc";
    })
    .map((a) => {
      const flow = ex[a.id]?.flow ?? flowForScheme(a.scheme);
      const fs = findings.filter((f) => f.application_id === a.id);
      const ls = lab.filter((l) => l.application_id === a.id);
      const auditor = ex[a.id]?.auditor ?? audits?.find((x) => x.application_id === a.id)?.auditor ?? undefined;
      const blockers: string[] = [];
      const openMajor = fs.filter((f) => f.severity === "major" && f.status !== "accepted").length;
      const openMinor = fs.filter((f) => f.severity === "minor" && f.status !== "accepted").length;
      if (openMajor) blockers.push(`${openMajor} major NC open`);
      if (openMinor) blockers.push(`${openMinor} minor NC without accepted corrective action`);
      if ((flow === "product" || flow === "combined") && (!ls.length || ls.some((l) => l.status === "pending" || l.status === "in_test")))
        blockers.push("Laboratory results outstanding");
      return { app: a, flow, auditor, findings: fs, lab: ls, blockers };
    });
}

import type { AuditDraft, ChecklistItem, NonConformity, SignOffState } from "./types";
import { DEFAULT_CHECKLIST, DEFAULT_FINDINGS } from "./checklistDefaults";

const PREFIX = "eswasaone.field.audit-draft.";

function key(auditId: string): string {
  return `${PREFIX}${auditId}`;
}

export function emptyDraft(
  auditId: string,
  auditorName = "",
): AuditDraft {
  return {
    auditId,
    checklist: DEFAULT_CHECKLIST.map((c) => ({ ...c })),
    findings: DEFAULT_FINDINGS.map((f) => ({ ...f })),
    signOff: {
      auditorSigned: Boolean(auditorName),
      auditorName,
      auditeeSigned: false,
      auditeeName: "",
    },
    updatedAt: new Date().toISOString(),
  };
}

export function loadDraft(auditId: string, auditorName = ""): AuditDraft {
  try {
    const raw = localStorage.getItem(key(auditId));
    if (!raw) return emptyDraft(auditId, auditorName);
    const parsed = JSON.parse(raw) as AuditDraft;
    if (!parsed?.auditId || !Array.isArray(parsed.checklist)) {
      return emptyDraft(auditId, auditorName);
    }
    return parsed;
  } catch {
    return emptyDraft(auditId, auditorName);
  }
}

export function saveDraft(draft: AuditDraft): void {
  const next: AuditDraft = {
    ...draft,
    updatedAt: new Date().toISOString(),
  };
  try {
    localStorage.setItem(key(draft.auditId), JSON.stringify(next));
  } catch {
    // Quota / private mode — keep in-memory only.
  }
}

export function setChecklistVerdict(
  draft: AuditDraft,
  itemId: string,
  verdict: ChecklistItem["verdict"],
): AuditDraft {
  return {
    ...draft,
    checklist: draft.checklist.map((c) =>
      c.id === itemId ? { ...c, verdict } : c,
    ),
  };
}

export function addFinding(
  draft: AuditDraft,
  finding: NonConformity,
): AuditDraft {
  return { ...draft, findings: [...draft.findings, finding] };
}

export function patchSignOff(
  draft: AuditDraft,
  patch: Partial<SignOffState>,
): AuditDraft {
  return { ...draft, signOff: { ...draft.signOff, ...patch } };
}

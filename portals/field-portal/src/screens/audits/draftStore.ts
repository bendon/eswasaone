import type {
  AuditDraft,
  ChecklistItem,
  FieldAuditRow,
  NonConformity,
  SampleRecord,
  SignOffState,
} from "./types";
import { auditKindOf, checklistFor, DEFAULT_CHECKLIST, DEFAULT_FINDINGS } from "./checklistDefaults";

const PREFIX = "eswasaone.field.audit-draft.";

function key(auditId: string): string {
  return `${PREFIX}${auditId}`;
}

export function emptyDraft(
  auditId: string,
  auditorName = "",
  audit?: FieldAuditRow,
): AuditDraft {
  const kind = audit ? auditKindOf(audit) : undefined;
  return {
    auditId,
    kind,
    checklist: audit ? checklistFor(audit, kind) : DEFAULT_CHECKLIST.map((c) => ({ ...c })),
    findings: DEFAULT_FINDINGS.map((f) => ({ ...f })),
    samples: [],
    signOff: {
      auditorSigned: Boolean(auditorName),
      auditorName,
      auditeeSigned: false,
      auditeeName: "",
    },
    updatedAt: new Date().toISOString(),
  };
}

export function loadDraft(auditId: string, auditorName = "", audit?: FieldAuditRow): AuditDraft {
  try {
    const raw = localStorage.getItem(key(auditId));
    if (!raw) return emptyDraft(auditId, auditorName, audit);
    const parsed = JSON.parse(raw) as AuditDraft;
    if (!parsed?.auditId || !Array.isArray(parsed.checklist)) {
      return emptyDraft(auditId, auditorName, audit);
    }
    return parsed;
  } catch {
    return emptyDraft(auditId, auditorName, audit);
  }
}

/** Drafts submitted while offline (or refused by the server) that still need to sync. */
export function listQueuedDrafts(): AuditDraft[] {
  const out: AuditDraft[] = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k?.startsWith(PREFIX)) continue;
      const d = JSON.parse(localStorage.getItem(k) || "null") as AuditDraft | null;
      if (d?.locallySubmitted && d.syncState !== "synced") out.push(d);
    }
  } catch {
    /* storage unavailable */
  }
  return out;
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

export function updateFinding(
  draft: AuditDraft,
  id: string,
  patch: Partial<NonConformity>,
): AuditDraft {
  return {
    ...draft,
    findings: draft.findings.map((f) => (f.id === id ? { ...f, ...patch } : f)),
  };
}

export function removeFinding(draft: AuditDraft, id: string): AuditDraft {
  return { ...draft, findings: draft.findings.filter((f) => f.id !== id) };
}

export function addSample(draft: AuditDraft, sample: SampleRecord): AuditDraft {
  return { ...draft, samples: [...(draft.samples || []), sample] };
}

export function removeSample(draft: AuditDraft, id: string): AuditDraft {
  return { ...draft, samples: (draft.samples || []).filter((s) => s.id !== id) };
}

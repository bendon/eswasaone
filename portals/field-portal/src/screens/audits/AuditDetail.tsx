import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AuthError, Icon, newIdempotencyKey, uploadMedia, useDialogs } from "@eswasaone/shared-ui";
import { useAuth } from "../../auth/AuthProvider";
import type {
  AuditDraft,
  ChecklistItem,
  ChecklistVerdict,
  FieldAuditRow,
  NcSeverity,
  NonConformity,
} from "./types";
import { companyOf, codeOf, schemeLabel, submitAudit } from "./api";
import { auditKindOf, KIND_LABEL, LABS } from "./checklistDefaults";
import {
  addFinding,
  addSample,
  loadDraft,
  patchSignOff,
  removeFinding,
  removeSample,
  saveDraft,
  setChecklistVerdict,
  updateFinding,
} from "./draftStore";

type Props = {
  audit: FieldAuditRow;
  auditorDisplayName: string;
  onBack: () => void;
  onLocallySubmitted: (id: string) => void;
};

const VERDICTS: { key: ChecklistVerdict; label: string; cls: string }[] = [
  { key: "C", label: "C", cls: "c" },
  { key: "NC", label: "NC", cls: "n" },
  { key: "NA", label: "N/A", cls: "x" },
];

const SEVERITIES: { key: NcSeverity; label: string }[] = [
  { key: "major", label: "Major" },
  { key: "minor", label: "Minor" },
  { key: "obs", label: "Obs." },
];

function useFieldToast() {
  const [toast, setToast] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const show = useCallback((msg: string) => {
    setToast(msg);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setToast(null), 1800);
  }, []);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );
  return { toast, show };
}

export function AuditDetail({
  audit,
  auditorDisplayName,
  onBack,
  onLocallySubmitted,
}: Props) {
  const dialogs = useDialogs();
  const { openAuth } = useAuth();
  const [draft, setDraft] = useState<AuditDraft>(() =>
    loadDraft(audit.id, auditorDisplayName, audit),
  );
  const [editing, setEditing] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const { toast, show: showToast } = useFieldToast();
  const kind = draft.kind ?? auditKindOf(audit);
  const locked = Boolean(draft.locallySubmitted);

  useEffect(() => {
    setDraft(loadDraft(audit.id, auditorDisplayName, audit));
  }, [audit, auditorDisplayName]);

  const persist = useCallback((next: AuditDraft) => {
    setDraft(next);
    saveDraft(next);
  }, []);

  const ncCount = draft.findings.filter((f) => f.severity !== "obs").length;
  const unanswered = draft.checklist.filter((c) => c.verdict === null).length;

  const metaLine = useMemo(() => {
    const parts = [codeOf(audit), schemeLabel(audit), audit.location].filter(Boolean);
    return parts.join(" · ");
  }, [audit]);

  function raiseNc(clause = "", severity: NcSeverity = "minor") {
    const id = `nc-${Date.now()}`;
    persist(
      addFinding(draft, {
        id,
        clause,
        severity,
        note: "",
        evidence: "",
        evidenceSlots: 0,
        photos: [],
      }),
    );
    setEditing(id);
  }

  function onVerdict(item: ChecklistItem, verdict: ChecklistVerdict) {
    const next = setChecklistVerdict(draft, item.id, verdict);
    persist(next);
    if (verdict === "NC" && !draft.findings.some((f) => f.clause.startsWith(item.title))) {
      const id = `nc-${Date.now()}`;
      persist(
        addFinding(next, {
          id,
          clause: `${item.title}${item.clauses ? ` (${item.clauses})` : ""}`,
          severity: "minor",
          note: "",
          evidence: "",
          evidenceSlots: 0,
          photos: [],
        }),
      );
      setEditing(id);
      showToast("NC opened — add the statement and evidence");
    } else {
      showToast("Checklist saved on device");
    }
  }

  async function addPhoto(f: NonConformity, file: File | undefined) {
    if (!file) return;
    showToast("Uploading photo…");
    const up = await uploadMedia(file, `audits/${audit.id}`);
    persist(
      updateFinding(draft, f.id, {
        photos: [...(f.photos || []), { key: up.key, name: up.name, url: up.url }],
      }),
    );
    showToast(up.mocked ? "Photo saved on device — uploads when online" : "Photo uploaded");
  }

  async function onSubmit() {
    if (!draft.signOff.auditorSigned || !draft.signOff.auditeeSigned) {
      showToast("Both auditor and auditee must sign off first");
      return;
    }
    const incomplete = draft.findings.find((f) => !f.clause.trim() || !f.note.trim());
    if (incomplete) {
      setEditing(incomplete.id);
      showToast("Complete every finding before submitting");
      return;
    }
    const ok = await dialogs.confirm({
      title: "Submit audit?",
      message: `${ncCount ? `${ncCount} non-conformit${ncCount === 1 ? "y" : "ies"} will be sent to the client for corrective action.` : "No non-conformities — the file goes to technical review."}${unanswered ? `\n\n${unanswered} checklist item(s) not answered.` : ""}\n\nConfirm before commit — writes are audited.`,
      confirmLabel: "Submit audit",
    });
    if (!ok) return;

    const withKey: AuditDraft = { ...draft, kind, submitKey: draft.submitKey ?? newIdempotencyKey("field-submit") };
    persist(withKey);
    setSubmitting(true);
    try {
      const delivered = await submitAudit(withKey);
      const next: AuditDraft = { ...withKey, locallySubmitted: true, syncState: delivered ? "synced" : "queued" };
      persist(next);
      onLocallySubmitted(audit.id);
      showToast(delivered ? "Audit submitted to Certification" : "Saved — will sync when back online");
    } catch (err) {
      if (err instanceof AuthError) {
        openAuth({ title: "Sign in to submit", reason: "Your session expired. The audit is saved on this device." });
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="aud-detail">
      {dialogs.host}
      {toast && (
        <div className="aud-toast" role="status">
          {toast}
        </div>
      )}

      <button type="button" className="aud-back" onClick={onBack}>
        <Icon name="i-cleft" />
        My audits
      </button>

      <header className="aud-head">
        <h2>{companyOf(audit)}</h2>
        <p className="aud-head__m">
          <span className="aud-mono">{metaLine}</span>
        </p>
        <p className="aud-head__m">{KIND_LABEL[kind]}</p>
      </header>

      <div className="aud-offnote" role="note">
        <Icon name={draft.syncState === "synced" ? "i-check-c" : "i-warn"} />
        <span>
          {draft.syncState === "synced"
            ? "Submitted and synced to Certification."
            : draft.syncState === "queued"
              ? "Submitted on device — waiting for a connection to sync."
              : "Working offline-safe — saved on device, syncs when back online."}
        </span>
      </div>

      <h3 className="aud-sec-h">
        Checklist {unanswered ? <span className="aud-sec-h__nc">· {unanswered} to answer</span> : null}
      </h3>
      <div className="aud-card">
        {draft.checklist.map((item) => (
          <div key={item.id} className="aud-clk">
            <div className="aud-clk__t">
              <b>{item.title}</b>
              <span>{item.clauses}</span>
            </div>
            <div className="aud-tri" role="group" aria-label={item.title}>
              {VERDICTS.map((v) => (
                <button
                  key={v.key!}
                  type="button"
                  disabled={locked}
                  className={`${v.cls}${item.verdict === v.key ? " on" : ""}`}
                  aria-pressed={item.verdict === v.key}
                  onClick={() => onVerdict(item, v.key)}
                >
                  {v.label}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>

      <h3 className="aud-sec-h">
        Findings {ncCount > 0 && <span className="aud-sec-h__nc">· {ncCount} NC</span>}
      </h3>
      <div className="aud-ncs">
        {draft.findings.map((f) =>
          editing === f.id && !locked ? (
            <div key={f.id} className="aud-nc aud-nc--edit">
              <label className="aud-fld">
                Clause / requirement
                <input
                  value={f.clause}
                  onChange={(e) => persist(updateFinding(draft, f.id, { clause: e.target.value }))}
                  placeholder="e.g. 7.1.5 Monitoring & measuring resources"
                />
              </label>
              <div className="aud-tri aud-tri--sev" role="group" aria-label="Grading">
                {SEVERITIES.map((s) => (
                  <button
                    key={s.key}
                    type="button"
                    className={f.severity === s.key ? "on" : ""}
                    aria-pressed={f.severity === s.key}
                    onClick={() => persist(updateFinding(draft, f.id, { severity: s.key }))}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
              <label className="aud-fld">
                Statement of non-conformity
                <textarea
                  value={f.note}
                  onChange={(e) => persist(updateFinding(draft, f.id, { note: e.target.value }))}
                  placeholder="What requirement was not met?"
                />
              </label>
              <label className="aud-fld">
                Objective evidence
                <textarea
                  value={f.evidence || ""}
                  onChange={(e) => persist(updateFinding(draft, f.id, { evidence: e.target.value }))}
                  placeholder="Records, observations, interviews"
                />
              </label>
              <div className="aud-ev" aria-label="Evidence photos">
                {(f.photos || []).map((p) => (
                  <img key={p.key} className="aud-ev__img" src={p.url} alt={p.name} />
                ))}
                <label className="aud-ev__ph aud-ev__add" aria-label="Add photo">
                  <Icon name="i-plus" />
                  <input
                    type="file"
                    accept="image/*"
                    capture="environment"
                    onChange={(e) => {
                      void addPhoto(f, e.target.files?.[0]);
                      e.target.value = "";
                    }}
                  />
                </label>
              </div>
              <div className="aud-row-btns">
                <button
                  type="button"
                  className="aud-btn aud-btn--ghost aud-btn--sm"
                  onClick={() => {
                    persist(removeFinding(draft, f.id));
                    setEditing(null);
                  }}
                >
                  Delete
                </button>
                <button type="button" className="aud-btn aud-btn--gold aud-btn--sm" onClick={() => setEditing(null)}>
                  Done
                </button>
              </div>
            </div>
          ) : (
            <button key={f.id} type="button" className="aud-nc" onClick={() => !locked && setEditing(f.id)} style={{ textAlign: "left", width: "100%" }}>
              <b>
                {f.clause || "Untitled finding"}
                <span className={`aud-sev aud-sev--${f.severity}`}>{f.severity}</span>
              </b>
              <p>{f.note || "Tap to add statement and evidence."}</p>
              {(f.photos || []).length ? (
                <div className="aud-ev">
                  {(f.photos || []).map((p) => (
                    <img key={p.key} className="aud-ev__img" src={p.url} alt={p.name} />
                  ))}
                </div>
              ) : null}
            </button>
          ),
        )}
      </div>
      {!locked ? (
        <button type="button" className="aud-btn aud-btn--ghost aud-btn--sm" onClick={() => raiseNc()}>
          <Icon name="i-plus" />
          Raise a non-conformity
        </button>
      ) : null}

      {kind === "product" ? <SamplesSection draft={draft} locked={locked} audit={audit} persist={persist} showToast={showToast} /> : null}

      <h3 className="aud-sec-h">Sign-off</h3>
      {!draft.signOff.auditeeSigned && !locked ? (
        <label className="aud-fld" style={{ marginBottom: 8 }}>
          Auditee representative
          <input
            value={draft.signOff.auditeeName}
            onChange={(e) => persist(patchSignOff(draft, { auditeeName: e.target.value }))}
            placeholder="Name and position"
          />
        </label>
      ) : null}
      <div className="aud-sign">
        <button
          type="button"
          disabled={locked}
          className={draft.signOff.auditorSigned ? "aud-sign__box done" : "aud-sign__box"}
          onClick={() => persist(patchSignOff(draft, { auditorSigned: true, auditorName: auditorDisplayName || "Auditor" }))}
        >
          <Icon name="i-check" />
          {draft.signOff.auditorSigned ? (
            <>
              Auditor
              <br />
              {draft.signOff.auditorName || auditorDisplayName}
            </>
          ) : (
            <>
              Tap to
              <br />
              sign as auditor
            </>
          )}
        </button>
        <button
          type="button"
          disabled={locked || !draft.signOff.auditeeName.trim()}
          className={draft.signOff.auditeeSigned ? "aud-sign__box done" : "aud-sign__box"}
          onClick={() => persist(patchSignOff(draft, { auditeeSigned: true }))}
        >
          <Icon name="i-check" />
          {draft.signOff.auditeeSigned ? (
            <>
              Auditee
              <br />
              {draft.signOff.auditeeName}
            </>
          ) : (
            <>
              Tap to
              <br />
              capture auditee
            </>
          )}
        </button>
      </div>

      <button
        type="button"
        className="aud-btn aud-btn--gold"
        style={{ marginTop: 16 }}
        onClick={() => void onSubmit()}
        disabled={locked || submitting}
      >
        <Icon name="i-check" />
        {submitting ? "Submitting…" : draft.syncState === "synced" ? "Submitted" : draft.syncState === "queued" ? "Queued for sync" : "Submit audit"}
      </button>
    </div>
  );
}

function SamplesSection({
  draft,
  locked,
  audit,
  persist,
  showToast,
}: {
  draft: AuditDraft;
  locked: boolean;
  audit: FieldAuditRow;
  persist: (d: AuditDraft) => void;
  showToast: (m: string) => void;
}) {
  const [s, setS] = useState({ product: "", batch: "", qty: "", sealNo: "", lab: LABS[0] });
  const samples = draft.samples || [];
  return (
    <>
      <h3 className="aud-sec-h">
        Samples {samples.length ? <span className="aud-sec-h__nc">· {samples.length} sealed</span> : null}
      </h3>
      <div className="aud-card">
        {samples.map((x) => (
          <div key={x.id} className="aud-clk">
            <div className="aud-clk__t">
              <b>
                {x.product} · batch {x.batch}
              </b>
              <span>
                {x.qty} · seal {x.sealNo} → {x.lab}
              </span>
            </div>
            {!locked ? (
              <button type="button" className="aud-btn aud-btn--ghost aud-btn--sm" style={{ width: "auto" }} onClick={() => persist(removeSample(draft, x.id))} aria-label={`Remove sample ${x.id}`}>
                <Icon name="i-x" />
              </button>
            ) : null}
          </div>
        ))}
        {!locked ? (
          <div className="aud-form">
            <label className="aud-fld">
              Product
              <input value={s.product} onChange={(e) => setS({ ...s, product: e.target.value })} placeholder={companyOf(audit)} />
            </label>
            <div className="aud-form__2">
              <label className="aud-fld">
                Batch / lot
                <input value={s.batch} onChange={(e) => setS({ ...s, batch: e.target.value })} />
              </label>
              <label className="aud-fld">
                Quantity
                <input value={s.qty} onChange={(e) => setS({ ...s, qty: e.target.value })} placeholder="12 units" />
              </label>
            </div>
            <label className="aud-fld">
              Seal number
              <input value={s.sealNo} onChange={(e) => setS({ ...s, sealNo: e.target.value })} />
            </label>
            <label className="aud-fld">
              Laboratory
              <select value={s.lab} onChange={(e) => setS({ ...s, lab: e.target.value })}>
                {LABS.map((l) => (
                  <option key={l}>{l}</option>
                ))}
              </select>
            </label>
            <button
              type="button"
              className="aud-btn aud-btn--ghost aud-btn--sm"
              disabled={!s.product || !s.batch || !s.sealNo}
              onClick={() => {
                persist(
                  addSample(draft, {
                    id: `SMP-${Date.now().toString(36).slice(-4).toUpperCase()}`,
                    ...s,
                    drawnAt: new Date().toISOString(),
                  }),
                );
                setS({ ...s, batch: "", qty: "", sealNo: "" });
                showToast("Sample recorded");
              }}
            >
              <Icon name="i-plus" /> Record sealed sample
            </button>
          </div>
        ) : null}
      </div>
    </>
  );
}

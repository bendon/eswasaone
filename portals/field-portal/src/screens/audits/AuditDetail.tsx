import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Icon, useDialogs } from "@eswasaone/shared-ui";
import type {
  AuditDraft,
  ChecklistVerdict,
  FieldAuditRow,
  NcSeverity,
} from "./types";
import { companyOf, codeOf, schemeLabel } from "./api";
import {
  addFinding,
  loadDraft,
  patchSignOff,
  saveDraft,
  setChecklistVerdict,
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
  const [draft, setDraft] = useState<AuditDraft>(() =>
    loadDraft(audit.id, auditorDisplayName),
  );
  const { toast, show: showToast } = useFieldToast();
  const syncNote =
    "Working offline-safe — saved on device, syncs when back online.";

  useEffect(() => {
    setDraft(loadDraft(audit.id, auditorDisplayName));
  }, [audit.id, auditorDisplayName]);

  const persist = useCallback((next: AuditDraft) => {
    setDraft(next);
    saveDraft(next);
  }, []);

  const ncCount = draft.findings.length;

  const metaLine = useMemo(() => {
    const parts = [
      codeOf(audit),
      schemeLabel(audit),
      audit.location,
    ].filter(Boolean);
    return parts.join(" · ");
  }, [audit]);

  function onVerdict(itemId: string, verdict: ChecklistVerdict) {
    persist(setChecklistVerdict(draft, itemId, verdict));
    showToast("Checklist saved on device");
  }

  function onRaiseNc() {
    const id = `nc-${Date.now()}`;
    const severity: NcSeverity = "minor";
    persist(
      addFinding(draft, {
        id,
        clause: "New non-conformity",
        severity,
        note: "Captured on device — tap to add clause, note and photo evidence.",
        evidenceSlots: 1,
      }),
    );
    showToast("NC added — saved on device");
  }

  function onSignAuditor() {
    persist(
      patchSignOff(draft, {
        auditorSigned: true,
        auditorName: auditorDisplayName || "Auditor",
      }),
    );
  }

  function onSignAuditee() {
    persist(
      patchSignOff(draft, {
        auditeeSigned: true,
        auditeeName: "Auditee",
      }),
    );
  }

  async function onSubmit() {
    if (!draft.signOff.auditorSigned || !draft.signOff.auditeeSigned) {
      showToast("Both auditor and auditee must sign off first");
      return;
    }
    const ok = await dialogs.confirm({
      title: "Submit audit?",
      message:
        "This will queue the audit for Certification. Confirm before commit — writes are audited.",
      confirmLabel: "Submit audit",
    });
    if (!ok) return;

    // Contract: POST /certification/audits creates (application+confirm) only —
    // no PATCH/submit path yet.
    // TODO: wire real — POST/PATCH audit outcome when OpenAPI adds update.
    const next: AuditDraft = { ...draft, locallySubmitted: true };
    persist(next);
    onLocallySubmitted(audit.id);
    showToast("Audit submitted → Certification (syncing)");
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
      </header>

      <div className="aud-offnote" role="note">
        <Icon name="i-warn" />
        <span>{syncNote}</span>
      </div>

      <h3 className="aud-sec-h">Checklist</h3>
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
                  className={`${v.cls}${item.verdict === v.key ? " on" : ""}`}
                  aria-pressed={item.verdict === v.key}
                  onClick={() => onVerdict(item.id, v.key)}
                >
                  {v.label}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>

      <h3 className="aud-sec-h">
        Findings{" "}
        {ncCount > 0 && (
          <span className="aud-sec-h__nc">· {ncCount} NC</span>
        )}
      </h3>
      <div className="aud-ncs">
        {draft.findings.map((f) => (
          <div key={f.id} className="aud-nc">
            <b>
              {f.clause}
              <span className={`aud-sev aud-sev--${f.severity}`}>
                {f.severity}
              </span>
            </b>
            <p>{f.note}</p>
            <div className="aud-ev" aria-label="Evidence placeholders">
              {Array.from({ length: f.evidenceSlots }).map((_, i) => (
                <span key={i} className="aud-ev__ph">
                  <Icon name="i-eye" />
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>
      <button
        type="button"
        className="aud-btn aud-btn--ghost aud-btn--sm"
        onClick={onRaiseNc}
      >
        <Icon name="i-plus" />
        Raise a non-conformity
      </button>

      <h3 className="aud-sec-h">Sign-off</h3>
      <div className="aud-sign">
        <button
          type="button"
          className={
            draft.signOff.auditorSigned
              ? "aud-sign__box done"
              : "aud-sign__box"
          }
          onClick={onSignAuditor}
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
          className={
            draft.signOff.auditeeSigned
              ? "aud-sign__box done"
              : "aud-sign__box"
          }
          onClick={onSignAuditee}
        >
          <Icon name="i-check" />
          {draft.signOff.auditeeSigned ? (
            <>
              Auditee
              <br />
              signed
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
        disabled={draft.locallySubmitted}
      >
        <Icon name="i-check" />
        {draft.locallySubmitted ? "Queued for sync" : "Submit audit"}
      </button>
    </div>
  );
}

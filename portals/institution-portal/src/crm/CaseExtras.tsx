/**
 * Case workspace additions (gap 04 R6, R7, R11): request a field visit and follow it, the outbound
 * message delivery log with resend, and the appeals panel picker + panel decision.
 */
import { useState } from "react";
import { Link } from "react-router-dom";
import { Select } from "@eswasaone/shared-ui";
import { eligiblePanel, listDeliveries, recordAppealDecision, requestFieldVisit, resendDelivery, updateCase, useCrm, type Case, type CrmActor } from "@eswasaone/shared-ui/crm";
import { getVisit, fieldStore } from "@eswasaone/shared-ui/field";
import { useStoreResource } from "@eswasaone/shared-ui/store";
import { ReasonDialog } from "@eswasaone/shared-ui/workflow";

const when = (iso: string) => new Date(iso).toLocaleString(undefined, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

export function CaseFieldVisitCard({ c, actor, onDone }: { c: Case; actor: CrmActor; onDone: (m: string) => void }) {
  const [open, setOpen] = useState(false);
  const visit = useStoreResource([fieldStore], () => (c.field_visit ? getVisit(c.field_visit.id) : null), [c.field_visit?.id]);
  const eligible = ["product_report", "mark_misuse", "service_complaint"].includes(c.type);
  if (!eligible && !c.field_visit) return null;
  const v = visit.data;
  return (
    <div className="crm-card">
      <div className="crm-card__h">
        <h3>Field visit</h3>
      </div>
      {v ? (
        <>
          <p style={{ margin: 0 }}>
            <Link className="crm-link" to={`/field/visits/${v.id}`}>
              {v.id}
            </Link>{" "}
            · {v.state} · {new Date(v.planned_date).toLocaleDateString()} · {v.lead ?? "team not assigned"}
          </p>
          <p className="crm-small">{v.sample_ids.length ? `${v.sample_ids.length} sample(s) taken${c.field_visit?.result ? ` — lab result: ${c.field_visit.result.toUpperCase()}` : " — waiting for the lab"}` : "No samples yet."}</p>
          <p className="crm-small">The case waits for the visit outcome; results are added to the internal thread automatically (R-V4 on a fail).</p>
        </>
      ) : (
        <>
          <p className="crm-small">Send an inspector to sample the product in the market or investigate on site. The case waits for the outcome.</p>
          <button type="button" className="crm-btn crm-btn--sm crm-btn--pri" onClick={() => setOpen(true)}>
            Request field visit
          </button>
        </>
      )}
      {open ? (
        <ReasonDialog
          title="Request field visit"
          consequence="Creates a Field visit linked to this case (map §3.12). The planner assigns an inspector; samples go to the lab and results come back here."
          reasonLabel="Scope / what to look for"
          requires="note"
          initialReason={`${c.subject}. ${c.about?.label ?? ""}`.trim()}
          fields={[
            { key: "type", label: "Visit type", type: "select", required: true, options: [{ value: "market_sampling", label: "Market sampling" }, { value: "complaint_investigation", label: "Complaint investigation" }] },
            { key: "site", label: "Location / premises", required: true, hint: c.location ? `Reported: ${c.location}` : undefined },
            { key: "address", label: "Address" },
            { key: "date", label: "Date", type: "date", required: true },
          ]}
          onClose={() => setOpen(false)}
          onSubmit={async (val) => {
            const p = val.payload ?? {};
            await requestFieldVisit(c.ref, { type: p.type as "market_sampling", site: p.site, address: p.address ?? "", date: p.date, scope: val.note ?? "" }, actor);
            setOpen(false);
            onDone("Field visit requested.");
          }}
        />
      ) : null}
    </div>
  );
}

export function CaseDeliveries({ c }: { c: Case }) {
  const res = useCrm(() => listDeliveries({ case_ref: c.ref }), [c.ref, c.updated_at]);
  const [busy, setBusy] = useState(false);
  const rows = res.data ?? [];
  if (res.notConnected) return null;
  if (!rows.length) return null;
  return (
    <div className="crm-card">
      <div className="crm-card__h">
        <h3>Messages sent</h3>
      </div>
      {rows.map((d) => (
        <div key={d.id} style={{ padding: "6px 0", borderBottom: "1px solid var(--line)" }}>
          <div className="crm-row">
            <b style={{ flex: 1, fontSize: 13 }}>{d.subject}</b>
            <span className={`crm-pill crm-pill--${d.status === "sent" ? "green" : d.status === "failed" ? "red" : "amber"}`}>{d.status}</span>
          </div>
          <span className="crm-small">
            {d.channel.toUpperCase()} → {d.to} · {when(d.at)}
            {d.attempts > 1 ? ` · ${d.attempts} attempts` : ""}
            {d.error ? ` · ${d.error}` : ""}
          </span>
          {d.status === "failed" ? (
            <button
              type="button"
              className="crm-link"
              disabled={busy}
              onClick={() => {
                setBusy(true);
                void resendDelivery(d.id, "portal").finally(() => {
                  setBusy(false);
                  res.reload();
                });
              }}
            >
              Resend to tracking page
            </button>
          ) : null}
        </div>
      ))}
    </div>
  );
}

export function AppealPanelCard({ c, actor, onDone }: { c: Case; actor: CrmActor; onDone: (m: string) => void }) {
  const people = eligiblePanel(c.ref);
  const [pick, setPick] = useState("");
  const [decide, setDecide] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  return (
    <div className="crm-card">
      <div className="crm-card__h">
        <h3>Appeal panel</h3>
      </div>
      <dl className="crm-kv">
        <dt>Contested by</dt>
        <dd>{c.decision_maker ?? "—"} (excluded)</dd>
        <dt>Panel</dt>
        <dd>{c.panel?.length ? c.panel.join(", ") : "Not appointed"}</dd>
      </dl>
      <div className="crm-row" style={{ marginTop: 10, flexWrap: "nowrap" }}>
        <Select value={pick} onChange={(val) => setPick(val)} aria-label="Add panel member" block>
          <option value="">Add panel member…</option>
          {people.map((p) => (
            <option key={p.name} value={p.name} disabled={!p.ok || c.panel?.includes(p.name)}>
              {p.name} — {p.ok ? p.title : `excluded: ${p.why}`}
            </option>
          ))}
        </Select>
        <button
          type="button"
          className="crm-btn crm-btn--sm"
          disabled={!pick}
          onClick={() =>
            void updateCase(c.ref, actor, { panel: [...(c.panel ?? []), pick] }).then(
              () => (setPick(""), onDone("Panel updated")),
              (e: Error) => setErr(e.message),
            )
          }
        >
          Add
        </button>
      </div>
      {err ? <p className="eo-error">{err}</p> : null}
      {c.appeal_outcome ? (
        <p style={{ marginTop: 10 }}>
          <b>Panel decision: {c.appeal_outcome.outcome}</b> ({new Date(c.appeal_outcome.at).toLocaleDateString()}, {c.appeal_outcome.by}) — {c.appeal_outcome.note}
          <span className="crm-small" style={{ display: "block" }}>
            {c.appeal_outcome.downstream}
          </span>
        </p>
      ) : (
        <button type="button" className="crm-btn crm-btn--sm crm-btn--pri" style={{ marginTop: 10 }} disabled={!c.panel?.length} onClick={() => setDecide(true)}>
          Record panel decision
        </button>
      )}
      {decide ? (
        <ReasonDialog
          title="Appeal panel decision"
          consequence="Records the decision, tells the appellant, and — if the appeal succeeds — gives Certification a task to implement it (e.g. reinstate the certificate)."
          requires="reason"
          reasonLabel="Panel's reasons (shown to the appellant)"
          fields={[{ key: "outcome", label: "Outcome", type: "select", required: true, options: [{ value: "uphold", label: "Uphold the original decision" }, { value: "overturn", label: "Overturn the decision" }, { value: "partial", label: "Partly uphold the appeal" }] }]}
          onClose={() => setDecide(false)}
          onSubmit={async (v) => {
            await recordAppealDecision(c.ref, v.payload?.outcome as "uphold", v.reason ?? "", actor);
            setDecide(false);
            onDone("Panel decision recorded.");
          }}
        />
      ) : null}
    </div>
  );
}

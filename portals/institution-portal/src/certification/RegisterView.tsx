import { useCallback, useEffect, useMemo, useState } from "react";
import {
  DataRow,
  FormDrawer,
  ModuleHeader,
  RecordDrawer,
  Toast,
  useDialogs,
  type DrawerAction,
  type FormDrawerField,
  type SummaryTile,
} from "@eswasaone/shared-ui";
import { EmptyState } from "../components/PageStates";
import { RequireStaff } from "../components/RequireStaff";
import {
  liftRegisterEntry,
  listCases,
  listRegister,
  registerAction,
  setCaseStatus,
  type DeskCase,
  type RegisterEntry,
  type RegisterKind,
} from "./deskApi";
import { CHARTER, FLOW_LABEL, fmtDate, workingDaysSince, type CertFlow } from "./pipeline";

/**
 * Register & appeals: the public status register (CER_PR_026) per path, plus the
 * appeals (CER_PR_002), complaints (CER_PR_006) and client-notice queue.
 */

const KIND_LABEL: Record<RegisterKind, string> = {
  suspended: "Suspended",
  withdrawn: "Withdrawn / cancelled",
  reduced: "Reduced scope",
};

const CASE_LABEL: Record<DeskCase["kind"], string> = {
  appeal: "Appeal",
  complaint: "Complaint",
  changes: "Notice of changes",
  scope: "Scope extension",
};

const STATUS_LABEL: Record<DeskCase["status"], string> = {
  received: "Received",
  acknowledged: "Acknowledged",
  in_review: "In review",
  closed: "Closed",
};

function caseSla(c: DeskCase): { kind: "breach" | "due" | "ok"; text: string } {
  if (c.status === "closed") return { kind: "ok", text: "closed" };
  const wd = workingDaysSince(c.received_at) ?? 0;
  if (c.status === "received") {
    const left = 3 - wd;
    return left < 0 ? { kind: "breach", text: `ack ${-left}wd late` } : { kind: left <= 1 ? "due" : "ok", text: `ack in ${left}wd` };
  }
  const left = CHARTER.complaintDays - wd;
  return left < 0 ? { kind: "breach", text: `${-left}wd over` } : { kind: left <= 5 ? "due" : "ok", text: `resolve in ${left}wd` };
}

type Tab = "register" | "cases";

export function RegisterView() {
  const dialogs = useDialogs();
  const [tab, setTab] = useState<Tab>("register");
  const [entries, setEntries] = useState<RegisterEntry[]>([]);
  const [cases, setCases] = useState<DeskCase[]>([]);
  const [flow, setFlow] = useState<CertFlow>("ms");
  const [addOpen, setAddOpen] = useState(false);
  const [openCase, setOpenCase] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);

  const load = useCallback(() => {
    setEntries(listRegister());
    void listCases().then(setCases);
  }, []);
  useEffect(load, [load]);

  const flowEntries = useMemo(() => entries.filter((e) => e.flow === flow), [entries, flow]);
  const openCases = cases.filter((c) => c.status !== "closed");
  const selected = cases.find((c) => c.id === openCase) ?? null;

  const summary: SummaryTile[] = [
    { label: "Suspended", value: entries.filter((e) => e.kind === "suspended").length, variant: "due" },
    { label: "Withdrawn", value: entries.filter((e) => e.kind === "withdrawn").length },
    { label: "Reduced scope", value: entries.filter((e) => e.kind === "reduced").length },
    {
      label: "Open appeals & complaints",
      value: openCases.length,
      variant: openCases.some((c) => caseSla(c).kind === "breach") ? "breach" : openCases.length ? "due" : "ok",
    },
  ];

  const addFields: FormDrawerField[] = [
    {
      name: "flow",
      label: "Path",
      type: "select",
      required: true,
      options: (["ms", "product", "ingelo"] as CertFlow[]).map((f) => ({ value: f, label: FLOW_LABEL[f] })),
    },
    {
      name: "kind",
      label: "Status",
      type: "select",
      required: true,
      options: (Object.keys(KIND_LABEL) as RegisterKind[]).map((k) => ({ value: k, label: KIND_LABEL[k] })),
    },
    { name: "holder", label: "Certified client", required: true },
    { name: "certificate", label: "Certificate / permit no.", required: true },
    { name: "scope", label: "Scope (remaining scope if reduced)", required: true },
    { name: "reason", label: "Reason", type: "textarea", required: true },
  ];

  async function lift(e: RegisterEntry) {
    const ok = await dialogs.confirm({
      title: `Remove ${e.certificate} from the register?`,
      message: e.kind === "suspended" ? "Use when the suspension is lifted and certification is reinstated." : "Use when scope is restored or the entry was made in error.",
      confirmLabel: "Remove entry",
    });
    if (!ok) return;
    try {
      liftRegisterEntry(e.id);
    } catch (err) {
      await dialogs.alert({ message: err instanceof Error ? err.message : "Not saved", kind: "error" });
      return;
    }
    setFlash(`${e.certificate} removed from the public register`);
    load();
  }

  function move(c: DeskCase, status: DeskCase["status"]) {
    try {
      setCaseStatus(c.id, status);
    } catch (err) {
      setFlash(err instanceof Error ? err.message : "Not saved");
      return;
    }
    setFlash(`${c.id} → ${STATUS_LABEL[status]}`);
    load();
  }

  const caseActions: DrawerAction[] = selected
    ? [
        ...(selected.status === "received"
          ? [{ label: "Acknowledge", variant: "pri" as const, onClick: () => move(selected, "acknowledged") }]
          : []),
        ...(selected.status === "acknowledged"
          ? [{ label: "Start review", variant: "pri" as const, onClick: () => move(selected, "in_review") }]
          : []),
        ...(selected.status !== "closed"
          ? [{ label: "Close with outcome", variant: "gold" as const, onClick: () => move(selected, "closed") }]
          : []),
        { label: "Close", variant: "ghost" as const, onClick: () => setOpenCase(null) },
      ]
    : [];

  return (
    <RequireStaff reason="Staff sign-in required">
      <ModuleHeader
        title="Register & appeals"
        subtitle="Public status register (suspended, withdrawn, reduced scope), plus appeals, complaints and client notices."
        summary={summary}
        extra={
          <div className="r">
            <div className="viewtog">
              <button type="button" className={tab === "register" ? "on" : ""} onClick={() => setTab("register")}>
                Public register
              </button>
              <button type="button" className={tab === "cases" ? "on" : ""} onClick={() => setTab("cases")}>
                Appeals &amp; complaints
              </button>
            </div>
            {tab === "register" ? (
              <button type="button" className="btn gold" onClick={() => setAddOpen(true)}>
                + Add entry
              </button>
            ) : null}
          </div>
        }
      />
      {dialogs.host}
      <Toast message={flash} />

      {tab === "register" ? (
        <>
          <div className="cert-filters">
            {(["ms", "product", "ingelo"] as CertFlow[]).map((f) => (
              <button key={f} type="button" className={`btn ${flow === f ? "pri" : "ghost"} sm`} onClick={() => setFlow(f)}>
                {FLOW_LABEL[f]}
              </button>
            ))}
          </div>
          {(Object.keys(KIND_LABEL) as RegisterKind[]).map((k) => {
            const rows = flowEntries.filter((e) => e.kind === k);
            return (
              <section key={k} style={{ marginBottom: 18 }}>
                <h3 className="sec-label">
                  {KIND_LABEL[k]} · {rows.length}
                </h3>
                {rows.length === 0 ? (
                  <p style={{ color: "var(--muted)", fontSize: 13.5 }}>
                    {k === "suspended"
                      ? "No certifications are currently under suspension."
                      : k === "withdrawn"
                        ? "No certifications have been withdrawn or cancelled."
                        : "No certifications are currently operating under a reduced scope."}
                  </p>
                ) : (
                  <div className="data-list">
                    {rows.map((e) => (
                      <DataRow
                        key={e.id}
                        icon="i-shield-c"
                        iconVariant={k === "suspended" ? "amber" : k === "withdrawn" ? "red" : "purple"}
                        title={e.holder}
                        badge={e.certificate}
                        meta={[{ label: e.scope }, { label: `Since ${fmtDate(e.since)}` }]}
                        detail={[{ label: "Reason", value: e.reason }]}
                        actions={
                          <button type="button" className="btn ghost sm" onClick={() => void lift(e)}>
                            {k === "suspended" ? "Reinstate" : "Remove"}
                          </button>
                        }
                      />
                    ))}
                  </div>
                )}
              </section>
            );
          })}
          <p style={{ color: "var(--muted)", fontSize: 12.5 }}>
            Entries publish to /certification/status on the service portal. Suspension, withdrawal and scope
            reduction follow CER_PR_026. You can also start them from Certificates.
          </p>
        </>
      ) : cases.length === 0 ? (
        <EmptyState title="No appeals or complaints" detail="Submissions from the applicant tracker and the complaints desk appear here." />
      ) : (
        <div className="data-list">
          {cases.map((c) => {
            const sla = caseSla(c);
            return (
              <DataRow
                key={c.id}
                icon={c.kind === "appeal" ? "i-scroll" : c.kind === "complaint" ? "i-mega" : "i-refresh"}
                iconVariant={c.kind === "appeal" ? "purple" : c.kind === "complaint" ? "red" : "navy"}
                title={`${CASE_LABEL[c.kind]}: ${c.from}`}
                badge={c.id}
                meta={[
                  ...(c.application_id ? [{ label: c.application_id, mono: true }] : []),
                  { label: STATUS_LABEL[c.status] },
                  { label: sla.text, sla: sla.kind },
                ]}
                onOpen={() => setOpenCase(c.id)}
              />
            );
          })}
        </div>
      )}

      <RecordDrawer
        open={!!selected}
        onClose={() => setOpenCase(null)}
        reference={selected?.id}
        title={selected ? `${CASE_LABEL[selected.kind]}: ${selected.from}` : ""}
        subtitle={selected ? <span className="stagechip">{STATUS_LABEL[selected.status]}</span> : null}
        sections={
          selected
            ? [
                {
                  heading: "Submission",
                  content: (
                    <>
                      <div className="kv"><b>Received</b><span>{fmtDate(selected.received_at)}</span></div>
                      {selected.application_id ? (
                        <div className="kv"><b>Case</b><span className="mono">{selected.application_id}</span></div>
                      ) : null}
                      <p style={{ fontSize: 13.5, marginTop: 8 }}>{selected.text}</p>
                    </>
                  ),
                },
                {
                  heading: "Procedure",
                  content: (
                    <p style={{ fontSize: 13, color: "var(--muted)" }}>
                      {selected.kind === "appeal"
                        ? `CER_PR_002: appeals are lodged in writing within ${CHARTER.appealDays} days of the decision.`
                        : selected.kind === "complaint"
                          ? `CER_PR_006: acknowledge within 3 working days; resolve within ${CHARTER.complaintDays} where possible.`
                          : selected.kind === "changes"
                            ? "Client notice of changes (CER_FO_028)."
                            : "Extending scope of certification (CER_PR_012)."}
                    </p>
                  ),
                },
              ]
            : []
        }
        actions={caseActions}
      />

      <FormDrawer
        open={addOpen}
        title="Add a register entry"
        mode="create"
        fields={addFields}
        values={{ flow, kind: "suspended" }}
        submitLabel="Publish to register"
        onClose={() => setAddOpen(false)}
        onSubmit={async (v) => {
          try {
          await registerAction(v.kind as RegisterKind, {
            flow: v.flow as CertFlow,
            holder: v.holder,
            certificate: v.certificate,
            scope: v.scope,
            reason: v.reason,
          });
          } catch (err) {
            await dialogs.alert({ message: err instanceof Error ? err.message : "Not saved", kind: "error" });
            return;
          }
          setAddOpen(false);
          setFlash(`${v.certificate} published as ${KIND_LABEL[v.kind as RegisterKind].toLowerCase()}`);
          load();
        }}
      />
    </RequireStaff>
  );
}

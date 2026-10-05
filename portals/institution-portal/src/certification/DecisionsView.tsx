import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  AuthError,
  DataRow,
  ModuleHeader,
  RecordDrawer,
  Toast,
  useDialogs,
  type DataMetaItem,
  type DrawerAction,
  type DrawerSection,
  type SummaryTile,
} from "@eswasaone/shared-ui";
import type { CertificationApplication, CertificationAuditsResponse } from "../api/types";
import { useApiResource } from "../hooks/useApiResource";
import { EmptyState, ResourceGate } from "../components/PageStates";
import { RequireStaff } from "../components/RequireStaff";
import { useInstitution } from "../layout/InstitutionLayout";
import {
  allExtras,
  listDecisions,
  listFindings,
  listLab,
  recordDecision,
  type DeskDecision,
  type DeskFinding,
  type LabEntry,
} from "./deskApi";
import { CHARTER, FLOW_LABEL, SUBSTEPS, flowForScheme, fmtDate, normalizeStage, type CertFlow } from "./pipeline";

/**
 * Decisions: independent certification decision (MS / Ingelo) or
 * Certification Approval Committee (product / combined). Impartiality:
 * the decision maker may not be the lead auditor for the case.
 */

type Row = {
  app: CertificationApplication;
  flow: CertFlow;
  auditor?: string;
  findings: DeskFinding[];
  lab: LabEntry[];
  blockers: string[];
};

function bodyFor(flow: CertFlow): DeskDecision["body"] {
  return flow === "product" || flow === "combined" ? "Certification Approval Committee" : "Certification reviewer";
}

export function DecisionsView() {
  const { user, sessionKey, openAuth } = useInstitution();
  const dialogs = useDialogs();
  const [params] = useSearchParams();
  const apps = useApiResource<{ items?: CertificationApplication[] }>("/certification/applications?limit=200", {
    enabled: Boolean(user),
    refreshKey: sessionKey,
  });
  const audits = useApiResource<CertificationAuditsResponse>("/certification/audits", {
    enabled: Boolean(user),
    refreshKey: sessionKey,
  });
  const [findings, setFindings] = useState<DeskFinding[]>([]);
  const [decisions, setDecisions] = useState<Record<string, DeskDecision>>({});
  const [openId, setOpenId] = useState<string | null>(params.get("open"));
  const [note, setNote] = useState("");
  const [flash, setFlash] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    void listFindings().then(setFindings);
    setDecisions(listDecisions());
  }, []);
  useEffect(load, [load]);

  const rows: Row[] = useMemo(() => {
    const ex = allExtras();
    const lab = listLab();
    return (apps.data?.items ?? [])
      .filter((a) => {
        const st = normalizeStage(a.status);
        return st === "audit" || st === "nc";
      })
      .map((a) => {
        const flow = ex[a.id]?.flow ?? flowForScheme(a.scheme);
        const fs = findings.filter((f) => f.application_id === a.id);
        const ls = lab.filter((l) => l.application_id === a.id);
        const auditor = ex[a.id]?.auditor ?? audits.data?.items?.find((x) => x.application_id === a.id)?.auditor;
        const blockers: string[] = [];
        const openMajor = fs.filter((f) => f.severity === "major" && f.status !== "accepted").length;
        const openMinor = fs.filter((f) => f.severity === "minor" && f.status !== "accepted").length;
        if (openMajor) blockers.push(`${openMajor} major NC open`);
        if (openMinor) blockers.push(`${openMinor} minor NC without accepted corrective action`);
        if ((flow === "product" || flow === "combined") && (!ls.length || ls.some((l) => l.status === "pending" || l.status === "in_test")))
          blockers.push("Laboratory results outstanding");
        return { app: a, flow, auditor, findings: fs, lab: ls, blockers };
      });
  }, [apps.data, audits.data, findings]);

  const selected = rows.find((r) => r.app.id === openId) ?? null;
  const me = user?.full_name || user?.username || "";
  const conflict = !!selected?.auditor && !!me && selected.auditor.toLowerCase() === me.toLowerCase();

  const ready = rows.filter((r) => !r.blockers.length).length;
  const recent = Object.values(decisions).sort((a, b) => b.at.localeCompare(a.at)).slice(0, 8);
  const summary: SummaryTile[] = [
    { label: "Awaiting decision", value: rows.length, variant: rows.length ? "due" : "ok" },
    { label: "Ready to decide", value: ready, variant: "ok" },
    { label: "Blocked", value: rows.length - ready, variant: rows.length - ready ? "breach" : "ok" },
    { label: "Decided (recent)", value: recent.length },
  ];

  async function decide(r: Row, outcome: DeskDecision["outcome"]) {
    if (conflict) return;
    if (!note.trim()) {
      await dialogs.alert({ message: "Record the basis for the decision.", kind: "error" });
      return;
    }
    const ok = await dialogs.confirm({
      title: outcome === "granted" ? `Grant certification to ${r.app.applicant}?` : `Refuse certification for ${r.app.applicant}?`,
      message:
        outcome === "granted"
          ? `Moves ${r.app.id} to Certified. The certificate, register entry, invoice and QR are issued (R-C3).`
          : `The client is notified with reasons and may appeal within ${CHARTER.appealDays} days (CER_PR_002).`,
      confirmLabel: outcome === "granted" ? "Grant" : "Refuse",
      danger: outcome === "refused",
    });
    if (!ok) return;
    setBusy(true);
    try {
      await recordDecision({
        application_id: r.app.id,
        outcome,
        body: bodyFor(r.flow),
        decided_by: me,
        note: note.trim(),
        at: new Date().toISOString(),
      });
      setFlash(`${r.app.id}: certification ${outcome}`);
      setOpenId(null);
      setNote("");
      load();
      apps.reload();
    } catch (err) {
      if (err instanceof AuthError && err.authRequired) openAuth(err.reason);
      else await dialogs.alert({ message: err instanceof Error ? err.message : "Decision failed", kind: "error" });
    } finally {
      setBusy(false);
    }
  }

  const sections: DrawerSection[] = selected
    ? [
        {
          heading: "Case",
          content: (
            <>
              <div className="kv"><b>Path</b><span>{FLOW_LABEL[selected.flow]}</span></div>
              <div className="kv"><b>Scheme</b><span>{selected.app.scheme}</span></div>
              <div className="kv"><b>Applied</b><span>{fmtDate(selected.app.created_at)}</span></div>
              <div className="kv"><b>Lead auditor</b><span>{selected.auditor ?? "—"}</span></div>
              <div className="kv"><b>Decision body</b><span>{bodyFor(selected.flow)}</span></div>
            </>
          ),
        },
        {
          heading: "Evidence",
          content: (
            <>
              <div className="kv">
                <b>Findings</b>
                <span>
                  {selected.findings.length
                    ? selected.findings.map((f) => `${f.id} (${f.severity}, ${f.status})`).join("; ")
                    : "None raised"}
                </span>
              </div>
              {selected.flow === "product" || selected.flow === "combined" ? (
                <div className="kv">
                  <b>Laboratory</b>
                  <span>
                    {selected.lab.length ? selected.lab.map((l) => `${l.field}: ${l.status}`).join("; ") : "No results recorded"}
                  </span>
                </div>
              ) : null}
              <div className="kv">
                <b>Checklist</b>
                <span>
                  {SUBSTEPS[selected.flow].filter((x) => allExtras()[selected.app.id]?.substeps[x.key]).length}/
                  {SUBSTEPS[selected.flow].length} steps ticked in the pipeline
                </span>
              </div>
              {selected.blockers.length ? (
                <p style={{ color: "var(--red)", fontWeight: 600, fontSize: 13, marginTop: 6 }}>
                  Blocked: {selected.blockers.join(" · ")}
                </p>
              ) : (
                <p style={{ color: "var(--green)", fontWeight: 600, fontSize: 13, marginTop: 6 }}>Ready for decision</p>
              )}
            </>
          ),
        },
        {
          heading: "Decision",
          content: conflict ? (
            <p style={{ color: "var(--red)", fontWeight: 600, fontSize: 13 }}>
              Impartiality: you were the lead auditor on this case, so another reviewer must decide.
            </p>
          ) : (
            <textarea
              aria-label="Decision basis"
              placeholder="Basis for the decision (recorded on file and sent to the client)"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              style={{ width: "100%", minHeight: 90, font: "inherit", padding: 8, border: "1px solid var(--line)", borderRadius: 8 }}
            />
          ),
        },
      ]
    : [];

  const actions: DrawerAction[] = selected
    ? [
        {
          label: busy ? "…" : "Grant certification",
          variant: "gold",
          onClick: () => void decide(selected, "granted"),
          disabled: busy || conflict || selected.blockers.length > 0,
        },
        { label: "Refuse", variant: "ghost", onClick: () => void decide(selected, "refused"), disabled: busy || conflict },
        { label: "Close", variant: "ghost", onClick: () => setOpenId(null) },
      ]
    : [];

  return (
    <RequireStaff reason="Staff sign-in required">
      <ResourceGate
        loading={apps.loading}
        refreshing={apps.refreshing}
        error={apps.error}
        onRetry={apps.reload}
        hasData={apps.data != null}
        skeleton="list"
        label="Loading decision queue…"
      >
        <>
          <ModuleHeader
            title="Certification decisions"
            subtitle="Independent review after audit, NC closure and, for products, laboratory testing (CER_PR_014)."
            summary={summary}
          />
          {dialogs.host}
          <Toast message={flash} />
          {rows.length === 0 ? (
            <EmptyState title="Nothing awaiting decision" detail="Cases appear here once audits or testing are complete." />
          ) : (
            <div className="data-list">
              {rows.map((r) => {
                const meta: DataMetaItem[] = [
                  { label: FLOW_LABEL[r.flow], tag: true },
                  { label: bodyFor(r.flow) },
                  { label: r.blockers.length ? r.blockers[0] : "ready", sla: r.blockers.length ? "breach" : "ok" },
                ];
                return (
                  <DataRow
                    key={r.app.id}
                    icon="i-scroll"
                    iconVariant={r.blockers.length ? "amber" : "green"}
                    title={r.app.applicant}
                    badge={r.app.id}
                    meta={meta}
                    onOpen={() => {
                      setNote("");
                      setOpenId(r.app.id);
                    }}
                  />
                );
              })}
            </div>
          )}
          {recent.length ? (
            <>
              <h3 className="sec-label">Recent decisions</h3>
              <div className="data-list">
                {recent.map((d) => (
                  <DataRow
                    key={d.application_id}
                    icon={d.outcome === "granted" ? "i-award" : "i-x"}
                    iconVariant={d.outcome === "granted" ? "green" : "red"}
                    title={`${d.application_id}: ${d.outcome}`}
                    meta={[{ label: d.body }, { label: d.decided_by || "—" }, { label: fmtDate(d.at) }]}
                    detail={[{ label: "Basis", value: d.note }]}
                  />
                ))}
              </div>
            </>
          ) : null}
          <RecordDrawer
            open={!!selected}
            onClose={() => setOpenId(null)}
            reference={selected?.app.id}
            title={selected?.app.applicant ?? ""}
            subtitle={selected ? <span className="stagechip">{bodyFor(selected.flow)}</span> : null}
            sections={sections}
            actions={actions}
          />
        </>
      </ResourceGate>
    </RequireStaff>
  );
}

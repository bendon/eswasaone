/**
 * Certification pipeline (gap 05 C1): columns follow the workflow map states; cards show owner,
 * SLA (paused while waiting on the customer) and links to the record page. Desk intake for paper
 * applications; filters by officer, scheme, flow and SLA; CSV export.
 */
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Icon } from "@eswasaone/shared-ui";
import { APP_DEF, createApplication, getCertSettings, listApplications, type CertApplication } from "@eswasaone/shared-ui/certification";
import { taskSla, tasksForRecord } from "@eswasaone/shared-ui/tasks";
import { ReasonDialog } from "@eswasaone/shared-ui/workflow";
import { downloadCsv, Gate, PageHead, Tile, useDomain, useStaffActor, useToast } from "../domain/ui";

const FLOW_LABEL: Record<string, string> = { ms: "Management system", product: "Product mark", ingelo: "Ingelo", combined: "Combined" };

function slaOf(a: CertApplication) {
  const t = tasksForRecord("Certification Application", a.id).find((x) => !x.closed_at && x.state === a.state);
  const paused = APP_DEF.states.find((s) => s.id === a.state)?.paused;
  if (paused) return { status: "paused" as const, label: "Waiting on customer" };
  return t ? taskSla(t) : null;
}

export function PipelineView() {
  const actor = useStaffActor();
  const [toast, show] = useToast();
  const [f, setF] = useState({ officer: "", scheme: "", flow: "", sla: "", mine: false, q: "" });
  const [intake, setIntake] = useState(false);
  const res = useDomain(() => listApplications({ q: f.q }), [f.q]);
  const settings = getCertSettings();

  const rows = useMemo(
    () =>
      (res.data ?? [])
        .filter((a) => !f.officer || a.officer === f.officer)
        .filter((a) => !f.scheme || a.scheme === f.scheme)
        .filter((a) => !f.flow || a.flow === f.flow)
        .filter((a) => !f.mine || a.officer === actor.name || (a.duties?.["Audit team"] ?? []).includes(actor.name))
        .filter((a) => !f.sla || slaOf(a)?.status === f.sla),
    [res.data, f, actor.name],
  );
  const officers = [...new Set((res.data ?? []).map((a) => a.officer).filter(Boolean))] as string[];
  const open = rows.filter((a) => !["Certified", "Rejected", "Withdrawn"].includes(a.state));
  const breach = open.filter((a) => slaOf(a)?.status === "breach").length;
  const waiting = open.filter((a) => ["Awaiting Customer", "Quoted", "NC Resolution"].includes(a.state)).length;

  return (
    <Gate res={res} what="Applications">
      {() => (
        <div className="crm-stack">
          {toast}
          <PageHead
            title="Certification pipeline"
            sub="Every application by workflow-map state. Act from the record page or from Approvals."
            actions={
              <>
                <button type="button" className="crm-btn crm-btn--sm" onClick={() => downloadCsv("certification-pipeline.csv", rows.map((a) => ({ id: a.id, org: a.org, scheme: a.standard, state: a.state, officer: a.officer ?? "", created: a.created_at.slice(0, 10) })))}>
                  <Icon name="i-download" /> Export
                </button>
                <button type="button" className="crm-btn crm-btn--pri crm-btn--sm" onClick={() => setIntake(true)}>
                  <Icon name="i-plus" /> Log paper application
                </button>
              </>
            }
          />
          <div className="crm-kpis">
            <Tile label="Open files" value={open.length} sub={`${rows.length} in view`} />
            <Tile label="SLA breached" value={breach} tone={breach ? "red" : "green"} sub="Staff-owned steps only" />
            <Tile label="Waiting on customers" value={waiting} tone="amber" sub="Clock paused" />
            <Tile label="Certified (all time)" value={rows.filter((a) => a.state === "Certified").length} tone="green" />
          </div>
          <div className="crm-toolbar">
            <input className="crm-input" style={{ maxWidth: 240 }} placeholder="Search organisation, id, scope…" value={f.q} onChange={(e) => setF({ ...f, q: e.target.value })} />
            <select className="crm-select" style={{ width: "auto" }} value={f.officer} onChange={(e) => setF({ ...f, officer: e.target.value })} aria-label="Officer">
              <option value="">All officers</option>
              {officers.map((o) => (
                <option key={o}>{o}</option>
              ))}
            </select>
            <select className="crm-select" style={{ width: "auto" }} value={f.scheme} onChange={(e) => setF({ ...f, scheme: e.target.value })} aria-label="Scheme">
              <option value="">All schemes</option>
              {settings.schemes.map((s) => (
                <option key={s.code} value={s.code}>
                  {s.standard}
                </option>
              ))}
            </select>
            <select className="crm-select" style={{ width: "auto" }} value={f.flow} onChange={(e) => setF({ ...f, flow: e.target.value })} aria-label="Flow">
              <option value="">All flows</option>
              {Object.entries(FLOW_LABEL).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
            <select className="crm-select" style={{ width: "auto" }} value={f.sla} onChange={(e) => setF({ ...f, sla: e.target.value })} aria-label="SLA">
              <option value="">Any SLA</option>
              <option value="breach">Breached</option>
              <option value="due">Due soon</option>
              <option value="ok">On track</option>
              <option value="paused">Paused</option>
            </select>
            <label className="crm-check">
              <input type="checkbox" checked={f.mine} onChange={(e) => setF({ ...f, mine: e.target.checked })} /> Mine
            </label>
          </div>
          <div className="crm-kanban" style={{ gridAutoColumns: "minmax(230px, 1fr)" }}>
            {APP_DEF.states.map((st) => {
              const col = rows.filter((a) => a.state === st.id);
              return (
                <div key={st.id} className="crm-col">
                  <div className="crm-col__h">
                    <span className={`crm-pill crm-pill--${st.tone}`}>{st.label}</span>
                    <b>{col.length}</b>
                  </div>
                  {col.map((a) => {
                    const sla = slaOf(a);
                    return (
                      <Link key={a.id} to={`/certification/applications/${a.id}`} className="crm-opp" style={{ display: "block", textDecoration: "none", color: "inherit" }}>
                        <span className="crm-mono crm-small">{a.id}</span>
                        <b style={{ display: "block" }}>{a.org}</b>
                        <span className="crm-small">
                          {a.standard} · {FLOW_LABEL[a.flow]}
                        </span>
                        <div className="crm-row" style={{ marginTop: 6, gap: 6 }}>
                          {sla ? <span className={`crm-sla crm-sla--${sla.status}`}>{sla.label}</span> : null}
                          <span className="crm-small">{a.officer ?? "Unclaimed"}</span>
                          {a.findings.some((n) => n.state === "Raised" || n.state === "Response submitted") ? <span className="crm-pill crm-pill--red">NCs</span> : null}
                          {a.channel !== "portal" ? <span className="crm-pill crm-pill--outline">{a.channel}</span> : null}
                        </div>
                      </Link>
                    );
                  })}
                </div>
              );
            })}
          </div>
          {intake ? (
            <IntakeDialog
              onClose={() => setIntake(false)}
              onDone={(id) => {
                setIntake(false);
                show(`Logged ${id}.`);
              }}
              by={actor.name}
            />
          ) : null}
        </div>
      )}
    </Gate>
  );
}

function IntakeDialog({ onClose, onDone, by }: { onClose: () => void; onDone: (id: string) => void; by: string }) {
  const schemes = getCertSettings().schemes;
  const [v, setV] = useState({ scheme: schemes[0].code, org: "", contact: "", email: "", phone: "", employees: "10", site: "", scope: "", channel: "desk" as "desk" | "email" | "transfer", tBody: "", tCert: "", tExp: "" });
  const set = (k: keyof typeof v) => (e: { target: { value: string } }) => setV({ ...v, [k]: e.target.value });
  return (
    <ReasonDialog
      title="Log a paper / email application"
      consequence="Creates the application in Submitted with the documents marked missing; the officer reviews them from the record page. Transfers carry the other body's certificate for a pre-transfer review."
      confirmLabel="Create application"
      reasonLabel="Desk note (optional)"
      canSubmit={Boolean(v.org.trim() && v.scope.trim() && v.contact.trim())}
      onClose={onClose}
      onSubmit={async () => {
        const a = createApplication(
          {
            scheme: v.scheme,
            org: v.org,
            contact: v.contact,
            customer_email: v.email || "demo",
            phone: v.phone,
            employees: Number(v.employees) || 1,
            sites: [{ name: v.site || "Main site", address: v.site, employees: Number(v.employees) || 1 }],
            scope: v.scope,
            channel: v.channel,
            transfer_from: v.channel === "transfer" ? { body: v.tBody, certificate: v.tCert, expires: v.tExp } : undefined,
          },
          by,
        );
        onDone(a.id);
      }}
    >
      <div className="crm-form crm-grid crm-grid--2">
        <label className="crm-field">
          Scheme
          <select className="crm-select" value={v.scheme} onChange={set("scheme")}>
            {schemes.map((s) => (
              <option key={s.code} value={s.code}>
                {s.title}
              </option>
            ))}
          </select>
        </label>
        <label className="crm-field">
          Received by
          <select className="crm-select" value={v.channel} onChange={set("channel")}>
            <option value="desk">Walk-in / paper</option>
            <option value="email">Email</option>
            <option value="transfer">Transfer from another body</option>
          </select>
        </label>
        <label className="crm-field">
          Organisation *
          <input className="crm-input" value={v.org} onChange={set("org")} />
        </label>
        <label className="crm-field">
          Contact person *
          <input className="crm-input" value={v.contact} onChange={set("contact")} />
        </label>
        <label className="crm-field">
          Email
          <input className="crm-input" type="email" value={v.email} onChange={set("email")} />
        </label>
        <label className="crm-field">
          Phone
          <input className="crm-input" value={v.phone} onChange={set("phone")} />
        </label>
        <label className="crm-field">
          Employees
          <input className="crm-input" type="number" value={v.employees} onChange={set("employees")} />
        </label>
        <label className="crm-field">
          Site address
          <input className="crm-input" value={v.site} onChange={set("site")} />
        </label>
      </div>
      <label className="crm-field">
        Scope *
        <input className="crm-input" value={v.scope} onChange={set("scope")} />
      </label>
      {v.channel === "transfer" ? (
        <div className="crm-grid crm-grid--3">
          <label className="crm-field">
            Current body
            <input className="crm-input" value={v.tBody} onChange={set("tBody")} />
          </label>
          <label className="crm-field">
            Certificate no.
            <input className="crm-input" value={v.tCert} onChange={set("tCert")} />
          </label>
          <label className="crm-field">
            Expires
            <input className="crm-input" type="date" value={v.tExp} onChange={set("tExp")} />
          </label>
        </div>
      ) : null}
    </ReasonDialog>
  );
}

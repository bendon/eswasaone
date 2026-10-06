import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  AuthError,
  deskUrl,
  FormDrawer,
  Icon,
  ModuleHeader,
  StaffPickerDrawer,
  useDialogs,
  type FormDrawerField,
  type IconName,
} from "@eswasaone/shared-ui";
import type { AuditSummary, CertificationApplication, CertificationAuditsResponse } from "../api/types";
import { useApiResource } from "../hooks/useApiResource";
import { EmptyState, ResourceGate } from "../components/PageStates";
import { RequireStaff } from "../components/RequireStaff";
import { useInstitution } from "../layout/InstitutionLayout";
import {
  advanceApplication,
  allExtras,
  assignAuditor,
  createDeskApplication,
  getExtras,
  setFlow,
  setSubstep,
  type AppExtras,
} from "./deskApi";
import {
  FLOW_LABEL,
  NEXT,
  SECONDARY,
  STAGES,
  SUBSTEPS,
  TIMELINE_STEPS,
  WITHDRAWN_CHIP,
  auditorInitials,
  flowForScheme,
  fmtDate,
  normalizeStage,
  slaFor,
  type CertFlow,
  type CertStage,
  type NextStep,
  type PipelineItem,
} from "./pipeline";

type AppsResponse = { items?: CertificationApplication[] };

function fromApi(
  a: CertificationApplication,
  extras: Record<string, AppExtras>,
  audits: AuditSummary[],
): PipelineItem {
  const stage = normalizeStage(a.status);
  const ex = extras[a.id];
  const audit = audits.find((x) => x.application_id === a.id);
  const { sla, text } = slaFor(stage, a.created_at);
  return {
    id: a.id,
    co: a.applicant || a.id,
    scheme: a.scheme || "—",
    flow: ex?.flow ?? flowForScheme(a.scheme || ""),
    stage,
    aud: ex?.auditor || audit?.auditor || "Unassigned",
    sla,
    slaText: text,
    applied: fmtDate(a.created_at),
    appliedIso: a.created_at,
    auditDate: audit?.due_date ? fmtDate(audit.due_date) : undefined,
  };
}

function stageMeta(stage: CertStage) {
  return (
    STAGES.find((x) => x.key === stage) ?? {
      key: "withdrawn" as const,
      label: "Withdrawn",
      state: "Withdraw",
      color: "var(--muted-2)",
      chip: WITHDRAWN_CHIP,
    }
  );
}

const INTAKE_FIELDS: FormDrawerField[] = [
  {
    name: "flow",
    label: "Certification path",
    type: "select",
    required: true,
    options: [
      { value: "ms", label: "Management system" },
      { value: "product", label: "Product certification" },
      { value: "ingelo", label: "Ingelo (MSME)" },
      { value: "combined", label: "Combined (ISO + product)" },
    ],
  },
  {
    name: "scheme",
    label: "Scheme",
    type: "select",
    required: true,
    options: [
      { value: "iso9001", label: "ISO 9001:2015 Quality" },
      { value: "iso14001", label: "ISO 14001:2015 Environment" },
      { value: "iso22000", label: "ISO 22000:2018 Food safety" },
      { value: "iso45001", label: "ISO 45001:2018 OH&S" },
      { value: "haccp", label: "SZNS SANS 10330 HACCP" },
      { value: "product", label: "SZNS Product Mark" },
      { value: "ingelo", label: "Ingelo Certification" },
      { value: "combined", label: "Combined ISO + Product Mark" },
    ],
  },
  { name: "applicant_org", label: "Organisation", required: true },
  { name: "applicant_name", label: "Contact person / informant", required: true },
  { name: "contact_email", label: "Email", type: "email" },
  { name: "contact_phone", label: "Phone" },
  { name: "site_address", label: "Physical address (site)" },
  {
    name: "channel",
    label: "Received via",
    type: "select",
    required: true,
    options: [
      { value: "paper-matsapha", label: "Paper form handed in at Matsapha" },
      { value: "email", label: "Email (certification@eswasa.co.sz)" },
      { value: "walk-in", label: "Walk-in / promotional visit" },
      { value: "phone", label: "Phone enquiry" },
    ],
  },
  { name: "received_at", label: "Date received", type: "date", required: true },
  { name: "notes", label: "Notes", type: "textarea", placeholder: "Form reference, missing items…" },
];

type ViewMode = "board" | "list";

export function PipelineView() {
  const { openAuth, sessionKey, user } = useInstitution();
  const dialogs = useDialogs();
  const navigate = useNavigate();
  const apps = useApiResource<AppsResponse>("/certification/applications?limit=200", {
    enabled: Boolean(user),
    refreshKey: sessionKey,
  });
  const audits = useApiResource<CertificationAuditsResponse>("/certification/audits", {
    enabled: Boolean(user),
    refreshKey: sessionKey,
  });
  const [view, setView] = useState<ViewMode>("board");
  const [items, setItems] = useState<PipelineItem[]>([]);
  const [advancing, setAdvancing] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [flowFilter, setFlowFilter] = useState("");
  const [schemeFilter, setSchemeFilter] = useState("");
  const [auditorFilter, setAuditorFilter] = useState("");
  const [slaFilter, setSlaFilter] = useState("");
  const [showWithdrawn, setShowWithdrawn] = useState(false);
  const [search, setSearch] = useState("");
  const [intakeOpen, setIntakeOpen] = useState(false);
  const [intakeBusy, setIntakeBusy] = useState(false);
  const [intakeErr, setIntakeErr] = useState<string | null>(null);
  const [pickFor, setPickFor] = useState<string | null>(null);
  const [extrasTick, setExtrasTick] = useState(0);

  useEffect(() => {
    if (apps.authRequired) openAuth("Staff sign-in required for certification");
  }, [apps.authRequired, openAuth]);

  useEffect(() => {
    if (apps.data) {
      const ex = allExtras();
      setItems((apps.data.items ?? []).map((a) => fromApi(a, ex, audits.data?.items ?? [])));
    }
  }, [apps.data, audits.data, extrasTick]);

  const filtered = useMemo(() => {
    return items.filter((it) => {
      if (!showWithdrawn && it.stage === "withdrawn") return false;
      if (flowFilter && it.flow !== flowFilter) return false;
      if (schemeFilter && it.scheme !== schemeFilter) return false;
      if (auditorFilter && it.aud !== auditorFilter) return false;
      if (slaFilter && it.sla !== slaFilter) return false;
      if (search) {
        const hay = `${it.id} ${it.co} ${it.scheme}`.toLowerCase();
        if (!hay.includes(search.toLowerCase())) return false;
      }
      return true;
    });
  }, [items, flowFilter, schemeFilter, auditorFilter, slaFilter, search, showWithdrawn]);

  const openItem = items.find((i) => i.id === openId) ?? null;
  const breaches = items.filter((i) => i.sla === "breach").length;

  async function run(it: PipelineItem, step: NextStep, presetComment?: string) {
    if (step.goto) {
      navigate(`/certification/${step.goto}?open=${encodeURIComponent(it.id)}`);
      return;
    }
    if (!step.action) return;
    const comment =
      presetComment ??
      (await dialogs.prompt({
      title: step.label,
      message: `${step.label} for ${it.id} (${it.co}). This updates the case and notifies the applicant.`,
      label: "Comment (optional, kept in the audit log)",
      confirmLabel: step.label,
    }));
    if (comment === null) return;
    setAdvancing(it.id);
    try {
      await advanceApplication(it.id, step.action, comment);
      const to = step.to ?? it.stage;
      setItems((prev) =>
        prev.map((x) => (x.id === it.id ? { ...x, stage: to, ...slaFor(to, x.appliedIso) } : x)),
      );
      await dialogs.alert({ message: `${step.label} → ${it.id}`, kind: "success" });
      apps.reload();
    } catch (err) {
      if (err instanceof AuthError && err.authRequired) openAuth(err.reason);
      else
        await dialogs.alert({
          message: err instanceof Error ? err.message : "Update failed",
          kind: "error",
        });
    } finally {
      setAdvancing(null);
    }
  }

  async function withdraw(it: PipelineItem) {
    const reason = await dialogs.prompt({
      title: `Withdraw ${it.id}?`,
      message: "Stops work on this application. The applicant is notified. Record the reason.",
      label: "Reason",
      confirmLabel: "Withdraw",
    });
    if (!reason) return;
    await run(it, { label: "Withdraw", ic: "i-x", cls: "ghost", action: "withdraw", to: "withdrawn" }, `Withdrawn: ${reason}`);
  }

  async function submitIntake(v: Record<string, string>) {
    setIntakeBusy(true);
    setIntakeErr(null);
    try {
      const res = await createDeskApplication(v);
      setIntakeOpen(false);
      setExtrasTick((n) => n + 1);
      apps.reload();
      await dialogs.alert({ message: `Application ${res.id} captured`, kind: "success" });
    } catch (err) {
      if (err instanceof AuthError && err.authRequired) openAuth(err.reason);
      setIntakeErr(err instanceof Error ? err.message : "Could not create application");
    } finally {
      setIntakeBusy(false);
    }
  }

  const schemes = useMemo(() => Array.from(new Set(items.map((i) => i.scheme))).sort(), [items]);
  const auditors = useMemo(
    () => Array.from(new Set(items.map((i) => i.aud))).filter((a) => a !== "Unassigned").sort(),
    [items],
  );

  return (
    <RequireStaff reason="Staff sign-in required for certification">
      <ResourceGate
        loading={apps.loading}
        refreshing={apps.refreshing}
        error={apps.error}
        onRetry={apps.reload}
        hasData={apps.data != null}
        skeleton="list"
        label="Loading certification pipeline…"
      >
        <>
          <ModuleHeader
            title="Certification pipeline"
            subtitle="Every application across management systems, product and Ingelo. The next step is the main button."
            summary={[
              { label: "Open", value: items.filter((i) => i.stage !== "withdrawn" && i.stage !== "certified").length },
              { label: "Certified / surveillance", value: items.filter((i) => ["certified", "surveillance", "renewal"].includes(i.stage)).length, variant: "ok" },
              { label: "In NC resolution", value: items.filter((i) => i.stage === "nc").length, variant: "due" },
              { label: "Charter breaches", value: breaches, variant: breaches ? "breach" : "ok" },
            ]}
            extra={
              <div className="r">
                <div className="viewtog">
                  <button type="button" className={view === "board" ? "on" : ""} onClick={() => setView("board")}>
                    <Icon name="i-board" /> Pipeline
                  </button>
                  <button type="button" className={view === "list" ? "on" : ""} onClick={() => setView("list")}>
                    <Icon name="i-list" /> List
                  </button>
                </div>
                <button type="button" className="btn gold" onClick={() => setIntakeOpen(true)}>
                  <Icon name="i-plus" /> New application
                </button>
              </div>
            }
          />

          {dialogs.host}

          <div className="cert-filters">
            <select className="sel" value={flowFilter} onChange={(e) => setFlowFilter(e.target.value)} aria-label="Path">
              <option value="">All paths</option>
              {(Object.keys(FLOW_LABEL) as CertFlow[]).map((f) => (
                <option key={f} value={f}>
                  {FLOW_LABEL[f]}
                </option>
              ))}
            </select>
            <select className="sel" value={schemeFilter} onChange={(e) => setSchemeFilter(e.target.value)} aria-label="Scheme">
              <option value="">All schemes</option>
              {schemes.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
            <select className="sel" value={auditorFilter} onChange={(e) => setAuditorFilter(e.target.value)} aria-label="Auditor">
              <option value="">All auditors</option>
              {auditors.map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
              <option value="Unassigned">Unassigned</option>
            </select>
            <select className="sel" value={slaFilter} onChange={(e) => setSlaFilter(e.target.value)} aria-label="Service Charter">
              <option value="">Charter: all</option>
              <option value="breach">Breached</option>
              <option value="due">Due soon</option>
              <option value="ok">On track</option>
            </select>
            <label className="sel" style={{ display: "inline-flex", alignItems: "center", gap: 6, cursor: "pointer" }}>
              <input type="checkbox" checked={showWithdrawn} onChange={() => setShowWithdrawn(!showWithdrawn)} /> Withdrawn
            </label>
            <div className="search">
              <Icon name="i-search" />
              <input
                type="search"
                placeholder="Search applicant or reference…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </div>

          {filtered.length === 0 ? (
            <EmptyState
              title={items.length ? "No applications match" : "No applications yet"}
              detail={items.length ? "Adjust the filters above." : "Online applications and desk intakes appear here."}
            />
          ) : view === "board" ? (
            <div className="cert-board">
              {STAGES.map((s) => {
                const colItems = filtered.filter((i) => i.stage === s.key);
                return (
                  <div className="cert-col" key={s.key}>
                    <div className="cert-col__h">
                      <span className="cert-col__dot" style={{ background: s.color }} />
                      <b>{s.label}</b>
                      <span className="c">{colItems.length}</span>
                    </div>
                    <div className="cert-col__list">
                      {colItems.length === 0 ? (
                        <div className="cert-col__empty">—</div>
                      ) : (
                        colItems.map((it) => (
                          <PipelineCard
                            key={it.id}
                            item={it}
                            advancing={advancing === it.id}
                            onOpen={() => setOpenId(it.id)}
                            onNext={(step) => void run(it, step)}
                          />
                        ))
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="cert-listwrap">
              <table className="cert-table">
                <thead>
                  <tr>
                    <th>Reference</th>
                    <th>Applicant</th>
                    <th>Path</th>
                    <th>Scheme</th>
                    <th>Stage</th>
                    <th>Auditor</th>
                    <th>Applied</th>
                    <th>Charter</th>
                    <th>Next step</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((it) => {
                    const s = stageMeta(it.stage);
                    const n = NEXT[it.stage];
                    return (
                      <tr key={it.id} onClick={() => setOpenId(it.id)}>
                        <td className="mono" style={{ fontWeight: 700 }}>
                          {it.id}
                        </td>
                        <td style={{ fontWeight: 700 }}>{it.co}</td>
                        <td>{FLOW_LABEL[it.flow]}</td>
                        <td>{it.scheme}</td>
                        <td>
                          <span className="stagechip" style={{ background: s.chip[0], color: s.chip[1] }}>
                            <span className="d" style={{ background: s.chip[1] }} />
                            {s.label}
                          </span>
                        </td>
                        <td>{it.aud}</td>
                        <td>{it.applied}</td>
                        <td>
                          <span className={`sla ${it.sla}`}>
                            <span className="d" />
                            {it.slaText}
                          </span>
                        </td>
                        <td>
                          {n ? (
                            <button
                              type="button"
                              className={`btn ${n.cls === "gold" ? "gold" : "pri"} sm`}
                              onClick={(e) => {
                                e.stopPropagation();
                                void run(it, n);
                              }}
                              disabled={advancing === it.id}
                            >
                              {advancing === it.id ? "…" : n.label}
                            </button>
                          ) : (
                            "—"
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {openItem ? (
            <CertDrawer
              item={openItem}
              advancing={advancing === openItem.id}
              onClose={() => setOpenId(null)}
              onNext={(step) => void run(openItem, step)}
              onWithdraw={() => void withdraw(openItem)}
              onAssign={() => setPickFor(openItem.id)}
              onExtrasChange={() => setExtrasTick((n) => n + 1)}
            />
          ) : null}

          <FormDrawer
            open={intakeOpen}
            title="Capture an application"
            mode="create"
            fields={INTAKE_FIELDS}
            values={{ received_at: new Date().toISOString().slice(0, 10), channel: "paper-matsapha", flow: "ingelo", scheme: "ingelo" }}
            submitLabel="Create application"
            busy={intakeBusy}
            error={intakeErr}
            onClose={() => setIntakeOpen(false)}
            onSubmit={submitIntake}
          >
            <p style={{ fontSize: 12.5, color: "var(--muted)", margin: 0 }}>
              For paper forms (e.g. Ingelo CER_FO_002_IPC handed in at Matsapha) or emailed applications. The case
              then follows the same pipeline and charter timers as online applications.
            </p>
          </FormDrawer>

          <StaffPickerDrawer
            open={pickFor !== null}
            title="Assign lead auditor"
            roleFilter="Certification Auditor"
            onClose={() => setPickFor(null)}
            onPick={async (staff) => {
              const appId = pickFor;
              setPickFor(null);
              if (!appId) return;
              const audit = (audits.data?.items ?? []).find((a) => a.application_id === appId);
              // Prefer email/username — Auditor master links by User/email, not display name.
              const key = staff.email || staff.username;
              const label = staff.full_name || key;
              try {
                await assignAuditor(appId, key, audit?.id);
                setExtrasTick((n) => n + 1);
                await dialogs.alert({ message: `${label} assigned to ${appId}`, kind: "success" });
              } catch (err) {
                await dialogs.alert({ message: err instanceof Error ? err.message : "Assignment failed", kind: "error" });
              }
            }}
          />
        </>
      </ResourceGate>
    </RequireStaff>
  );
}

function PipelineCard({
  item,
  advancing,
  onOpen,
  onNext,
}: {
  item: PipelineItem;
  advancing: boolean;
  onOpen: () => void;
  onNext: (step: NextStep) => void;
}) {
  const n = NEXT[item.stage];
  return (
    <div className={`cardc${item.sla === "breach" ? " breach" : ""}`} onClick={onOpen}>
      <div className="cardc__top">
        <span className="cardc__ref">{item.id}</span>
        <span className="cardc__nc" style={{ background: "var(--navy-l)", color: "var(--navy)" }}>
          {FLOW_LABEL[item.flow]}
        </span>
      </div>
      <div className="cardc__co">{item.co}</div>
      <div className="cardc__scheme">{item.scheme}</div>
      <div className="cardc__foot">
        <span className="aud">
          <span className="av">{auditorInitials(item.aud)}</span>
          {item.aud}
        </span>
        <span className={`sla ${item.sla}`}>
          <span className="d" />
          {item.slaText}
        </span>
      </div>
      {n ? (
        <div className="cardc__act">
          <button
            type="button"
            className={`act-btn ${n.cls}`}
            onClick={(e) => {
              e.stopPropagation();
              onNext(n);
            }}
            disabled={advancing}
          >
            <Icon name={n.ic as IconName} />
            {advancing ? "…" : n.label}
          </button>
        </div>
      ) : null}
    </div>
  );
}

function CertDrawer({
  item,
  advancing,
  onClose,
  onNext,
  onWithdraw,
  onAssign,
  onExtrasChange,
}: {
  item: PipelineItem;
  advancing: boolean;
  onClose: () => void;
  onNext: (step: NextStep) => void;
  onWithdraw: () => void;
  onAssign: () => void;
  onExtrasChange: () => void;
}) {
  const s = stageMeta(item.stage);
  const idx = STAGES.findIndex((x) => x.key === item.stage);
  const n = NEXT[item.stage];
  const secondary = SECONDARY[item.stage] ?? [];
  const [extras, setExtras] = useState<AppExtras>(() => getExtras(item.id));
  const desk = deskUrl("certification-application", item.id);

  useEffect(() => setExtras(getExtras(item.id)), [item.id]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const steps = SUBSTEPS[item.flow];
  const done = steps.filter((x) => extras.substeps[x.key]).length;

  return (
    <>
      <div className="cert-scrim show" onClick={onClose} />
      <aside className="cert-drawer show" role="dialog" aria-label={`${item.id} details`}>
        <div className="cert-drawer__h">
          <button className="x" type="button" onClick={onClose} aria-label="Close">
            ×
          </button>
          <div className="cert-drawer__ref">{item.id}</div>
          <div className="cert-drawer__co">{item.co}</div>
          <div className="cert-drawer__sub">
            {item.scheme} ·{" "}
            <span className="stagechip" style={{ background: s.chip[0], color: s.chip[1] }}>
              <span className="d" style={{ background: s.chip[1] }} />
              {s.label}
            </span>
          </div>
        </div>

        <div className="cert-drawer__b">
          <div className="dh">Lifecycle</div>
          <div className="timeline">
            {TIMELINE_STEPS.map((step, i) => {
              const cls = item.stage === "withdrawn" ? "todo" : i < idx ? "done" : i === idx ? "cur" : "todo";
              return (
                <div className={`tl-step ${cls}`} key={step[0]}>
                  <span className="tl-dot">{cls === "done" ? <Icon name="i-check" /> : null}</span>
                  <div>
                    <b>{step[0]}</b>
                    <span>{i === 2 && item.auditDate ? item.auditDate : step[1]}</span>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="dh">
            {FLOW_LABEL[item.flow]} checklist · {done}/{steps.length} (saved on this device only)
          </div>
          {steps.map((x) => (
            <label key={x.key} className="kv" style={{ cursor: "pointer", alignItems: "center" }}>
              <b style={{ display: "flex", gap: 8, alignItems: "center", fontWeight: 600 }}>
                <input
                  type="checkbox"
                  checked={!!extras.substeps[x.key]}
                  onChange={(e) => {
                    setExtras(setSubstep(item.id, x.key, e.target.checked));
                    onExtrasChange();
                  }}
                />
                {x.label}
              </b>
              <span style={{ color: "var(--muted-2)", fontSize: 12 }}>{STAGES.find((st) => st.key === x.stage)?.label}</span>
            </label>
          ))}

          <div className="dh">Details</div>
          <div className="kv">
            <b>Path</b>
            <span>
              <select
                className="sel"
                value={item.flow}
                onChange={(e) => {
                  setFlow(item.id, e.target.value as CertFlow);
                  onExtrasChange();
                }}
                aria-label="Certification path"
              >
                {(Object.keys(FLOW_LABEL) as CertFlow[]).map((f) => (
                  <option key={f} value={f}>
                    {FLOW_LABEL[f]}
                  </option>
                ))}
              </select>
            </span>
          </div>
          <div className="kv">
            <b>Scheme</b>
            <span>{item.scheme}</span>
          </div>
          <div className="kv">
            <b>Applied</b>
            <span>{item.applied}</span>
          </div>
          <div className="kv">
            <b>Service Charter</b>
            <span className={`sla ${item.sla}`}>
              <span className="d" />
              {item.slaText}
            </span>
          </div>
          <div className="kv">
            <b>Lead auditor</b>
            <span>
              {item.aud}{" "}
              <button type="button" className="btn ghost sm" onClick={onAssign} style={{ marginLeft: 6 }}>
                {item.aud === "Unassigned" ? "Assign" : "Change"}
              </button>
            </span>
          </div>
          {item.auditDate ? (
            <div className="kv">
              <b>Audit date</b>
              <span>{item.auditDate}</span>
            </div>
          ) : null}
          {extras.channel ? (
            <div className="kv">
              <b>Received via</b>
              <span>{extras.channel}</span>
            </div>
          ) : null}

          <div className="dh">Records</div>
          {desk ? (
            <div className="docrow">
              <Icon name="i-file" /> Application, documents &amp; comments{" "}
              <a className="dl" href={desk} target="_blank" rel="noopener noreferrer">
                Open in Desk
              </a>
            </div>
          ) : (
            <div className="docrow">
              <Icon name="i-file" /> Application documents are attached to the case in Desk.
            </div>
          )}
          <div className="docrow">
            <Icon name="i-clipboard" /> Audits &amp; findings{" "}
            <Link className="dl" to={`/certification/findings?open=${encodeURIComponent(item.id)}`}>
              Findings
            </Link>
          </div>
        </div>

        <div className="cert-drawer__f" style={{ flexWrap: "wrap" }}>
          {n ? (
            <button
              type="button"
              className={`btn ${n.cls === "gold" ? "gold" : "pri"}`}
              style={{ flex: 1 }}
              onClick={() => onNext(n)}
              disabled={advancing}
            >
              <Icon name={n.ic as IconName} />
              {advancing ? "…" : n.label}
            </button>
          ) : null}
          {secondary.map((x) => (
            <button key={x.label} type="button" className="btn ghost" onClick={() => onNext(x)} disabled={advancing}>
              {x.label}
            </button>
          ))}
          {item.stage !== "withdrawn" && item.stage !== "certified" && item.stage !== "surveillance" ? (
            <button type="button" className="btn ghost" onClick={onWithdraw} disabled={advancing} style={{ color: "var(--red)" }}>
              Withdraw
            </button>
          ) : null}
          <button type="button" className="btn ghost" onClick={onClose}>
            Close
          </button>
        </div>
      </aside>
    </>
  );
}

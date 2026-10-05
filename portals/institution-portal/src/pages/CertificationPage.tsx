import { useEffect, useMemo, useState } from "react";
import { apiFetch, AuthError, Icon, useDialogs, type IconName } from "@eswasaone/shared-ui";
import type { CertificationApplication } from "../api/types";
import { useApiResource } from "../hooks/useApiResource";
import { EmptyState, ErrorState, LoadingState } from "../components/PageStates";
import { RequireStaff } from "../components/RequireStaff";
import { useInstitution } from "../layout/InstitutionLayout";
import {
  STAGES,
  NEXT,
  TIMELINE_STEPS,
  auditorInitials,
  type CertStage,
  type PipelineItem,
  type SlaKind,
} from "../certification/pipeline";

type AppsResponse = { items?: CertificationApplication[] };

/** Map a live API application into the pipeline shape. */
function fromApi(a: CertificationApplication): PipelineItem {
  const stage = normalizeStage(a.status);
  const sla: SlaKind = "breach"; // TODO: wire real SLA signal
  return {
    id: a.id,
    co: a.applicant || a.id,
    scheme: a.scheme || "—",
    stage,
    aud: "Unassigned", // TODO: wire auditor
    sla,
    slaText: a.status?.toLowerCase() || "pending",
    applied: "—",
  };
}

function normalizeStage(status: string): CertStage {
  const s = status.toLowerCase();
  if (s.includes("submit")) return "submitted";
  if (s.includes("review")) return "review";
  if (s.includes("sched")) return "scheduled";
  if (s.includes("nc") || s.includes("corrective")) return "nc";
  if (s.includes("cert")) return "certified";
  if (s.includes("surveillance")) return "surveillance";
  return "submitted";
}

type ViewMode = "board" | "list";

export function CertificationPage() {
  const { openAuth, sessionKey, user } = useInstitution();
  const dialogs = useDialogs();
  const apps = useApiResource<AppsResponse>("/certification/applications", {
    enabled: Boolean(user),
    refreshKey: sessionKey,
  });
  const [view, setView] = useState<ViewMode>("board");
  const [items, setItems] = useState<PipelineItem[]>([]);
  const [advancing, setAdvancing] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [schemeFilter, setSchemeFilter] = useState("");
  const [auditorFilter, setAuditorFilter] = useState("");
  const [slaFilter, setSlaFilter] = useState("");
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (apps.authRequired) openAuth("Staff sign-in required for certification");
  }, [apps.authRequired, openAuth]);

  useEffect(() => {
    if (apps.data) {
      setItems((apps.data.items ?? []).map(fromApi));
    }
  }, [apps.data]);

  const filtered = useMemo(() => {
    return items.filter((it) => {
      if (schemeFilter && !it.scheme.toLowerCase().includes(schemeFilter.toLowerCase())) return false;
      if (auditorFilter && it.aud !== auditorFilter) return false;
      if (slaFilter && it.sla !== slaFilter) return false;
      if (search) {
        const hay = `${it.id} ${it.co} ${it.scheme}`.toLowerCase();
        if (!hay.includes(search.toLowerCase())) return false;
      }
      return true;
    });
  }, [items, schemeFilter, auditorFilter, slaFilter, search]);

  const openItem = items.find((i) => i.id === openId) ?? null;

  async function advance(it: PipelineItem) {
    const n = NEXT[it.stage];
    if (!n.to) {
      setFlash(`Opening certificate for ${it.id}`);
      return;
    }
    const ok = await dialogs.confirm({
      title: n.label,
      message: `${n.label} for ${it.id}?\n\nThis will update the application and notify the team.`,
      confirmLabel: n.label,
    });
    if (!ok) return;
    setAdvancing(it.id);
    setFlash(null);
    try {
      await apiFetch(
        `/certification/applications/${encodeURIComponent(it.id)}/advance`,
        { method: "POST", body: JSON.stringify({ confirm: true, action: n.label }) },
      );
      setItems((prev) =>
        prev.map((x) =>
          x.id === it.id
            ? { ...x, stage: n.to as CertStage, sla: "ok", slaText: "moved just now", nc: 0 }
            : x,
        ),
      );
      setFlash(`${n.label} → ${it.id}`);
    } catch (err) {
      if (err instanceof AuthError && err.authRequired) openAuth(err.reason);
      else setFlash(err instanceof Error ? err.message : "Advance failed");
    } finally {
      setAdvancing(null);
    }
  }

  function advanceTo(it: PipelineItem, to: CertStage) {
    setItems((prev) =>
      prev.map((x) => (x.id === it.id ? { ...x, stage: to, sla: "due", slaText: "surveillance scheduled" } : x)),
    );
    setFlash(`Surveillance scheduled → ${it.id}`);
  }

  const schemes = useMemo(() => Array.from(new Set(items.map((i) => i.scheme))).sort(), [items]);
  const auditors = useMemo(
    () => Array.from(new Set(items.map((i) => i.aud))).filter((a) => a !== "Unassigned").sort(),
    [items],
  );

  return (
    <RequireStaff reason="Staff sign-in required for certification">
      {apps.loading ? (
        <LoadingState label="Loading certification pipeline…" />
      ) : apps.error ? (
        <ErrorState message={apps.error} onRetry={apps.reload} />
      ) : (
        <>
          <div className="cert-head">
            <div>
              <h2>Certification pipeline</h2>
              <p>Where every application sits. The next step is the only button.</p>
            </div>
            <div className="r">
              <div className="viewtog">
                <button
                  type="button"
                  className={view === "board" ? "on" : ""}
                  onClick={() => setView("board")}
                >
                  <Icon name="i-board" /> Pipeline
                </button>
                <button
                  type="button"
                  className={view === "list" ? "on" : ""}
                  onClick={() => setView("list")}
                >
                  <Icon name="i-list" /> List
                </button>
              </div>
              <button type="button" className="btn gold">
                <Icon name="i-plus" /> New application
              </button>
            </div>
          </div>
{flash ? (
            <p className="tagpill" style={{ marginBottom: 12, display: "inline-block" }}>
              {flash}
            </p>
          ) : null}

          <div className="cert-filters">
            <select
              className="sel"
              value={schemeFilter}
              onChange={(e) => setSchemeFilter(e.target.value)}
            >
              <option value="">All schemes</option>
              {schemes.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
            <select
              className="sel"
              value={auditorFilter}
              onChange={(e) => setAuditorFilter(e.target.value)}
            >
              <option value="">All auditors</option>
              {auditors.map((a) => (
                <option key={a} value={a}>{a}</option>
              ))}
              <option value="Unassigned">Unassigned</option>
            </select>
            <select
              className="sel"
              value={slaFilter}
              onChange={(e) => setSlaFilter(e.target.value)}
            >
              <option value="">SLA: all</option>
              <option value="breach">Breached</option>
              <option value="due">Due soon</option>
              <option value="ok">On track</option>
            </select>
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
            <EmptyState title="No applications match" detail="Adjust the filters above." />
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
                            onAdvance={() => void advance(it)}
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
                    <th>Scheme</th>
                    <th>Stage</th>
                    <th>Auditor</th>
                    <th>SLA</th>
                    <th>Next step</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((it) => {
                    const s = STAGES.find((x) => x.key === it.stage)!;
                    const n = NEXT[it.stage];
                    return (
                      <tr key={it.id} onClick={() => setOpenId(it.id)}>
                        <td className="mono" style={{ fontWeight: 700 }}>{it.id}</td>
                        <td style={{ fontWeight: 700 }}>{it.co}</td>
                        <td>{it.scheme}</td>
                        <td>
                          <span
                            className="stagechip"
                            style={{ background: s.chip[0], color: s.chip[1] }}
                          >
                            <span className="d" style={{ background: s.chip[1] }} />
                            {s.label}
                            {it.nc ? ` · ${it.nc} NC` : ""}
                          </span>
                        </td>
                        <td>{it.aud}</td>
                        <td>
                          <span className={`sla ${it.sla}`}>
                            <span className="d" />
                            {it.slaText}
                          </span>
                        </td>
                        <td>
                          <button
                            type="button"
                            className={`btn ${n.cls === "gold" ? "gold" : "pri"} sm`}
                            onClick={(e) => {
                              e.stopPropagation();
                              void advance(it);
                            }}
                            disabled={advancing === it.id}
                          >
                            {advancing === it.id ? "…" : n.label}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* Drawer */}
          {openItem ? (
            <CertDrawer
              item={openItem}
              advancing={advancing === openItem.id}
              onClose={() => setOpenId(null)}
              onAdvance={() => void advance(openItem)}
              onSurveillance={() => advanceTo(openItem, "surveillance")}
            />
          ) : null}
        </>
      )}
    </RequireStaff>
  );
}

function PipelineCard({
  item,
  advancing,
  onOpen,
  onAdvance,
}: {
  item: PipelineItem;
  advancing: boolean;
  onOpen: () => void;
  onAdvance: () => void;
}) {
  const n = NEXT[item.stage];
  return (
    <div
      className={`cardc${item.sla === "breach" ? " breach" : ""}`}
      onClick={onOpen}
    >
      <div className="cardc__top">
        <span className="cardc__ref">{item.id}</span>
        {item.nc ? <span className="cardc__nc">{item.nc} NC open</span> : null}
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
      <div className="cardc__act">
        <button
          type="button"
          className={`act-btn ${n.cls}`}
          onClick={(e) => {
            e.stopPropagation();
            onAdvance();
          }}
          disabled={advancing}
        >
          <Icon name={n.ic as IconName} />
          {advancing ? "…" : n.label}
        </button>
        {item.stage === "certified" ? (
          <button
            type="button"
            className="act-btn ghost"
            onClick={(e) => {
              e.stopPropagation();
              onOpen();
            }}
          >
            Surveillance
          </button>
        ) : null}
      </div>
    </div>
  );
}

function CertDrawer({
  item,
  advancing,
  onClose,
  onAdvance,
  onSurveillance,
}: {
  item: PipelineItem;
  advancing: boolean;
  onClose: () => void;
  onAdvance: () => void;
  onSurveillance: () => void;
}) {
  const s = STAGES.find((x) => x.key === item.stage)!;
  const idx = STAGES.findIndex((x) => x.key === item.stage);
  const n = NEXT[item.stage];

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <>
      <div className="cert-scrim show" onClick={onClose} />
      <aside className="cert-drawer show" role="dialog" aria-label={`${item.id} details`}>
        <div className="cert-drawer__h">
          <button className="x" type="button" onClick={onClose} aria-label="Close">×</button>
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
              const cls = i < idx ? "done" : i === idx ? "cur" : "todo";
              return (
                <div className={`tl-step ${cls}`} key={step[0]}>
                  <span className="tl-dot">
                    {i < idx ? <Icon name="i-check" /> : null}
                  </span>
                  <div>
                    <b>{step[0]}</b>
                    <span>
                      {i === 2 && item.auditDate ? item.auditDate
                        : i === 3 && item.nc ? `${item.nc} findings open`
                        : i === 4 && item.cert ? item.cert
                        : step[1]}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="dh">Details</div>
          <div className="kv"><b>Scheme</b><span>{item.scheme}</span></div>
          <div className="kv"><b>Applied</b><span>{item.applied}</span></div>
          <div className="kv"><b>Auditor</b><span>{item.aud}</span></div>
          {item.auditDate ? <div className="kv"><b>Audit date</b><span>{item.auditDate}</span></div> : null}
          {item.cert ? <div className="kv"><b>Certificate</b><span className="mono">{item.cert}</span></div> : null}
          {item.nc ? (
            <div className="kv"><b>Open NCs</b><span style={{ color: "var(--red)", fontWeight: 700 }}>{item.nc}</span></div>
          ) : null}

          <div className="dh">Documents</div>
          <div className="docrow"><Icon name="i-file" /> Application form <a className="dl">View</a></div>
          <div className="docrow"><Icon name="i-file" /> Audit report <a className="dl">View</a></div>
          <div className="docrow"><Icon name="i-award" /> Certificate (PDF + QR) <a className="dl">Download</a></div>
        </div>

        <div className="cert-drawer__f">
          <button
            type="button"
            className={`btn ${n.cls === "gold" ? "gold" : "pri"}`}
            style={{ flex: 1 }}
            onClick={onAdvance}
            disabled={advancing}
          >
            <Icon name={n.ic as IconName} />
            {advancing ? "…" : n.label}
          </button>
          {item.stage === "certified" ? (
            <button type="button" className="btn ghost" onClick={onSurveillance}>
              Surveillance
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
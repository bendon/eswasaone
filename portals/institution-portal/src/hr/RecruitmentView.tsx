import { useEffect, useMemo, useState, type FormEvent } from "react";
import { apiFetch, AuthError, Icon, RecordDrawer, useDialogs, type DrawerSection } from "@eswasaone/shared-ui";
import { useApiResource } from "../hooks/useApiResource";
import { EmptyState, ResourceGate } from "../components/PageStates";
import { RequireStaff } from "../components/RequireStaff";
import { useInstitution } from "../layout/InstitutionLayout";
import type { components } from "@contracts";
import { PIPELINE_STAGES } from "./helpers";

type HrJobOpening = components["schemas"]["HrJobOpening"];
type HrApplicant = components["schemas"]["HrApplicant"];

const STAGE_ORDER = ["Open", "Applied", "Screening", "Interview", "Offer", "Accepted", "Hired"];

function stageIndex(status: string): number {
  const s = status.trim();
  const aliases: Record<string, string> = { Replied: "Screening", Hold: "Screening" };
  const key = aliases[s] || s;
  const i = STAGE_ORDER.findIndex((x) => x.toLowerCase() === key.toLowerCase());
  if (i >= 0) return Math.min(i, PIPELINE_STAGES.length - 1);
  // Map unknown into Applied column
  return 0;
}

function nextStage(status: string): string {
  const i = stageIndex(status);
  return STAGE_ORDER[Math.min(i + 1, STAGE_ORDER.length - 1)];
}

/** Recruitment — Job Opening / Job Applicant via Core → HRMS. */
export function RecruitmentView() {
  const { openAuth, user, sessionKey } = useInstitution();
  const dialogs = useDialogs();
  const jobsRes = useApiResource<{ items: HrJobOpening[] }>("/hr/jobs", {
    enabled: Boolean(user),
    refreshKey: sessionKey,
  });
  const appsRes = useApiResource<{ items: HrApplicant[] }>("/hr/applicants?limit=80", {
    enabled: Boolean(user),
    refreshKey: sessionKey,
  });

  const [showPost, setShowPost] = useState(false);
  const [title, setTitle] = useState("");
  const [department, setDepartment] = useState("");
  const [designation, setDesignation] = useState("");
  const [vacancies, setVacancies] = useState(1);
  const [busy, setBusy] = useState(false);
  const [advancing, setAdvancing] = useState<string | null>(null);
  const [openJob, setOpenJob] = useState<string | null>(null);

  useEffect(() => {
    if (jobsRes.authRequired || appsRes.authRequired) openAuth("Staff sign-in required");
  }, [jobsRes.authRequired, appsRes.authRequired, openAuth]);

  const jobs: HrJobOpening[] = jobsRes.data?.items ?? [];

  const applicants: HrApplicant[] = appsRes.data?.items ?? [];

  const selectedJob = jobs.find((j) => j.id === openJob) ?? null;
  const focusJobTitle = selectedJob?.job_title || jobs[0]?.job_title;

  const pipelineApps = useMemo(() => {
    if (!focusJobTitle) return applicants;
    const filtered = applicants.filter(
      (a) => !a.job || a.job.toLowerCase().includes(focusJobTitle.toLowerCase().slice(0, 12)),
    );
    return filtered.length ? filtered : applicants;
  }, [applicants, focusJobTitle]);

  async function postJob(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await apiFetch<HrJobOpening>("/hr/jobs", {
        method: "POST",
        body: JSON.stringify({
          job_title: title.trim(),
          department: department.trim() || undefined,
          designation: designation.trim() || undefined,
          vacancies,
          confirm: true,
        }),
      });
      await dialogs.alert({
        message: `Posted “${title.trim()}”`,
        kind: "success",
      });
      setTitle("");
      setDepartment("");
      setDesignation("");
      setShowPost(false);
      jobsRes.reload();
    } catch (err) {
      if (err instanceof AuthError && err.authRequired) openAuth(err.reason);
      else
        await dialogs.alert({
          message: err instanceof Error ? err.message : "Could not post job",
          kind: "error",
        });
    } finally {
      setBusy(false);
    }
  }

  async function advance(app: HrApplicant) {
    const stage = nextStage(app.status);
    const ok = await dialogs.confirm({
      title: "Advance applicant",
      message: `Advance ${app.applicant_name} to ${stage}?`,
      confirmLabel: "Advance",
    });
    if (!ok) return;
    setAdvancing(app.id);
    try {
      await apiFetch<HrApplicant>(`/hr/applicants/${encodeURIComponent(app.id)}/advance`, {
        method: "POST",
        body: JSON.stringify({ stage, confirm: true }),
      });
      await dialogs.alert({
        message: `${app.applicant_name} → ${stage}`,
        kind: "success",
      });
      appsRes.reload();
    } catch (err) {
      if (err instanceof AuthError && err.authRequired) openAuth(err.reason);
      else
        await dialogs.alert({
          message: err instanceof Error ? err.message : "Advance failed",
          kind: "error",
        });
    } finally {
      setAdvancing(null);
    }
  }

  const drawerSections: DrawerSection[] = selectedJob
    ? [
        {
          heading: "Job opening",
          content: (
            <>
              <div className="kv">
                <b>Reference</b>
                <span className="mono">{selectedJob.id}</span>
              </div>
              <div className="kv">
                <b>Title</b>
                <span>{selectedJob.job_title}</span>
              </div>
              <div className="kv">
                <b>Department</b>
                <span>{selectedJob.department || "—"}</span>
              </div>
              <div className="kv">
                <b>Status</b>
                <span>{selectedJob.status}</span>
              </div>
            </>
          ),
        },
      ]
    : [];

  const loading = jobsRes.loading && appsRes.loading;
  const error = jobsRes.error || appsRes.error;

  return (
    <RequireStaff reason="Staff sign-in required">
      <ResourceGate
        loading={loading}
        refreshing={jobsRes.refreshing || appsRes.refreshing}
        error={error}
        onRetry={() => {
          jobsRes.reload();
          appsRes.reload();
        }}
        hasData={jobsRes.data != null || appsRes.data != null}
        skeleton="list"
        label="Loading recruitment…"
      >
        <div className="hr">
          {dialogs.host}

          <div className="hr-box" style={{ marginBottom: 16 }}>
            <div className="hr-box__h">
              <div>
                <h3>Open positions</h3>
                <p>
                  {jobs.length} opening{jobs.length === 1 ? "" : "s"} · {applicants.length} applicants
                </p>
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button type="button" className="btn gold sm" onClick={() => setShowPost((v) => !v)}>
                  <Icon name="i-plus" />
                  Post a job
                </button>
              </div>
            </div>

            {showPost ? (
              <div className="hr-box__b">
                <form className="hr-invite" onSubmit={(e) => void postJob(e)} style={{ margin: 0 }}>
                  <label>
                    Job title
                    <input required value={title} onChange={(e) => setTitle(e.target.value)} />
                  </label>
                  <label>
                    Department
                    <input value={department} onChange={(e) => setDepartment(e.target.value)} />
                  </label>
                  <label>
                    Designation
                    <input value={designation} onChange={(e) => setDesignation(e.target.value)} />
                  </label>
                  <label>
                    Vacancies
                    <input
                      type="number"
                      min={1}
                      value={vacancies}
                      onChange={(e) => setVacancies(Number(e.target.value) || 1)}
                    />
                  </label>
                  <button type="submit" className="btn pri" disabled={busy}>
                    {busy ? "Saving…" : "Create opening"}
                  </button>
                </form>
              </div>
            ) : null}

            <div className="hr-box__b" style={{ paddingTop: 0, overflowX: "auto" }}>
              {jobs.length === 0 ? (
                <EmptyState
                  title="No open positions"
                  detail="Post a job opening here. Your permissions decide who can publish and advance applicants."
                />
              ) : (
                <table className="hr-table">
                  <thead>
                    <tr>
                      <th>Role</th>
                      <th>Department</th>
                      <th>Status</th>
                      <th>Vacancies</th>
                      <th style={{ textAlign: "right" }} />
                    </tr>
                  </thead>
                  <tbody>
                    {jobs.map((j) => (
                      <tr key={j.id}>
                        <td style={{ fontWeight: 700 }}>{j.job_title}</td>
                        <td>{j.department || "—"}</td>
                        <td>{j.status}</td>
                        <td className="mono">{j.vacancies ?? "—"}</td>
                        <td style={{ textAlign: "right" }}>
                          <button
                            type="button"
                            className="btn ghost sm"
                            onClick={() => setOpenJob(j.id)}
                          >
                            View
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>

          <h3 style={{ fontSize: 15, fontWeight: 800, marginBottom: 12 }}>
            Applicant pipeline{focusJobTitle ? `: ${focusJobTitle}` : ""}
          </h3>
          <div className="hr-board">
            {PIPELINE_STAGES.map((stage, si) => {
              const items = pipelineApps.filter((a) => stageIndex(a.status) === si);
              return (
                <div key={stage.label} className="hr-col">
                  <div className="hr-col__h">
                    <span className="dot" style={{ background: stage.color }} />
                    <b>{stage.label}</b>
                    <span className="c">{items.length}</span>
                  </div>
                  {items.length === 0 ? (
                    <div style={{ fontSize: 11, color: "var(--muted-2)", padding: 6 }}>—</div>
                  ) : (
                    items.map((a) => (
                      <div key={a.id} className="hr-appc">
                        <b>{a.applicant_name}</b>
                        <div className="role">{a.job || "—"}</div>
                        <div className="meta">{a.status}</div>
                        {si < PIPELINE_STAGES.length - 1 ? (
                          <button
                            type="button"
                            className="btn pri sm"
                            style={{ width: "100%", marginTop: 10, minHeight: 30 }}
                            disabled={advancing === a.id}
                            onClick={() => void advance(a)}
                          >
                            {advancing === a.id ? "…" : "Advance →"}
                          </button>
                        ) : (
                          <div style={{ marginTop: 8 }}>
                            <span className="hr-st ok">
                              <span className="d" />
                              Hired
                            </span>
                          </div>
                        )}
                      </div>
                    ))
                  )}
                </div>
              );
            })}
          </div>

          <RecordDrawer
            open={!!selectedJob}
            onClose={() => setOpenJob(null)}
            reference={selectedJob?.id}
            title={selectedJob?.job_title ?? ""}
            subtitle={selectedJob ? <span className="stagechip">{selectedJob.status}</span> : null}
            sections={drawerSections}
          />
        </div>
      </ResourceGate>
    </RequireStaff>
  );
}

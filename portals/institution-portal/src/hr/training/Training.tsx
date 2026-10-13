import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { FormDrawer, type FormDrawerField } from "@eswasaone/shared-ui";
import { useApiResource } from "../../hooks/useApiResource";
import { EmptyState, ResourceGate } from "../../components/PageStates";
import { RequireStaff } from "../../components/RequireStaff";
import { useInstitution } from "../../layout/InstitutionLayout";
import type {
  HrTrainingEvent,
  HrTrainingNeed,
  HrTrainingNeedList,
  HrTrainingPlan,
  HrTrainingPlanList,
  HrTrainingPlanStatus,
} from "../../api/types";
import { Banner, Crumbs, fmtDay, StatusPill, Track, type TrackStep } from "../../me/parts";
import { errorText, hrSend } from "../api";

/**
 * Training plan (HR additions plan 05, H17): department plans per year, a plan with its lines and who decides, the
 * new-plan stepper, an event with nominations, attendance and cost, and the needs list. Approve and send back
 * happen in Approvals only ("Approve training plan …"); the approver is a named HR Manager other than the
 * preparer, provisional until ESWASA answers A6. Cost is recorded only; the training budget is Finance's.
 */

const PLAN_CLS: Record<HrTrainingPlanStatus, string> = { Draft: "mute", Waiting: "leave", Approved: "ok", "Sent back": "bad" };
const NEED_CLS: Record<string, string> = { Open: "info", Planned: "leave", Met: "ok", Dropped: "mute" };
const QUARTERS = ["Q1", "Q2", "Q3", "Q4"];
const REASONS = ["Need", "Compliance", "Accreditation", "Development"];
const EVENT_TYPES = ["Seminar", "Theory", "Workshop", "Conference", "Exam", "Internet", "Self-Study"];

export const money = (n?: number | null) => (n ?? 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function PlanStatus({ status }: { status: HrTrainingPlanStatus }) {
  return <StatusPill cls={PLAN_CLS[status] ?? "info"} label={status === "Waiting" ? "Waiting for approval" : status} />;
}

export function NeedStatus({ n }: { n: HrTrainingNeed }) {
  return <StatusPill cls={NEED_CLS[n.status] ?? "info"} label={n.status} />;
}

function TrainingSwitch({ current }: { current: "plans" | "needs" }) {
  const navigate = useNavigate();
  const views: Array<["plans" | "needs", string, string]> = [
    ["plans", "Plans", "/hr/training"],
    ["needs", "Needs", "/hr/training/needs"],
  ];
  return (
    <nav className="hr-struct-tabs" aria-label="Training views">
      {views.map(([id, text, to]) => (
        <button key={id} type="button" className={current === id ? "on" : undefined} aria-current={current === id ? "page" : undefined} onClick={() => navigate(to)}>
          {text}
        </button>
      ))}
    </nav>
  );
}

export function NeedsTable({ needs, person = true }: { needs: HrTrainingNeed[]; person?: boolean }) {
  return (
    <div className="hr-box hr-scroll">
      <table className="hr-table">
        <thead>
          <tr>
            {person ? <th>Person</th> : null}
            <th>Training needed</th>
            <th>From</th>
            <th>Priority</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {needs.map((n) => (
            <tr key={n.name}>
              {person ? (
                <td>
                  {n.employee_name ?? n.employee}
                  {n.department ? <div className="sub">{n.department}</div> : null}
                </td>
              ) : null}
              <td>
                {n.topic}
                {n.skill ? <div className="sub">Competence: {n.skill}</div> : null}
              </td>
              <td>{n.source}</td>
              <td>{n.priority ?? "—"}</td>
              <td>
                <NeedStatus n={n} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** H17 Training tab: one row per department for the chosen year, with status and estimated against actual cost. */
export function TrainingPlans() {
  const { user, sessionKey } = useInstitution();
  const [params, setParams] = useSearchParams();
  const year = params.get("year") ?? "";
  const res = useApiResource<HrTrainingPlanList>(`/hr/training/plans${year ? `?year=${encodeURIComponent(year)}` : ""}`, { enabled: Boolean(user), refreshKey: sessionKey });
  const d = res.data;
  const shownYear = year || d?.years[0] || "";
  const plans = (d?.plans ?? []).filter((p) => !shownYear || p.year === shownYear);
  const missing = (d?.departments ?? []).filter((dep) => !plans.some((p) => p.department === dep));
  return (
    <RequireStaff reason="Staff sign-in required">
      <div className="hr hr-view">
        <TrainingSwitch current="plans" />
        <div className="hr-head">
          <div>
            <h2>Training plans</h2>
            <p>{d ? `${d.waiting} waiting for approval.` : "Each department's yearly training plan."}</p>
          </div>
          <div className="hr-head__r">
            <label className="hr-f" style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
              <span>Year</span>
              <select className="hr-in" aria-label="Year" value={shownYear} onChange={(e) => setParams(e.target.value ? { year: e.target.value } : {}, { replace: true })}>
                {(d?.years ?? []).map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>
            </label>
            {d?.can_prepare ? (
              <Link className="btn pri" to={`/hr/training/plans/new${shownYear ? `?year=${encodeURIComponent(shownYear)}` : ""}`}>
                New plan
              </Link>
            ) : null}
          </div>
        </div>
        <ResourceGate loading={res.loading} error={res.error} onRetry={res.reload} refreshing={res.refreshing} hasData={Boolean(d)} skeleton="list">
          {d ? (
            <>
              {d.approver_note ? <p className="hr-note">{d.approver_note}</p> : null}
              {!d.years.length ? (
                <EmptyState title="No fiscal years yet" detail="Add this year's Fiscal Year in Desk, then prepare the department plans." />
              ) : plans.length || missing.length ? (
                <div className="hr-box hr-scroll">
                  <table className="hr-table">
                    <thead>
                      <tr>
                        <th>Department</th>
                        <th>Status</th>
                        <th>Lines</th>
                        <th>People</th>
                        <th>Estimated cost</th>
                        <th>Actual cost</th>
                      </tr>
                    </thead>
                    <tbody>
                      {plans.map((p) => (
                        <tr key={p.name}>
                          <td>
                            <Link className="hr-lnk" to={`/hr/training/plans/${encodeURIComponent(p.name)}`}>
                              {p.department}
                            </Link>
                          </td>
                          <td>
                            <PlanStatus status={p.status} />
                          </td>
                          <td>
                            {p.totals.lines}
                            {p.totals.scheduled ? <div className="sub">{p.totals.scheduled} scheduled</div> : null}
                          </td>
                          <td>{p.totals.people}</td>
                          <td>{money(p.totals.estimated)}</td>
                          <td>{p.totals.scheduled ? money(p.totals.actual) : "—"}</td>
                        </tr>
                      ))}
                      {missing.map((dep) => (
                        <tr key={dep}>
                          <td>{dep}</td>
                          <td>
                            <StatusPill cls="mute" label="No plan" />
                          </td>
                          <td colSpan={4}>
                            {d.can_prepare ? (
                              <Link className="hr-lnk" to={`/hr/training/plans/new?department=${encodeURIComponent(dep)}&year=${encodeURIComponent(shownYear)}`}>
                                Prepare the plan
                              </Link>
                            ) : null}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <EmptyState title="No plans yet" detail="Department training plans for this year appear here." />
              )}
            </>
          ) : null}
        </ResourceGate>
      </div>
    </RequireStaff>
  );
}

function planTrack(p: HrTrainingPlan): TrackStep[] {
  const sent = p.status !== "Draft" && p.status !== "Sent back";
  return [
    { title: "Prepared", detail: p.prepared_by ?? undefined, state: "done" },
    {
      title: p.status === "Sent back" ? "Sent back" : "Waiting for approval",
      detail: p.status === "Waiting" ? (p.deciders.length ? `In Approvals for ${p.deciders.join(", ")}` : undefined) : p.decision_note ?? undefined,
      state: p.status === "Waiting" || p.status === "Sent back" ? "now" : sent ? "done" : undefined,
    },
    { title: "Approved", detail: p.approved_by ? `By ${p.approved_by}${p.decided_on ? `, ${fmtDay(p.decided_on, true)}` : ""}` : undefined, state: p.status === "Approved" ? "done" : undefined },
  ];
}

function ScheduleDrawer({ plan, line, onClose, onDone }: { plan: string; line: { name: string; topic: string } | null; onClose: () => void; onDone: (p: HrTrainingPlan) => void }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const fields: FormDrawerField[] = [
    { name: "start", label: "Starts", type: "date", required: true },
    { name: "end", label: "Ends", type: "date", required: true },
    { name: "venue", label: "Venue" },
    { name: "trainer", label: "Trainer or provider" },
    { name: "event_type", label: "Kind of training", type: "select", options: EVENT_TYPES.map((t) => ({ value: t, label: t })) },
  ];
  async function submit(v: Record<string, string>) {
    if (!line) return;
    setBusy(true);
    setErr(null);
    try {
      onDone(
        await hrSend<HrTrainingPlan>(`/hr/training/plans/${encodeURIComponent(plan)}/lines/${encodeURIComponent(line.name)}/schedule`, {
          start: v.start,
          end: v.end,
          venue: v.venue?.trim() || null,
          trainer: v.trainer?.trim() || null,
          event_type: v.event_type || null,
        }),
      );
    } catch (e) {
      setErr(errorText(e, "Not scheduled."));
    } finally {
      setBusy(false);
    }
  }
  return (
    <FormDrawer
      key={line?.name ?? "closed"}
      open={Boolean(line)}
      title={line ? `Schedule ${line.topic}` : "Schedule"}
      mode="create"
      submitLabel="Schedule"
      fields={fields}
      busy={busy}
      error={err}
      onClose={onClose}
      onSubmit={submit}
    >
      <p className="hr-note">This creates the training event. Line managers can then nominate their people.</p>
    </FormDrawer>
  );
}

/** Plan detail: lines, status, who decides, and Schedule per approved line. */
export function TrainingPlanDetail() {
  const { id = "" } = useParams();
  const { user, sessionKey } = useInstitution();
  const res = useApiResource<HrTrainingPlan>(`/hr/training/plans/${encodeURIComponent(id)}`, { enabled: Boolean(user), refreshKey: sessionKey });
  const [d, setD] = useState<HrTrainingPlan | null>(null);
  const p = d ?? res.data;
  const [scheduling, setScheduling] = useState<{ name: string; topic: string } | null>(null);
  return (
    <RequireStaff reason="Staff sign-in required">
      <div className="hr hr-view">
        <Crumbs items={[["Training", "/hr/training"], [p ? `${p.department} ${p.year}` : id]]} />
        <ResourceGate loading={res.loading} error={res.error} onRetry={res.reload} refreshing={res.refreshing} hasData={Boolean(p)} skeleton="panel">
          {p ? (
            <>
              <div className="hr-head">
                <div>
                  <h2>
                    Training plan: {p.department} {p.year}
                  </h2>
                  <p>
                    {p.totals.lines} line{p.totals.lines === 1 ? "" : "s"}, {p.totals.people} people. Estimated {money(p.totals.estimated)}
                    {p.totals.scheduled ? `, actual so far ${money(p.totals.actual)}` : ""}.
                  </p>
                </div>
                <div className="hr-head__r">
                  <PlanStatus status={p.status} />
                  {p.can_edit ? (
                    <Link className="btn ghost" to={`/hr/training/plans/new?plan=${encodeURIComponent(p.name)}`}>
                      Edit plan
                    </Link>
                  ) : null}
                </div>
              </div>
              <Track steps={planTrack(p)} />
              {p.status === "Waiting" ? (
                <Banner kind="info" title="Waiting for an HR Manager">
                  {p.deciders.length ? `${p.deciders.join(", ")} decide${p.deciders.length === 1 ? "s" : ""} in Approvals.` : "No other HR Manager can decide yet."}{" "}
                  {p.approver_note ?? ""}
                </Banner>
              ) : null}
              {p.status === "Sent back" && p.decision_note ? (
                <Banner kind="bad" title="Sent back">
                  {p.decision_note}
                </Banner>
              ) : null}
              {p.note ? <p className="hr-note">{p.note}</p> : null}
              <div className="hr-box hr-scroll">
                <table className="hr-table">
                  <thead>
                    <tr>
                      <th>Training</th>
                      <th>Quarter</th>
                      <th>Why</th>
                      <th>People</th>
                      <th>Estimated cost</th>
                      <th>Event</th>
                    </tr>
                  </thead>
                  <tbody>
                    {p.lines.map((ln) => (
                      <tr key={ln.name}>
                        <td>
                          {ln.topic}
                          {ln.provider ? <div className="sub">{ln.provider}</div> : null}
                          {ln.needs.length ? <div className="sub">Needs: {ln.needs.map((n) => n.employee_name ?? n.employee).join(", ")}</div> : null}
                        </td>
                        <td>{ln.quarter ?? "—"}</td>
                        <td>{ln.reason ?? "—"}</td>
                        <td>{ln.people ?? "—"}</td>
                        <td>
                          {money((ln.estimated_direct ?? 0) + (ln.estimated_indirect ?? 0))}
                          <div className="sub">
                            {money(ln.estimated_direct)} direct, {money(ln.estimated_indirect)} indirect
                          </div>
                        </td>
                        <td>
                          {ln.event ? (
                            <Link className="hr-lnk" to={`/hr/training/events/${encodeURIComponent(ln.event)}`}>
                              {ln.start_time ? fmtDay(ln.start_time, true) : "Open event"}
                            </Link>
                          ) : ln.can_schedule ? (
                            <button type="button" className="btn ghost sm" onClick={() => setScheduling({ name: ln.name, topic: ln.topic })}>
                              Schedule
                            </button>
                          ) : (
                            "—"
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <ScheduleDrawer
                plan={p.name}
                line={scheduling}
                onClose={() => setScheduling(null)}
                onDone={(next) => {
                  setD(next);
                  setScheduling(null);
                }}
              />
            </>
          ) : null}
        </ResourceGate>
      </div>
    </RequireStaff>
  );
}

type DraftLine = {
  topic: string;
  quarter: string;
  reason: string;
  people: string;
  provider: string;
  estimated_direct: string;
  estimated_indirect: string;
  needs: string[];
};

const blankLine = (topic = "", needs: string[] = []): DraftLine => ({
  topic,
  quarter: "",
  reason: needs.length ? "Need" : "Development",
  people: needs.length ? String(needs.length) : "",
  provider: "",
  estimated_direct: "",
  estimated_indirect: "",
  needs,
});

/** One line per topic among the picked needs, with those needs attached. */
export function linesFromNeeds(needs: HrTrainingNeed[]): DraftLine[] {
  const byTopic = new Map<string, string[]>();
  for (const n of needs) byTopic.set(n.topic, [...(byTopic.get(n.topic) ?? []), n.name]);
  return [...byTopic].map(([topic, names]) => blankLine(topic, names));
}

/** New plan (Track): department and year, then needs to pick from, then lines, then review and send. */
export function NewTrainingPlan() {
  const { user, sessionKey } = useInstitution();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const editing = params.get("plan") ?? "";
  const list = useApiResource<HrTrainingPlanList>("/hr/training/plans", { enabled: Boolean(user), refreshKey: sessionKey });
  const existing = useApiResource<HrTrainingPlan>(`/hr/training/plans/${encodeURIComponent(editing)}`, { enabled: Boolean(user && editing), refreshKey: sessionKey });
  const [step, setStep] = useState(0);
  const [department, setDepartment] = useState(params.get("department") ?? "");
  const [year, setYear] = useState(params.get("year") ?? "");
  const [picked, setPicked] = useState<string[]>([]);
  const [lines, setLines] = useState<DraftLine[]>([]);
  const [note, setNote] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const needsRes = useApiResource<HrTrainingNeedList>(`/hr/training/needs?department=${encodeURIComponent(department)}`, {
    enabled: Boolean(user && department && step >= 1),
    refreshKey: sessionKey,
  });
  const pickable = useMemo(() => (needsRes.data?.needs ?? []).filter((n) => n.status === "Open" || n.plan === editing), [needsRes.data, editing]);

  const ex = existing.data;
  useEffect(() => {
    if (!editing || !ex || loaded) return;
    setLoaded(true);
    setDepartment(ex.department);
    setYear(ex.year);
    setNote(ex.note ?? "");
    setPicked(ex.lines.flatMap((l) => l.needs.map((n) => n.name)));
    setLines(
      ex.lines.map((l) => ({
        topic: l.topic,
        quarter: l.quarter ?? "",
        reason: l.reason ?? "Need",
        people: l.people != null ? String(l.people) : "",
        provider: l.provider ?? "",
        estimated_direct: String(l.estimated_direct ?? ""),
        estimated_indirect: String(l.estimated_indirect ?? ""),
        needs: l.needs.map((n) => n.name),
      })),
    );
  }, [editing, ex, loaded]);

  const years = list.data?.years ?? [];
  const departments = list.data?.departments ?? [];
  const steps = ["Department and year", "Needs", "Lines", "Review"];
  const track: TrackStep[] = steps.map((t, i) => ({ title: t, state: i < step ? "done" : i === step ? "now" : undefined }));
  const total = (k: "estimated_direct" | "estimated_indirect") => lines.reduce((s, l) => s + (Number(l[k]) || 0), 0);
  const lineErrors = lines.flatMap((l, i) => [!l.topic.trim() ? `Line ${i + 1}: say what the training is.` : null, !l.quarter ? `Line ${i + 1}: choose the quarter.` : null]).filter(Boolean) as string[];

  function setLine(i: number, patch: Partial<DraftLine>) {
    setLines((cur) => cur.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  }

  function toLines() {
    if (!lines.length) setLines(picked.length ? linesFromNeeds(pickable.filter((n) => picked.includes(n.name))) : [blankLine()]);
    setStep(2);
  }

  async function save(submit: boolean) {
    setBusy(true);
    setErr(null);
    try {
      const p = await hrSend<HrTrainingPlan>("/hr/training/plans", {
        name: editing || null,
        department,
        year,
        note: note.trim() || null,
        submit,
        lines: lines.map((l) => ({
          topic: l.topic.trim(),
          quarter: l.quarter,
          reason: l.reason,
          people: l.people ? Number(l.people) : null,
          provider: l.provider.trim() || null,
          needs: l.needs,
          estimated_direct: Number(l.estimated_direct) || 0,
          estimated_indirect: Number(l.estimated_indirect) || 0,
        })),
      });
      navigate(`/hr/training/plans/${encodeURIComponent(p.name)}`);
    } catch (e) {
      setErr(errorText(e, "Not saved."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <RequireStaff reason="Staff sign-in required">
      <div className="hr hr-view">
        <Crumbs items={[["Training", "/hr/training"], [editing ? "Edit plan" : "New plan"]]} />
        <div className="hr-head">
          <div>
            <h2>{editing ? "Edit training plan" : "New training plan"}</h2>
            <p>One plan per department per year. A named HR Manager other than you approves it in Approvals.</p>
          </div>
        </div>
        <Track steps={track} />
        <ResourceGate loading={list.loading} error={list.error} onRetry={list.reload} hasData={Boolean(list.data)} skeleton="panel">
          <div className="hr-box">
            <div className="hr-box__b">
              {step === 0 ? (
                <div className="hr-view">
                  <label className="hr-f">
                    <span>Department</span>
                    <select className="hr-in" aria-label="Department" value={department} disabled={Boolean(editing)} onChange={(e) => setDepartment(e.target.value)}>
                      <option value="">Choose…</option>
                      {departments.map((d) => (
                        <option key={d} value={d}>
                          {d}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="hr-f">
                    <span>Year</span>
                    <select className="hr-in" aria-label="Plan year" value={year} onChange={(e) => setYear(e.target.value)}>
                      <option value="">Choose…</option>
                      {years.map((y) => (
                        <option key={y} value={y}>
                          {y}
                        </option>
                      ))}
                    </select>
                  </label>
                  {!years.length ? <p className="hr-note">No fiscal years yet. Add this year's Fiscal Year in Desk first.</p> : null}
                </div>
              ) : null}
              {step === 1 ? (
                needsRes.loading ? (
                  <p className="hr-note">Loading needs…</p>
                ) : pickable.length ? (
                  <div className="hr-view">
                    <p className="hr-note">Pick the open needs this plan answers. Each topic becomes a line you can change next.</p>
                    {pickable.map((n) => (
                      <label key={n.name} className="hr-f" style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                        <input
                          type="checkbox"
                          checked={picked.includes(n.name)}
                          onChange={(e) => setPicked((cur) => (e.target.checked ? [...cur, n.name] : cur.filter((x) => x !== n.name)))}
                        />
                        <span>
                          {n.topic}: {n.employee_name ?? n.employee} ({n.source})
                        </span>
                      </label>
                    ))}
                  </div>
                ) : (
                  <EmptyState title="No open needs" detail="Nothing has been raised for this department yet. You can still add lines for compliance or development." />
                )
              ) : null}
              {step === 2 ? (
                <div className="hr-view">
                  {lines.map((l, i) => (
                    <fieldset key={i} className="hr-box" style={{ padding: 12 }}>
                      <legend>Line {i + 1}</legend>
                      <label className="hr-f">
                        <span>Training</span>
                        <input className="hr-in" aria-label={`Line ${i + 1} training`} value={l.topic} onChange={(e) => setLine(i, { topic: e.target.value })} />
                      </label>
                      <label className="hr-f">
                        <span>Quarter</span>
                        <select className="hr-in" aria-label={`Line ${i + 1} quarter`} value={l.quarter} onChange={(e) => setLine(i, { quarter: e.target.value })}>
                          <option value="">Choose…</option>
                          {QUARTERS.map((q) => (
                            <option key={q} value={q}>
                              {q}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="hr-f">
                        <span>Why</span>
                        <select className="hr-in" aria-label={`Line ${i + 1} reason`} value={l.reason} onChange={(e) => setLine(i, { reason: e.target.value })}>
                          {REASONS.map((r) => (
                            <option key={r} value={r}>
                              {r}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="hr-f">
                        <span>People</span>
                        <input className="hr-in" type="number" min={0} aria-label={`Line ${i + 1} people`} value={l.people} onChange={(e) => setLine(i, { people: e.target.value })} />
                      </label>
                      <label className="hr-f">
                        <span>Provider</span>
                        <input className="hr-in" aria-label={`Line ${i + 1} provider`} value={l.provider} onChange={(e) => setLine(i, { provider: e.target.value })} />
                      </label>
                      <label className="hr-f">
                        <span>Estimated direct cost</span>
                        <input className="hr-in" type="number" min={0} step="0.01" aria-label={`Line ${i + 1} direct cost`} value={l.estimated_direct} onChange={(e) => setLine(i, { estimated_direct: e.target.value })} />
                      </label>
                      <label className="hr-f">
                        <span>Estimated indirect cost</span>
                        <input className="hr-in" type="number" min={0} step="0.01" aria-label={`Line ${i + 1} indirect cost`} value={l.estimated_indirect} onChange={(e) => setLine(i, { estimated_indirect: e.target.value })} />
                      </label>
                      {l.needs.length ? <p className="hr-note">Answers {l.needs.length} need{l.needs.length === 1 ? "" : "s"}.</p> : null}
                      <button type="button" className="btn ghost sm" onClick={() => setLines((cur) => cur.filter((_, j) => j !== i))}>
                        Remove line
                      </button>
                    </fieldset>
                  ))}
                  <div>
                    <button type="button" className="btn ghost" onClick={() => setLines((cur) => [...cur, blankLine()])}>
                      Add line
                    </button>
                  </div>
                </div>
              ) : null}
              {step === 3 ? (
                <div className="hr-view">
                  <p>
                    <b>
                      {department} {year}
                    </b>
                    : {lines.length} line{lines.length === 1 ? "" : "s"}, estimated {money(total("estimated_direct"))} direct and {money(total("estimated_indirect"))} indirect.
                  </p>
                  <ul>
                    {lines.map((l, i) => (
                      <li key={i}>
                        {l.quarter} · {l.topic} ({l.reason})
                      </li>
                    ))}
                  </ul>
                  <label className="hr-f">
                    <span>Note for the approver (optional)</span>
                    <textarea className="hr-in" rows={3} value={note} onChange={(e) => setNote(e.target.value)} />
                  </label>
                  <p className="hr-note">Costs are recorded only. The training budget stays with Finance.</p>
                </div>
              ) : null}
            </div>
          </div>
          {err ? (
            <Banner kind="bad" title="Not saved">
              {err}
            </Banner>
          ) : null}
          {step === 2 && lineErrors.length ? <p className="hr-note">{lineErrors[0]}</p> : null}
          <div className="hr-actions">
            {step > 0 ? (
              <button type="button" className="btn ghost" onClick={() => setStep(step - 1)}>
                Back
              </button>
            ) : (
              <Link className="btn ghost" to="/hr/training">
                Cancel
              </Link>
            )}
            {step === 0 ? (
              <button type="button" className="btn pri" disabled={!department || !year} onClick={() => setStep(1)}>
                Next
              </button>
            ) : null}
            {step === 1 ? (
              <button type="button" className="btn pri" onClick={toLines}>
                Next
              </button>
            ) : null}
            {step === 2 ? (
              <button type="button" className="btn pri" disabled={!lines.length || Boolean(lineErrors.length)} onClick={() => setStep(3)}>
                Review
              </button>
            ) : null}
            {step === 3 ? (
              <>
                <button type="button" className="btn ghost" disabled={busy} onClick={() => void save(false)}>
                  Save draft
                </button>
                <button type="button" className="btn pri" disabled={busy} onClick={() => void save(true)}>
                  {busy ? "Sending…" : "Send for approval"}
                </button>
              </>
            ) : null}
          </div>
        </ResourceGate>
      </div>
    </RequireStaff>
  );
}

/** Nominate: a checkbox list of the viewer's candidates (a manager's team; for HR the plan department's staff). */
export function NominateBox({ event, onDone }: { event: HrTrainingEvent; onDone: (e: HrTrainingEvent) => void }) {
  const have = new Set(event.nominees.map((n) => n.employee));
  const options = event.team.filter((t) => !have.has(t.name));
  const [chosen, setChosen] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  if (!event.can_nominate || !options.length) return null;
  async function nominate() {
    setBusy(true);
    setErr(null);
    try {
      onDone(await hrSend<HrTrainingEvent>(`/hr/training/events/${encodeURIComponent(event.name)}/nominate`, { employees: chosen }));
      setChosen([]);
    } catch (e) {
      setErr(errorText(e, "Not nominated."));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="hr-box">
      <div className="hr-box__h">
        <div>
          <h3>Nominate</h3>
          <p>They get an email with the date and venue.</p>
        </div>
      </div>
      <div className="hr-box__b">
        {options.map((t) => (
          <label key={t.name} className="hr-f" style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <input type="checkbox" checked={chosen.includes(t.name)} onChange={(e) => setChosen((cur) => (e.target.checked ? [...cur, t.name] : cur.filter((x) => x !== t.name)))} />
            <span>{t.employee_name ?? t.name}</span>
          </label>
        ))}
        {err ? <p className="hr-note">{err}</p> : null}
        <button type="button" className="btn pri sm" disabled={!chosen.length || busy} onClick={() => void nominate()}>
          {busy ? "Saving…" : `Nominate ${chosen.length || ""}`.trim()}
        </button>
      </div>
    </div>
  );
}

/** Event: nominees with attendance checkboxes (HR), cost (HR), and Nominate (line managers and HR). */
export function TrainingEventView() {
  const { id = "" } = useParams();
  const { user, sessionKey } = useInstitution();
  const res = useApiResource<HrTrainingEvent>(`/hr/training/events/${encodeURIComponent(id)}`, { enabled: Boolean(user), refreshKey: sessionKey });
  const [d, setD] = useState<HrTrainingEvent | null>(null);
  const e = d ?? res.data;
  const [present, setPresent] = useState<Record<string, boolean>>({});
  const [cost, setCost] = useState<{ direct: string; indirect: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const isPresent = (emp: string, fallback?: boolean | null) => present[emp] ?? Boolean(fallback);

  async function send(kind: "attendance" | "cost") {
    if (!e) return;
    setBusy(kind);
    setErr(null);
    try {
      const body =
        kind === "attendance"
          ? { rows: e.nominees.map((n) => ({ employee: n.employee, present: isPresent(n.employee, n.present) })) }
          : { direct: Number(cost?.direct ?? e.direct_cost ?? 0) || 0, indirect: Number(cost?.indirect ?? e.indirect_cost ?? 0) || 0 };
      setD(await hrSend<HrTrainingEvent>(`/hr/training/events/${encodeURIComponent(e.name)}/${kind}`, body));
      setPresent({});
      setCost(null);
    } catch (x) {
      setErr(errorText(x, "Not saved."));
    } finally {
      setBusy(null);
    }
  }

  return (
    <RequireStaff reason="Staff sign-in required">
      <div className="hr hr-view">
        <Crumbs items={[["Training", "/hr/training"], ...(e?.plan ? ([[`${e.department ?? "Plan"}`, `/hr/training/plans/${encodeURIComponent(e.plan)}`]] as Array<[string, string]>) : []), [e?.event_name ?? id]]} />
        <ResourceGate loading={res.loading} error={res.error} onRetry={res.reload} refreshing={res.refreshing} hasData={Boolean(e)} skeleton="panel">
          {e ? (
            <>
              <div className="hr-head">
                <div>
                  <h2>{e.event_name ?? e.name}</h2>
                  <p>
                    {fmtDay(e.start_time, true)}
                    {e.end_time && e.end_time.slice(0, 10) !== e.start_time?.slice(0, 10) ? ` to ${fmtDay(e.end_time, true)}` : ""}
                    {e.location ? `, ${e.location}` : ""}
                    {e.trainer_name ? `. Trainer: ${e.trainer_name}` : ""}
                  </p>
                </div>
                <div className="hr-head__r">
                  <StatusPill cls={e.event_status === "Completed" ? "ok" : e.event_status === "Cancelled" ? "mute" : "info"} label={e.event_status ?? "Scheduled"} />
                  {e.result_url ? (
                    <a className="btn ghost" href={e.result_url} target="_blank" rel="noreferrer">
                      Record result
                    </a>
                  ) : null}
                </div>
              </div>
              {err ? (
                <Banner kind="bad" title="Not saved">
                  {err}
                </Banner>
              ) : null}
              {e.nominees.length ? (
                <div className="hr-box hr-scroll">
                  <table className="hr-table">
                    <thead>
                      <tr>
                        <th>Nominee</th>
                        <th>Department</th>
                        <th>{e.can_record ? "Attended" : "Attendance"}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {e.nominees.map((n) => (
                        <tr key={n.employee}>
                          <td>{n.employee_name ?? n.employee}</td>
                          <td>{n.department ?? "—"}</td>
                          <td>
                            {e.can_record ? (
                              <input
                                type="checkbox"
                                aria-label={`${n.employee_name ?? n.employee} attended`}
                                checked={isPresent(n.employee, n.present)}
                                onChange={(x) => setPresent((cur) => ({ ...cur, [n.employee]: x.target.checked }))}
                              />
                            ) : (
                              n.attendance ?? "Not recorded"
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <EmptyState title="Nobody nominated yet" detail="Line managers nominate their people; HR can nominate anyone." />
              )}
              {e.can_record && e.nominees.length ? (
                <div className="hr-actions">
                  <button type="button" className="btn pri" disabled={busy === "attendance"} onClick={() => void send("attendance")}>
                    {busy === "attendance" ? "Saving…" : "Save attendance"}
                  </button>
                </div>
              ) : null}
              <NominateBox event={e} onDone={setD} />
              {e.can_record ? (
                <div className="hr-box">
                  <div className="hr-box__h">
                    <div>
                      <h3>Actual cost</h3>
                      <p>Recorded only. Nothing is posted to accounts.</p>
                    </div>
                  </div>
                  <div className="hr-box__b">
                    <label className="hr-f">
                      <span>Direct (fees, materials)</span>
                      <input
                        className="hr-in"
                        type="number"
                        min={0}
                        step="0.01"
                        aria-label="Direct cost"
                        value={cost?.direct ?? String(e.direct_cost ?? 0)}
                        onChange={(x) => setCost({ direct: x.target.value, indirect: cost?.indirect ?? String(e.indirect_cost ?? 0) })}
                      />
                    </label>
                    <label className="hr-f">
                      <span>Indirect (travel, venue, time away)</span>
                      <input
                        className="hr-in"
                        type="number"
                        min={0}
                        step="0.01"
                        aria-label="Indirect cost"
                        value={cost?.indirect ?? String(e.indirect_cost ?? 0)}
                        onChange={(x) => setCost({ indirect: x.target.value, direct: cost?.direct ?? String(e.direct_cost ?? 0) })}
                      />
                    </label>
                    <button type="button" className="btn pri sm" disabled={!cost || busy === "cost"} onClick={() => void send("cost")}>
                      {busy === "cost" ? "Saving…" : "Save cost"}
                    </button>
                  </div>
                </div>
              ) : null}
            </>
          ) : null}
        </ResourceGate>
      </div>
    </RequireStaff>
  );
}

const NEED_STATUSES = ["", "Open", "Planned", "Met", "Dropped"];

export function RaiseNeedDrawer({
  open,
  people,
  onClose,
  onDone,
}: {
  open: boolean;
  people?: Array<{ name: string; employee_name?: string | null }>;
  onClose: () => void;
  onDone: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const fields: FormDrawerField[] = [
    people
      ? { name: "employee", label: "Who", type: "select", required: true, options: people.map((p) => ({ value: p.name, label: p.employee_name ?? p.name })) }
      : { name: "employee", label: "Employee ID", required: true, placeholder: "e.g. HR-EMP-00044" },
    { name: "topic", label: "Training needed", required: true },
    { name: "priority", label: "Priority", type: "select", options: ["Low", "Medium", "High"].map((p) => ({ value: p, label: p })) },
    { name: "note", label: "Note", type: "textarea" },
  ];
  async function submit(v: Record<string, string>) {
    setBusy(true);
    setErr(null);
    try {
      await hrSend<HrTrainingNeedList>("/hr/training/needs", { employee: v.employee.trim(), topic: v.topic.trim(), priority: v.priority || null, note: v.note?.trim() || null });
      onDone();
    } catch (e) {
      setErr(errorText(e, "Not raised."));
    } finally {
      setBusy(false);
    }
  }
  return (
    <FormDrawer
      key={open ? "open" : "closed"}
      open={open}
      title="Raise a training need"
      mode="create"
      submitLabel="Raise"
      fields={fields}
      busy={busy}
      error={err}
      onClose={onClose}
      onSubmit={submit}
    />
  );
}

/** Needs list with filters (department, status, source). */
export function TrainingNeeds() {
  const { user, sessionKey } = useInstitution();
  const [params, setParams] = useSearchParams();
  const [raising, setRaising] = useState(false);
  const q = new URLSearchParams();
  for (const k of ["department", "status", "source"]) if (params.get(k)) q.set(k, params.get(k) as string);
  const res = useApiResource<HrTrainingNeedList>(`/hr/training/needs${q.toString() ? `?${q}` : ""}`, { enabled: Boolean(user), refreshKey: sessionKey });
  const d = res.data;
  function set(key: string, value: string) {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    setParams(next, { replace: true });
  }
  return (
    <RequireStaff reason="Staff sign-in required">
      <div className="hr hr-view">
        <TrainingSwitch current="needs" />
        <div className="hr-head">
          <div>
            <h2>Training needs</h2>
            <p>{d ? `${d.open} open.` : "From reviews, expiring authorisations, managers and staff."}</p>
          </div>
          <div className="hr-head__r">
            <button type="button" className="btn pri" onClick={() => setRaising(true)}>
              Raise a need
            </button>
          </div>
        </div>
        <div className="hr-filters">
          <label className="hr-f">
            <span>Department</span>
            <select className="hr-in" value={params.get("department") ?? ""} onChange={(e) => set("department", e.target.value)}>
              <option value="">All</option>
              {(d?.departments ?? []).map((x) => (
                <option key={x} value={x}>
                  {x}
                </option>
              ))}
            </select>
          </label>
          <label className="hr-f">
            <span>Status</span>
            <select className="hr-in" value={params.get("status") ?? ""} onChange={(e) => set("status", e.target.value)}>
              {NEED_STATUSES.map((x) => (
                <option key={x} value={x}>
                  {x || "All"}
                </option>
              ))}
            </select>
          </label>
          <label className="hr-f">
            <span>From</span>
            <select className="hr-in" value={params.get("source") ?? ""} onChange={(e) => set("source", e.target.value)}>
              <option value="">All</option>
              {(d?.sources ?? []).map((x) => (
                <option key={x} value={x}>
                  {x}
                </option>
              ))}
            </select>
          </label>
        </div>
        <ResourceGate loading={res.loading} error={res.error} onRetry={res.reload} refreshing={res.refreshing} hasData={Boolean(d)} skeleton="list">
          {d ? d.needs.length ? <NeedsTable needs={d.needs} /> : <EmptyState title="No training needs" detail="Needs raised from reviews, expiring authorisations or by managers appear here." /> : null}
        </ResourceGate>
        <RaiseNeedDrawer
          open={raising}
          onClose={() => setRaising(false)}
          onDone={() => {
            setRaising(false);
            res.reload();
          }}
        />
      </div>
    </RequireStaff>
  );
}

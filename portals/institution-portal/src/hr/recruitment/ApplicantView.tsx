import { useEffect, useState, type ReactNode } from "react";
import { Link, useParams } from "react-router-dom";
import { apiBase, apiFetch } from "@eswasaone/shared-ui";
import { useApiResource } from "../../hooks/useApiResource";
import { ResourceGate } from "../../components/PageStates";
import { RequireStaff } from "../../components/RequireStaff";
import { useInstitution } from "../../layout/InstitutionLayout";
import type { HrApplicantDetail, HrEmployeesResponse, HrStage } from "../../api/types";
import { Banner, Crumbs, fmtDay, NextStep, StatusPill } from "../../me/parts";

const STAGES: HrStage[] = ["Applied", "Shortlist", "Interview", "Offer", "Hired"];

/**
 * H6c Applicant (journey J2). One page per candidate; the action shown depends on where they are:
 * screen → schedule interview → interview result → offer (approved by another HR Manager in Approvals)
 * → candidate's answer → create employee. Every rule is enforced in eswasa_hr / HRMS.
 */
export function ApplicantView() {
  const { id = "" } = useParams();
  const { user, sessionKey } = useInstitution();
  const res = useApiResource<HrApplicantDetail>(`/hr/recruitment/applicants/${encodeURIComponent(id)}`, {
    enabled: Boolean(user),
    refreshKey: sessionKey,
  });
  const [d, setD] = useState<HrApplicantDetail | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [hired, setHired] = useState<{ employee: string; employee_name: string } | null>(null);

  useEffect(() => {
    if (res.data) setD(res.data);
  }, [res.data]);

  async function post<T>(path: string, body: Record<string, unknown>): Promise<T | null> {
    setBusy(true);
    setErr(null);
    try {
      return await apiFetch<T>(path, { method: "POST", body: JSON.stringify({ ...body, confirm: true }) });
    } catch (e) {
      setErr(e instanceof Error ? e.message : "That didn't work. Try again.");
      return null;
    } finally {
      setBusy(false);
    }
  }
  async function act(path: string, body: Record<string, unknown>) {
    const next = await post<HrApplicantDetail>(path, body);
    if (next) setD(next);
  }

  const base = `/hr/recruitment/applicants/${encodeURIComponent(id)}`;
  const cur = d ? (d.stage === "Not taken forward" ? -1 : STAGES.indexOf(d.stage)) : 0;
  const lastInterview = d?.interviews[d.interviews.length - 1];
  const cleared = d?.interviews.some((i) => i.status === "Cleared");

  let action: ReactNode = null;
  if (d && !hired) {
    if (d.stage === "Not taken forward") {
      action = <Banner kind="lock" title="Not taken forward">They get no further messages. The reason is on the record.</Banner>;
    } else if (d.stage === "Applied") {
      action = <Screen busy={busy} onMove={(status, note) => void act(`${base}/status`, { status, note })} />;
    } else if (d.stage === "Shortlist") {
      action = <Schedule busy={busy} onSchedule={(b) => void act(`${base}/interviews`, b)} />;
    } else if (d.stage === "Interview" && !cleared) {
      action =
        lastInterview && lastInterview.status !== "Rejected" ? (
          <InterviewResult waiting={lastInterview.waiting_for} busy={busy} onResult={(status) => void act(`/hr/recruitment/interviews/${encodeURIComponent(lastInterview.id)}/result`, { status })} />
        ) : (
          <Banner kind="lock" title="Interview not cleared">Schedule another interview or decline the applicant.</Banner>
        );
    } else if (d.stage === "Interview" && cleared && !d.offer) {
      action = <MakeOffer busy={busy} onOffer={(b) => void act(`${base}/offer`, b)} />;
    } else if (d.offer && d.offer.docstatus === 0) {
      action = (
        <NextStep title="Another HR Manager approves the offer" body="It's in their Approvals. The letter can't go out until then; you can't approve an offer you prepared." />
      );
    } else if (d.offer && d.offer.status === "Awaiting Response") {
      action = (
        <Answer
          busy={busy}
          onAnswer={(answer) => void act(`/hr/recruitment/offers/${encodeURIComponent(d.offer!.name)}/answer`, { answer })}
        />
      );
    } else if (d.offer && d.offer.status === "Accepted" && !d.offer.employee) {
      action = (
        <CreateEmployee
          busy={busy}
          onCreate={async (b) => {
            const r = await post<{ employee: string; employee_name: string }>(`/hr/recruitment/offers/${encodeURIComponent(d.offer!.name)}/employee`, b);
            if (r) setHired(r);
          }}
        />
      );
    } else if (d.offer?.employee) {
      action = <NextStep title="Hired" body="Onboarding gives ICT, Finance, the line manager and the joiner their tasks." to={`/hr/onboarding/new?employee=${encodeURIComponent(d.offer.employee)}`} label="Start onboarding" />;
    } else if (d.offer?.status === "Rejected") {
      action = <Banner kind="lock" title="Offer declined">The post stays vacant. Offer another shortlisted candidate or re-advertise.</Banner>;
    }
  }

  return (
    <RequireStaff reason="Staff sign-in required">
      <ResourceGate loading={res.loading} error={res.error} onRetry={res.reload} hasData={Boolean(d)} skeleton="panel">
        {d ? (
          <div className="hr hr-view">
            <Crumbs
              items={[
                ["Recruitment", "/hr/recruitment"],
                [d.opening?.job_title ?? "Opening", d.opening ? `/hr/recruitment/openings/${encodeURIComponent(d.opening.name)}` : "/hr/recruitment"],
                [d.applicant_name],
              ]}
            />
            <div className="hr-head">
              <div>
                <h2>{d.applicant_name}</h2>
                <p>
                  {d.opening?.job_title ?? ""}. Applied {fmtDay(d.applied_on, true)}
                  {d.source ? ` through ${d.source}` : ""}.
                </p>
              </div>
            </div>

            <ol className="hr-steps" aria-label="Stage">
              {STAGES.map((s, i) => (
                <li key={s} className={hired || i < cur ? "done" : i === cur ? "now" : ""} aria-current={i === cur ? "step" : undefined}>
                  <em>{i + 1}</em>
                  <b>{s}</b>
                </li>
              ))}
            </ol>

            {hired ? (
              <>
                <Banner kind="ok" title={`${hired.employee_name} is now an employee`}>
                  Record {hired.employee}. Link their portal login in Directory and start onboarding.
                </Banner>
                <NextStep title="Start onboarding" body="ICT, Finance, the line manager and the new joiner each get their tasks." to={`/hr/onboarding/new?employee=${encodeURIComponent(hired.employee)}`} label="Start onboarding" />
              </>
            ) : null}

            <div className="hr-grid c2">
              <div className="hr-box">
                <div className="hr-box__h">
                  <div>
                    <h3>Application</h3>
                  </div>
                </div>
                <div className="hr-box__b">
                  <dl className="hr-kv">
                    <div>
                      <dt>Email</dt>
                      <dd>{d.email ?? "—"}</dd>
                    </div>
                    <div>
                      <dt>Phone</dt>
                      <dd>{d.phone ?? "—"}</dd>
                    </div>
                    <div>
                      <dt>CV</dt>
                      <dd>
                        {d.has_cv ? (
                          <a className="hr-lnk" href={`${apiBase()}${base}/cv`} target="_blank" rel="noreferrer">
                            Open CV
                          </a>
                        ) : (
                          "Not attached"
                        )}
                      </dd>
                    </div>
                    <div>
                      <dt>Status</dt>
                      <dd>{d.status}</dd>
                    </div>
                  </dl>
                  {d.cover_letter ? (
                    <>
                      <h4 style={{ fontSize: 12, margin: "14px 0 4px", color: "var(--muted)" }}>Why they applied</h4>
                      <p style={{ whiteSpace: "pre-wrap", margin: 0 }}>{d.cover_letter}</p>
                    </>
                  ) : null}
                </div>
              </div>
              <div className="hr-box">
                <div className="hr-box__h">
                  <div>
                    <h3>Interviews</h3>
                  </div>
                </div>
                <div className="hr-box__b">
                  {d.interviews.length ? (
                    d.interviews.map((i) => (
                      <div key={i.id} className="hr-out" style={{ marginBottom: 10 }}>
                        <div className="hr-out__i">
                          <div>
                            <b>
                              {fmtDay(i.scheduled_on, true)}, {i.from_time ?? ""}
                            </b>
                            <span className="s">
                              {i.interview_type ?? "Interview"}. Panel: {i.panel.join(", ") || "—"}
                            </span>
                          </div>
                          <span className="r">
                            <StatusPill cls={i.status === "Cleared" ? "ok" : i.status === "Rejected" ? "bad" : "leave"} label={i.status} />
                          </span>
                        </div>
                        {i.feedback.map((f) => (
                          <div className="hr-out__i" key={f.interviewer}>
                            <div>
                              <b>
                                {f.interviewer}: {f.result ?? "—"}
                                {f.rating ? `, ${f.rating} of 5` : ""}
                              </b>
                              {f.feedback ? <span className="s">{f.feedback}</span> : null}
                            </div>
                          </div>
                        ))}
                        {i.waiting_for ? <p className="hr-note">Waiting for {i.waiting_for} panel member{i.waiting_for === 1 ? "" : "s"} to record feedback.</p> : null}
                      </div>
                    ))
                  ) : (
                    <p className="hr-note">No interview yet.</p>
                  )}
                </div>
              </div>
            </div>

            {d.offer ? (
              <Banner kind="info" title={`Offer: ${d.offer.state}`}>
                {d.offer.designation}, dated {fmtDay(d.offer.offer_date, true)}.
                {d.offer.docstatus === 1 ? (
                  <>
                    {" "}
                    <a className="hr-lnk" href={`${apiBase()}/hr/recruitment/offers/${encodeURIComponent(d.offer.name)}/letter`} target="_blank" rel="noreferrer">
                      Offer letter (PDF)
                    </a>
                  </>
                ) : null}
              </Banner>
            ) : null}
            {err ? (
              <Banner kind="bad" title="Not done">
                {err}
              </Banner>
            ) : null}
            {action}
          </div>
        ) : null}
      </ResourceGate>
    </RequireStaff>
  );
}

function Box({ title, sub, children }: { title: string; sub?: string; children: ReactNode }) {
  return (
    <div className="hr-box">
      <div className="hr-box__h">
        <div>
          <h3>{title}</h3>
          {sub ? <p>{sub}</p> : null}
        </div>
      </div>
      <div className="hr-box__b">{children}</div>
    </div>
  );
}

function Screen({ busy, onMove }: { busy: boolean; onMove: (status: string, note?: string) => void }) {
  const [note, setNote] = useState("");
  return (
    <Box title="Screen this applicant" sub="Only shortlisted candidates are contacted">
      <div className="hr-view" style={{ gap: 10 }}>
        <label className="hr-f">
          <span>Note (needed to decline; not sent to the applicant)</span>
          <input className="hr-in" value={note} onChange={(e) => setNote(e.target.value)} />
        </label>
        <div className="hr-actions">
          <button type="button" className="btn ghost" disabled={busy || !note.trim()} onClick={() => onMove("Rejected", note)}>
            Not taken forward
          </button>
          <button type="button" className="btn ghost" disabled={busy} onClick={() => onMove("Hold", note)}>
            Hold
          </button>
          <button type="button" className="btn pri" disabled={busy} onClick={() => onMove("Shortlisted", note)}>
            Shortlist
          </button>
        </div>
      </div>
    </Box>
  );
}

function Schedule({ busy, onSchedule }: { busy: boolean; onSchedule: (b: Record<string, unknown>) => void }) {
  const { user, sessionKey } = useInstitution();
  const types = useApiResource<{ items: string[] }>("/hr/recruitment/interview-types", { enabled: Boolean(user), refreshKey: sessionKey });
  const people = useApiResource<HrEmployeesResponse>("/hr/employees?limit=500", { enabled: Boolean(user), refreshKey: sessionKey });
  const [type, setType] = useState("");
  const [on, setOn] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [panel, setPanel] = useState<string[]>([]);
  const staff = (people.data?.items ?? []).filter((p) => p.user_id);
  const ready = type && on && from && to && to > from && panel.length;

  return (
    <Box title="Schedule an interview" sub="Each interviewer gets a task to record their feedback">
      {types.data && !types.data.items.length ? (
        <Banner kind="warn" title="No interview types set up">Add one in HR setup (with the skills it rates) before scheduling.</Banner>
      ) : (
        <div className="hr-form">
          <label className="hr-f">
            <span>Interview type</span>
            <select className="hr-in" value={type} onChange={(e) => setType(e.target.value)}>
              <option value="">Choose…</option>
              {(types.data?.items ?? []).map((t) => (
                <option key={t}>{t}</option>
              ))}
            </select>
          </label>
          <label className="hr-f">
            <span>Date</span>
            <input className="hr-in" type="date" value={on} onChange={(e) => setOn(e.target.value)} />
          </label>
          <label className="hr-f">
            <span>Starts</span>
            <input className="hr-in" type="time" value={from} onChange={(e) => setFrom(e.target.value)} />
          </label>
          <label className="hr-f">
            <span>Ends</span>
            <input className="hr-in" type="time" value={to} onChange={(e) => setTo(e.target.value)} />
          </label>
          <fieldset className="wide" style={{ border: 0, padding: 0, margin: 0 }}>
            <legend className="hr-f">Panel</legend>
            <div className="hr-radios">
              {staff.map((p) => (
                <label key={p.id} className="hr-radio">
                  <input
                    type="checkbox"
                    checked={panel.includes(p.user_id!)}
                    onChange={(e) => setPanel((cur) => (e.target.checked ? [...cur, p.user_id!] : cur.filter((u) => u !== p.user_id)))}
                  />
                  <span>
                    <b>{p.employee_name}</b>
                    {p.designation ? <small>{p.designation}</small> : null}
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
          <div className="hr-actions wide">
            <span />
            <button
              type="button"
              className="btn pri"
              disabled={!ready || busy}
              onClick={() => onSchedule({ interview_type: type, scheduled_on: on, from_time: from, to_time: to, interviewers: panel })}
            >
              Schedule interview
            </button>
          </div>
        </div>
      )}
    </Box>
  );
}

function InterviewResult({ waiting, busy, onResult }: { waiting: number; busy: boolean; onResult: (s: "Cleared" | "Rejected") => void }) {
  return (
    <Box title="Interview result" sub={waiting ? `Waiting for ${waiting} panel member${waiting === 1 ? "" : "s"}. You can decide once the panel has scored.` : "The panel has scored. Record the outcome."}>
      <div className="hr-actions">
        <button type="button" className="btn ghost" disabled={busy || waiting > 0} onClick={() => onResult("Rejected")}>
          Not cleared
        </button>
        <button type="button" className="btn pri" disabled={busy || waiting > 0} onClick={() => onResult("Cleared")}>
          Cleared
        </button>
      </div>
    </Box>
  );
}

function MakeOffer({ busy, onOffer }: { busy: boolean; onOffer: (b: Record<string, unknown>) => void }) {
  const [date, setDate] = useState("");
  const [terms, setTerms] = useState("");
  return (
    <Box title="Make an offer" sub="Another HR Manager approves it in Approvals before the letter goes out">
      <div className="hr-form">
        <label className="hr-f">
          <span>Offer date</span>
          <input className="hr-in" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </label>
        <label className="hr-f wide">
          <span>Terms</span>
          <textarea className="hr-in" rows={4} value={terms} onChange={(e) => setTerms(e.target.value)} />
          <small>Start date, grade band, probation and conditions such as qualification checks and the impartiality declaration.</small>
        </label>
        <div className="hr-actions wide">
          <span />
          <button type="button" className="btn pri" disabled={!date || busy} onClick={() => onOffer({ offer_date: date, terms })}>
            Send for approval
          </button>
        </div>
      </div>
    </Box>
  );
}

function Answer({ busy, onAnswer }: { busy: boolean; onAnswer: (a: "Accepted" | "Rejected") => void }) {
  return (
    <Box title="Record the candidate's answer" sub="The offer is approved. Send the letter, then record what they said.">
      <div className="hr-actions">
        <button type="button" className="btn ghost" disabled={busy} onClick={() => onAnswer("Rejected")}>
          Declined
        </button>
        <button type="button" className="btn pri" disabled={busy} onClick={() => onAnswer("Accepted")}>
          Accepted
        </button>
      </div>
    </Box>
  );
}

function CreateEmployee({ busy, onCreate }: { busy: boolean; onCreate: (b: Record<string, unknown>) => void }) {
  const { user, sessionKey } = useInstitution();
  const people = useApiResource<HrEmployeesResponse>("/hr/employees?limit=500", { enabled: Boolean(user), refreshKey: sessionKey });
  const [start, setStart] = useState("");
  const [gender, setGender] = useState("");
  const [dob, setDob] = useState("");
  const [manager, setManager] = useState("");
  const ready = start && gender && dob && manager;
  return (
    <Box title="Create the employee" sub="Name, email and post carry over from the offer">
      <div className="hr-form">
        <label className="hr-f">
          <span>Start date</span>
          <input className="hr-in" type="date" value={start} onChange={(e) => setStart(e.target.value)} />
        </label>
        <label className="hr-f">
          <span>Line manager</span>
          <select className="hr-in" value={manager} onChange={(e) => setManager(e.target.value)}>
            <option value="">Choose…</option>
            {(people.data?.items ?? []).map((p) => (
              <option key={p.id} value={p.id}>
                {p.employee_name}
              </option>
            ))}
          </select>
          <small>Also becomes their leave and expense approver</small>
        </label>
        <label className="hr-f">
          <span>Gender</span>
          <select className="hr-in" value={gender} onChange={(e) => setGender(e.target.value)}>
            <option value="">Choose…</option>
            <option>Female</option>
            <option>Male</option>
            <option>Prefer not to say</option>
          </select>
        </label>
        <label className="hr-f">
          <span>Date of birth</span>
          <input className="hr-in" type="date" value={dob} onChange={(e) => setDob(e.target.value)} />
        </label>
        <div className="hr-actions wide">
          <Link className="btn ghost" to="/hr/recruitment">
            Later
          </Link>
          <button
            type="button"
            className="btn pri"
            disabled={!ready || busy}
            onClick={() => onCreate({ date_of_joining: start, gender, date_of_birth: dob, reports_to: manager })}
          >
            Create employee
          </button>
        </div>
      </div>
    </Box>
  );
}

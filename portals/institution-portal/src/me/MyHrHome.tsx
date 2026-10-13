import { Link } from "react-router-dom";
import { Icon } from "@eswasaone/shared-ui";
import { useApiResource } from "../hooks/useApiResource";
import { ResourceGate } from "../components/PageStates";
import { useInstitution } from "../layout/InstitutionLayout";
import type { HrAppraisal, HrMe, HrMyDeclaration, HrMyItems, HrMyTraining, HrOnboarding } from "../api/types";
import { Banner, fmtDay, fmtDays, fmtRange, leaveStatus, NextStep, StatusPill } from "./parts";

/** E1 My HR — the signed-in person's own record, balances and leave. Live GET /hr/me only. */
export function MyHrHome() {
  const { user, sessionKey } = useInstitution();
  const me = useApiResource<HrMe>("/hr/me", { enabled: Boolean(user), refreshKey: sessionKey });
  const d = me.data;

  return (
    <ResourceGate
      loading={me.loading}
      error={me.error}
      onRetry={me.reload}
      refreshing={me.refreshing}
      hasData={Boolean(d)}
      skeleton="dashboard"
    >
      {d && !d.linked ? (
        <div className="hr-view">
          <div className="hr-head">
            <div>
              <h2>My HR</h2>
              <p>Your job, leave and pay in one place.</p>
            </div>
          </div>
          <Banner kind="lock" title="Your login isn't linked to an employee record yet">
            Until HR links it, leave requests can't reach your line manager and your balances can't be shown.
          </Banner>
          <NextStep
            title="Ask HR to link your record"
            body="HR links your login to your employee record in Directory. It takes a minute."
          />
        </div>
      ) : null}
      {d && d.linked ? <Linked me={d} /> : null}
    </ResourceGate>
  );
}

function Linked({ me }: { me: HrMe }) {
  const { sessionKey } = useInstitution();
  const decl = useApiResource<HrMyDeclaration>("/hr/me/declaration", { refreshKey: sessionKey });
  const declDue = decl.data && decl.data.status !== "signed" ? decl.data : null;
  const onb = useApiResource<{ onboarding: HrOnboarding | null }>("/hr/me/onboarding", { refreshKey: sessionKey });
  const firstDays = onb.data?.onboarding ?? null;
  const apr = useApiResource<{ appraisal: HrAppraisal | null }>("/hr/me/appraisal", { refreshKey: sessionKey });
  const selfDue = apr.data?.appraisal?.can_self && !apr.data.appraisal.self_done ? apr.data.appraisal : null;
  const items = useApiResource<HrMyItems>("/hr/me/items", { refreshKey: sessionKey });
  const toAcknowledge = items.data?.waiting ?? 0;
  const training = useApiResource<HrMyTraining>("/hr/me/training", { refreshKey: sessionKey }); // additions plan 05
  const nextCourse = training.data?.upcoming?.[0] ?? null;
  const emp = me.employee;
  const first = (emp?.employee_name ?? "").split(" ")[0] || "there";
  const annual = me.balances.find((b) => /annual/i.test(b.leave_type)) ?? me.balances[0];
  const waiting = me.leave.filter((l) => leaveStatus(l.status).cls === "leave");
  const approver = me.leave_approver?.name;

  return (
    <div className="hr-view">
      <div className="hr-head">
        <div>
          <h2>My HR</h2>
          <p>
            Hello {first}. {emp?.designation ? `${emp.designation}` : ""}
            {emp?.department ? `, ${emp.department}` : ""}.
          </p>
        </div>
        <div className="hr-head__r">
          <Link className="btn pri" to="leave/new">
            <Icon name="i-plus" />
            Apply for leave
          </Link>
        </div>
      </div>

      <div className="hr-cards">
        <Link className="hr-card" to="leave">
          <span className="l">{annual ? annual.leave_type : "Leave"}</span>
          <span className="v">
            {annual ? (
              <>
                {annual.balance} <small>days left</small>
              </>
            ) : (
              "—"
            )}
          </span>
          <span className="d">{annual ? `${annual.used} of ${annual.allocated} used` : "No leave allocated yet"}</span>
        </Link>
        <div className="hr-card">
          <span className="l">Line manager</span>
          <span className="v" style={{ fontSize: 17 }}>
            {me.line_manager ?? "Not set"}
          </span>
          <span className="d">Leave approver: {approver ?? "not set"}</span>
        </div>
        <Link className="hr-card" to="leave">
          <span className="l">Requests waiting</span>
          <span className="v">{waiting.length}</span>
          <span className="d">{waiting.length ? `With ${approver ?? "your approver"} in Approvals` : "Nothing waiting"}</span>
        </Link>
      </div>

      {firstDays ? (
        <Banner
          kind="info"
          title={`Your first days: ${firstDays.done} of ${firstDays.total} set up`}
          action={
            <Link className="btn pri sm" to="first-days">
              Open checklist
            </Link>
          }
        >
          Your checklist, and what ICT, Finance and your line manager are setting up for you.
        </Banner>
      ) : null}

      {selfDue ? (
        <Banner
          kind="info"
          title={`${selfDue.cycle_name}: rate yourself by ${fmtDay(selfDue.end_date, true)}`}
          action={
            <Link className="btn pri sm" to="appraisal">
              Start
            </Link>
          }
        >
          Then {selfDue.manager_name ?? "your line manager"} adds their ratings.
        </Banner>
      ) : null}

      {toAcknowledge ? (
        <Banner
          kind="info"
          title={`${toAcknowledge} issued item${toAcknowledge === 1 ? "" : "s"} to acknowledge`}
          action={
            <Link className="btn pri sm" to="items">
              My items
            </Link>
          }
        >
          HR has issued you equipment or a card. Confirm you received it.
        </Banner>
      ) : null}

      {nextCourse ? (
        <Banner
          kind="info"
          title={`You're nominated for ${nextCourse.event_name ?? "a course"} on ${fmtDay(nextCourse.start_time, true)}`}
          action={
            <Link className="btn pri sm" to="training">
              My training
            </Link>
          }
        >
          {nextCourse.location ? `At ${nextCourse.location}.` : "HR will confirm the venue."}
        </Banner>
      ) : null}

      {declDue ? (
        <Banner
          kind="bad"
          title={`Sign your ${declDue.year_label} impartiality and confidentiality declaration`}
          action={
            <Link className="btn pri sm" to="declaration">
              Sign now
            </Link>
          }
        >
          Until you sign, you can't be assigned to audits or decisions. It takes about 3 minutes.
        </Banner>
      ) : null}

      {!approver ? (
        <Banner kind="warn" title="You have no leave approver yet">
          Leave requests need one. Ask HR to set your line manager and leave approver.
        </Banner>
      ) : null}

      <div className="hr-grid c2">
        <div className="hr-box">
          <div className="hr-box__h">
            <div>
              <h3>Leave balances</h3>
              <p>This leave year</p>
            </div>
          </div>
          <div className="hr-box__b">
            {me.balances.length ? (
              me.balances.map((b) => (
                <div className="hr-bal" key={b.leave_type}>
                  <span>{b.leave_type}</span>
                  <div className="hr-prog">
                    <i style={{ width: `${b.allocated ? Math.min(100, (b.balance / b.allocated) * 100) : 0}%` }} />
                  </div>
                  <b>
                    {b.balance} of {b.allocated} left
                  </b>
                </div>
              ))
            ) : (
              <p className="hr-note">No leave has been allocated to you yet. HR sets this up for the leave year.</p>
            )}
          </div>
        </div>
        <div className="hr-box">
          <div className="hr-box__h">
            <div>
              <h3>Recent requests</h3>
              <p>Decided by your leave approver in Approvals</p>
            </div>
            <Link className="hr-lnk" to="leave">
              All leave
            </Link>
          </div>
          <div className="hr-box__b">
            {me.leave.length ? (
              <div className="hr-out">
                {me.leave.slice(0, 4).map((l) => {
                  const s = leaveStatus(l.status);
                  return (
                    <div className="hr-out__i" key={l.id}>
                      <div>
                        <b>{l.leave_type}</b>
                        <span className="s">{fmtRange(l.from_date, l.to_date)}</span>
                      </div>
                      <span className="r">
                        <StatusPill cls={s.cls} label={s.label} />
                      </span>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="hr-note">You haven't asked for leave this year.</p>
            )}
          </div>
        </div>
      </div>

      <p className="hr-note">
        <Link to="profile">My profile and documents</Link>: check your record, upload documents, ask for a correction.{" "}
        <Link to="expenses">Expense claims</Link>: claim back money spent for work.{" "}
        <Link to="letters">My letters</Link>: ask for an employment confirmation letter and download letters HR has issued you.{" "}
        <Link to="training">My training</Link>: your courses and training needs.
      </p>
      <p className="hr-note">
        Something wrong at work? <Link to="concern">Raise a concern in confidence</Link>. Only one HR Manager sees it.
      </p>
      <p className="hr-note">
        Your personal and pay details are hidden until HR gives a reason. <Link to="access-log">See who looked at your record</Link>.
      </p>

      {waiting.length ? (
        <NextStep
          title={`${approver ?? "Your approver"} decides your request`}
          body={`${waiting[0].leave_type}, ${fmtRange(waiting[0].from_date, waiting[0].to_date)}. You'll see the decision here.`}
        />
      ) : (
        <NextStep
          title="Planning time off?"
          body={annual ? `You have ${fmtDays(annual.balance)} of ${annual.leave_type.toLowerCase()} left.` : undefined}
          to="leave/new"
          label="Apply for leave"
        />
      )}
    </div>
  );
}

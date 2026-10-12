import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { apiFetch } from "@eswasaone/shared-ui";
import { useApiResource } from "../hooks/useApiResource";
import { ResourceGate } from "../components/PageStates";
import { useInstitution } from "../layout/InstitutionLayout";
import type { HrLeavePreview, HrLeaveSummary, HrMe } from "../api/types";
import { Banner, Crumbs, fmtDay, fmtDays, fmtRange, NextStep, Track } from "./parts";

/**
 * E2 Apply for leave. Shows what the request means (working days, balance after, who decides, work
 * in those dates) from POST /hr/leave/preview before anything is sent, then POST /hr/leave.
 * The decision is made by the leave approver in Approvals, never here.
 */
export function ApplyLeave() {
  const { user, sessionKey } = useInstitution();
  const me = useApiResource<HrMe>("/hr/me", { enabled: Boolean(user), refreshKey: sessionKey });
  const types = useMemo(() => me.data?.balances ?? [], [me.data]);

  const [leaveType, setLeaveType] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [reason, setReason] = useState("");
  const [preview, setPreview] = useState<HrLeavePreview | null>(null);
  const [previewErr, setPreviewErr] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [sent, setSent] = useState<HrLeaveSummary | null>(null);

  useEffect(() => {
    if (!leaveType && types.length) setLeaveType(types[0].leave_type);
  }, [types, leaveType]);

  useEffect(() => {
    setPreview(null);
    setPreviewErr(null);
    if (!leaveType || !from || !to) return;
    let live = true;
    setChecking(true);
    const t = window.setTimeout(() => {
      apiFetch<HrLeavePreview>("/hr/leave/preview", {
        method: "POST",
        body: JSON.stringify({ leave_type: leaveType, from_date: from, to_date: to }),
      })
        .then((p) => live && setPreview(p))
        .catch((e: unknown) => live && setPreviewErr(e instanceof Error ? e.message : "Couldn't check these dates"))
        .finally(() => live && setChecking(false));
    }, 300);
    return () => {
      live = false;
      window.clearTimeout(t);
    };
  }, [leaveType, from, to]);

  const blocked = !preview || preview.days <= 0 || !preview.approver;

  async function send() {
    setBusy(true);
    setErr(null);
    try {
      const res = await apiFetch<HrLeaveSummary>("/hr/leave", {
        method: "POST",
        body: JSON.stringify({
          leave_type: leaveType,
          from_date: from,
          to_date: to,
          reason: reason.trim() || undefined,
          confirm: true,
        }),
      });
      setSent(res);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "The request wasn't sent. Try again.");
    } finally {
      setBusy(false);
    }
  }

  const approverName = preview?.approver?.name ?? me.data?.leave_approver?.name ?? "your leave approver";

  if (sent) {
    return (
      <div className="hr-view">
        <Crumbs items={[["My HR", ".."], ["Leave request sent"]]} />
        <div className="hr-head">
          <div>
            <h2>Leave request sent</h2>
            <p>
              {sent.leave_type || leaveType}, {fmtRange(sent.from_date ?? from, sent.to_date ?? to)}
            </p>
          </div>
        </div>
        <div className="hr-box">
          <div className="hr-box__h">
            <div>
              <h3>Where it is now</h3>
            </div>
          </div>
          <div className="hr-box__b">
            <Track
              steps={[
                { title: "Requested", detail: "Just now, by you", state: "done" },
                { title: `${approverName} decides`, detail: "In Approvals. If it waits too long it goes to the HR Manager.", state: "now" },
                { title: "Decision", detail: "You'll see it in My HR and in your notifications" },
              ]}
            />
          </div>
        </div>
        <NextStep title={`${approverName} decides`} body="Nothing else to do for now." to=".." label="Back to My HR" />
      </div>
    );
  }

  return (
    <ResourceGate loading={me.loading} error={me.error} onRetry={me.reload} hasData={Boolean(me.data)} skeleton="panel">
      <div className="hr-view">
        <Crumbs items={[["My HR", ".."], ["Apply for leave"]]} />
        <div className="hr-head">
          <div>
            <h2>Apply for leave</h2>
            <p>You'll see what it means before you send it.</p>
          </div>
        </div>

        {me.data && !me.data.linked ? (
          <Banner kind="lock" title="Your login isn't linked to an employee record yet">
            Ask HR to link it. Until then, leave requests can't reach your line manager.
          </Banner>
        ) : null}

        <div className="hr-box">
          <div className="hr-box__b">
            <form
              className="hr-form"
              onSubmit={(e) => {
                e.preventDefault();
                if (!blocked) void send();
              }}
            >
              <fieldset className="wide" style={{ border: 0, padding: 0, margin: 0 }}>
                <legend className="hr-f" style={{ marginBottom: 6 }}>
                  Kind of leave
                </legend>
                {types.length ? (
                  <div className="hr-radios">
                    {types.map((t) => (
                      <label className="hr-radio" key={t.leave_type}>
                        <input
                          type="radio"
                          name="leave_type"
                          checked={leaveType === t.leave_type}
                          onChange={() => setLeaveType(t.leave_type)}
                        />
                        <span>
                          <b>{t.leave_type}</b>
                          <small>{fmtDays(t.balance)} left</small>
                        </span>
                      </label>
                    ))}
                  </div>
                ) : (
                  <p className="hr-note">No leave has been allocated to you yet. HR sets this up for the leave year.</p>
                )}
              </fieldset>
              <label className="hr-f">
                <span>From</span>
                <input className="hr-in" type="date" value={from} required onChange={(e) => setFrom(e.target.value)} />
              </label>
              <label className="hr-f">
                <span>To</span>
                <input
                  className="hr-in"
                  type="date"
                  value={to}
                  min={from || undefined}
                  required
                  onChange={(e) => setTo(e.target.value)}
                />
              </label>
              <label className="hr-f wide">
                <span>Note for your approver</span>
                <input className="hr-in" value={reason} maxLength={300} onChange={(e) => setReason(e.target.value)} />
                <small>Optional. Say who can cover, if you know.</small>
              </label>

              <div className="wide" aria-live="polite">
                {checking ? <p className="hr-note">Checking these dates…</p> : null}
                {previewErr ? <Banner kind="bad" title="Couldn't check these dates">{previewErr}</Banner> : null}
                {preview ? <PreviewPanel p={preview} /> : null}
              </div>

              {err ? (
                <div className="wide">
                  <Banner kind="bad" title="Not sent">
                    {err}
                  </Banner>
                </div>
              ) : null}

              <div className="hr-actions wide">
                <Link className="btn ghost" to="..">
                  Cancel
                </Link>
                <button type="submit" className="btn pri" disabled={blocked || busy}>
                  {busy ? "Sending…" : `Send to ${approverName}`}
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </ResourceGate>
  );
}

function PreviewPanel({ p }: { p: HrLeavePreview }) {
  return (
    <div className="hr-view" style={{ gap: 10 }}>
      <dl className="hr-kv">
        <div>
          <dt>Working days</dt>
          <dd>{fmtDays(p.days)}</dd>
        </div>
        <div>
          <dt>Balance after</dt>
          <dd>{p.balance_after === null || p.balance_after === undefined ? "—" : fmtDays(p.balance_after)}</dd>
        </div>
        <div>
          <dt>Decided by</dt>
          <dd>{p.approver?.name ?? "No approver set"}</dd>
        </div>
      </dl>
      {p.conflicts.length ? (
        <Banner kind="warn" title={`Your work in those dates (${p.conflicts.length})`}>
          {p.conflicts.map((c) => `${c.title}${c.date ? `, ${fmtDay(c.date)}` : ""}`).join("; ")}. Someone else will need to
          take it; your approver sees this too.
        </Banner>
      ) : null}
      {p.warnings.map((w) => (
        <Banner key={w} kind={/approver/i.test(w) ? "bad" : "warn"} title={w} />
      ))}
    </div>
  );
}

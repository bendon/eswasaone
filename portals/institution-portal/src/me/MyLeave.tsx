import { useState } from "react";
import { Link } from "react-router-dom";
import { Icon, uploadMedia } from "@eswasaone/shared-ui";
import { useApiResource } from "../hooks/useApiResource";
import { EmptyState, ResourceGate } from "../components/PageStates";
import { useInstitution } from "../layout/InstitutionLayout";
import type { HrLeaveRequest, HrLeaveRequests, HrLeaveSummary, HrMe } from "../api/types";
import { errorText, hrSend } from "../hr/api";
import { Banner, leaveStatus, fmtRange, StatusPill } from "./parts";

/** Open requests, and approved leave that hasn't started, can be cancelled; the server has the last word. */
function cancellable(l: HrLeaveSummary): boolean {
  const s = (l.status || "").toLowerCase();
  const today = new Date().toISOString().slice(0, 10);
  return s === "open" || (s === "approved" && Boolean(l.from_date) && (l.from_date as string) > today);
}

/** E3 My leave: own requests and their status, and cancel. Live GET /hr/me; POST /hr/leave/{id}/cancel.
 * Open requests that need a medical certificate (plan 08) get "Add certificate": POST /hr/me/leave/{id}/certificate. */
export function MyLeave() {
  const { user, sessionKey } = useInstitution();
  const me = useApiResource<HrMe>("/hr/me", { enabled: Boolean(user), refreshKey: sessionKey });
  const open = useApiResource<HrLeaveRequests>("/hr/leave/requests?status=Open", { enabled: Boolean(user), refreshKey: sessionKey });
  const needsCert = new Set(((open.data?.items ?? []) as HrLeaveRequest[]).filter((r) => r.certificate_required && !r.has_certificate).map((r) => r.id));
  const leave = me.data?.leave ?? [];
  const [adding, setAdding] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [cancelling, setCancelling] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  async function cancel(id: string) {
    setErr(null);
    if (!reason.trim()) return setErr("Say why you're cancelling. Your approver sees it.");
    setBusy(true);
    try {
      await hrSend(`/hr/leave/${encodeURIComponent(id)}/cancel`, { reason: reason.trim() });
      setDone("Cancelled. Your approver has been told, and any days taken from your balance are back.");
      setCancelling(null);
      setReason("");
      me.reload();
    } catch (e) {
      setErr(errorText(e, "Not cancelled."));
    } finally {
      setBusy(false);
    }
  }

  async function addCertificate(id: string) {
    setErr(null);
    if (!file) return setErr("Attach the certificate.");
    setBusy(true);
    try {
      const link = (await uploadMedia(file, "hr/evidence", { allowMock: false })).url;
      await hrSend(`/hr/me/leave/${encodeURIComponent(id)}/certificate`, { certificate: link });
      setDone("Certificate sent. HR will check it.");
      setAdding(null);
      setFile(null);
      open.reload();
    } catch (e) {
      setErr(errorText(e, "Not sent."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <ResourceGate loading={me.loading} error={me.error} onRetry={me.reload} refreshing={me.refreshing} hasData={Boolean(me.data)}>
      <div className="hr-view">
        <div className="hr-head">
          <div>
            <h2>My leave</h2>
            <p>Decided by {me.data?.leave_approver?.name ?? "your leave approver"} in Approvals.</p>
          </div>
          <div className="hr-head__r">
            <Link className="btn pri" to="new">
              <Icon name="i-plus" />
              Apply for leave
            </Link>
          </div>
        </div>
        {err ? (
          <Banner kind="bad" title={adding ? "Not sent" : "Not cancelled"}>
            {err}
          </Banner>
        ) : null}
        {done ? (
          <p className="page-note" role="status">
            {done}
          </p>
        ) : null}
        {leave.length ? (
          <div className="hr-box hr-scroll">
            <table className="hr-table">
              <thead>
                <tr>
                  <th>Kind</th>
                  <th>Dates</th>
                  <th>Status</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {leave.map((l) => {
                  const s = leaveStatus(l.status);
                  return (
                    <tr key={l.id}>
                      <td>
                        <b>{l.leave_type}</b>
                      </td>
                      <td>{fmtRange(l.from_date, l.to_date)}</td>
                      <td>
                        <StatusPill cls={s.cls} label={s.label} />
                      </td>
                      <td style={{ textAlign: "right" }}>
                        {needsCert.has(l.id) && adding !== l.id ? (
                          <button type="button" className="btn ghost sm" onClick={() => (setAdding(l.id), setCancelling(null), setErr(null), setDone(null))}>
                            Add certificate
                          </button>
                        ) : null}{" "}
                        {adding === l.id ? (
                          <div className="hr-view" style={{ gap: 6, minWidth: 240 }}>
                            <input className="hr-in" type="file" aria-label="Medical certificate" accept="application/pdf,image/jpeg,image/png" onChange={(e) => setFile(e.target.files?.[0] ?? null)} disabled={busy} />
                            <div>
                              <button type="button" className="btn pri sm" disabled={busy} onClick={() => void addCertificate(l.id)}>
                                {busy ? "Sending…" : "Send certificate"}
                              </button>{" "}
                              <button type="button" className="btn ghost sm" disabled={busy} onClick={() => (setAdding(null), setErr(null))}>
                                Not now
                              </button>
                            </div>
                          </div>
                        ) : null}
                        {cancellable(l) && cancelling !== l.id ? (
                          <button type="button" className="btn ghost sm" onClick={() => (setCancelling(l.id), setErr(null), setDone(null))}>
                            Cancel
                          </button>
                        ) : null}
                        {cancelling === l.id ? (
                          <div className="hr-view" style={{ gap: 6, minWidth: 240 }}>
                            <input className="hr-in" aria-label="Why are you cancelling?" placeholder="Why are you cancelling?" value={reason} onChange={(e) => setReason(e.target.value)} disabled={busy} />
                            <div>
                              <button type="button" className="btn pri sm" disabled={busy} onClick={() => void cancel(l.id)}>
                                {busy ? "Cancelling…" : "Cancel this leave"}
                              </button>{" "}
                              <button type="button" className="btn ghost sm" disabled={busy} onClick={() => (setCancelling(null), setErr(null))}>
                                Keep it
                              </button>
                            </div>
                          </div>
                        ) : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState title="No leave requests yet" detail="Requests you send appear here with their status." />
        )}
      </div>
    </ResourceGate>
  );
}

import { useState } from "react";
import { Link } from "react-router-dom";
import type { SessionUser } from "@eswasaone/shared-ui";
import { INSTITUTION_NAV, type InstitutionRouteId } from "../nav";
import {
  findPendingForUserModule,
  submitAccessRequest,
} from "../hr/accessRequests";

type Props = {
  routeId: InstitutionRouteId;
  user: SessionUser;
};

export function AccessDeniedPanel({ routeId, user }: Props) {
  const nav = INSTITUTION_NAV.find((n) => n.id === routeId);
  const moduleLabel = nav?.title ?? nav?.label ?? "this module";
  const username = user.username;

  const [pending, setPending] = useState(() =>
    findPendingForUserModule(username, routeId),
  );
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const [err, setErr] = useState<string | null>(null);

  function onRequest() {
    setBusy(true);
    setErr(null);
    try {
      // TODO: wire real — POST /hr/access-requests (confirm-before-commit)
      const created = submitAccessRequest({
        moduleId: routeId,
        moduleLabel,
        requesterUsername: username,
        requesterName: user.full_name || username,
        requesterEmail: user.email || "",
        note,
      });
      setPending(created);
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : "Could not send request.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="panel access-denied">
      <h3>Access needed</h3>
      <p style={{ color: "var(--muted)" }}>
        You do not have access to <strong>{moduleLabel}</strong> yet. If you need this
        module for your work, send a request to your supervisor. Your head of department
        or HR can review it from HR &amp; People.
      </p>

      {pending ? (
        <p className="access-denied__ok" role="status">
          Request sent ({pending.id}). Your supervisor or HR will review it.
        </p>
      ) : (
        <div className="access-denied__form">
          <label>
            Optional note for your supervisor
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={3}
              placeholder="e.g. Need Finance for invoice follow-ups in my unit"
              disabled={busy}
            />
          </label>
          {err ? <p className="page-note">{err}</p> : null}
          <button
            type="button"
            className="btn-primary"
            disabled={busy}
            onClick={onRequest}
          >
            {busy ? "Sending…" : "Request access from supervisor"}
          </button>
        </div>
      )}

      <Link to="/" className="btn ghost" style={{ display: "inline-flex", marginTop: 12 }}>
        Back to dashboard
      </Link>
    </div>
  );
}

import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import type { SessionUser } from "@eswasaone/shared-ui";
import { INSTITUTION_NAV, type InstitutionRouteId } from "../nav";
import { errorText } from "../hr/api";
import {
  findPendingForUserModule,
  submitAccessRequest,
  type ModuleAccessRequest,
} from "../hr/accessRequests";

type Props = {
  routeId: InstitutionRouteId;
  user: SessionUser;
};

export function AccessDeniedPanel({ routeId, user }: Props) {
  const nav = INSTITUTION_NAV.find((n) => n.id === routeId);
  const moduleLabel = nav?.title ?? nav?.label ?? "this module";
  const username = user.username;

  const [pending, setPending] = useState<ModuleAccessRequest | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const [err, setErr] = useState<string | null>(null);

  // A request already sent for this module shows instead of the form.
  useEffect(() => {
    let live = true;
    findPendingForUserModule(username, routeId)
      .then((r) => {
        if (live) setPending(r ?? null);
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [username, routeId]);

  async function onRequest() {
    setBusy(true);
    setErr(null);
    try {
      setPending(await submitAccessRequest({ moduleId: routeId, moduleLabel, note }));
    } catch (ex) {
      setErr(errorText(ex, "Request not sent. Try again."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="panel access-denied">
      <h3>Access needed</h3>
      <p style={{ color: "var(--muted)" }}>
        You do not have access to <strong>{moduleLabel}</strong> yet. If you need this
        module for your work, send a request. HR or a System Manager reviews it in HR &amp; People
        or in Approvals.
      </p>

      {pending ? (
        <p className="access-denied__ok" role="status">
          Request sent ({pending.id}). HR or a System Manager will review it.
        </p>
      ) : (
        <div className="access-denied__form">
          <label>
            Why you need it (optional)
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={3}
              placeholder="e.g. Need Finance for invoice follow-ups in my unit"
              disabled={busy}
            />
          </label>
          {err ? (
            <p className="page-note" role="alert">
              {err}
            </p>
          ) : null}
          <button
            type="button"
            className="btn-primary"
            disabled={busy}
            onClick={() => void onRequest()}
          >
            {busy ? "Sending…" : "Request access"}
          </button>
        </div>
      )}

      <Link to="/" className="btn ghost" style={{ display: "inline-flex", marginTop: 12 }}>
        Back to dashboard
      </Link>
    </div>
  );
}

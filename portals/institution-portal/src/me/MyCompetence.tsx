import { useState } from "react";
import { apiFetch } from "@eswasaone/shared-ui";
import { useApiResource } from "../hooks/useApiResource";
import { EmptyState, ResourceGate } from "../components/PageStates";
import { useInstitution } from "../layout/InstitutionLayout";
import type { HrAuthorisationRow } from "../api/types";
import { AuthPill } from "../hr/competence/shared";
import { Banner, Crumbs, fmtDay, NextStep } from "./parts";
import { useHrSettings } from "../hr/useHrSettings";

/**
 * E8 My authorisations (journey J4, employee side): what work I can be assigned, what is ending, and
 * "ask HR to renew" with what I've done towards it. Live GET /hr/me/competence.
 */
export function MyCompetence() {
  const { user, sessionKey } = useInstitution();
  const alertDays = useHrSettings()?.expiry_alert_days ?? [];
  const res = useApiResource<{ items: HrAuthorisationRow[] }>("/hr/me/competence", { enabled: Boolean(user), refreshKey: sessionKey });
  const items = res.data?.items ?? [];
  const due = items.filter((r) => r.status === "Expiring" || r.status === "Expired");

  return (
    <ResourceGate loading={res.loading} error={res.error} onRetry={res.reload} refreshing={res.refreshing} hasData={Boolean(res.data)}>
      <div className="hr-view">
        <Crumbs items={[["My HR", ".."], ["My authorisations"]]} />
        <div className="hr-head">
          <div>
            <h2>My authorisations</h2>
            <p>The audit, review and calibration work you can be assigned to.</p>
          </div>
        </div>

        {items.length ? (
          <div className="hr-box hr-scroll">
            <table className="hr-table">
              <thead>
                <tr>
                  <th>Competence</th>
                  <th>Valid</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {items.map((r) => (
                  <tr key={r.id}>
                    <td>
                      <b>{r.skill}</b>
                    </td>
                    <td>
                      {fmtDay(r.valid_from, true)} to {r.valid_to ? fmtDay(r.valid_to, true) : "no end date"}
                    </td>
                    <td>
                      <AuthPill status={r.status} validTo={r.valid_to} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState title="No authorisations yet" detail="If your post needs one, HR records it with your evidence and your head of department approves it." />
        )}

        {due.map((r) => (
          <RenewalAsk key={r.id} row={r} />
        ))}

        {due.length ? null : (
          <NextStep
            title="Nothing to renew"
            body={alertDays.length ? `You'll get an alert ${alertDays.join(", ")} days before any of these ends.` : "You'll get an alert before any of these ends."}
            to=".."
            label="Back to My HR"
          />
        )}
      </div>
    </ResourceGate>
  );
}

function RenewalAsk({ row }: { row: HrAuthorisationRow }) {
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState<number | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function ask() {
    setBusy(true);
    setErr(null);
    try {
      const r = await apiFetch<{ sent_to: number }>("/hr/me/competence/renewal", {
        method: "POST",
        body: JSON.stringify({ skill: row.skill, note: note.trim(), confirm: true }),
      });
      setSent(r.sent_to);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Not sent. Try again.");
    } finally {
      setBusy(false);
    }
  }

  if (sent !== null) {
    return (
      <NextStep
        title={`HR prepares the renewal of ${row.skill}`}
        body="Then the head of your department approves it in Approvals. You'll see it change here."
      />
    );
  }

  return (
    <div className="hr-box">
      <div className="hr-box__h">
        <div>
          <h3>Renew {row.skill}</h3>
          <p>{row.status === "Expired" ? `Ended ${fmtDay(row.valid_to, true)}` : `Ends ${fmtDay(row.valid_to, true)}`}. Until it's renewed you won't be offered this work after that date.</p>
        </div>
      </div>
      <div className="hr-box__b hr-view" style={{ gap: 10 }}>
        <label className="hr-f">
          <span>What have you done towards it?</span>
          <input className="hr-in" value={note} placeholder="e.g. refresher course on 4 Nov, witnessed audit FV-0091" onChange={(e) => setNote(e.target.value)} />
          <small>HR uses this as the evidence reference.</small>
        </label>
        {err ? (
          <Banner kind="bad" title="Not sent">
            {err}
          </Banner>
        ) : null}
        <div>
          <button type="button" className="btn pri" disabled={!note.trim() || busy} onClick={() => void ask()}>
            {busy ? "Sending…" : "Ask HR to renew"}
          </button>
        </div>
      </div>
    </div>
  );
}

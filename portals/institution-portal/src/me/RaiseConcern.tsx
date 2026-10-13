import { useState } from "react";
import { Link } from "react-router-dom";
import { apiFetch } from "@eswasaone/shared-ui";
import { useApiResource } from "../hooks/useApiResource";
import { ResourceGate } from "../components/PageStates";
import { useInstitution } from "../layout/InstitutionLayout";
import type { HrMyConcerns } from "../api/types";
import { Banner, Crumbs, fmtDay, NextStep, StatusPill, Track } from "./parts";

/** E9 Raise a concern in confidence: it goes to one HR Manager you didn't exclude; your line manager isn't told. */
export function RaiseConcern() {
  const { user, sessionKey } = useInstitution();
  const res = useApiResource<HrMyConcerns>("/hr/me/concerns", { enabled: Boolean(user), refreshKey: sessionKey });
  const [category, setCategory] = useState("");
  const [what, setWhat] = useState("");
  const [exclude, setExclude] = useState<string[]>([]);
  const [talkFirst, setTalkFirst] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [sent, setSent] = useState<{ id: string; handled_by?: string | null } | null>(null);
  const d = res.data;
  const left = (d?.handlers ?? []).filter((h) => !exclude.includes(h.user));
  const ready = Boolean(what.trim() && category && left.length > 0);

  async function send() {
    setBusy(true);
    setErr(null);
    try {
      setSent(
        await apiFetch<{ id: string; handled_by?: string | null }>("/hr/me/concerns", {
          method: "POST",
          body: JSON.stringify({ description: what.trim(), grievance_type: category || null, not_handled_by: exclude, talk_first: talkFirst, confirm: true }),
        }),
      );
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Not sent. Try again.");
    } finally {
      setBusy(false);
    }
  }

  if (sent)
    return (
      <div className="hr-view">
        <Crumbs items={[["My HR", "/me"], ["Concern received"]]} />
        <div className="hr-head">
          <div>
            <h2>Your concern has been received</h2>
            <p>
              Reference {sent.id}. Only {sent.handled_by ?? "the HR Manager"} sees it. Your line manager isn't told unless you agree.
            </p>
          </div>
        </div>
        <div className="hr-box">
          <div className="hr-box__b">
            <Track
              steps={[
                { title: "You raised it", detail: "In confidence", state: "done" },
                { title: `${sent.handled_by ?? "The HR Manager"} contacts you`, detail: talkFirst ? "Before anything is investigated" : "With the next step", state: "now" },
                { title: "Resolved", detail: "You see the status in My HR" },
              ]}
            />
          </div>
        </div>
        <NextStep title="Back to My HR" to="/me" label="My HR" />
      </div>
    );

  return (
    <ResourceGate loading={res.loading} error={res.error} onRetry={res.reload} hasData={Boolean(d)} skeleton="panel">
      {d ? (
        <div className="hr-view">
          <Crumbs items={[["My HR", "/me"], ["Raise a concern"]]} />
          <div className="hr-head">
            <div>
              <h2>Raise a concern in confidence</h2>
              <p>Only one HR Manager sees it. Your line manager isn't told unless you agree.</p>
            </div>
          </div>
          <div className="hr-box">
            <div className="hr-box__b hr-form">
              {d.categories.length ? (
                <label className="hr-f">
                  <span>What is it about?</span>
                  <select className="hr-in" value={category} onChange={(e) => setCategory(e.target.value)}>
                    <option value="">Choose…</option>
                    {d.categories.map((c) => (
                      <option key={c}>{c}</option>
                    ))}
                  </select>
                </label>
              ) : (
                <div className="wide">
                  <Banner kind="info" title="No concern categories yet">
                    You can't send a concern here until HR adds the categories. Speak to the HR Manager or the Executive Director in the meantime.
                  </Banner>
                </div>
              )}
              {d.handlers.length > 1 ? (
                <fieldset className="hr-f wide">
                  <legend>Anyone who should not handle it? (optional)</legend>
                  <div className="hr-radios">
                    {d.handlers.map((h) => (
                      <label className="hr-radio" key={h.user}>
                        <input type="checkbox" checked={exclude.includes(h.user)} onChange={(e) => setExclude((cur) => (e.target.checked ? [...cur, h.user] : cur.filter((x) => x !== h.user)))} />
                        <span>
                          <b>{h.name ?? h.user}</b>
                        </span>
                      </label>
                    ))}
                  </div>
                  {!left.length ? <small>Leave at least one HR Manager to handle it.</small> : null}
                </fieldset>
              ) : null}
              <label className="hr-f wide">
                <span>What happened</span>
                <textarea className="hr-in" rows={5} value={what} onChange={(e) => setWhat(e.target.value)} placeholder="Facts, dates, anyone who saw it" />
              </label>
              <label className="hr-radio wide">
                <input type="checkbox" checked={talkFirst} onChange={(e) => setTalkFirst(e.target.checked)} />
                <span>
                  <b>I'd like to talk to HR before anything is investigated</b>
                </span>
              </label>
            </div>
          </div>
          {err ? (
            <Banner kind="bad" title="Not sent">
              {err}
            </Banner>
          ) : null}
          <div className="hr-actions">
            <Link className="btn ghost" to="/me">
              Cancel
            </Link>
            <button type="button" className="btn pri" disabled={!ready || busy} onClick={() => void send()}>
              {busy ? "Sending…" : "Send in confidence"}
            </button>
          </div>
          {d.items.length ? (
            <div className="hr-box hr-scroll">
              <div className="hr-box__h">
                <div>
                  <h3>Concerns you raised</h3>
                </div>
              </div>
              <table className="hr-table">
                <tbody>
                  {d.items.map((i) => (
                    <tr key={i.id}>
                      <td className="mono">{i.id}</td>
                      <td>{fmtDay(i.raised_on, true)}</td>
                      <td>
                        <StatusPill cls={["Resolved", "Invalid", "Cancelled"].includes(i.status) ? "ok" : "leave"} label={i.status} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </div>
      ) : null}
    </ResourceGate>
  );
}

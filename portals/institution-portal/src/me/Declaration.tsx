import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { apiFetch } from "@eswasaone/shared-ui";
import { useApiResource } from "../hooks/useApiResource";
import { ResourceGate } from "../components/PageStates";
import { useInstitution } from "../layout/InstitutionLayout";
import type { HrDeclarationInterest, HrMyDeclaration } from "../api/types";
import { Banner, Crumbs, fmtDay, fmtRange, NextStep, Track } from "./parts";

type Row = HrDeclarationInterest;
const BLANK: Row = { organisation: "", relationship: "", from_date: "", to_date: "" };
const STEPS = ["Your interests", "Confidentiality", "Sign"] as const;

/**
 * E6 Impartiality and confidentiality declaration (journey J5). Three steps; rules live in
 * eswasa_hr.declarations, so the server message is shown as-is if signing is refused.
 */
export function Declaration() {
  const { user, sessionKey } = useInstitution();
  const res = useApiResource<HrMyDeclaration>("/hr/me/declaration", { enabled: Boolean(user), refreshKey: sessionKey });
  const d = res.data;

  const [step, setStep] = useState(0);
  const [rows, setRows] = useState<Row[]>([{ ...BLANK }]);
  const [nothingElse, setNothingElse] = useState(false);
  const [accepted, setAccepted] = useState(false);
  const [signedName, setSignedName] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [signed, setSigned] = useState<HrMyDeclaration | null>(null);

  useEffect(() => {
    if (d?.interests?.length) setRows(d.interests.map((r) => ({ ...BLANK, ...r })));
    if (d?.nothing_else) setNothingElse(true);
  }, [d]);

  const filled = rows.filter((r) => r.organisation.trim() || r.relationship.trim());
  const incomplete = filled.find((r) => !r.organisation.trim() || !r.relationship.trim());
  const step1Ok = !incomplete && (filled.length > 0 || nothingElse);
  const canSign = step1Ok && accepted && signedName.trim().length >= 3;

  function setRow(i: number, patch: Partial<Row>) {
    setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  }

  async function sign() {
    setBusy(true);
    setErr(null);
    try {
      const out = await apiFetch<HrMyDeclaration>("/hr/me/declaration", {
        method: "POST",
        body: JSON.stringify({
          interests: filled.map((r) => ({
            organisation: r.organisation.trim(),
            relationship: r.relationship,
            from_date: r.from_date || null,
            to_date: r.to_date || null,
          })),
          nothing_else: nothingElse,
          confidentiality_accepted: accepted,
          signed_name: signedName.trim(),
          confirm: true,
        }),
      });
      setSigned(out);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Not signed. Try again.");
    } finally {
      setBusy(false);
    }
  }

  const done = signed ?? (d?.status === "signed" ? d : null);
  if (done) {
    return (
      <div className="hr-view">
        <Crumbs items={[["My HR", ".."], ["Declaration"]]} />
        <div className="hr-head">
          <div>
            <h2>Declaration signed</h2>
            <p>
              {done.year_label}, signed {fmtDay(done.signed_on, true)}.
            </p>
          </div>
        </div>
        <Banner kind="ok" title="On file">
          No approval is needed. The audit planner uses your list from now, so you can be assigned to audits and
          decisions again, except for the organisations you listed.
        </Banner>
        <div className="hr-box">
          <div className="hr-box__h">
            <div>
              <h3>What you declared</h3>
            </div>
          </div>
          <div className="hr-box__b">
            {done.interests.length ? (
              <div className="hr-out">
                {done.interests.map((r) => (
                  <div className="hr-out__i" key={`${r.organisation}-${r.from_date}`}>
                    <div>
                      <b>{r.organisation}</b>
                      <span className="s">
                        {r.relationship}
                        {r.from_date ? `, ${fmtRange(r.from_date, r.to_date)}` : ""}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="hr-note">Nothing to declare.</p>
            )}
            <p className="hr-note" style={{ marginTop: 10 }}>
              Something changed during the year? Tell HR so they can amend it.
            </p>
          </div>
        </div>
        <NextStep title="Nothing else to do" body="You'll be asked again at the start of next year." to=".." label="Back to My HR" />
      </div>
    );
  }

  return (
    <ResourceGate loading={res.loading} error={res.error} onRetry={res.reload} hasData={Boolean(d)} skeleton="panel">
      {d ? (
        <div className="hr-view">
          <Crumbs items={[["My HR", ".."], ["Declaration"]]} />
          <div className="hr-head">
            <div>
              <h2>Impartiality and confidentiality declaration</h2>
              <p>{d.year_label}. About 3 minutes. Until you sign, you can't be assigned to audits or decisions.</p>
            </div>
          </div>

          <ol className="hr-steps" aria-label="Steps">
            {STEPS.map((s, i) => (
              <li key={s} className={i < step ? "done" : i === step ? "now" : ""} aria-current={i === step ? "step" : undefined}>
                <em>Step {i + 1}</em>
                <b>{s}</b>
              </li>
            ))}
          </ol>

          <div className="hr-box">
            <div className="hr-box__b">
              {step === 0 ? (
                <div className="hr-view" style={{ gap: 12 }}>
                  <p className="hr-note">
                    List every organisation you have worked for, consulted to, owned part of, sat on the board of, or where
                    a close family member works, since {fmtDay(d.look_back_from, true)}. The audit planner keeps you off
                    their audits and decisions.
                  </p>
                  {rows.map((r, i) => (
                    <fieldset key={i} className="hr-form" style={{ border: "1px solid var(--line)", borderRadius: 10, padding: 12, margin: 0 }}>
                      <legend className="hr-note" style={{ padding: "0 4px" }}>
                        Organisation {i + 1}
                      </legend>
                      <label className="hr-f">
                        <span>Organisation</span>
                        <input className="hr-in" value={r.organisation} onChange={(e) => setRow(i, { organisation: e.target.value })} />
                      </label>
                      <label className="hr-f">
                        <span>Relationship</span>
                        <select className="hr-in" value={r.relationship} onChange={(e) => setRow(i, { relationship: e.target.value })}>
                          <option value="">Choose…</option>
                          {d.relationships.map((x) => (
                            <option key={x}>{x}</option>
                          ))}
                        </select>
                      </label>
                      <label className="hr-f">
                        <span>From</span>
                        <input className="hr-in" type="date" value={r.from_date ?? ""} onChange={(e) => setRow(i, { from_date: e.target.value })} />
                      </label>
                      <label className="hr-f">
                        <span>To</span>
                        <input className="hr-in" type="date" value={r.to_date ?? ""} onChange={(e) => setRow(i, { to_date: e.target.value })} />
                        <small>Leave empty if it's ongoing</small>
                      </label>
                      {rows.length > 1 ? (
                        <div className="wide">
                          <button type="button" className="hr-lnk" onClick={() => setRows((rs) => rs.filter((_, j) => j !== i))}>
                            Remove
                          </button>
                        </div>
                      ) : null}
                    </fieldset>
                  ))}
                  <div>
                    <button type="button" className="btn ghost sm" onClick={() => setRows((rs) => [...rs, { ...BLANK }])}>
                      Add another organisation
                    </button>
                  </div>
                  <label className="hr-radio">
                    <input type="checkbox" checked={nothingElse} onChange={(e) => setNothingElse(e.target.checked)} />
                    <span>
                      <b>I have nothing {filled.length ? "else " : ""}to declare</b>
                    </span>
                  </label>
                  {incomplete ? (
                    <Banner kind="warn" title="Finish each organisation">
                      Each one needs a name and a relationship.
                    </Banner>
                  ) : null}
                </div>
              ) : null}

              {step === 1 ? (
                <div className="hr-view" style={{ gap: 12 }}>
                  <blockquote className="hr-banner" style={{ margin: 0, display: "block" }}>
                    {d.confidentiality_text}
                  </blockquote>
                  <label className="hr-radio">
                    <input type="checkbox" checked={accepted} onChange={(e) => setAccepted(e.target.checked)} />
                    <span>
                      <b>I have read and accept the confidentiality undertaking</b>
                      <small>Required by ISO/IEC 17021-1, 17065 and 17025</small>
                    </span>
                  </label>
                </div>
              ) : null}

              {step === 2 ? (
                <div className="hr-view" style={{ gap: 12 }}>
                  <dl className="hr-kv">
                    <div>
                      <dt>Declaration year</dt>
                      <dd>{d.year_label}</dd>
                    </div>
                    <div>
                      <dt>Organisations listed</dt>
                      <dd>{filled.length || "None"}</dd>
                    </div>
                    <div>
                      <dt>Confidentiality</dt>
                      <dd>{accepted ? "Accepted" : "Not accepted yet"}</dd>
                    </div>
                  </dl>
                  <label className="hr-f">
                    <span>Type your full name to sign</span>
                    <input className="hr-in" value={signedName} autoComplete="name" onChange={(e) => setSignedName(e.target.value)} />
                  </label>
                  {err ? (
                    <Banner kind="bad" title="Not signed">
                      {err}
                    </Banner>
                  ) : null}
                </div>
              ) : null}
            </div>
          </div>

          <div className="hr-actions">
            {step > 0 ? (
              <button type="button" className="btn ghost" onClick={() => setStep(step - 1)}>
                Back
              </button>
            ) : (
              <Link className="btn ghost" to="..">
                Cancel
              </Link>
            )}
            {step < 2 ? (
              <button
                type="button"
                className="btn pri"
                disabled={step === 0 ? !step1Ok : !accepted}
                onClick={() => setStep(step + 1)}
              >
                Continue
              </button>
            ) : (
              <button type="button" className="btn pri" disabled={!canSign || busy} onClick={() => void sign()}>
                {busy ? "Signing…" : "Sign declaration"}
              </button>
            )}
          </div>
          <Track
            steps={[
              { title: "You sign", detail: "Now", state: "now" },
              { title: "On file", detail: "No approval needed. HR sees it in the declarations register" },
            ]}
          />
        </div>
      ) : null}
    </ResourceGate>
  );
}

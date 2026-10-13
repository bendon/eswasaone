import { useState } from "react";
import { apiFetch, uploadMedia } from "@eswasaone/shared-ui";
import type { HrSensitive } from "../api/types";
import { errorText, hrSend } from "../hr/api";
import { SensitiveTables } from "../hr/sensitive/Sensitive";
import { Banner } from "./parts";

/**
 * HR additions plan 04: family and medical (level 3) on My profile. Your own details open without a reason, but
 * each view is logged like HR's. Dependants change through a request to an HR Manager, decided in Approvals:
 * adding one needs a birth or marriage certificate, and beneficiary shares stay empty or add up to 100.
 */

const RELATIONSHIPS = ["Spouse", "Child", "Parent", "Other"];
const OWN = "/hr/me/sensitive?level=3";

function loadOwn(): Promise<HrSensitive> {
  return apiFetch<HrSensitive>(OWN);
}

/** Record tab: "Family and medical", hidden until you choose to show it (logged). */
export function MyFamilyBox() {
  const [shown, setShown] = useState<HrSensitive | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function show() {
    setBusy(true);
    setErr(null);
    try {
      setShown(await loadOwn());
    } catch (e) {
      setErr(errorText(e, "Not opened."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="hr-box" aria-label="Family and medical">
      <div className="hr-box__h">
        <div>
          <h3>Family and medical</h3>
          <p>Dependants, beneficiaries and medical aid. Only HR Managers can open these, and each view is recorded.</p>
        </div>
      </div>
      <div className="hr-box__b hr-view" style={{ gap: 10 }}>
        {shown ? (
          <>
            <dl className="hr-kv">
              {shown.fields.map((f) => (
                <div key={f.field}>
                  <dt>{f.label}</dt>
                  <dd>{f.value ?? "—"}</dd>
                </div>
              ))}
            </dl>
            <SensitiveTables tables={shown.tables} />
            <div>
              <button type="button" className="btn ghost sm" onClick={() => setShown(null)}>
                Hide
              </button>
            </div>
          </>
        ) : (
          <div className="hr-lock">
            <span>Hidden.</span>
            <button type="button" className="btn ghost sm" disabled={busy} onClick={() => void show()}>
              {busy ? "Opening…" : "Show (this is logged)"}
            </button>
          </div>
        )}
        {err ? (
          <Banner kind="bad" title="Not opened">
            {err}
          </Banner>
        ) : null}
      </div>
    </div>
  );
}

type Kind = "dependant_add" | "dependant_update" | "dependant_remove";
type Row = Record<string, unknown> & { id?: string };

const EMPTY = { full_name: "", relationship: "", date_of_birth: "", id_number: "", on_medical_aid: false, beneficiary_share: "", phone: "" };

/** Corrections tab: add, change or remove a dependant. */
export function DependantRequest({ onSent }: { onSent?: () => void }) {
  const [kind, setKind] = useState<Kind>("dependant_add");
  const [mine, setMine] = useState<Row[] | null>(null);
  const [dependant, setDependant] = useState("");
  const [row, setRow] = useState({ ...EMPTY });
  const [shares, setShares] = useState<Record<string, string>>({});
  const [reason, setReason] = useState("");
  const [evidence, setEvidence] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [formKey, setFormKey] = useState(0);

  async function loadMine() {
    setErr(null);
    try {
      const out = await loadOwn();
      setMine((out.tables?.[0]?.rows ?? []) as Row[]);
    } catch (e) {
      setErr(errorText(e, "Couldn't load your dependants."));
    }
  }

  function pick(id: string) {
    setDependant(id);
    const r = mine?.find((m) => m.id === id);
    if (!r) return setRow({ ...EMPTY });
    setRow({
      full_name: String(r["Name"] ?? ""),
      relationship: String(r["Relationship"] ?? ""),
      date_of_birth: String(r["Date of birth"] ?? ""),
      id_number: String(r["ID number"] ?? ""),
      on_medical_aid: r["On medical aid"] === "Yes",
      beneficiary_share: r["Beneficiary share (%)"] == null ? "" : String(r["Beneficiary share (%)"]),
      phone: String(r["Phone"] ?? ""),
    });
  }

  const set = (k: keyof typeof EMPTY, v: string | boolean) => setRow((r) => ({ ...r, [k]: v }));
  const others = (mine ?? []).filter((m) => m.id && m.id !== dependant);
  const needsPick = kind !== "dependant_add";

  async function send() {
    setErr(null);
    setOk(null);
    if (needsPick && !dependant) return setErr("Choose one of your dependants.");
    if (kind !== "dependant_remove" && (!row.full_name.trim() || !row.relationship)) return setErr("Give the dependant's full name and relationship.");
    if (!reason.trim()) return setErr("Say why it needs changing.");
    if (kind === "dependant_add" && !evidence) return setErr("Adding a dependant needs evidence, such as a birth or marriage certificate.");
    setBusy(true);
    try {
      const link = evidence ? (await uploadMedia(evidence, "hr/evidence", { allowMock: false })).url : undefined;
      const rebalanced = Object.fromEntries(Object.entries(shares).filter(([, v]) => v.trim() !== "").map(([k, v]) => [k, Number(v)]));
      const body: Record<string, unknown> = { kind, reason: reason.trim(), evidence: link };
      if (needsPick) body.dependant = dependant;
      if (kind !== "dependant_remove") {
        body.row = {
          full_name: row.full_name.trim(),
          relationship: row.relationship,
          date_of_birth: row.date_of_birth || undefined,
          id_number: row.id_number.trim() || undefined,
          on_medical_aid: row.on_medical_aid ? 1 : 0,
          beneficiary_share: row.beneficiary_share === "" ? undefined : Number(row.beneficiary_share),
          phone: row.phone.trim() || undefined,
        };
      }
      if (Object.keys(rebalanced).length) body.shares = rebalanced;
      await hrSend("/hr/me/profile-changes", body);
      setOk("Sent. An HR Manager decides it in Approvals and you'll see the answer below.");
      setRow({ ...EMPTY });
      setShares({});
      setReason("");
      setEvidence(null);
      setDependant("");
      setFormKey((k) => k + 1);
      onSent?.();
    } catch (e) {
      setErr(errorText(e, "Not sent."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="hr-box" key={formKey}>
      <div className="hr-box__h">
        <div>
          <h3>Add or change a dependant</h3>
          <p>Dependants, medical aid cover and death-benefit shares. An HR Manager decides it in Approvals.</p>
        </div>
      </div>
      <div className="hr-box__b hr-view" style={{ gap: 10 }}>
        <div className="hr-radios" role="radiogroup" aria-label="What to do">
          {(
            [
              ["dependant_add", "Add a dependant"],
              ["dependant_update", "Change a dependant"],
              ["dependant_remove", "Remove a dependant"],
            ] as Array<[Kind, string]>
          ).map(([k, label]) => (
            <label className="hr-radio" key={k}>
              <input type="radio" name="dependant_kind" checked={kind === k} onChange={() => (setKind(k), setDependant(""), setRow({ ...EMPTY }))} disabled={busy} />
              <span>
                <b>{label}</b>
              </span>
            </label>
          ))}
        </div>
        {needsPick || mine === null ? (
          mine === null ? (
            <div className="hr-lock">
              <span>{needsPick ? "Load your dependants to choose one." : "To change other beneficiaries' shares, load your dependants."}</span>
              <button type="button" className="btn ghost sm" onClick={() => void loadMine()} disabled={busy}>
                Load my dependants (this is logged)
              </button>
            </div>
          ) : (
            <label className="hr-f">
              <span>Dependant</span>
              <select className="hr-in" value={dependant} onChange={(e) => pick(e.target.value)} disabled={busy}>
                <option value="">Choose…</option>
                {mine.map((m) => (
                  <option key={String(m.id)} value={String(m.id)}>
                    {String(m["Name"] ?? m.id)}
                  </option>
                ))}
              </select>
            </label>
          )
        ) : null}
        {kind !== "dependant_remove" ? (
          <>
            <label className="hr-f">
              <span>Full name</span>
              <input className="hr-in" value={row.full_name} onChange={(e) => set("full_name", e.target.value)} disabled={busy} />
            </label>
            <label className="hr-f">
              <span>Relationship</span>
              <select className="hr-in" value={row.relationship} onChange={(e) => set("relationship", e.target.value)} disabled={busy}>
                <option value="">Choose…</option>
                {RELATIONSHIPS.map((r) => (
                  <option key={r}>{r}</option>
                ))}
              </select>
            </label>
            <label className="hr-f">
              <span>Date of birth</span>
              <input className="hr-in" type="date" value={row.date_of_birth} onChange={(e) => set("date_of_birth", e.target.value)} disabled={busy} />
            </label>
            <label className="hr-f">
              <span>ID number</span>
              <input className="hr-in" value={row.id_number} onChange={(e) => set("id_number", e.target.value)} disabled={busy} />
            </label>
            <label className="hr-f">
              <span>Phone</span>
              <input className="hr-in" value={row.phone} onChange={(e) => set("phone", e.target.value)} disabled={busy} />
            </label>
            <label className="hr-radio">
              <input type="checkbox" checked={row.on_medical_aid} onChange={(e) => set("on_medical_aid", e.target.checked)} disabled={busy} />
              <span>
                <b>On my medical aid</b>
              </span>
            </label>
            <label className="hr-f">
              <span>Beneficiary share (%)</span>
              <input className="hr-in" type="number" min={0} max={100} value={row.beneficiary_share} onChange={(e) => set("beneficiary_share", e.target.value)} disabled={busy} />
              <small>Optional. Shares are empty for everyone, or add up to 100.</small>
            </label>
          </>
        ) : null}
        {others.length ? (
          <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
            <legend className="hr-f">Other beneficiaries' shares (%)</legend>
            {others.map((m) => (
              <label className="hr-f" key={String(m.id)}>
                <span>{String(m["Name"] ?? m.id)}</span>
                <input
                  className="hr-in"
                  type="number"
                  min={0}
                  max={100}
                  placeholder={m["Beneficiary share (%)"] == null ? "" : String(m["Beneficiary share (%)"])}
                  value={shares[String(m.id)] ?? ""}
                  onChange={(e) => setShares((s) => ({ ...s, [String(m.id)]: e.target.value }))}
                  disabled={busy}
                />
              </label>
            ))}
          </fieldset>
        ) : null}
        <label className="hr-f">
          <span>Why it changes</span>
          <input className="hr-in" value={reason} onChange={(e) => setReason(e.target.value)} disabled={busy} />
        </label>
        <label className="hr-f">
          <span>Dependant evidence{kind === "dependant_add" ? " (needed)" : " (optional)"}</span>
          <input className="hr-in" type="file" accept="application/pdf,image/jpeg,image/png" onChange={(e) => setEvidence(e.target.files?.[0] ?? null)} disabled={busy} />
          <small>A birth or marriage certificate, or your medical aid card.</small>
        </label>
        {err ? (
          <Banner kind="bad" title="Not sent">
            {err}
          </Banner>
        ) : null}
        {ok ? (
          <p className="page-note" role="status">
            {ok}
          </p>
        ) : null}
        <div>
          <button type="button" className="btn pri" disabled={busy} onClick={() => void send()}>
            {busy ? "Sending…" : "Send dependant change"}
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Record page kit (gap 01 C2, C6, C7, C8, C14) — one deep-linkable layout for every module record:
 *
 * ┌ Header: back · reference · type · state pill · SLA chip · ActionBar ┐
 * ├ Main: summary · tabs (module body, documents, history) ─┬ Rail: SLA · people · links · independence ┤
 */
import { useRef, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { Icon } from "../icons/Icon";
import { Select } from "../components/Select";
import { useStoreResource } from "../store/localStore";
import type { HistoryEvent, Tone } from "../workflow/types";
import { docsStore, listRecordDocs, removeRecordDoc, uploadRecordDoc, type RecordDoc } from "./docs";

/* ---------------- shell ---------------- */

export type RecordTab = { id: string; label: string; badge?: number | string; render: () => ReactNode };

export function RecordPage({
  back,
  reference,
  type,
  title,
  state,
  tone = "navy",
  chips,
  actions,
  summary,
  tabs,
  rail,
  banner,
  defaultTab,
}: {
  back: { to: string; label: string };
  reference: string;
  type: string;
  title: string;
  state?: string;
  tone?: Tone;
  chips?: ReactNode;
  actions?: ReactNode;
  summary?: ReactNode;
  tabs: RecordTab[];
  rail?: ReactNode;
  banner?: ReactNode;
  defaultTab?: string;
}) {
  const [tab, setTab] = useState(defaultTab ?? tabs[0]?.id);
  const cur = tabs.find((t) => t.id === tab) ?? tabs[0];
  return (
    <div className="eo-record">
      <div className="crm-ws__head eo-record__head">
        <div style={{ minWidth: 0, flex: "1 1 340px" }}>
          <Link to={back.to} className="crm-ws__back">
            <Icon name="i-cleft" /> {back.label}
          </Link>
          <div className="crm-row" style={{ marginTop: 6 }}>
            <span className="crm-ref crm-mono">{reference}</span>
            <span className="crm-pill crm-pill--outline">{type}</span>
            {state ? <span className={`crm-pill crm-pill--${tone}`}>{state}</span> : null}
            {chips}
          </div>
          <h2>{title}</h2>
        </div>
        {actions ? <div className="crm-ws__actions">{actions}</div> : null}
      </div>
      {banner}
      <div className="crm-ws">
        <div className="crm-stack" style={{ minWidth: 0 }}>
          {summary ? <div className="crm-card">{summary}</div> : null}
          <div className="crm-card">
            <div className="crm-tabs" role="tablist">
              {tabs.map((t) => (
                <button key={t.id} type="button" role="tab" aria-selected={t.id === cur?.id} className={t.id === cur?.id ? "on" : ""} onClick={() => setTab(t.id)}>
                  {t.label}
                  {t.badge !== undefined && t.badge !== 0 ? <span className="n">{t.badge}</span> : null}
                </button>
              ))}
            </div>
            <div role="tabpanel">{cur?.render()}</div>
          </div>
        </div>
        {rail ? <aside className="crm-ws__rail">{rail}</aside> : null}
      </div>
    </div>
  );
}

export function RailCard({ title, children, action }: { title: string; children: ReactNode; action?: ReactNode }) {
  return (
    <div className="crm-card">
      <div className="crm-card__h">
        <h3>{title}</h3>
        {action}
      </div>
      {children}
    </div>
  );
}

export function Facts({ rows }: { rows: { label: string; value: ReactNode }[] }) {
  return (
    <dl className="crm-kv">
      {rows.map((r) => (
        <FactRow key={r.label} label={r.label} value={r.value} />
      ))}
    </dl>
  );
}

function FactRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <>
      <dt>{label}</dt>
      <dd>{value === undefined || value === null || value === "" ? "—" : value}</dd>
    </>
  );
}

/* ---------------- history (C7) ---------------- */

export function HistoryTimeline({ events, empty = "No history yet." }: { events: HistoryEvent[]; empty?: string }) {
  if (!events.length) return <p className="crm-muted">{empty}</p>;
  const rows = [...events].reverse();
  return (
    <ul className="crm-timeline eo-history">
      {rows.map((e, i) => (
        <li key={`${e.at}-${i}`} className={i === 0 ? "is-now" : e.reason ? "is-warn" : ""}>
          <b>
            {e.action}
            {e.from && e.to && e.from !== e.to ? (
              <span className="eo-history__tr">
                {" "}
                {e.from} → {e.to}
              </span>
            ) : null}
          </b>
          <span>
            {e.actor}
            {e.on_behalf_of ? ` on behalf of ${e.on_behalf_of}` : ""} · {fmtStamp(e.at)}
            {e.rule ? ` · ${e.rule}` : ""}
          </span>
          {e.reason ? (
            <p className="eo-history__note">
              <b>Reason:</b> {e.reason}
            </p>
          ) : null}
          {e.note ? <p className="eo-history__note">{e.note}</p> : null}
          {e.changes?.length ? (
            <p className="eo-history__note">
              {e.changes.map((c) => (
                <span key={c.field} style={{ display: "block" }}>
                  {c.field}: {c.from ?? "—"} → {c.to ?? "—"}
                </span>
              ))}
            </p>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

export function fmtStamp(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

export function fmtDate(iso?: string): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

/* ---------------- independence (C8) ---------------- */

export function IndependencePanel({
  duties,
  checks,
}: {
  duties: { step: string; people: string[] }[];
  /** Rules for the next step, e.g. "Decision-maker ≠ auditor" with pass/fail. */
  checks?: { rule: string; ok: boolean; detail?: string }[];
}) {
  return (
    <RailCard title="Independence">
      {duties.length ? (
        <dl className="crm-kv">
          {duties.map((d) => (
            <FactRow key={d.step} label={d.step} value={d.people.join(", ")} />
          ))}
        </dl>
      ) : (
        <p className="crm-small">Nobody has acted on this record yet.</p>
      )}
      {checks?.length ? (
        <ul className="eo-checks">
          {checks.map((c) => (
            <li key={c.rule} className={c.ok ? "ok" : "bad"}>
              <Icon name={c.ok ? "i-check-c" : "i-warn"} />
              <span>
                <b>{c.rule}</b>
                {c.detail ? <em>{c.detail}</em> : null}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </RailCard>
  );
}

/* ---------------- documents (C6) ---------------- */

export function DocumentsPanel({
  doctype,
  name,
  by,
  categories = ["Papers", "Evidence", "Correspondence", "Other"],
  required = [],
  gateCategories = [],
  readOnly = false,
}: {
  doctype: string;
  name: string;
  by: string;
  categories?: string[];
  /** Checklist: categories that must have at least one current document. */
  required?: string[];
  /** Categories whose documents are gate artefacts (supersede only). */
  gateCategories?: string[];
  readOnly?: boolean;
}) {
  const res = useStoreResource([docsStore], () => listRecordDocs(doctype, name), [doctype, name]);
  const [cat, setCat] = useState(categories[0]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [newVersionOf, setNewVersionOf] = useState<RecordDoc | null>(null);
  const [showOld, setShowOld] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  const docs = res.data ?? [];
  const current = docs.filter((d) => !d.superseded_by);
  const shown = showOld ? docs : current;

  const onFile = async (file?: File | null) => {
    if (!file) return;
    setBusy(true);
    setErr(null);
    try {
      await uploadRecordDoc({ doctype, name, file, category: newVersionOf?.category ?? cat, by, family: newVersionOf?.family, gate: gateCategories.includes(newVersionOf?.category ?? cat) });
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
      setNewVersionOf(null);
      if (input.current) input.current.value = "";
    }
  };

  return (
    <div className="eo-docs">
      {required.length ? (
        <ul className="eo-checks eo-checks--row">
          {required.map((r) => {
            const ok = current.some((d) => d.category === r);
            return (
              <li key={r} className={ok ? "ok" : "bad"}>
                <Icon name={ok ? "i-check-c" : "i-warn"} />
                <span>
                  <b>{r}</b>
                  <em>{ok ? "Provided" : "Missing"}</em>
                </span>
              </li>
            );
          })}
        </ul>
      ) : null}
      {!readOnly ? (
        <div className="crm-row eo-docs__up">
          <Select value={cat} onChange={(val) => setCat(val)} aria-label="Category">
            {categories.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </Select>
          <button type="button" className="crm-btn crm-btn--sm" disabled={busy} onClick={() => input.current?.click()}>
            <Icon name="i-plus" /> {busy ? "Uploading…" : newVersionOf ? `Upload new version of ${newVersionOf.name}` : "Upload document"}
          </button>
          <input ref={input} type="file" hidden onChange={(e) => void onFile(e.target.files?.[0])} />
          <span className="crm-spacer" />
          <label className="crm-check crm-small">
            <input type="checkbox" checked={showOld} onChange={(e) => setShowOld(e.target.checked)} /> Show earlier versions
          </label>
        </div>
      ) : null}
      {err ? <p className="eo-error">{err}</p> : null}
      {!shown.length ? (
        <p className="crm-muted">No documents yet.</p>
      ) : (
        <div className="crm-table-wrap">
          <table className="crm-table">
            <thead>
              <tr>
                <th>Document</th>
                <th>Category</th>
                <th>Version</th>
                <th>Uploaded</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {shown.map((d) => (
                <tr key={d.id} style={d.superseded_by ? { opacity: 0.55 } : undefined}>
                  <td>
                    <b>{d.name}</b>
                    <span className="crm-small">
                      {Math.round(d.size / 1024)} KB{d.gate ? " · gate document" : ""}
                      {d.superseded_by ? " · superseded" : ""}
                    </span>
                  </td>
                  <td>{d.category}</td>
                  <td>v{d.version}</td>
                  <td>
                    {d.uploaded_by}
                    <span className="crm-small">{fmtStamp(d.at)}</span>
                  </td>
                  <td className="num">
                    {d.url ? (
                      <a className="crm-link" href={d.url} target="_blank" rel="noreferrer" download={d.name}>
                        Open
                      </a>
                    ) : (
                      <span className="crm-small">Sample</span>
                    )}
                    {!readOnly && !d.superseded_by ? (
                      <>
                        {" · "}
                        <button type="button" className="crm-link" onClick={() => (setNewVersionOf(d), input.current?.click())}>
                          New version
                        </button>
                        {!d.gate ? (
                          <>
                            {" · "}
                            <button
                              type="button"
                              className="crm-link"
                              onClick={() => {
                                try {
                                  removeRecordDoc(doctype, name, d.id);
                                } catch (e) {
                                  setErr(e instanceof Error ? e.message : String(e));
                                }
                              }}
                            >
                              Remove
                            </button>
                          </>
                        ) : null}
                      </>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/* ---------------- assistant (C14, L8) ---------------- */

/**
 * "Suggest next step" — proposes only. It summarises history, flags missing documents and drafts
 * the reason/note; the user decides and acts through the ActionBar.
 * TODO: wire real — POST /agent/suggest {doctype, name} → Esi proposal with a one-time token (L8).
 */
export function SuggestButton({ build }: { build: () => { summary: string; flags: string[]; draft?: string; next?: string } }) {
  const [open, setOpen] = useState(false);
  const s = open ? build() : null;
  return (
    <div className="eo-suggest">
      <button type="button" className="crm-btn crm-btn--sm" onClick={() => setOpen((o) => !o)}>
        <Icon name="i-spark" /> {open ? "Hide suggestion" : "Suggest next step"}
      </button>
      {s ? (
        <div className="eo-suggest__b">
          <p>{s.summary}</p>
          {s.flags.length ? (
            <ul>
              {s.flags.map((f) => (
                <li key={f}>{f}</li>
              ))}
            </ul>
          ) : null}
          {s.next ? (
            <p>
              <b>Suggested:</b> {s.next}
            </p>
          ) : null}
          {s.draft ? (
            <>
              <pre className="eo-msgprev__body">{s.draft}</pre>
              <button type="button" className="crm-link" onClick={() => void navigator.clipboard?.writeText(s.draft!)}>
                Copy draft
              </button>
            </>
          ) : null}
          <p className="crm-small">The assistant only proposes. Nothing changes until you act.</p>
        </div>
      ) : null}
    </div>
  );
}

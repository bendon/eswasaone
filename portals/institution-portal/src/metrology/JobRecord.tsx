/**
 * Calibration job record (gap 07 M5–M8): Items · Worksheet · Review · Certificate · Documents · History.
 * Worksheet: method, reference standards (overdue / out-of-service ones blocked), environment,
 * measurement points with error vs tolerance and uncertainty; an out-of-tolerance point notifies the
 * customer at once (R-M2). Reviewer ≠ metrologist (R-M3).
 */
import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Icon } from "@eswasaone/shared-ui";
import { fmtMoney, invoiceTotals } from "@eswasaone/shared-ui/billing";
import {
  actOnJob,
  assignMetrologist,
  dispatchJob,
  eligibleMetrologists,
  equipmentProblem,
  getJob,
  jobActions,
  JOB_DEF,
  jobOot,
  listEquipment,
  listMethods,
  pointError,
  pointOot,
  quoteJob,
  receiveItems,
  reissueCertificate,
  saveWorksheet,
  parseReadingsCsv,
  type CalJob,
  type CalPointRow,
  type JobBundle,
  type Worksheet,
} from "@eswasaone/shared-ui/metrology";
import { DocumentsPanel, Facts, HistoryTimeline, IndependencePanel, RailCard, RecordPage, fmtDate } from "@eswasaone/shared-ui/record";
import { ReasonDialog, dutyList, stateDef, type Actor } from "@eswasaone/shared-ui/workflow";
import { Acts, Gate, run, useDomain, useStaffActor, useToast } from "../domain/ui";

export function JobRecordPage() {
  const { id = "" } = useParams();
  const actor = useStaffActor();
  const [toast, show] = useToast();
  const res = useDomain(() => getJob(id), [id]);
  return <Gate res={res} what="Calibration job">{(b) => <Job b={b} actor={actor} show={show} toast={toast} />}</Gate>;
}

type Dlg = null | "quote" | "receive" | "assign" | "dispatch" | "reissue";

function Job({ b, actor, show, toast }: { b: JobBundle; actor: Actor; show: (m: string) => void; toast: React.ReactNode }) {
  const j = b.job;
  const [dlg, setDlg] = useState<Dlg>(null);
  const acts = jobActions(j.id, actor);
  const custom: Record<string, Dlg> = { quote: "quote", receive: "receive", assign: "assign", dispatch: "dispatch" };
  return (
    <>
      {toast}
      <RecordPage
        back={{ to: "/metrology/jobs", label: "Jobs" }}
        reference={j.id}
        type={`${j.discipline} calibration · ${j.location === "onsite" ? "on site" : "lab"}`}
        title={j.customer}
        state={stateDef(JOB_DEF, j.state)?.label}
        tone={stateDef(JOB_DEF, j.state)?.tone}
        chips={jobOot(j) ? <span className="crm-pill crm-pill--red">Out of tolerance</span> : j.accreditation ? <span className="crm-pill crm-pill--outline">Accredited</span> : null}
        actions={
          <>
            {acts
              .filter((a) => custom[a.action])
              .map((a) => (
                <button key={a.action} type="button" className={`crm-btn${a.primary ? " crm-btn--pri" : ""}`} disabled={Boolean(a.disabledReason)} title={a.disabledReason} onClick={() => setDlg(custom[a.action])}>
                  {a.label}
                </button>
              ))}
            {j.certificate ? (
              <Link className="crm-btn" to={`/print/calcert/${j.id}`} target="_blank">
                <Icon name="i-download" /> Certificate
              </Link>
            ) : null}
            <Acts actions={acts} state={j.state} hide={Object.keys(custom)} toast={show} act={(a, input) => actOnJob(j.id, a.action, actor, input)} />
          </>
        }
        banner={j.oot_notified_at ? <div className="crm-banner crm-banner--err">Out-of-tolerance notice sent to the customer on {fmtDate(j.oot_notified_at)} (R-M2).</div> : null}
        summary={
          <Facts
            rows={[
              { label: "Contact", value: `${j.contact}${j.phone ? ` · ${j.phone}` : ""}` },
              { label: "Items", value: j.items.map((i) => `${i.description} (SN ${i.serial}, ${i.range})`).join("; ") },
              { label: "Requested", value: `${fmtDate(j.created_at)} · preferred ${fmtDate(j.preferred_date)} · ${j.delivery === "courier" ? "return by courier" : "customer collects"}` },
              { label: "Due", value: fmtDate(j.due) },
              { label: "Notes", value: j.notes },
            ]}
          />
        }
        tabs={[
          {
            id: "worksheet",
            label: "Worksheet",
            render: () => <WorksheetTab b={b} actor={actor} show={show} />,
          },
          {
            id: "items",
            label: "Items & receipt",
            render: () => (
              <div className="crm-stack">
                <table className="crm-table">
                  <thead>
                    <tr>
                      <th>Item</th>
                      <th>Make / model</th>
                      <th>Serial</th>
                      <th>Range / resolution</th>
                    </tr>
                  </thead>
                  <tbody>
                    {j.items.map((i) => (
                      <tr key={i.id}>
                        <td>{i.description}</td>
                        <td>{[i.make, i.model].filter(Boolean).join(" ") || "—"}</td>
                        <td className="crm-mono">{i.serial}</td>
                        <td>
                          {i.range}
                          {i.resolution ? ` · ${i.resolution}` : ""}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {j.receipt ? (
                  <Facts rows={[{ label: "Received", value: `${fmtDate(j.receipt.at)} by ${j.receipt.by}` }, { label: "Condition", value: `${j.receipt.condition}${j.receipt.mismatch ? ` — ${j.receipt.mismatch}` : ""}` }, { label: "Accessories", value: j.receipt.accessories }, { label: "Job tag", value: j.receipt.tag }]} />
                ) : (
                  <p className="crm-muted">{j.location === "onsite" ? "On-site job — no lab receipt." : "Not received yet."}</p>
                )}
                {b.visit ? (
                  <p>
                    Field visit:{" "}
                    <Link className="crm-link" to={`/field/visits/${b.visit.id}`}>
                      {b.visit.id} · {b.visit.state}
                    </Link>
                  </p>
                ) : null}
              </div>
            ),
          },
          {
            id: "quote",
            label: "Quote & invoice",
            render: () =>
              j.quote ? (
                <div className="crm-stack">
                  <table className="crm-table">
                    <tbody>
                      {j.quote.lines.map((l, i) => (
                        <tr key={i}>
                          <td>{l.label}</td>
                          <td className="num">{l.qty}</td>
                          <td className="num">{fmtMoney(l.unit_price * l.qty)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <p className="crm-small">
                    Issued {fmtDate(j.quote.issued_at)} by {j.quote.issued_by}, valid until {fmtDate(j.quote.valid_until)}.
                    {b.invoice ? ` Invoice ${b.invoice.id}: ${b.invoice.status}, balance ${fmtMoney(invoiceTotals(b.invoice).balance)}.` : ""}
                  </p>
                </div>
              ) : (
                <p className="crm-muted">No quote yet.</p>
              ),
          },
          {
            id: "certificate",
            label: "Certificate",
            render: () =>
              j.certificate ? (
                <div className="crm-stack">
                  <Facts rows={[{ label: "Certificate", value: `${j.certificate.id} (v${j.certificate.version})` }, { label: "Issued", value: `${fmtDate(j.certificate.issued_at)} by ${j.certificate.by}` }, { label: "Verify token", value: <span className="crm-mono">{j.certificate.token}</span> }, { label: "Reason for reissue", value: j.certificate.reason }]} />
                  <div className="crm-row">
                    <Link className="crm-btn crm-btn--sm" to={`/print/calcert/${j.id}`} target="_blank">
                      Preview / print
                    </Link>
                    <Link className="crm-btn crm-btn--sm" to={`/print/cal-label/${j.id}`} target="_blank">
                      Print QR labels
                    </Link>
                    <button type="button" className="crm-btn crm-btn--sm" onClick={() => setDlg("reissue")}>
                      Amend (new version)
                    </button>
                  </div>
                </div>
              ) : (
                <p className="crm-muted">Issued after the review (R-M3).</p>
              ),
          },
          { id: "docs", label: "Documents", render: () => <DocumentsPanel doctype="Calibration Job" name={j.id} by={actor.name} categories={["Raw data", "Photos", "Customer documents", "Certificate", "Other"]} gateCategories={["Certificate"]} /> },
          { id: "history", label: "History", render: () => <HistoryTimeline events={j.history} /> },
        ]}
        rail={
          <>
            <RailCard title="People">
              <Facts rows={[{ label: "Metrologist", value: j.metrologist ?? "—" }, { label: "Reviewer", value: j.duties?.Reviewer?.join(", ") ?? "—" }]} />
            </RailCard>
            <IndependencePanel duties={dutyList(j)} checks={[{ rule: "Reviewer ≠ metrologist", ok: !(j.duties?.Metrologist ?? []).includes(actor.name), detail: (j.duties?.Metrologist ?? []).includes(actor.name) ? "You recorded these results, so a different reviewer must approve." : undefined }]} />
            <RailCard title="Traceability">
              {b.refs.length ? (
                <ul className="crm-small" style={{ margin: 0, paddingLeft: 16 }}>
                  {b.refs.map((r) => (
                    <li key={r.id}>
                      {r.id} {r.name} — due {fmtDate(r.cal_due)}
                      {equipmentProblem(r) ? <b style={{ color: "var(--red)" }}> · {equipmentProblem(r)}</b> : null}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="crm-small">No reference standards selected.</p>
              )}
            </RailCard>
          </>
        }
      />
      {dlg === "quote" ? <QuoteDialog j={j} actor={actor} onClose={() => setDlg(null)} show={show} /> : null}
      {dlg === "receive" ? <ReceiveDialog j={j} actor={actor} onClose={() => setDlg(null)} show={show} /> : null}
      {dlg === "assign" ? <AssignDialog j={j} actor={actor} onClose={() => setDlg(null)} show={show} /> : null}
      {dlg === "dispatch" ? (
        <ReasonDialog
          title="Record collection / dispatch"
          consequence="Closes the job (R-M4). The next due date is already in the customer's instrument register."
          fields={[
            { key: "method", label: "How", type: "select", required: true, options: [{ value: "collection", label: "Collected at the counter" }, { value: "courier", label: "Courier" }] },
            { key: "name", label: "Collected by / courier name", required: true },
            { key: "reference", label: "Waybill / ID number" },
          ]}
          onClose={() => setDlg(null)}
          onSubmit={async (v) => {
            dispatchJob(j.id, { method: (v.payload?.method as "collection" | "courier") ?? "collection", name: v.payload?.name ?? "", reference: v.payload?.reference }, actor, j.state);
            setDlg(null);
            show("Dispatched.");
          }}
        />
      ) : null}
      {dlg === "reissue" ? (
        <ReasonDialog
          title="Amend certificate"
          consequence="Issues a new version (gate document). The earlier certificate stays on record as superseded."
          requires="reason"
          onClose={() => setDlg(null)}
          onSubmit={async (v) => {
            reissueCertificate(j.id, v.reason ?? "", actor);
            setDlg(null);
            show("New certificate version issued.");
          }}
        />
      ) : null}
    </>
  );
}

function QuoteDialog({ j, actor, onClose, show }: { j: CalJob; actor: Actor; onClose: () => void; show: (m: string) => void }) {
  const [lines, setLines] = useState(j.items.map((i) => ({ label: `Calibration — ${i.description} (${i.range})`, qty: 1, unit_price: j.location === "onsite" ? 2400 : 650 })).concat(j.location === "onsite" ? [{ label: "Travel and test loads", qty: 1, unit_price: 1800 }] : []));
  const [days, setDays] = useState("30");
  return (
    <ReasonDialog
      title={`Quote ${j.id}`}
      consequence="Sends the quote to the customer, who accepts it online (or you record an offline acceptance)."
      confirmLabel="Send quote"
      onClose={onClose}
      onSubmit={async () => {
        quoteJob(j.id, lines, Number(days) || 30, actor);
        onClose();
        show("Quote sent.");
      }}
    >
      {lines.map((l, i) => (
        <div key={i} className="crm-row">
          <input className="crm-input" style={{ flex: 3 }} value={l.label} onChange={(e) => setLines(lines.map((x, k) => (k === i ? { ...x, label: e.target.value } : x)))} />
          <input className="crm-input" style={{ width: 70 }} type="number" value={l.qty} onChange={(e) => setLines(lines.map((x, k) => (k === i ? { ...x, qty: Number(e.target.value) } : x)))} />
          <input className="crm-input" style={{ width: 110 }} type="number" value={l.unit_price} onChange={(e) => setLines(lines.map((x, k) => (k === i ? { ...x, unit_price: Number(e.target.value) } : x)))} />
        </div>
      ))}
      <div className="crm-row">
        <button type="button" className="crm-btn crm-btn--sm crm-btn--ghost" onClick={() => setLines([...lines, { label: "", qty: 1, unit_price: 0 }])}>
          + Line
        </button>
        <label className="crm-small">
          Valid for <input className="crm-input" style={{ width: 70, display: "inline-block" }} value={days} onChange={(e) => setDays(e.target.value)} /> days
        </label>
        <span className="crm-spacer" />
        <b>{fmtMoney(lines.reduce((n, l) => n + l.qty * l.unit_price, 0) * 1.15)} incl. VAT</b>
      </div>
    </ReasonDialog>
  );
}

export function ReceiveDialog({ j, actor, onClose, show }: { j: CalJob; actor: Actor; onClose: () => void; show: (m: string) => void }) {
  const [r, setR] = useState({ condition: "good" as "good" | "damaged" | "mismatch", accessories: "", mismatch: "", tag: `JT-${j.id.slice(-4)}` });
  return (
    <ReasonDialog
      title={`Log receipt — ${j.id}`}
      consequence="Records arrival, condition and the job tag. A mismatch with the request is flagged to the customer in the receipt."
      confirmLabel="Log receipt & print tag"
      canSubmit={r.condition !== "mismatch" || Boolean(r.mismatch.trim())}
      onClose={onClose}
      onSubmit={async () => {
        receiveItems(j.id, { ...r, mismatch: r.mismatch || undefined, photos: [], at: "", by: "" }, actor);
        onClose();
        show(`Received — tag ${r.tag}.`);
      }}
    >
      <p className="crm-small">Expected: {j.items.map((i) => `${i.description} SN ${i.serial}`).join("; ")}</p>
      <div className="crm-grid crm-grid--2">
        <label className="crm-field">
          Condition
          <select className="crm-select" value={r.condition} onChange={(e) => setR({ ...r, condition: e.target.value as typeof r.condition })}>
            <option value="good">Good</option>
            <option value="damaged">Damaged</option>
            <option value="mismatch">Doesn't match the request</option>
          </select>
        </label>
        <label className="crm-field">
          Job tag (QR)
          <input className="crm-input" value={r.tag} onChange={(e) => setR({ ...r, tag: e.target.value })} />
        </label>
      </div>
      <label className="crm-field">
        Accessories received
        <input className="crm-input" value={r.accessories} onChange={(e) => setR({ ...r, accessories: e.target.value })} placeholder="Probe, case, charger…" />
      </label>
      {r.condition !== "good" ? (
        <label className="crm-field">
          What's different / damaged *
          <input className="crm-input" value={r.mismatch} onChange={(e) => setR({ ...r, mismatch: e.target.value })} />
        </label>
      ) : null}
    </ReasonDialog>
  );
}

function AssignDialog({ j, actor, onClose, show }: { j: CalJob; actor: Actor; onClose: () => void; show: (m: string) => void }) {
  const people = eligibleMetrologists(j.discipline);
  const [who, setWho] = useState(people.find((p) => p.ok)?.name ?? "");
  return (
    <ReasonDialog
      title={`Assign a metrologist — ${j.discipline}`}
      consequence="Only staff authorised for this discipline are eligible."
      confirmLabel="Assign & start"
      canSubmit={Boolean(who)}
      onClose={onClose}
      onSubmit={async () => {
        await assignMetrologist(j.id, who, actor, j.state);
        onClose();
        show(`Assigned to ${who}.`);
      }}
    >
      {people.map((p) => (
        <label key={p.name} className="crm-check" style={p.ok ? undefined : { opacity: 0.55 }}>
          <input type="radio" name="met" disabled={!p.ok} checked={who === p.name} onChange={() => setWho(p.name)} /> {p.name} <span className="crm-small">{p.ok ? `${p.load} open jobs` : `✕ ${p.why}`}</span>
        </label>
      ))}
    </ReasonDialog>
  );
}

function WorksheetTab({ b, actor, show }: { b: JobBundle; actor: Actor; show: (m: string) => void }) {
  const j = b.job;
  const editable = j.state === "In Progress";
  const [ws, setWs] = useState<Worksheet>(structuredClone(j.worksheet));
  const methods = listMethods().filter((m) => m.discipline === j.discipline);
  const equipment = listEquipment().filter((e) => e.discipline === j.discipline);
  const setPoint = (id: string, patch: Partial<CalPointRow>) => setWs({ ...ws, points: ws.points.map((p) => (p.id === id ? { ...p, ...patch } : p)) });
  const method = methods.find((m) => m.id === ws.method_id);
  return (
    <div className="crm-stack">
      {!editable ? <div className="crm-banner crm-banner--lock">The worksheet is {j.state === "Pending Review" ? "locked for review" : j.state === "In Progress" ? "editable" : "read-only"}.</div> : null}
      <div className="crm-grid crm-grid--2">
        <label className="crm-field">
          Method / procedure
          <select className="crm-select" disabled={!editable} value={ws.method_id ?? ""} onChange={(e) => setWs({ ...ws, method_id: e.target.value })}>
            <option value="">Choose…</option>
            {methods.map((m) => (
              <option key={m.id} value={m.id}>
                {m.code} {m.title} {m.accredited ? "(accredited)" : "(not accredited)"}
              </option>
            ))}
          </select>
          {method ? <span className="hint">Range {method.range} · CMC {method.cmc}</span> : null}
          {j.accreditation && method && !method.accredited ? <span className="eo-error">Customer asked for an accredited certificate — this method is outside the scope.</span> : null}
        </label>
        <div className="crm-grid crm-grid--2">
          <label className="crm-field">
            Temperature °C
            <input className="crm-input" type="number" step="0.1" disabled={!editable} value={ws.env.temp_c ?? ""} onChange={(e) => setWs({ ...ws, env: { ...ws.env, temp_c: e.target.value === "" ? undefined : Number(e.target.value) } })} />
          </label>
          <label className="crm-field">
            Humidity % RH
            <input className="crm-input" type="number" disabled={!editable} value={ws.env.rh_pct ?? ""} onChange={(e) => setWs({ ...ws, env: { ...ws.env, rh_pct: e.target.value === "" ? undefined : Number(e.target.value) } })} />
          </label>
        </div>
      </div>
      <div>
        <p className="crm-small" style={{ margin: "0 0 6px" }}>
          Reference standards used (traceability). Overdue or out-of-service equipment can't be selected.
        </p>
        {equipment.map((e) => {
          const p = equipmentProblem(e);
          return (
            <label key={e.id} className="crm-check" style={p ? { opacity: 0.55 } : undefined} title={p ?? undefined}>
              <input type="checkbox" disabled={!editable || Boolean(p)} checked={ws.refs.includes(e.id)} onChange={(ev) => setWs({ ...ws, refs: ev.target.checked ? [...ws.refs, e.id] : ws.refs.filter((x) => x !== e.id) })} /> {e.id} {e.name} <span className="crm-small">{p ? `✕ ${p}` : `due ${fmtDate(e.cal_due)}`}</span>
            </label>
          );
        })}
      </div>
      <div className="crm-table-wrap">
        <table className="crm-table">
          <thead>
            <tr>
              <th>Item</th>
              <th>Nominal</th>
              <th>Unit</th>
              <th>As found</th>
              <th>As left</th>
              <th>Error</th>
              <th>Tol ±</th>
              <th>U (k=2)</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {ws.points.map((p) => (
              <tr key={p.id} style={pointOot(p) ? { background: "var(--red-soft, #fdecec)" } : undefined}>
                <td>
                  <select className="crm-select" disabled={!editable} value={p.item_id} onChange={(e) => setPoint(p.id, { item_id: e.target.value })}>
                    {j.items.map((i) => (
                      <option key={i.id} value={i.id}>
                        {i.serial}
                      </option>
                    ))}
                  </select>
                </td>
                {(["nominal", "unit", "as_found", "as_left"] as const).map((k) => (
                  <td key={k}>
                    <input className="crm-input" style={{ width: k === "unit" ? 56 : 92 }} disabled={!editable} type={k === "unit" ? "text" : "number"} step="any" value={p[k]} onChange={(e) => setPoint(p.id, { [k]: k === "unit" ? e.target.value : Number(e.target.value) } as Partial<CalPointRow>)} />
                  </td>
                ))}
                <td>
                  <b style={{ color: pointOot(p) ? "var(--red)" : undefined }}>{pointError(p)}</b>
                </td>
                {(["tolerance", "uncertainty"] as const).map((k) => (
                  <td key={k}>
                    <input className="crm-input" style={{ width: 80 }} disabled={!editable} type="number" step="any" value={p[k]} onChange={(e) => setPoint(p.id, { [k]: Number(e.target.value) })} />
                  </td>
                ))}
                <td>
                  {editable ? (
                    <button type="button" className="crm-link" onClick={() => setWs({ ...ws, points: ws.points.filter((x) => x.id !== p.id) })}>
                      ✕
                    </button>
                  ) : pointOot(p) ? (
                    <span className="crm-pill crm-pill--red">OOT</span>
                  ) : (
                    <span className="crm-pill crm-pill--green">Pass</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {editable ? (
        <div className="crm-row">
          <button type="button" className="crm-btn crm-btn--sm crm-btn--ghost" onClick={() => setWs({ ...ws, points: [...ws.points, { id: `P${Date.now() % 100000}`, item_id: j.items[0]?.id ?? "I1", nominal: 0, unit: ws.points[0]?.unit ?? "", as_found: 0, as_left: 0, tolerance: ws.points[0]?.tolerance ?? 0, uncertainty: ws.points[0]?.uncertainty ?? 0 }] })}>
            + Point
          </button>
          <CsvImport
            items={j.items.map((i) => ({ id: i.id, label: `${i.id} ${i.description}` }))}
            onApply={(rows) => setWs({ ...ws, points: [...ws.points, ...rows.map((r, n) => ({ ...r, id: `P${(Date.now() + n) % 1000000}` }))] })}
          />
          <button type="button" className="crm-btn crm-btn--sm crm-btn--pri" onClick={() => void run(() => saveWorksheet(j.id, ws, actor), show, "Worksheet saved.")}>
            Save worksheet
          </button>
          <span className="crm-small">Saved {ws.saved_at ? `${fmtDate(ws.saved_at)} by ${ws.saved_by}` : "—"}. Save before submitting for review.</span>
        </div>
      ) : null}
    </div>
  );
}

/** Direct data capture (07 P3): readings exported from a balance / thermometer / logger as CSV. */
function CsvImport({ items, onApply }: { items: { id: string; label: string }[]; onApply: (rows: Omit<CalPointRow, "id">[]) => void }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [item, setItem] = useState(items[0]?.id ?? "I1");
  const parsed = text.trim() ? parseReadingsCsv(text, item) : null;
  if (!open)
    return (
      <button type="button" className="crm-btn crm-btn--sm crm-btn--ghost" onClick={() => setOpen(true)}>
        Import readings (CSV)
      </button>
    );
  return (
    <ReasonDialog
      title="Import readings from CSV"
      consequence="Adds the rows below to the worksheet. Nothing is saved until you save the worksheet."
      confirmLabel={parsed?.rows.length ? `Add ${parsed.rows.length} point(s)` : "Add points"}
      canSubmit={Boolean(parsed?.rows.length)}
      onClose={() => setOpen(false)}
      onSubmit={async () => {
        if (parsed?.rows.length) onApply(parsed.rows);
        setOpen(false);
        setText("");
      }}
    >
      <label className="crm-field">
        Rows without an item column go to
        <select className="crm-select" value={item} onChange={(e) => setItem(e.target.value)}>
          {items.map((i) => (
            <option key={i.id} value={i.id}>
              {i.label}
            </option>
          ))}
        </select>
      </label>
      <label className="crm-field">
        CSV file
        <input
          type="file"
          accept=".csv,text/csv,text/plain"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void f.text().then(setText);
          }}
        />
      </label>
      <label className="crm-field">
        …or paste
        <textarea className="crm-textarea" rows={6} style={{ fontFamily: "ui-monospace, monospace", fontSize: 12 }} placeholder={"nominal,unit,as_found,as_left,tolerance,uncertainty\n100,g,100.0003,100.0001,0.0005,0.0002"} value={text} onChange={(e) => setText(e.target.value)} />
      </label>
      {parsed?.errors.length ? (
        <ul className="eo-error" style={{ margin: 0 }}>
          {parsed.errors.slice(0, 5).map((e) => (
            <li key={e}>{e}</li>
          ))}
        </ul>
      ) : null}
      {parsed?.rows.length ? (
        <table className="crm-table">
          <thead>
            <tr>
              <th>Item</th>
              <th className="num">Nominal</th>
              <th className="num">As found</th>
              <th className="num">As left</th>
              <th className="num">Tol.</th>
              <th className="num">U</th>
            </tr>
          </thead>
          <tbody>
            {parsed.rows.slice(0, 12).map((r, n) => (
              <tr key={n}>
                <td>{r.item_id}</td>
                <td className="num">
                  {r.nominal} {r.unit}
                </td>
                <td className="num">{r.as_found}</td>
                <td className="num">{r.as_left}</td>
                <td className="num">{r.tolerance}</td>
                <td className="num">{r.uncertainty}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}
    </ReasonDialog>
  );
}

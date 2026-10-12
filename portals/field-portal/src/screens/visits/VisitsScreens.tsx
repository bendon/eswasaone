/**
 * Field PWA visit screens (gap 08 F2–F8): Today, all my visits, one Visit screen for every visit type
 * (accept/decline, pack + frozen checklist, GPS check-in, checklist, findings, photos, samples,
 * on-site calibration points, notes, signatures, submit, abort, per-diem claim), Samples with
 * hand-over by scan, and the Outbox. Every write goes through the outbox so it works offline.
 */
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Icon } from "@eswasaone/shared-ui";
import {
  collectSample,
  downloadPack,
  fieldStore,
  getVisit,
  linkClaim,
  listSamples,
  listVisits,
  overdueCheckIn,
  sampleBySeal,
  SAMPLE_STATES,
  VISIT_TYPES,
  visitActions,
  visitDef,
  ESWASA_HQ,
  mapsLink,
  planRoute,
  type LatLng,
  type CalPoint,
  type ChecklistItem,
  type FieldVisit,
  type VisitFinding,
} from "@eswasaone/shared-ui/field";
import { useStoreResource } from "@eswasaone/shared-ui/store";
import { verifyCertificateToken } from "@eswasaone/shared-ui/certification";
import { displayState, stateDef, type Actor } from "@eswasaone/shared-ui/workflow";
import { useAuth } from "../../auth/AuthProvider";
import { clearSent, discard, enqueue, isOffline, outbox, outboxSummary, retry, setSimulatedOffline } from "../../lib/outbox";
import { createExpense } from "../me/api";

/* ---------------- shared ---------------- */

export function useFieldActor(): Actor {
  const { user } = useAuth();
  return useMemo(() => ({ name: user?.full_name || user?.username || "Field officer", roles: user?.roles ?? [] }), [user]);
}

function useField<T>(load: () => T, deps: unknown[] = []) {
  return useStoreResource([fieldStore, outbox], load, deps);
}

const fmt = (iso?: string) => (iso ? new Date(iso).toLocaleString(undefined, { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "—");

function Pill({ v }: { v: FieldVisit }) {
  const sd = stateDef(visitDef(v.type), v.state);
  return <span className={`fv-pill fv-pill--${sd?.tone ?? "slate"}`}>{sd?.label ?? v.state}</span>;
}

function useToast(): [ReactNode, (m: string) => void] {
  const [m, setM] = useState<string | null>(null);
  return [m ? <div className="fv-toast" role="status">{m}</div> : null, (x: string) => (setM(x), window.setTimeout(() => setM(null), 3000))];
}

function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return (
    <>
      <div className="fv-sheet-scrim" onClick={onClose} />
      <div className="fv-sheet" role="dialog" aria-modal="true" aria-label={title}>
        <div className="fv-row">
          <h3 className="fv-grow">{title}</h3>
          <button type="button" className="fv-btn fv-btn--sm" onClick={onClose}>
            Close
          </button>
        </div>
        {children}
      </div>
    </>
  );
}

function VisitCard({ v }: { v: FieldVisit }) {
  return (
    <Link to={`/visits/${v.id}`} className="fv-card fv-link">
      <div className="fv-row">
        <span className="fv-pill fv-pill--slate">{VISIT_TYPES[v.type].short}</span>
        <Pill v={v} />
        {overdueCheckIn(v) ? <span className="fv-pill fv-pill--red">Check in overdue</span> : null}
        {v.conflict && !v.conflict.resolved ? <span className="fv-pill fv-pill--red">Conflict</span> : null}
      </div>
      <div className="fv-title" style={{ marginTop: 6 }}>
        {v.title}
      </div>
      <div className="fv-sub">
        {fmt(v.planned_date)} · {v.site.name}
        {v.site.address ? `, ${v.site.address}` : ""}
      </div>
      <div className="fv-sub">
        {v.site.contact}
        {v.site.phone ? ` · ${v.site.phone}` : ""}
      </div>
    </Link>
  );
}

function myVisits(actor: Actor) {
  const all = listVisits().filter((v) => !["Cancelled"].includes(v.state));
  const mine = all.filter((v) => v.lead === actor.name || v.team.includes(actor.name));
  return { all, mine, showingAll: !mine.length };
}

/* ---------------- Today ---------------- */

export function TodayScreen() {
  const actor = useFieldActor();
  const res = useField(() => myVisits(actor), [actor.name]);
  const sync = outboxSummary();
  const d = res.data;
  if (!d) return <section className="field-screen">Loading…</section>;
  const list = d.showingAll ? d.all : d.mine;
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const end = new Date(start.getTime() + 86_400_000);
  const week = new Date(start.getTime() + 7 * 86_400_000);
  const today = list.filter((v) => new Date(v.planned_date) >= start && new Date(v.planned_date) < end);
  const thisWeek = list.filter((v) => new Date(v.planned_date) >= end && new Date(v.planned_date) < week);
  const todo = list.filter((v) => ["Assigned", "Returned", "In Progress"].includes(v.state) || overdueCheckIn(v));
  return (
    <section className="field-screen fv-stack" aria-label="Today">
      {d.showingAll ? <div className="fv-banner">You're signed in as {actor.name}, with no visits assigned — showing the whole team (demo).</div> : null}
      <Link to="/outbox" className={`fv-card fv-link ${sync.conflict || sync.failed ? "fv-card--err" : sync.pending ? "fv-card--warn" : "fv-card--ok"}`}>
        <div className="fv-row">
          <Icon name="i-refresh" />
          <b className="fv-grow">{sync.label}</b>
          <Icon name="i-cright" />
        </div>
      </Link>
      {todo.length ? (
        <>
          <h2 className="field-screen__title">Needs you</h2>
          {todo.map((v) => (
            <VisitCard key={v.id} v={v} />
          ))}
        </>
      ) : null}
      <RouteCard visits={[...today, ...thisWeek].filter((v) => !["Submitted", "Closed", "Aborted"].includes(v.state))} />
      <h2 className="field-screen__title">Today</h2>
      {today.length ? today.map((v) => <VisitCard key={v.id} v={v} />) : <p className="field-muted">No visits today.</p>}
      <h2 className="field-screen__title">This week</h2>
      {thisWeek.length ? thisWeek.map((v) => <VisitCard key={v.id} v={v} />) : <p className="field-muted">Nothing else this week.</p>}
      <div className="fv-row">
        <Link to="/visits" className="fv-btn fv-grow" style={{ textAlign: "center" }}>
          All visits
        </Link>
        <Link to="/samples" className="fv-btn fv-grow" style={{ textAlign: "center" }}>
          Samples
        </Link>
      </div>
    </section>
  );
}

/* ---------------- all visits ---------------- */

export function VisitsScreen() {
  const actor = useFieldActor();
  const [type, setType] = useState("");
  const [state, setState] = useState("open");
  const res = useField(() => myVisits(actor), [actor.name]);
  const d = res.data;
  if (!d) return <section className="field-screen">Loading…</section>;
  const list = (d.showingAll ? d.all : d.mine).filter((v) => (!type || v.type === type) && (state === "all" ? true : state === "open" ? !["Closed", "Cancelled"].includes(v.state) : v.state === "Closed"));
  return (
    <section className="field-screen fv-stack" aria-label="Visits">
      <div className="fv-seg">
        {[
          ["open", "Open"],
          ["closed", "Closed"],
          ["all", "All"],
        ].map(([k, l]) => (
          <button key={k} type="button" className={state === k ? "on" : ""} onClick={() => setState(k)}>
            {l}
          </button>
        ))}
      </div>
      <div className="fv-seg">
        <button type="button" className={!type ? "on" : ""} onClick={() => setType("")}>
          All types
        </button>
        {Object.entries(VISIT_TYPES).map(([k, c]) => (
          <button key={k} type="button" className={type === k ? "on" : ""} onClick={() => setType(k)}>
            {c.short}
          </button>
        ))}
      </div>
      {list.map((v) => (
        <VisitCard key={v.id} v={v} />
      ))}
      {!list.length ? <p className="field-muted">No visits.</p> : null}
    </section>
  );
}

/* ---------------- one visit ---------------- */

type SheetKind = null | "decline" | "abort" | "finding" | "sample" | "signature" | "claim" | "photo";

export function VisitScreen() {
  const { id = "" } = useParams();
  const actor = useFieldActor();
  const nav = useNavigate();
  const [toast, show] = useToast();
  const [sheet, setSheet] = useState<SheetKind>(null);
  const res = useField(() => getVisit(id), [id]);
  const v = res.data;
  if (res.loading && !v) return <section className="field-screen">Loading…</section>;
  if (!v) return <section className="field-screen">Visit not found. <Link to="/visits">Back</Link></section>;
  const cfg = VISIT_TYPES[v.type];
  const acts = visitActions(v.id, actor);
  const can = (a: string) => acts.find((x) => x.action === a);
  const editing = ["In Progress", "Returned"].includes(v.state) || (v.state === "Confirmed" && Boolean(v.pack));
  const pendingHere = outbox.read().items.filter((i) => i.status !== "sent" && "visit" in i.op && i.op.visit === v.id);
  const send = async (label: string, op: Parameters<typeof enqueue>[1], ok: string) => {
    const r = await enqueue(label, op, actor);
    show(r.status === "sent" ? ok : r.status === "pending" ? `${label}: saved on this device — will send when online.` : `${label}: ${r.status}. ${r.error ?? ""}`);
    return r;
  };
  const doAct = (action: string, input: { reason?: string; note?: string; payload?: Record<string, string> } = {}) => send(can(action)?.label ?? action, { kind: "act", visit: v.id, action, input: { expected_state: v.state, ...input } }, `${can(action)?.label ?? action}: done.`);
  const checkInNow = () => {
    const fallback = () => ({ lat: (v.site.gps?.lat ?? -26.5) + (Math.random() - 0.5) * 0.0004, lng: (v.site.gps?.lng ?? 31.4) + (Math.random() - 0.5) * 0.0004, accuracy: 15 + Math.random() * 20 });
    const go = (gps: { lat: number; lng: number; accuracy: number }) => void send("Check in", { kind: "checkin", visit: v.id, gps }, `Checked in at ${gps.lat.toFixed(4)}, ${gps.lng.toFixed(4)}.`);
    if (navigator.geolocation) navigator.geolocation.getCurrentPosition((p) => go({ lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy }), () => go(fallback()), { timeout: 5000 });
    else go(fallback());
  };

  return (
    <section className="field-screen fv-stack" aria-label="Visit">
      {toast}
      <button type="button" className="fv-btn fv-btn--sm" style={{ alignSelf: "flex-start" }} onClick={() => nav(-1)}>
        ← Back
      </button>
      <div className="fv-card">
        <div className="fv-row">
          <span className="fv-pill fv-pill--slate">{cfg.label}</span>
          <Pill v={v} />
        </div>
        <div className="fv-title" style={{ marginTop: 6, fontSize: 17 }}>
          {v.title}
        </div>
        <dl className="fv-kv" style={{ marginTop: 8 }}>
          <dt>When</dt>
          <dd>
            {fmt(v.planned_date)} · {v.duration_days} day(s)
          </dd>
          <dt>Where</dt>
          <dd>
            {v.site.name}, {v.site.address}
          </dd>
          <dt>Contact</dt>
          <dd>
            {v.site.contact} {v.site.phone ? <a href={`tel:${v.site.phone}`}>{v.site.phone}</a> : null}
          </dd>
          <dt>Team</dt>
          <dd>{v.lead ? [`${v.lead} (lead)`, ...v.team].join(", ") : "—"}</dd>
          {v.parent ? (
            <>
              <dt>For</dt>
              <dd>{v.parent.label}</dd>
            </>
          ) : null}
        </dl>
        {v.site.gps ? (
          <a className="fv-btn fv-btn--sm" style={{ marginTop: 8, display: "inline-block" }} href={`https://maps.google.com/?q=${v.site.gps.lat},${v.site.gps.lng}`} target="_blank" rel="noreferrer">
            <Icon name="i-map" /> Directions
          </a>
        ) : null}
        {v.site.directions ? <p className="fv-sub">{v.site.directions}</p> : null}
      </div>

      {pendingHere.length ? (
        <Link to="/outbox" className="fv-banner fv-banner--warn" style={{ textDecoration: "none", color: "inherit" }}>
          {pendingHere.length} change(s) for this visit not sent yet ({pendingHere.map((p) => `${p.label}: ${p.status}`).join(", ")}).
        </Link>
      ) : null}
      {v.conflict && !v.conflict.resolved ? <div className="fv-banner fv-banner--err">Sync conflict: {v.conflict.detail} — your supervisor will resolve this.</div> : null}
      {v.review?.outcome === "returned" && v.state === "Returned" ? <div className="fv-banner fv-banner--warn">Returned by {v.review.by}: {v.review.note}</div> : null}
      {v.abort ? <div className="fv-banner fv-banner--err">Aborted: {v.abort.reason}</div> : null}
      {v.state === "Accepted" ? <div className="fv-banner">Waiting for the customer to confirm the date.</div> : null}

      {/* lifecycle */}
      <div className="fv-stack">
        {can("accept") ? (
          <div className="fv-row">
            <button type="button" className="fv-btn fv-btn--pri fv-grow" disabled={Boolean(can("accept")!.disabledReason)} onClick={() => void doAct("accept")}>
              Accept visit
            </button>
            <button type="button" className="fv-btn fv-grow" onClick={() => setSheet("decline")}>
              Decline
            </button>
          </div>
        ) : null}
        {v.state === "Confirmed" && !v.pack ? (
          <button type="button" className="fv-btn fv-btn--gold fv-btn--block" onClick={() => (downloadPack(v.id, actor), show(`Pack downloaded — checklist ${v.checklist_version} frozen.`))}>
            <Icon name="i-download" /> Download visit pack
          </button>
        ) : null}
        {can("check_in") ? (
          <button type="button" className="fv-btn fv-btn--pri fv-btn--block" disabled={Boolean(can("check_in")!.disabledReason)} title={can("check_in")!.disabledReason} onClick={checkInNow}>
            <Icon name="i-pin" /> Check in (GPS)
          </button>
        ) : null}
        {v.checkin ? <p className="fv-sub">Checked in {fmt(v.checkin.at)} · {v.checkin.lat.toFixed(4)}, {v.checkin.lng.toFixed(4)} ±{Math.round(v.checkin.accuracy)} m</p> : null}
      </div>

      {v.pack ? (
        <div className="fv-card">
          <h3>Visit pack</h3>
          <p className="fv-sub">
            {v.pack.summary} · downloaded {fmt(v.pack.downloaded_at)} · checklist {v.checklist_version} (frozen)
          </p>
          {v.pack.previous_ncs.length ? <p className="fv-sub">Previous findings: {v.pack.previous_ncs.join("; ")}</p> : null}
          {v.pack.open_samples.length ? <p className="fv-sub">Open samples: {v.pack.open_samples.join(", ")}</p> : null}
        </div>
      ) : null}

      {cfg.body.includes("checklist") ? <ChecklistCard v={v} editable={editing && v.state !== "Confirmed"} onSave={(items) => void send("Checklist", { kind: "checklist", visit: v.id, items }, "Checklist saved.")} /> : null}

      {cfg.body.includes("findings") ? (
        <div className="fv-card">
          <div className="fv-row">
            <h3 className="fv-grow">Findings ({v.findings.length})</h3>
            {editing && v.state !== "Confirmed" ? (
              <button type="button" className="fv-btn fv-btn--sm" onClick={() => setSheet("finding")}>
                + Finding
              </button>
            ) : null}
          </div>
          {v.findings.map((f) => (
            <p key={f.id} className="fv-sub" style={{ color: "var(--field-ink)" }}>
              <span className={`fv-pill fv-pill--${f.severity === "major" ? "red" : f.severity === "minor" ? "amber" : "slate"}`}>{f.severity}</span> <b>{f.clause}</b> {f.statement}
            </p>
          ))}
        </div>
      ) : null}

      {cfg.body.includes("calibration") ? <CalCard v={v} editable={editing && v.state !== "Confirmed"} onSave={(points) => void send("Calibration points", { kind: "cal", visit: v.id, points }, "Results saved.")} /> : null}

      {cfg.body.includes("samples") ? (
        <div className="fv-card">
          <div className="fv-row">
            <h3 className="fv-grow">Samples ({v.sample_ids.length})</h3>
            {["In Progress", "Returned"].includes(v.state) ? (
              <button type="button" className="fv-btn fv-btn--sm" onClick={() => setSheet("sample")}>
                + Collect sample
              </button>
            ) : null}
          </div>
          <SampleList visit={v.id} />
        </div>
      ) : null}

      <div className="fv-card">
        <div className="fv-row">
          <h3 className="fv-grow">Photos ({v.photos.length})</h3>
          {editing && v.state !== "Confirmed" ? (
            <button type="button" className="fv-btn fv-btn--sm" onClick={() => setSheet("photo")}>
              + Photo
            </button>
          ) : null}
        </div>
        {v.photos.map((p) => (
          <p key={p.id} className="fv-sub">
            {p.url ? <img src={p.url} alt={p.caption ?? p.name} style={{ width: 64, height: 64, objectFit: "cover", borderRadius: 8, verticalAlign: "middle", marginRight: 8 }} /> : null}
            {p.caption ?? p.name} · #{p.hash} ✓
          </p>
        ))}
      </div>

      {cfg.body.includes("notes") || v.notes ? <NotesCard v={v} editable={editing && v.state !== "Confirmed"} onSave={(notes) => void send("Notes", { kind: "notes", visit: v.id, notes }, "Notes saved.")} /> : null}

      <div className="fv-card">
        <div className="fv-row">
          <h3 className="fv-grow">Signatures</h3>
          {editing && v.state !== "Confirmed" ? (
            <button type="button" className="fv-btn fv-btn--sm" onClick={() => setSheet("signature")}>
              + Sign
            </button>
          ) : null}
        </div>
        {v.signatures.map((s) => (
          <p key={`${s.role}-${s.name}`} className="fv-sub">
            {s.name}
            {s.title ? `, ${s.title}` : ""} ({s.role}) · {fmt(s.at)}
          </p>
        ))}
        {!v.signatures.length ? <p className="fv-sub">{cfg.confirm ? "The client representative signs at the closing meeting." : "Witness signs when a sample is sealed."}</p> : null}
      </div>

      <div className="fv-stack">
        {can("submit") ? (
          <>
            <button type="button" className="fv-btn fv-btn--pri fv-btn--block" disabled={Boolean(can("submit")!.disabledReason)} onClick={() => void doAct("submit")}>
              Submit report
            </button>
            {can("submit")!.disabledReason ? <p className="fv-err">{can("submit")!.disabledReason}</p> : null}
          </>
        ) : null}
        {can("resubmit") ? (
          <button type="button" className="fv-btn fv-btn--pri fv-btn--block" onClick={() => void doAct("resubmit")}>
            Resubmit report
          </button>
        ) : null}
        {can("abort") ? (
          <button type="button" className="fv-btn fv-btn--danger fv-btn--block" onClick={() => setSheet("abort")}>
            Abort visit
          </button>
        ) : null}
        {["Submitted", "Closed"].includes(v.state) && !v.claim_ref ? (
          <button type="button" className="fv-btn fv-btn--block" onClick={() => setSheet("claim")}>
            Claim per diem / travel
          </button>
        ) : null}
        {v.claim_ref ? <p className="fv-sub">Claim {v.claim_ref} submitted.</p> : null}
      </div>

      {sheet === "decline" || sheet === "abort" ? (
        <ReasonSheet
          title={sheet === "decline" ? "Decline visit" : "Abort visit"}
          codes={sheet === "abort" ? [["refused_access", "Refused access"], ["premises_closed", "Premises closed"], ["safety", "Safety concern"], ["other", "Other"]] : undefined}
          onClose={() => setSheet(null)}
          onSubmit={(reason, code) => {
            setSheet(null);
            void doAct(sheet, { reason, payload: code ? { code } : undefined });
          }}
        />
      ) : null}
      {sheet === "finding" ? <FindingSheet onClose={() => setSheet(null)} onSave={(f) => (setSheet(null), void send("Finding", { kind: "finding", visit: v.id, finding: f }, "Finding added."))} /> : null}
      {sheet === "sample" ? <SampleSheet v={v} onClose={() => setSheet(null)} onSave={(s) => (setSheet(null), void send(`Sample ${s.seal}`, { kind: "sample", visit: v.id, sample: s }, `Sample ${s.seal} collected.`))} /> : null}
      {sheet === "signature" ? <SignatureSheet confirm={cfg.confirm} onClose={() => setSheet(null)} onSave={(sig) => (setSheet(null), void send("Signature", { kind: "signature", visit: v.id, sig }, `Signed by ${sig.name}.`))} /> : null}
      {sheet === "photo" ? <PhotoSheet onClose={() => setSheet(null)} onSave={(p) => (setSheet(null), void send("Photo", { kind: "photo", visit: v.id, ...p }, "Photo added."))} /> : null}
      {sheet === "claim" ? <ClaimSheet v={v} onClose={() => setSheet(null)} onDone={(m) => (setSheet(null), show(m))} /> : null}
    </section>
  );
}

function ChecklistCard({ v, editable, onSave }: { v: FieldVisit; editable: boolean; onSave: (items: ChecklistItem[]) => void }) {
  const [items, setItems] = useState(v.checklist);
  useEffect(() => setItems(v.checklist), [v.checklist]);
  const dirty = JSON.stringify(items) !== JSON.stringify(v.checklist);
  const left = items.filter((i) => !i.answer).length;
  return (
    <div className="fv-card">
      <div className="fv-row">
        <h3 className="fv-grow">Checklist</h3>
        <span className="fv-pill fv-pill--slate">{v.checklist_version}</span>
        <span className={`fv-pill fv-pill--${left ? "amber" : "green"}`}>{left ? `${left} left` : "Done"}</span>
      </div>
      {items.map((q) => (
        <div key={q.id} className="fv-q">
          <div className="fv-sub">{q.section}</div>
          <div>{q.question}</div>
          <div className="fv-q__opts">
            {(["yes", "no", "na"] as const).map((a) => (
              <button key={a} type="button" disabled={!editable} className={q.answer === a ? a : ""} onClick={() => setItems(items.map((x) => (x.id === q.id ? { ...x, answer: a } : x)))}>
                {a === "na" ? "N/A" : a === "yes" ? "Yes" : "No"}
              </button>
            ))}
          </div>
          {q.answer === "no" || q.note ? <input className="fv-input" style={{ marginTop: 6 }} disabled={!editable} placeholder="Note / evidence" value={q.note ?? ""} onChange={(e) => setItems(items.map((x) => (x.id === q.id ? { ...x, note: e.target.value } : x)))} /> : null}
        </div>
      ))}
      {editable ? (
        <button type="button" className="fv-btn fv-btn--pri fv-btn--block" disabled={!dirty} onClick={() => onSave(items)}>
          Save checklist
        </button>
      ) : !v.pack && v.state === "Confirmed" ? (
        <p className="fv-sub">Download the pack and check in to start.</p>
      ) : null}
    </div>
  );
}

function NotesCard({ v, editable, onSave }: { v: FieldVisit; editable: boolean; onSave: (n: string) => void }) {
  const [n, setN] = useState(v.notes);
  return (
    <div className="fv-card">
      <h3>Notes</h3>
      <textarea className="fv-textarea" disabled={!editable} value={n} onChange={(e) => setN(e.target.value)} placeholder="What you found, who you spoke to, next steps" />
      {editable ? <Dictate onText={(t) => setN((cur) => `${cur}${cur && !/\s$/.test(cur) ? " " : ""}${t}`)} /> : null}
      {editable ? (
        <button type="button" className="fv-btn fv-btn--sm" style={{ marginTop: 8 }} disabled={n === v.notes} onClick={() => onSave(n)}>
          Save notes
        </button>
      ) : null}
    </div>
  );
}

function CalCard({ v, editable, onSave }: { v: FieldVisit; editable: boolean; onSave: (p: CalPoint[]) => void }) {
  const [pts, setPts] = useState<CalPoint[]>(v.cal_points.length ? v.cal_points : [{ id: "P1", instrument: v.scope ?? "Instrument", nominal: 0, unit: "kg", as_found: 0, as_left: 0, tolerance: 0, uncertainty: 0 }]);
  const set = (i: number, k: keyof CalPoint, val: string) => setPts(pts.map((p, j) => (j === i ? { ...p, [k]: k === "instrument" || k === "unit" || k === "id" ? val : Number(val) } : p)));
  return (
    <div className="fv-card">
      <h3>Calibration results</h3>
      {pts.map((p, i) => {
        const err = Math.round((p.as_found - p.nominal) * 1e6) / 1e6;
        const oot = Math.abs(err) > p.tolerance && p.tolerance > 0;
        return (
          <div key={p.id} className="fv-q">
            <div className="fv-row">
              <input className="fv-input fv-grow" disabled={!editable} value={p.instrument} onChange={(e) => set(i, "instrument", e.target.value)} />
              <span className={`fv-pill fv-pill--${oot ? "red" : "green"}`}>{oot ? "Out of tol." : `err ${err}`}</span>
            </div>
            <div className="fv-row" style={{ marginTop: 6 }}>
              {(["nominal", "as_found", "as_left", "tolerance", "uncertainty"] as const).map((k) => (
                <label key={k} className="fv-label" style={{ width: "30%" }}>
                  {k.replace("_", " ")}
                  <input className="fv-input" type="number" step="any" inputMode="decimal" disabled={!editable} value={p[k]} onChange={(e) => set(i, k, e.target.value)} />
                </label>
              ))}
              <label className="fv-label" style={{ width: "20%" }}>
                unit
                <input className="fv-input" disabled={!editable} value={p.unit} onChange={(e) => set(i, "unit", e.target.value)} />
              </label>
            </div>
          </div>
        );
      })}
      {editable ? (
        <div className="fv-row">
          <button type="button" className="fv-btn fv-btn--sm" onClick={() => setPts([...pts, { ...pts[pts.length - 1], id: `P${pts.length + 1}`, nominal: 0, as_found: 0, as_left: 0 }])}>
            + Point
          </button>
          <button type="button" className="fv-btn fv-btn--sm fv-btn--pri" onClick={() => onSave(pts)}>
            Save results
          </button>
        </div>
      ) : null}
    </div>
  );
}

function SampleList({ visit }: { visit: string }) {
  const res = useField(() => listSamples({ visit }), [visit]);
  if (res.notConnected) return <p className="fv-sub">Samples not connected.</p>;
  return (
    <>
      {(res.data ?? []).map((s) => (
        <p key={s.id} className="fv-sub" style={{ color: "var(--field-ink)" }}>
          <b>{s.seal}</b> {s.product} · {s.quantity} · <span className="fv-pill fv-pill--slate">{SAMPLE_STATES.find((x) => x.id === s.state)?.label}</span>
          {s.result ? <span className={`fv-pill fv-pill--${s.result === "pass" ? "green" : "red"}`}> {s.result}</span> : null}
        </p>
      ))}
    </>
  );
}

function ReasonSheet({ title, codes, onClose, onSubmit }: { title: string; codes?: [string, string][]; onClose: () => void; onSubmit: (reason: string, code?: string) => void }) {
  const [reason, setReason] = useState("");
  const [code, setCode] = useState(codes?.[0]?.[0] ?? "");
  return (
    <Sheet title={title} onClose={onClose}>
      {codes ? (
        <div className="fv-seg">
          {codes.map(([k, l]) => (
            <button key={k} type="button" className={code === k ? "on" : ""} onClick={() => setCode(k)}>
              {l}
            </button>
          ))}
        </div>
      ) : null}
      <label className="fv-label">
        Reason (required)
        <textarea className="fv-textarea" value={reason} onChange={(e) => setReason(e.target.value)} />
      </label>
      <button type="button" className="fv-btn fv-btn--pri fv-btn--block" disabled={!reason.trim()} onClick={() => onSubmit(reason, codes ? code : undefined)}>
        {title}
      </button>
    </Sheet>
  );
}

function FindingSheet({ onClose, onSave }: { onClose: () => void; onSave: (f: Omit<VisitFinding, "id">) => void }) {
  const [f, setF] = useState<Omit<VisitFinding, "id">>({ clause: "", severity: "minor", statement: "", photos: [] });
  return (
    <Sheet title="Raise a finding" onClose={onClose}>
      <div className="fv-seg">
        {(["major", "minor", "observation"] as const).map((s) => (
          <button key={s} type="button" className={f.severity === s ? "on" : ""} onClick={() => setF({ ...f, severity: s })}>
            {s}
          </button>
        ))}
      </div>
      <label className="fv-label">
        Clause
        <input className="fv-input" value={f.clause} onChange={(e) => setF({ ...f, clause: e.target.value })} placeholder="ISO 9001 §7.1.5" />
      </label>
      <label className="fv-label">
        Statement of nonconformity
        <textarea className="fv-textarea" value={f.statement} onChange={(e) => setF({ ...f, statement: e.target.value })} />
      </label>
      <Dictate onText={(t) => setF((cur) => ({ ...cur, statement: `${cur.statement}${cur.statement && !/\s$/.test(cur.statement) ? " " : ""}${t}` }))} />
      <button type="button" className="fv-btn fv-btn--pri fv-btn--block" disabled={!f.clause.trim() || !f.statement.trim()} onClick={() => onSave(f)}>
        Add finding
      </button>
    </Sheet>
  );
}

function SampleSheet({ v, onClose, onSave }: { v: FieldVisit; onClose: () => void; onSave: (s: Parameters<typeof collectSample>[1]) => void }) {
  const [s, setS] = useState({ seal: "", product: "", brand: "", batch: "", quantity: "", witness: "", test: "2", retained: "1", client: "1" });
  const [scan, setScan] = useState(false);
  const set = (k: keyof typeof s) => (e: { target: { value: string } }) => setS({ ...s, [k]: e.target.value });
  return (
    <Sheet title="Collect sample" onClose={onClose}>
      {scan ? <Scanner onCode={(c) => (setS({ ...s, seal: c }), setScan(false))} /> : null}
      <div className="fv-row">
        <label className="fv-label fv-grow">
          Seal number
          <input className="fv-input" value={s.seal} onChange={set("seal")} placeholder="ES-SEAL-…" />
        </label>
        <button type="button" className="fv-btn fv-btn--sm" onClick={() => setScan(true)}>
          Scan
        </button>
      </div>
      {s.seal && sampleBySeal(s.seal) ? <p className="fv-err">This seal is already used.</p> : null}
      <label className="fv-label">
        Product
        <input className="fv-input" value={s.product} onChange={set("product")} />
      </label>
      <div className="fv-row">
        <label className="fv-label fv-grow">
          Brand
          <input className="fv-input" value={s.brand} onChange={set("brand")} />
        </label>
        <label className="fv-label fv-grow">
          Batch
          <input className="fv-input" value={s.batch} onChange={set("batch")} />
        </label>
      </div>
      <label className="fv-label">
        Quantity
        <input className="fv-input" value={s.quantity} onChange={set("quantity")} placeholder="e.g. 4 bottles" />
      </label>
      <div className="fv-row">
        {(["test", "retained", "client"] as const).map((k) => (
          <label key={k} className="fv-label fv-grow">
            Split: {k}
            <input className="fv-input" type="number" value={s[k]} onChange={set(k)} />
          </label>
        ))}
      </div>
      <label className="fv-label">
        Witness (name)
        <input className="fv-input" value={s.witness} onChange={set("witness")} />
      </label>
      <button
        type="button"
        className="fv-btn fv-btn--pri fv-btn--block"
        disabled={!s.seal.trim() || !s.product.trim() || !s.quantity.trim()}
        onClick={() => onSave({ seal: s.seal, product: s.product, brand: s.brand || undefined, batch: s.batch || undefined, quantity: s.quantity, witness: s.witness || undefined, split: { test: Number(s.test) || 0, retained: Number(s.retained) || 0, client: Number(s.client) || 0 }, gps: v.site.gps })}
      >
        Seal & record sample
      </button>
    </Sheet>
  );
}

function SignatureSheet({ confirm, onClose, onSave }: { confirm: boolean; onClose: () => void; onSave: (s: { role: "client" | "witness" | "lead"; name: string; title?: string }) => void }) {
  const [role, setRole] = useState<"client" | "witness" | "lead">(confirm ? "client" : "witness");
  const [name, setName] = useState("");
  const [title, setTitle] = useState("");
  const [drawn, setDrawn] = useState(false);
  const ref = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const pos = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * e.currentTarget.width, y: ((e.clientY - r.top) / r.height) * e.currentTarget.height };
  };
  return (
    <Sheet title="Signature" onClose={onClose}>
      <div className="fv-seg">
        {(["client", "witness", "lead"] as const).map((r) => (
          <button key={r} type="button" className={role === r ? "on" : ""} onClick={() => setRole(r)}>
            {r === "client" ? "Client representative" : r === "witness" ? "Witness" : "Lead"}
          </button>
        ))}
      </div>
      <label className="fv-label">
        Name
        <input className="fv-input" value={name} onChange={(e) => setName(e.target.value)} />
      </label>
      <label className="fv-label">
        Position
        <input className="fv-input" value={title} onChange={(e) => setTitle(e.target.value)} />
      </label>
      <canvas
        ref={ref}
        className="fv-sig"
        width={600}
        height={200}
        onPointerDown={(e) => {
          drawing.current = true;
          const c = ref.current!.getContext("2d")!;
          const p = pos(e);
          c.beginPath();
          c.moveTo(p.x, p.y);
        }}
        onPointerMove={(e) => {
          if (!drawing.current) return;
          const c = ref.current!.getContext("2d")!;
          const p = pos(e);
          c.lineWidth = 3;
          c.lineTo(p.x, p.y);
          c.stroke();
          setDrawn(true);
        }}
        onPointerUp={() => (drawing.current = false)}
      />
      <button type="button" className="fv-btn fv-btn--pri fv-btn--block" disabled={!name.trim() || !drawn} onClick={() => onSave({ role, name, title: title || undefined })}>
        Save signature
      </button>
    </Sheet>
  );
}

function PhotoSheet({ onClose, onSave }: { onClose: () => void; onSave: (p: { name: string; caption?: string; url?: string }) => void }) {
  const [file, setFile] = useState<{ name: string; url?: string } | null>(null);
  const [caption, setCaption] = useState("");
  return (
    <Sheet title="Add photo" onClose={onClose}>
      <input
        type="file"
        accept="image/*"
        capture="environment"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (!f) return;
          const r = new FileReader();
          r.onload = () => setFile({ name: f.name, url: f.size < 350_000 ? String(r.result) : undefined });
          r.readAsDataURL(f);
        }}
      />
      {file?.url ? <img src={file.url} alt="" style={{ maxWidth: "100%", borderRadius: 10 }} /> : null}
      <label className="fv-label">
        Caption
        <input className="fv-input" value={caption} onChange={(e) => setCaption(e.target.value)} />
      </label>
      <button type="button" className="fv-btn fv-btn--pri fv-btn--block" disabled={!file} onClick={() => file && onSave({ name: file.name, caption: caption || undefined, url: file.url })}>
        Add photo
      </button>
    </Sheet>
  );
}

function ClaimSheet({ v, onClose, onDone }: { v: FieldVisit; onClose: () => void; onDone: (m: string) => void }) {
  const [amount, setAmount] = useState(String(350 * v.duration_days));
  const [type, setType] = useState("Per diem");
  const [busy, setBusy] = useState(false);
  return (
    <Sheet title="Claim from this visit" onClose={onClose}>
      <p className="fv-sub">
        Pre-filled from {v.id}: {v.duration_days} day(s) at {v.site.name}.
      </p>
      <div className="fv-seg">
        {["Per diem", "Mileage", "Accommodation"].map((t) => (
          <button key={t} type="button" className={type === t ? "on" : ""} onClick={() => setType(t)}>
            {t}
          </button>
        ))}
      </div>
      <label className="fv-label">
        Amount (E)
        <input className="fv-input" type="number" value={amount} onChange={(e) => setAmount(e.target.value)} />
      </label>
      <button
        type="button"
        className="fv-btn fv-btn--pri fv-btn--block"
        disabled={busy || !Number(amount)}
        onClick={() => {
          setBusy(true);
          const ref = `EXP-${v.id.slice(-4)}-${Date.now() % 1000}`;
          // TODO: wire real — POST /hr/expenses with the visit reference.
          void createExpense({ amount: Number(amount), expense_type: type, description: `${v.title} (${v.id})`, confirm: true })
            .then((x) => ((linkClaim(v.id, String((x as { name?: string }).name ?? ref)), onDone("Claim submitted."))))
            .catch(() => (linkClaim(v.id, ref), onDone(`Claim ${ref} saved (demo — HR isn't connected).`)))
            .finally(() => setBusy(false));
        }}
      >
        Submit claim
      </button>
    </Sheet>
  );
}

/* ---------------- scanner ---------------- */

type Detector = { detect: (src: HTMLVideoElement) => Promise<{ rawValue: string }[]> };

function Scanner({ onCode }: { onCode: (c: string) => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    const W = window as unknown as { BarcodeDetector?: new (o: { formats: string[] }) => Detector };
    if (!W.BarcodeDetector || !navigator.mediaDevices?.getUserMedia) {
      setErr("This device can't scan — type the seal number.");
      return;
    }
    let stream: MediaStream | null = null;
    let alive = true;
    const det = new W.BarcodeDetector({ formats: ["qr_code", "code_128"] });
    void navigator.mediaDevices
      .getUserMedia({ video: { facingMode: "environment" } })
      .then((s) => {
        stream = s;
        if (video.current) {
          video.current.srcObject = s;
          void video.current.play();
        }
        const tick = async () => {
          if (!alive || !video.current) return;
          try {
            const codes = await det.detect(video.current);
            if (codes[0]?.rawValue) return onCode(codes[0].rawValue);
          } catch {
            /* keep trying */
          }
          window.setTimeout(() => void tick(), 400);
        };
        void tick();
      })
      .catch(() => setErr("Camera not available — type the seal number."));
    return () => {
      alive = false;
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [onCode]);
  return err ? <p className="fv-sub">{err}</p> : <video ref={video} className="fv-video" muted playsInline />;
}

/* ---------------- samples ---------------- */

export function SamplesScreen() {
  const actor = useFieldActor();
  const [toast, show] = useToast();
  const [seal, setSeal] = useState("");
  const [scan, setScan] = useState(false);
  const res = useField(() => listSamples(), []);
  const mine = (res.data ?? []).filter((s) => s.collected_by === actor.name || s.holder === actor.name);
  const list = mine.length ? mine : res.data ?? [];
  return (
    <section className="field-screen fv-stack" aria-label="Samples">
      {res.notConnected ? (
        <div className="fv-card" role="status" aria-live="polite">
          <h3>Samples aren't available yet</h3>
          <p className="fv-sub">Sample tracking needs the Core Engine field service module, which is not live yet.</p>
        </div>
      ) : (
        <>
      {toast}
      <div className="fv-card">
        <h3>Hand over to the lab</h3>
        <p className="fv-sub">Scan the seal QR of each sample you hand to lab reception or the courier.</p>
        {scan ? <Scanner onCode={(c) => (setSeal(c), setScan(false))} /> : null}
        <div className="fv-row">
          <input className="fv-input fv-grow" value={seal} onChange={(e) => setSeal(e.target.value)} placeholder="Seal number" />
          <button type="button" className="fv-btn fv-btn--sm" onClick={() => setScan(true)}>
            Scan
          </button>
        </div>
        <button
          type="button"
          className="fv-btn fv-btn--pri fv-btn--block"
          style={{ marginTop: 8 }}
          disabled={!seal.trim()}
          onClick={() =>
            void enqueue(`Hand over ${seal}`, { kind: "handover", seal, to: "Lab reception" }, actor).then((r) => {
              show(r.status === "sent" ? `${seal} handed over.` : r.status === "pending" ? "Saved — will send when online." : `${r.status}: ${r.error ?? ""}`);
              if (r.status !== "failed") setSeal("");
            })
          }
        >
          Hand over
        </button>
      </div>
      <ProductCheck />
      {mine.length ? null : <p className="fv-sub">No samples of yours — showing all (demo).</p>}
      {list.map((s) => (
        <div key={s.id} className="fv-card">
          <div className="fv-row">
            <b className="fv-grow">{s.seal}</b>
            <span className="fv-pill fv-pill--slate">{SAMPLE_STATES.find((x) => x.id === s.state)?.label}</span>
          </div>
          <div className="fv-sub">
            {s.product} {s.brand ? `· ${s.brand}` : ""} · {s.quantity} · {s.parent?.label}
          </div>
          <div className="fv-sub">Custody: {s.custody.map((c) => `${new Date(c.at).toLocaleDateString()} ${c.action}`).join(" → ")}</div>
          {s.state === "Collected" ? (
            <button type="button" className="fv-btn fv-btn--sm" style={{ marginTop: 6 }} onClick={() => setSeal(s.seal)}>
              Hand over this one
            </button>
          ) : null}
        </div>
      ))}
        </>
      )}
    </section>
  );
}

/* ---------------- outbox ---------------- */

export function OutboxScreen() {
  const res = useField(() => ({ items: outbox.read().items, offline: isOffline(), sim: outbox.read().offline }), []);
  const d = res.data;
  if (!d) return <section className="field-screen">Loading…</section>;
  const s = outboxSummary();
  const tone = { pending: "amber", sent: "green", failed: "red", conflict: "red" } as const;
  return (
    <section className="field-screen fv-stack" aria-label="Outbox">
      <div className={`fv-card ${s.conflict || s.failed ? "fv-card--err" : s.pending ? "fv-card--warn" : "fv-card--ok"}`}>
        <b>{s.label}</b>
        <p className="fv-sub">Everything you record is kept on this device and sent in order. Conflicts are flagged to your supervisor — nothing is dropped.</p>
        <label className="fv-row" style={{ marginTop: 8 }}>
          <input type="checkbox" checked={d.sim} onChange={(e) => setSimulatedOffline(e.target.checked)} /> Work offline (demo)
        </label>
        <div className="fv-row" style={{ marginTop: 8 }}>
          <button type="button" className="fv-btn fv-btn--sm" onClick={() => clearSent()}>
            Clear sent
          </button>
        </div>
      </div>
      {d.items.map((i) => (
        <div key={i.key} className="fv-card">
          <div className="fv-row">
            <b className="fv-grow">{i.label}</b>
            <span className={`fv-pill fv-pill--${tone[i.status]}`}>{i.status}</span>
          </div>
          <div className="fv-sub">
            {"visit" in i.op ? `${i.op.visit} · ` : ""}queued {new Date(i.at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
            {i.sent_at ? ` · sent ${new Date(i.sent_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}` : ""} · {i.attempts} attempt(s)
          </div>
          {i.error ? <p className="fv-err">{i.status === "conflict" ? `The record moved on while you were offline: ${i.error}. Your supervisor will resolve this.` : i.error}</p> : null}
          {i.status === "failed" || i.status === "conflict" ? (
            <div className="fv-row" style={{ marginTop: 6 }}>
              <button type="button" className="fv-btn fv-btn--sm" onClick={() => void retry(i.key)}>
                Retry
              </button>
              <button type="button" className="fv-btn fv-btn--sm fv-btn--danger" onClick={() => discard(i.key)}>
                Discard
              </button>
            </div>
          ) : null}
        </div>
      ))}
      {!d.items.length ? <p className="field-muted">Nothing in the outbox.</p> : null}
    </section>
  );
}

export const visitCustomerLabel = (v: FieldVisit) => displayState(visitDef(v.type), v.state, "customer");

/* ---------------- route planning (08 P3) ---------------- */

/** Orders the open visits with a GPS pin by nearest neighbour from where you are, with a sketch map. */
function RouteCard({ visits }: { visits: FieldVisit[] }) {
  const [open, setOpen] = useState(false);
  const [here, setHere] = useState<{ at: LatLng; label: string } | null>(null);
  const stops = visits.filter((v): v is FieldVisit & { site: { gps: LatLng } } => Boolean(v.site.gps)).map((v) => ({ v, gps: v.site.gps! }));
  useEffect(() => {
    if (!open || here) return;
    if (!navigator.geolocation) return setHere({ at: ESWASA_HQ, label: "ESWASA office (no GPS on this device)" });
    navigator.geolocation.getCurrentPosition(
      (p) => setHere({ at: { lat: p.coords.latitude, lng: p.coords.longitude }, label: "your location" }),
      () => setHere({ at: ESWASA_HQ, label: "ESWASA office (location not shared)" }),
      { timeout: 8000, maximumAge: 300_000 },
    );
  }, [open, here]);
  if (stops.length < 2) return null;
  if (!open)
    return (
      <button type="button" className="fv-btn fv-btn--block" onClick={() => setOpen(true)}>
        <Icon name="i-map" /> Plan my route ({stops.length} stops)
      </button>
    );
  const start = here?.at ?? ESWASA_HQ;
  const r = planRoute(start, stops);
  const pts = [start, ...r.order.map((x) => x.gps)];
  const lats = pts.map((p) => p.lat);
  const lngs = pts.map((p) => p.lng);
  const [minLat, maxLat, minLng, maxLng] = [Math.min(...lats), Math.max(...lats), Math.min(...lngs), Math.max(...lngs)];
  const W = 300;
  const H = 180;
  const pad = 18;
  const sx = (lng: number) => pad + ((lng - minLng) / Math.max(1e-6, maxLng - minLng)) * (W - 2 * pad);
  const sy = (lat: number) => pad + ((maxLat - lat) / Math.max(1e-6, maxLat - minLat)) * (H - 2 * pad);
  return (
    <div className="fv-card">
      <div className="fv-row">
        <h3 className="fv-grow">Route · {r.total_km} km straight-line</h3>
        <button type="button" className="fv-btn fv-btn--sm" onClick={() => setOpen(false)}>
          Hide
        </button>
      </div>
      <p className="fv-sub">From {here?.label ?? "…locating"}. Nearest stop first.</p>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label="Sketch map of the route" style={{ background: "var(--field-surface, #f4f6fb)", borderRadius: 10 }}>
        <polyline points={pts.map((p) => `${sx(p.lng)},${sy(p.lat)}`).join(" ")} fill="none" stroke="currentColor" strokeOpacity={0.5} strokeWidth={2} strokeDasharray="4 3" />
        <circle cx={sx(start.lng)} cy={sy(start.lat)} r={6} fill="#1f3a78" />
        {r.order.map((x, i) => (
          <g key={x.v.id}>
            <circle cx={sx(x.gps.lng)} cy={sy(x.gps.lat)} r={9} fill="#d9a800" />
            <text x={sx(x.gps.lng)} y={sy(x.gps.lat) + 4} textAnchor="middle" fontSize={10} fontWeight={700} fill="#000">
              {i + 1}
            </text>
          </g>
        ))}
      </svg>
      <ol style={{ paddingLeft: 18, margin: "8px 0" }}>
        {r.order.map((x) => (
          <li key={x.v.id} style={{ marginBottom: 4 }}>
            <Link to={`/visits/${x.v.id}`}>{x.v.site.name}</Link> <span className="fv-sub">· {x.leg_km} km · {new Date(x.v.planned_date).toLocaleDateString()}</span>
          </li>
        ))}
      </ol>
      <a className="fv-btn fv-btn--pri fv-btn--block" href={mapsLink(start, r.order.map((x) => x.gps))} target="_blank" rel="noopener">
        Open in Maps
      </a>
    </div>
  );
}

/* ---------------- voice notes (08 P3) ---------------- */

type SpeechRec = { lang: string; interimResults: boolean; continuous: boolean; start: () => void; stop: () => void; onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> ; resultIndex: number }) => void) | null; onend: (() => void) | null; onerror: ((e: { error: string }) => void) | null };

/** Dictation via the browser's speech recognition; hidden where unsupported. The text is always editable. */
function Dictate({ onText }: { onText: (t: string) => void }) {
  const W = window as unknown as { SpeechRecognition?: new () => SpeechRec; webkitSpeechRecognition?: new () => SpeechRec };
  const Ctor = W.SpeechRecognition ?? W.webkitSpeechRecognition;
  const rec = useRef<SpeechRec | null>(null);
  const [on, setOn] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => () => rec.current?.stop(), []);
  if (!Ctor) return null;
  const toggle = () => {
    if (on) return rec.current?.stop();
    setErr(null);
    const r = new Ctor();
    r.lang = "en-ZA";
    r.interimResults = false;
    r.continuous = true;
    r.onresult = (e) => {
      for (let i = e.resultIndex; i < e.results.length; i++) if (e.results[i].isFinal) onText(e.results[i][0].transcript.trim());
    };
    r.onerror = (e) => setErr(e.error === "not-allowed" ? "Microphone permission is off." : `Dictation stopped (${e.error}).`);
    r.onend = () => setOn(false);
    rec.current = r;
    r.start();
    setOn(true);
  };
  return (
    <div className="fv-row" style={{ marginTop: 4 }}>
      <button type="button" className={`fv-btn fv-btn--sm${on ? " fv-btn--pri" : ""}`} onClick={toggle} aria-pressed={on}>
        <Icon name="i-mic" /> {on ? "Stop dictation" : "Dictate"}
      </button>
      <span className="fv-sub">{on ? "Listening… speak the statement; check the text before saving." : err ?? "Voice note → text. Needs a connection on most phones."}</span>
    </div>
  );
}

/* ---------------- product certification check (08 P3) ---------------- */

/** Scan the certificate QR / number on a product label and check the register on the spot. */
function ProductCheck() {
  const [code, setCode] = useState("");
  const [scan, setScan] = useState(false);
  const [r, setR] = useState<(ReturnType<typeof verifyCertificateToken> & { code: string }) | null>(null);
  const check = (raw: string) => {
    const m = raw.trim().match(/\/verify\/(?:cal\/)?([^/?#\s]+)/i);
    const token = decodeURIComponent(m ? m[1] : raw.trim());
    try {
      setR({ ...verifyCertificateToken(token), code: token });
    } catch {
      setR({ valid: false, code: token });
    }
  };
  return (
    <div className="fv-card">
      <h3>Check a product's certification</h3>
      <p className="fv-sub">Scan the QR on the label or certificate, or type the certificate number.</p>
      {scan ? <Scanner onCode={(c) => (setCode(c), setScan(false), check(c))} /> : null}
      <div className="fv-row">
        <input className="fv-input fv-grow" value={code} onChange={(e) => setCode(e.target.value)} placeholder="Certificate number or QR text" />
        <button type="button" className="fv-btn fv-btn--sm" onClick={() => setScan(true)}>
          Scan
        </button>
        <button type="button" className="fv-btn fv-btn--sm fv-btn--pri" disabled={!code.trim()} onClick={() => check(code)}>
          Check
        </button>
      </div>
      {r ? (
        <div className={`fv-banner${r.valid ? "" : " fv-banner--err"}`} style={{ marginTop: 8 }} role="status">
          {r.valid ? (
            <>
              <b>Valid — {r.org}</b>
              <br />
              {r.standard} · {r.number} · expires {r.expires ? new Date(r.expires).toLocaleDateString() : "—"}
              <br />
              <span className="fv-sub">Scope: {r.scope}</span>
            </>
          ) : r.state ? (
            <>
              <b>Not valid — certificate {r.state.toLowerCase()}</b> ({r.number}, {r.org}). The mark must not be used. Take a sample or raise a finding on your visit.
            </>
          ) : (
            <>
              <b>Not on the register</b> ({r.code}). Possible false claim: photograph the label, take a sample and report it from your visit.
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}

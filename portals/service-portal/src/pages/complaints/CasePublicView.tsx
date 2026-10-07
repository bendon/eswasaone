import { useState } from "react";
import { Link } from "react-router-dom";
import { Icon } from "@eswasaone/shared-ui";
import {
  CrmBanner,
  StatePill,
  Stars,
  Thread,
  addWorkingDays,
  customerAct,
  customerActions,
  fmtDay,
  publicCrmConfig,
  rateCase,
  type Case,
  type CaseActionId,
} from "@eswasaone/shared-ui/crm";

const MILESTONES = ["Received", "Being handled", "Resolved", "Closed"] as const;

function milestoneIndex(c: Case): number {
  if (c.state === "Closed") return 3;
  if (c.state === "Resolved") return 2;
  if (c.state === "Open" || c.state === "Triaged") return 0;
  return 1;
}

/** Customer's view of one case: progress, conversation, and the actions they can take. */
export function CasePublicView({ c, onChange }: { c: Case; onChange: (c: Case) => void }) {
  const cfg = publicCrmConfig();
  const typeCfg = cfg.case_types[c.type];
  const actions = customerActions(c, cfg.reopen_days);
  const [reply, setReply] = useState("");
  const [files, setFiles] = useState<string[]>([]);
  const [disputing, setDisputing] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [score, setScore] = useState(0);
  const [comment, setComment] = useState("");
  const m = milestoneIndex(c);
  const due = addWorkingDays(c.created_at, typeCfg.resolve_days + c.paused_wd);
  const can = (a: CaseActionId) => actions.some((x) => x.action === a);

  async function act(a: CaseActionId, note?: string) {
    setBusy(true);
    setErr(null);
    try {
      const next = await customerAct(c.ref, a, { note, attachments: files.length ? files : undefined });
      setReply("");
      setFiles([]);
      setDisputing(false);
      setReason("");
      onChange(next);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function rate() {
    setBusy(true);
    try {
      onChange(await rateCase(c.ref, score, comment));
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  const open = !["Resolved", "Closed"].includes(c.state);

  return (
    <div className="crm-stack">
      <div className="crm-card">
        <div className="crm-row" style={{ alignItems: "flex-start" }}>
          <div style={{ minWidth: 0, flex: 1 }}>
            <span className="crm-mono">{c.ref}</span> <span className="crm-pill crm-pill--outline">{typeCfg.short}</span>
            <h2 style={{ fontSize: 20, fontWeight: 800, letterSpacing: "-0.02em", margin: "8px 0 4px" }}>{c.subject}</h2>
            <span className="crm-small">
              Sent {fmtDay(c.created_at)}
              {c.about ? ` · about ${c.about.label}` : ""}
            </span>
          </div>
          <StatePill state={c.state} customer />
        </div>
        <ol className="crm-steps" style={{ marginTop: 16, marginBottom: 0 }} aria-label="Progress">
          {MILESTONES.map((s, i) => (
            <li key={s} className={i === m ? "on" : i < m ? "done" : ""}>
              <i>{i < m ? "✓" : i + 1}</i>
              <span>{s}</span>
            </li>
          ))}
        </ol>
        {open ? (
          <p className="crm-small" style={{ marginTop: 12 }}>
            {c.state === "Awaiting Customer"
              ? "We're waiting for your reply. The clock on your case is paused until then."
              : `We aim to answer by ${due.toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" })}.`}
          </p>
        ) : null}
      </div>

      {err ? <CrmBanner tone="err">{err}</CrmBanner> : null}

      {c.state === "Awaiting Customer" ? (
        <CrmBanner>
          <b>ESWASA needs something from you.</b> Read the latest message below and reply.
        </CrmBanner>
      ) : null}

      {c.state === "Resolved" ? (
        <div className="crm-card" style={{ borderColor: "var(--green)" }}>
          <div className="crm-card__h">
            <div>
              <h3>Is this resolved for you?</h3>
              <p>
                {can("dispute")
                  ? `If you don't reply, the case closes automatically ${cfg.reopen_days} days after we resolved it.`
                  : "The window to reopen this case has passed."}
              </p>
            </div>
          </div>
          {c.resolution ? <p style={{ fontSize: 14, lineHeight: 1.55, marginTop: 0 }}>{c.resolution}</p> : null}
          {disputing ? (
            <div className="crm-form">
              <label className="crm-field">
                What's still wrong?
                <textarea className="crm-textarea" value={reason} onChange={(e) => setReason(e.target.value)} autoFocus />
              </label>
              <div className="crm-row">
                <button type="button" className="crm-btn" onClick={() => setDisputing(false)}>
                  Cancel
                </button>
                <button type="button" className="crm-btn crm-btn--danger" disabled={busy || !reason.trim()} onClick={() => void act("dispute", reason.trim())}>
                  Reopen my case
                </button>
              </div>
            </div>
          ) : (
            <div className="crm-row">
              {can("confirm") ? (
                <button type="button" className="crm-btn crm-btn--pri" disabled={busy} onClick={() => void act("confirm")}>
                  <Icon name="i-check" /> Yes, it's resolved
                </button>
              ) : null}
              {can("dispute") ? (
                <button type="button" className="crm-btn" disabled={busy} onClick={() => setDisputing(true)}>
                  No, reopen it
                </button>
              ) : null}
            </div>
          )}
        </div>
      ) : null}

      {c.state === "Closed" && !c.csat && !c.duplicate_of ? (
        <div className="crm-card">
          <div className="crm-card__h">
            <div>
              <h3>How did we do?</h3>
              <p>{cfg.survey[0]}</p>
            </div>
          </div>
          <Stars value={score} onChange={setScore} />
          {score ? (
            <div className="crm-form" style={{ marginTop: 10 }}>
              <textarea className="crm-textarea" style={{ minHeight: 70 }} value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Anything we could do better? (optional)" aria-label="Comment" />
              <button type="button" className="crm-btn crm-btn--pri" style={{ alignSelf: "flex-start" }} disabled={busy} onClick={() => void rate()}>
                Send rating
              </button>
            </div>
          ) : null}
        </div>
      ) : c.csat ? (
        <CrmBanner tone="ok">
          Thanks for rating us {c.csat.score}/5.
        </CrmBanner>
      ) : null}

      <div className="crm-card">
        <div className="crm-card__h">
          <h3>Messages</h3>
        </div>
        <Thread messages={c.thread} customerView selfLabel={c.reporter.anonymous ? "You (anonymous)" : "You"} />
      </div>

      {open ? (
        <div className="crm-composer">
          <textarea
            className="crm-textarea"
            value={reply}
            onChange={(e) => setReply(e.target.value)}
            placeholder={c.state === "Awaiting Customer" ? "Your reply to ESWASA…" : "Add information to your case…"}
            aria-label="Your message"
          />
          <div className="crm-composer__f">
            <label className="crm-btn crm-btn--sm crm-btn--ghost" style={{ cursor: "pointer" }}>
              <Icon name="i-clip" /> Attach
              <input
                type="file"
                multiple
                accept="image/*,application/pdf"
                style={{ display: "none" }}
                onChange={(e) => setFiles((f) => [...f, ...Array.from(e.target.files ?? []).map((x) => x.name)].slice(0, 5))}
              />
            </label>
            {files.map((f) => (
              <span key={f} className="crm-pill crm-pill--outline">
                {f}
              </span>
            ))}
            <span className="crm-spacer" />
            {can("withdraw") ? (
              <button type="button" className="crm-btn crm-btn--sm crm-btn--ghost" disabled={busy} onClick={() => void act("withdraw", reply.trim() || undefined)}>
                Withdraw case
              </button>
            ) : null}
            <button type="button" className="crm-btn crm-btn--sm crm-btn--pri" disabled={busy || !reply.trim()} onClick={() => void act("customer_reply", reply.trim())}>
              <Icon name="i-send" /> Send
            </button>
          </div>
        </div>
      ) : null}

      <p className="crm-small">
        Need to talk to someone? Call (+268) 2518 4633 and quote <b className="crm-mono">{c.ref}</b>. <Link to="/complaints">New case</Link>
      </p>
    </div>
  );
}

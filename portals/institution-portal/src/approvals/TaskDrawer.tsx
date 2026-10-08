/**
 * Drawer v2 (gap 02 A3): record preview, last history entries, documents, four-eyes panel, SLA basis,
 * "Open record", and every action through the ActionBar / ReasonDialog (reasons enforced).
 */
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { CrmDrawer } from "@eswasaone/shared-ui/crm";
import { Facts, HistoryTimeline, SuggestButton, fmtStamp } from "@eswasaone/shared-ui/record";
import { ActionBar, ReasonDialog, type ActionOption, type Actor } from "@eswasaone/shared-ui/workflow";
import {
  claimTask,
  eligibleAssignees,
  escalateTask,
  managerRoleFor,
  releaseTask,
  snoozeTask,
  type Task,
} from "@eswasaone/shared-ui/tasks";
import { renderTemplate, type PreviewMessage } from "@eswasaone/shared-ui/notify";
import { handlerFor, slaOf, type InboxTask } from "./model";
import { liveEscalate } from "./live";

export function TaskDrawer({
  task,
  actor,
  onClose,
  onDone,
  autoAction,
}: {
  task: InboxTask | null;
  actor: Actor;
  onClose: () => void;
  onDone: (msg: string) => void;
  /** Keyboard flow: open straight into an action's dialog. */
  autoAction?: string | null;
}) {
  const [dialog, setDialog] = useState<"reassign" | "escalate" | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => setErr(null), [task?.id]);
  if (!task) return null;

  const h = handlerFor(task);
  const preview = h.preview(actor);
  const actions = h.actions(actor);
  const sla = slaOf(task);
  const state = h.currentState() ?? task.state;
  const mine = task.assignee === actor.name;
  const four = preview?.duties?.filter((d) => d.people.includes(actor.name)) ?? [];

  const msgPreview = (a: ActionOption, reason: string): PreviewMessage | null => {
    if (!a.notifies && !["reject", "return"].includes(a.action)) return null;
    const key = task.doctype === "Case" ? `case.${a.action}` : `generic.${a.action}`;
    const r = renderTemplate(key, { ref: task.name, name: preview?.facts.find((f) => f.label === "Reporter")?.value ?? "Customer", subject: task.title, title: task.title, reason: reason || "(your reason)", dup: "(original case)" });
    return r ? { to: task.doctype === "Case" ? "Customer (email + account)" : "Originator", ...r } : null;
  };

  const run = async (fn: () => Promise<unknown>, msg: string) => {
    setErr(null);
    try {
      await fn();
      onDone(msg);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <CrmDrawer
      open
      wide
      title={task.title}
      subtitle={
        <>
          {task.module} · {task.doctype} <span className="crm-mono">{task.name}</span>
        </>
      }
      onClose={onClose}
      footer={
        <>
          {!task.live && !task.closed_at ? (
            <>
              {!task.assignee ? (
                <button type="button" className="crm-btn crm-btn--sm" onClick={() => void run(() => claimTask(task.id, actor), "Claimed — the SLA clock is yours.")}>
                  Claim
                </button>
              ) : mine ? (
                <button type="button" className="crm-btn crm-btn--sm crm-btn--ghost" onClick={() => void run(() => releaseTask(task.id, actor), "Released to the pool.")}>
                  Release
                </button>
              ) : null}
              <button type="button" className="crm-btn crm-btn--sm" onClick={() => setDialog("reassign")}>
                Reassign
              </button>
              {task.family === "alert" ? (
                <button type="button" className="crm-btn crm-btn--sm crm-btn--ghost" onClick={() => void run(() => snoozeTask(task.id, 1, actor), "Snoozed until tomorrow.")}>
                  Snooze 1 day
                </button>
              ) : null}
            </>
          ) : null}
          {!task.closed_at ? (
            <button type="button" className="crm-btn crm-btn--sm crm-btn--ghost" onClick={() => setDialog("escalate")}>
              Escalate
            </button>
          ) : null}
          <span className="crm-spacer" />
          <Link to={task.link} className="crm-btn crm-btn--sm crm-btn--gold">
            Open record
          </Link>
        </>
      }
    >
      <div className="crm-row">
        <span className={`crm-sla crm-sla--${sla.status === "ok" ? "ok" : sla.status}`}>{sla.label}</span>
        <span className="crm-pill crm-pill--outline">{state}</span>
        {task.rule ? <span className="crm-pill crm-pill--slate crm-mono">{task.rule}</span> : null}
        {task.escalated ? <span className="crm-pill crm-pill--red">Escalated</span> : null}
        {task.on_behalf_of ? <span className="crm-pill crm-pill--purple">On behalf of {task.on_behalf_of}</span> : null}
        {task.live ? <span className="crm-pill">Live (Frappe)</span> : null}
      </div>

      {err ? <p className="eo-error">{err}</p> : null}

      {task.closed_at ? (
        <div className="crm-banner crm-banner--ok">
          <div>
            Closed {fmtStamp(task.closed_at)} by {task.closed_by} — <b>{task.outcome}</b>
          </div>
        </div>
      ) : (
        <div>
          <h4 className="eo-drawer-h">Act</h4>
          <ActionBar
            actions={actions}
            state={state}
            preview={msgPreview}
            onAct={async (a, input) => {
              await h.act(a.action, { ...actor, on_behalf_of: task.on_behalf_of }, input);
              onDone(`${a.label}: done.`);
            }}
            empty={<p className="crm-muted">Nothing to act on here — open the record for details.</p>}
          />
          {autoAction ? <AutoOpen actions={actions} state={state} action={autoAction} onAct={async (a, input) => {
            await h.act(a.action, { ...actor, on_behalf_of: task.on_behalf_of }, input);
            onDone(`${a.label}: done.`);
          }} preview={msgPreview} /> : null}
        </div>
      )}

      {!task.closed_at ? (
        <SuggestButton
          build={() => {
            const flags: string[] = [];
            if (sla.status === "breach") flags.push(`SLA breached (${sla.label}) — act or escalate today.`);
            if (!task.assignee) flags.push("Nobody has claimed this yet.");
            if (four.length) flags.push("You were involved in this record — a colleague should take the decision.");
            if (task.family === "approve" && !(preview?.documents?.length)) flags.push("No documents attached to review.");
            const legal = actions.filter((a) => !a.disabledReason);
            const primary = legal.find((a) => a.primary);
            const ret = legal.find((a) => /return|request_info/.test(a.action));
            const blocked = flags.some((f) => /documents|involved/.test(f));
            return {
              summary: `${task.title}. ${preview?.history?.length ? `Last step: ${preview.history[0].action} by ${preview.history[0].actor}.` : ""} ${task.facts ? Object.entries(task.facts).slice(0, 3).map(([k, v]) => `${k}: ${v}`).join(" · ") : ""}`,
              flags,
              next: blocked && ret ? `${ret.label} — ask for what's missing.` : primary ? `${primary.label}.` : undefined,
              draft: blocked && ret ? `Please provide the supporting documents for ${task.name} so it can be reviewed. Once they're attached we'll complete the review within the SLA.` : undefined,
            };
          }}
        />
      ) : null}

      {four.length ? (
        <div className="crm-banner crm-banner--lock">
          <div>
            <b>Four-eyes:</b> you were involved as {four.map((d) => d.step.toLowerCase()).join(", ")} on this record, so some actions are greyed out for you.
          </div>
        </div>
      ) : null}

      {preview?.summary ? <p style={{ margin: 0, lineHeight: 1.5 }}>{preview.summary}</p> : null}

      <div className="crm-grid crm-grid--2">
        <div>
          <h4 className="eo-drawer-h">Record</h4>
          <Facts rows={preview?.facts ?? Object.entries(task.facts ?? {}).map(([label, value]) => ({ label, value }))} />
        </div>
        <div>
          <h4 className="eo-drawer-h">Task</h4>
          <Facts
            rows={[
              { label: "Family", value: task.family },
              { label: "Role", value: task.role },
              { label: "Assignee", value: task.assignee ?? "Unclaimed (pool)" },
              { label: "Opened", value: fmtStamp(task.created_at) },
              { label: "Due", value: `${fmtStamp(task.due)}` },
              { label: "SLA basis", value: task.paused ? "Paused — waiting on the customer" : "Working days, Eswatini holiday list" },
            ]}
          />
        </div>
      </div>

      {preview?.duties?.length ? (
        <div>
          <h4 className="eo-drawer-h">Independence</h4>
          <Facts rows={preview.duties.map((d) => ({ label: d.step, value: d.people.join(", ") }))} />
        </div>
      ) : null}

      {preview?.documents?.length ? (
        <div>
          <h4 className="eo-drawer-h">Documents</h4>
          <div className="crm-row">
            {preview.documents.map((d) => (
              <span key={d.name} className="crm-pill crm-pill--outline">
                {d.name}
              </span>
            ))}
          </div>
        </div>
      ) : null}

      <div>
        <h4 className="eo-drawer-h">Latest history</h4>
        <HistoryTimeline events={preview?.history?.length ? [...preview.history].reverse() : task.log.map((l) => ({ at: l.at, actor: l.actor, action: l.action, note: l.note }))} />
      </div>

      {dialog === "reassign" ? (
        <ReassignDialog
          task={task}
          exclude={(preview?.duties ?? []).flatMap((d) => d.people)}
          onClose={() => setDialog(null)}
          onSubmit={async (to, reason) => {
            const { reassignTask } = await import("@eswasaone/shared-ui/tasks");
            await reassignTask(task.id, to, reason, actor);
            setDialog(null);
            onDone(`Reassigned to ${to}.`);
          }}
        />
      ) : null}
      {dialog === "escalate" ? (
        <ReasonDialog
          title="Escalate"
          rule="R-A2"
          requires="reason"
          consequence={`Sends an urgent alert to the ${managerRoleFor(task.role)} and marks this task as escalated.`}
          confirmLabel="Escalate"
          danger
          onClose={() => setDialog(null)}
          preview={(reason) => {
            const r = renderTemplate("task.escalate", { name: managerRoleFor(task.role), actor: actor.name, title: task.title, reason: reason || "(your reason)" });
            return r ? { to: managerRoleFor(task.role), ...r } : null;
          }}
          onSubmit={async (v) => {
            if (task.live) await liveEscalate(task, v.reason ?? "");
            else await escalateTask(task.id, v.reason ?? "", actor);
            setDialog(null);
            onDone("Escalated.");
          }}
        />
      ) : null}
    </CrmDrawer>
  );
}

/** Opens one action's dialog immediately (keyboard a / r). */
function AutoOpen({ actions, action, state, onAct, preview }: { actions: ActionOption[]; action: string; state: string; onAct: (a: ActionOption, input: import("@eswasaone/shared-ui/workflow").ActInput) => Promise<void>; preview: (a: ActionOption, r: string) => PreviewMessage | null }) {
  const [open, setOpen] = useState(true);
  const a = action === "primary" ? actions.find((x) => x.primary && !x.disabledReason) : actions.find((x) => /reject|return/.test(x.action) && !x.disabledReason);
  if (!a || !open) return null;
  return (
    <ReasonDialog
      title={a.label}
      consequence={a.consequence}
      rule={a.rule}
      requires={a.requires}
      fields={a.fields}
      danger={a.danger}
      confirmLabel={a.label}
      preview={(r) => preview(a, r)}
      onClose={() => setOpen(false)}
      onSubmit={async (v) => {
        await onAct(a, { expected_state: state, reason: v.reason, note: v.note, payload: v.payload });
        setOpen(false);
      }}
    />
  );
}

export function ReassignDialog({
  task,
  exclude,
  onClose,
  onSubmit,
  title = "Reassign",
}: {
  task: Pick<Task, "role" | "facts">;
  exclude: string[];
  onClose: () => void;
  onSubmit: (to: string, reason: string) => Promise<void>;
  title?: string;
}) {
  const [to, setTo] = useState<string | null>(null);
  const people = eligibleAssignees(task, exclude);
  return (
    <ReasonDialog
      title={title}
      requires="reason"
      consequence="Moves the task to another officer. Eligibility is re-checked: role, independence, leave and workload."
      confirmLabel={to ? `Reassign to ${to}` : "Reassign"}
      canSubmit={Boolean(to)}
      onClose={onClose}
      onSubmit={async (v) => {
        if (!to) throw new Error("Choose who should take it.");
        await onSubmit(to, v.reason ?? "");
      }}
    >
      <div className="crm-field">
        Assign to
        <div className="eo-pick" role="listbox" aria-label="Staff">
          {people.map((p) => (
            <button key={p.name} type="button" role="option" aria-selected={to === p.name} className={to === p.name ? "on" : ""} disabled={!p.ok} title={p.why} onClick={() => setTo(p.name)}>
              <span>
                <b>{p.name}</b> <em>{p.title}</em>
              </span>
              <em>{p.ok ? "Eligible" : p.why}</em>
            </button>
          ))}
        </div>
      </div>
    </ReasonDialog>
  );
}

/**
 * Staff bell (gap 01 C5): assigned to you · SLA due · mentions and reminders.
 */
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Icon, type SessionUser } from "@eswasaone/shared-ui";
import { CrmDrawer } from "@eswasaone/shared-ui/crm";
import { listNotifications, markAllNotificationsRead, markNotificationRead, notifyStore } from "@eswasaone/shared-ui/notify";
import { useStoreResource } from "@eswasaone/shared-ui/store";
import { listTasks, taskSla, taskStore } from "@eswasaone/shared-ui/tasks";
import { actorFrom } from "../approvals/live";

export function StaffBell({ user }: { user: SessionUser }) {
  const actor = useMemo(() => actorFrom(user), [user]);
  const [open, setOpen] = useState(false);
  const res = useStoreResource(
    [taskStore, notifyStore],
    () => {
      const mine = listTasks(actor, { queue: "mine" });
      const due = listTasks(actor, { queue: "all" }).filter((t) => ["due", "breach"].includes(taskSla(t).status));
      const notes = listNotifications("staff", { name: actor.name, email: user.email });
      return { mine, due, notes };
    },
    [actor.name],
  );
  const d = res.data;
  const unread = d ? d.notes.filter((n) => !n.read).length : 0;
  const count = d ? d.mine.length + unread : 0;
  return (
    <>
      <button type="button" className="eo-bell" aria-label={`Notifications${count ? ` (${count})` : ""}`} onClick={() => setOpen(true)}>
        <Icon name="i-bell" />
        {count ? <span className="eo-bell__n">{count > 99 ? "99+" : count}</span> : null}
      </button>
      <CrmDrawer
        open={open}
        title="Your work"
        subtitle="Assigned to you, SLA due and messages"
        onClose={() => setOpen(false)}
        footer={
          <Link className="crm-btn crm-btn--pri" to="/approvals" onClick={() => setOpen(false)}>
            Open Approvals
          </Link>
        }
      >
        {d ? (
          <>
            <section>
              <h4 className="eo-drawer-h">Assigned to you ({d.mine.length})</h4>
              {!d.mine.length ? <p className="crm-small">Nothing assigned. Claim pool work in Approvals.</p> : null}
              <ul className="eo-notes">
                {d.mine.slice(0, 6).map((t) => (
                  <li key={t.id} className="eo-note">
                    <div>
                      <Link to={t.link} onClick={() => setOpen(false)}>
                        <b>{t.title}</b>
                      </Link>
                      <span className="crm-small">
                        {t.module} · {taskSla(t).label}
                        {t.on_behalf_of ? ` · on behalf of ${t.on_behalf_of}` : ""}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
            <section>
              <h4 className="eo-drawer-h">SLA due or breached ({d.due.length})</h4>
              <ul className="eo-notes">
                {d.due.slice(0, 6).map((t) => (
                  <li key={t.id} className="eo-note">
                    <div>
                      <Link to={`/approvals?open=${encodeURIComponent(t.name)}`} onClick={() => setOpen(false)}>
                        <b>{t.title}</b>
                      </Link>
                      <span className="crm-small">
                        <span className={`crm-sla crm-sla--${taskSla(t).status}`}>{taskSla(t).label}</span> {t.assignee ?? `Pool: ${t.role}`}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
            <section>
              <div className="crm-row">
                <h4 className="eo-drawer-h">Messages ({unread} unread)</h4>
                <span className="crm-spacer" />
                {unread ? (
                  <button type="button" className="crm-link" onClick={() => markAllNotificationsRead(d.notes.map((n) => n.id))}>
                    Mark all read
                  </button>
                ) : null}
              </div>
              {!d.notes.length ? <p className="crm-small">No messages.</p> : null}
              <ul className="eo-notes">
                {d.notes.slice(0, 8).map((n) => (
                  <li key={n.id} className={`eo-note${n.read ? "" : " unread"}`} onClick={() => markNotificationRead(n.id)}>
                    <span className="eo-note__dot" />
                    <div>
                      <b>{n.title}</b>
                      <p style={{ whiteSpace: "pre-wrap" }}>{n.body.split("\n").slice(0, 3).join("\n")}</p>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          </>
        ) : null}
      </CrmDrawer>
    </>
  );
}

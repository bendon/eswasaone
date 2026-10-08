/**
 * My account → Notifications (gap 01 C5): every customer-audience event — application received, info
 * requested, quote issued, audit date proposed, NC raised, certificate issued, calibration ready,
 * comment acknowledged, case replied — with read / unread state.
 * TODO: wire real — GET /notifications?audience=customer, POST /notifications/{id}/read.
 */
import { useState } from "react";
import { Link } from "react-router-dom";
import { Icon, type IconName } from "@eswasaone/shared-ui";
import { myCaseRefs } from "@eswasaone/shared-ui/crm";
import { listNotifications, markAllNotificationsRead, markNotificationRead, notifyStore, type AppNotification } from "@eswasaone/shared-ui/notify";
import { useStoreResource } from "@eswasaone/shared-ui/store";
import { useAuth } from "../../auth/AuthProvider";
import { Skeleton } from "./Skeleton";

const KIND_ICON: Record<AppNotification["kind"], IconName> = {
  application: "i-steps",
  case: "i-alert-c",
  quote: "i-dollar",
  audit: "i-cal",
  certificate: "i-badge",
  calibration: "i-gauge",
  comment: "i-mail",
  board: "i-bank",
  task: "i-check-c",
  info: "i-bell",
};

export function useCustomerNotifications() {
  const { user } = useAuth();
  return useStoreResource([notifyStore], () => listNotifications("customer", { email: user?.email, refs: myCaseRefs() }), [user?.email]);
}

export function AccountNotificationsPage() {
  const res = useCustomerNotifications();
  const [filter, setFilter] = useState<"all" | "unread">("all");
  const items = (res.data ?? []).filter((n) => filter === "all" || !n.read);
  const unread = (res.data ?? []).filter((n) => !n.read);
  return (
    <section className="panel is-on" role="tabpanel">
      <div className="panel__head">
        <div>
          <h2>Notifications</h2>
          <p>Updates on your applications, quotes, audits, certificates, calibrations and cases{unread.length ? ` · ${unread.length} unread` : ""}</p>
        </div>
        <div className="actions">
          <div className="crm-seg">
            <button type="button" className={filter === "all" ? "on" : ""} onClick={() => setFilter("all")}>
              All
            </button>
            <button type="button" className={filter === "unread" ? "on" : ""} onClick={() => setFilter("unread")}>
              Unread
            </button>
          </div>
          {unread.length ? (
            <button type="button" className="abtn" onClick={() => markAllNotificationsRead(unread.map((n) => n.id))}>
              Mark all read
            </button>
          ) : null}
        </div>
      </div>
      {res.loading && !res.data ? (
        <Skeleton lines={4} />
      ) : !items.length ? (
        <div className="crm-empty">
          <Icon name="i-bell" />
          <b>{filter === "unread" ? "You're all caught up" : "No notifications yet"}</b>
          <p>We'll let you know here, and by email, when something needs your attention.</p>
        </div>
      ) : (
        <ul className="eo-notes">
          {items.map((n) => (
            <li key={n.id} className={`eo-note${n.read ? "" : " unread"}`}>
              <span className="eo-note__dot" />
              <span className="crm-signal__ic" style={{ width: 34, height: 34 }}>
                <Icon name={KIND_ICON[n.kind]} />
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <b>{n.title}</b>
                <p>{n.body}</p>
                <span className="crm-small">
                  {new Date(n.at).toLocaleString(undefined, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                  {n.channel?.includes("email") ? " · also emailed" : ""}
                  {n.channel?.includes("sms") ? " · SMS" : ""}
                </span>
              </div>
              <div className="crm-stack" style={{ gap: 6, alignItems: "flex-end" }}>
                {n.link ? (
                  <Link className="abtn" to={n.link} onClick={() => markNotificationRead(n.id)}>
                    Open
                  </Link>
                ) : null}
                <button type="button" className="crm-link" onClick={() => markNotificationRead(n.id, !n.read)}>
                  {n.read ? "Mark unread" : "Mark read"}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** Header bell with unread count (desktop + mobile). */
export function CustomerBell() {
  const res = useCustomerNotifications();
  const n = (res.data ?? []).filter((x) => !x.read).length;
  return (
    <Link className="eo-bell" to="/account/notifications" aria-label={`Notifications${n ? ` (${n} unread)` : ""}`}>
      <Icon name="i-bell" />
      {n ? <span className="eo-bell__n">{n > 9 ? "9+" : n}</span> : null}
    </Link>
  );
}

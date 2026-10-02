import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  Icon,
  onEscape,
  setBodyScrollLocked,
  type IconName,
  type AccountOverview,
} from "@eswasaone/shared-ui";
import { getOverview } from "../api/account";
import { primaryRoleLabel } from "../lib/roles";

export type UserActivityRow = {
  title: string;
  ref: string;
  icon: IconName;
  tint: string;
  tone: string;
  status: "review" | "done" | "progress";
  statusLabel: string;
};

export type UserStat = {
  label: string;
  value: string;
  to?: string;
};

export type UserAlert = {
  id: string;
  title: string;
  detail: string;
  tone: "info" | "pending" | "alert" | "tip";
  to?: string;
  unread?: boolean;
};

const EMPTY_STATS: UserStat[] = [
  { label: "Open apps", value: "—", to: "/account" },
  { label: "Orders", value: "—", to: "/account/orders" },
  { label: "Certificates", value: "—", to: "/account/certificates" },
  { label: "Courses", value: "—", to: "/account/training" },
];

function overviewToDock(ov: AccountOverview): {
  stats: UserStat[];
  alerts: UserAlert[];
  activity: UserActivityRow[];
} {
  const byLabel = (label: string) =>
    ov.stats.items.find((s) => s.label.toLowerCase().includes(label))?.value ?? 0;

  const stats: UserStat[] = [
    { label: "Open apps", value: String(byLabel("open")), to: "/account" },
    { label: "Orders", value: String(byLabel("order")), to: "/account/orders" },
    { label: "Certificates", value: String(byLabel("cert")), to: "/account/certificates" },
    {
      label: "Courses",
      value: String(byLabel("course") || byLabel("team") || 0),
      to: "/account/training",
    },
  ];

  const alerts: UserAlert[] = ov.alerts.slice(0, 5).map((a) => ({
    id: a.id,
    title: a.title,
    detail: a.body,
    tone: (a.tone as UserAlert["tone"]) || "info",
    to: a.href,
    unread: a.tone === "alert" || a.tone === "pending",
  }));

  const activity: UserActivityRow[] = ov.feed.slice(0, 5).map((f) => {
    const icon = (f.icon as IconName) || "i-clipboard";
    const status: UserActivityRow["status"] =
      f.title.toLowerCase().includes("order") || f.title.toLowerCase().includes("certificate")
        ? "done"
        : f.title.toLowerCase().includes("application")
          ? "review"
          : "progress";
    return {
      title: f.title,
      ref: f.subtitle || f.time || f.id,
      icon,
      tint: f.tint || "#ECEEFC",
      tone: f.tone || "#313391",
      status,
      statusLabel:
        status === "done" ? "Completed" : status === "review" ? "In review" : "In progress",
    };
  });

  return { stats, alerts, activity };
}

type Props = {
  userName: string;
  userEmail?: string | null;
  userRoles?: string[];
  onSignOut: () => void;
};

/**
 * Floating account dock for signed-in Service Portal users.
 * Loads live overview from /account/overview; empty until fetch settles.
 */
export function UserDock({ userName, userEmail, userRoles, onSignOut }: Props) {
  const [open, setOpen] = useState(false);
  const [stats, setStats] = useState<UserStat[]>(EMPTY_STATS);
  const [alerts, setAlerts] = useState<UserAlert[]>([]);
  const [activity, setActivity] = useState<UserActivityRow[]>([]);

  const initials =
    userName
      .split(/\s+/)
      .map((p) => p[0])
      .join("")
      .slice(0, 2)
      .toUpperCase() || "?";
  const unread = alerts.filter((a) => a.unread).length;
  const roleLabel = primaryRoleLabel(userRoles);

  useEffect(() => {
    let cancelled = false;
    void getOverview("personal")
      .then((ov) => {
        if (cancelled) return;
        const mapped = overviewToDock(ov);
        setStats(mapped.stats);
        setAlerts(mapped.alerts);
        setActivity(mapped.activity);
      })
      .catch(() => {
        /* keep empty placeholders — no silent mock data */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    return onEscape(() => setOpen(false));
  }, [open]);

  useEffect(() => {
    if (!open) return;
    setBodyScrollLocked(true);
    return () => setBodyScrollLocked(false);
  }, [open]);

  return (
    <div className={`user-dock${open ? " is-open" : ""}`}>
      <button
        type="button"
        className={`user-dock__trigger${open ? " is-hidden" : ""}`}
        aria-label={unread ? `Open my account, ${unread} alerts` : "Open my account"}
        onClick={() => setOpen(true)}
      >
        <span className="user-dock__av" aria-hidden="true">
          {initials}
          {unread > 0 ? <i className="user-dock__badge">{unread > 9 ? "9+" : unread}</i> : null}
        </span>
        <span className="user-dock__hint">
          My account
          {unread > 0 ? <em className="user-dock__hint-meta">{unread} new</em> : null}
        </span>
      </button>

      {open ? (
        <div className="user-dock__panel" role="dialog" aria-label="My account" aria-modal="true">
          <div className="user-dock__head">
            <span className="user-dock__av user-dock__av--lg" aria-hidden="true">
              {initials}
            </span>
            <div className="user-dock__id">
              <b>{userName}</b>
              <span>
                {userEmail || "Citizen account"}
                {roleLabel ? ` · ${roleLabel}` : ""}
              </span>
            </div>
            <button
              type="button"
              className="user-dock__close"
              aria-label="Close"
              onClick={() => setOpen(false)}
            >
              ×
            </button>
          </div>

          <div className="user-dock__body">
            <div className="user-dock__stats" role="group" aria-label="Account summary">
              {stats.map((s) => {
                const inner = (
                  <>
                    <b>{s.value}</b>
                    <span>{s.label}</span>
                  </>
                );
                return s.to ? (
                  <Link
                    key={s.label}
                    to={s.to}
                    className="user-dock__stat"
                    onClick={() => setOpen(false)}
                  >
                    {inner}
                  </Link>
                ) : (
                  <div key={s.label} className="user-dock__stat">
                    {inner}
                  </div>
                );
              })}
            </div>

            <div className="user-dock__sec-head">
              <div>
                <h2>Alerts</h2>
                <p>Notifications that need your attention</p>
              </div>
              {unread > 0 ? <span className="user-dock__pill">{unread} new</span> : null}
            </div>
            <div className="user-dock__alerts">
              {alerts.length === 0 ? (
                <p className="user-dock__empty">No alerts right now.</p>
              ) : (
                alerts.map((a) => {
                  const row = (
                    <>
                      <span className={`user-dock__alert-mark tone-${a.tone}`} aria-hidden="true" />
                      <div className="user-dock__alert-copy">
                        <b>
                          {a.title}
                          {a.unread ? <i className="user-dock__dot" aria-label="Unread" /> : null}
                        </b>
                        <span>{a.detail}</span>
                      </div>
                    </>
                  );
                  return a.to ? (
                    <Link
                      key={a.id}
                      to={a.to}
                      className={`user-dock__alert${a.unread ? " is-unread" : ""}`}
                      onClick={() => setOpen(false)}
                    >
                      {row}
                    </Link>
                  ) : (
                    <div
                      key={a.id}
                      className={`user-dock__alert${a.unread ? " is-unread" : ""}`}
                    >
                      {row}
                    </div>
                  );
                })
              )}
            </div>

            <div className="user-dock__sec-head">
              <div>
                <h2>Your activity</h2>
                <p>Applications, purchases and training</p>
              </div>
              <Link to="/account" className="linkish" onClick={() => setOpen(false)}>
                View all
              </Link>
            </div>
            <div className="user-dock__actlist">
              {activity.length === 0 ? (
                <p className="user-dock__empty">No recent activity.</p>
              ) : (
                activity.map((row) => (
                  <div key={`${row.title}-${row.ref}`} className="user-dock__actrow">
                    <span
                      className="user-dock__actic"
                      style={{ ["--tint" as string]: row.tint, ["--tone" as string]: row.tone }}
                    >
                      <Icon name={row.icon} />
                    </span>
                    <div className="user-dock__actbody">
                      <b>{row.title}</b>
                      <span>{row.ref}</span>
                    </div>
                    <span className={`actstatus actstatus--${row.status}`}>
                      <span className="s" /> {row.statusLabel}
                    </span>
                  </div>
                ))
              )}
            </div>

            <nav className="user-dock__links" aria-label="Account links">
              <Link to="/account" onClick={() => setOpen(false)}>
                <Icon name="i-users" /> Profile &amp; overview
              </Link>
              <Link to="/account/orders" onClick={() => setOpen(false)}>
                <Icon name="i-cart" /> Orders
              </Link>
              <Link to="/account/certificates" onClick={() => setOpen(false)}>
                <Icon name="i-badge" /> Certificates
              </Link>
              <Link to="/account/training" onClick={() => setOpen(false)}>
                <Icon name="i-cap" /> Training
              </Link>
            </nav>
          </div>

          <div className="user-dock__foot">
            <button
              type="button"
              className="btn-ghost"
              style={{ width: "100%" }}
              onClick={() => {
                setOpen(false);
                onSignOut();
              }}
            >
              Sign out
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

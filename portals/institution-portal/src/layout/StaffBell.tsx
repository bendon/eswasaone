/**
 * Staff bell — dropdown notification panel with Unread/All tabs,
 * day-grouped items, and "Mark all as read".
 * Replaces the previous CrmDrawer approach with the mock's inline dropdown.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Icon, type IconName, type SessionUser } from "@eswasaone/shared-ui";
import {
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  notifyStore,
  type AppNotification,
} from "@eswasaone/shared-ui/notify";
import { useStoreResource } from "@eswasaone/shared-ui/store";
import { listTasks, taskSla, taskStore } from "@eswasaone/shared-ui/tasks";
import { actorFrom } from "../approvals/live";

type BellTab = "unread" | "all";

type BellItem = {
  id: string;
  icon: IconName;
  tint: string;
  tone: string;
  html: string; // pre-rendered HTML snippet
  time: string;
  day: string;
  unread: boolean;
  link?: string;
};

const TINTS: Record<string, { tint: string; tone: string; icon: IconName }> = {
  application: { tint: "#ECEEFC", tone: "#313391", icon: "i-file" },
  case: { tint: "#ECEEFC", tone: "#313391", icon: "i-mail" },
  quote: { tint: "#ECEEFC", tone: "#313391", icon: "i-clipboard" },
  audit: { tint: "#FEF3C7", tone: "#92400E", icon: "i-cal" },
  certificate: { tint: "#DCFCE7", tone: "#166534", icon: "i-award" },
  calibration: { tint: "#F0E9FB", tone: "#7C3AED", icon: "i-flask" },
  comment: { tint: "#FEF6DC", tone: "#B8860B", icon: "i-mail" },
  board: { tint: "#ECEEFC", tone: "#313391", icon: "i-board" },
  task: { tint: "#ECEEFC", tone: "#313391", icon: "i-check-c" },
  info: { tint: "#EFF3F8", tone: "#5A6B84", icon: "i-bell" },
};

function dayLabel(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "Earlier";
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  if (sameDay) return "Today";
  const y = new Date(now);
  y.setDate(y.getDate() - 1);
  if (d.toDateString() === y.toDateString()) return "Yesterday";
  return d.toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

function timeLabel(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", hour12: false });
}

export function StaffBell({ user }: { user: SessionUser }) {
  const actor = useMemo(() => actorFrom(user), [user]);
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<BellTab>("unread");
  const wrapRef = useRef<HTMLDivElement>(null);

  const res = useStoreResource(
    [taskStore, notifyStore],
    () => {
      const mine = listTasks(actor, { queue: "mine" });
      const due = listTasks(actor, { queue: "all" }).filter((t) =>
        ["due", "breach"].includes(taskSla(t).status),
      );
      const notes = listNotifications("staff", { name: actor.name, email: user.email });
      return { mine, due, notes };
    },
    [actor.name],
  );

  const d = res.data;
  const unreadNotes = d ? d.notes.filter((n) => !n.read).length : 0;
  const count = d ? d.mine.length + unreadNotes : 0;

  // Build flat BellItem list from notifications + tasks
  const items: BellItem[] = useMemo(() => {
    if (!d) return [];
    const fromNotes: BellItem[] = d.notes.map((n: AppNotification) => {
      const meta = TINTS[n.kind] ?? TINTS.info;
      return {
        id: n.id,
        icon: meta.icon,
        tint: meta.tint,
        tone: meta.tone,
        html: `<b>${escapeHtml(n.title)}</b> — ${escapeHtml(n.body.split("\n")[0] ?? "")}`,
        time: timeLabel(n.at),
        day: dayLabel(n.at),
        unread: !n.read,
        link: n.link,
      };
    });
    const fromTasks: BellItem[] = d.due.slice(0, 4).map((t) => {
      const sla = taskSla(t);
      return {
        id: `task-${t.id}`,
        icon: "i-warn",
        tint: sla.status === "breach" ? "#FDECEC" : "#FEF3C7",
        tone: sla.status === "breach" ? "#9F1239" : "#92400E",
        html: `<b>${escapeHtml(t.title)}</b><br/>SLA ${escapeHtml(sla.label)} · ${escapeHtml(t.module)}`,
        time: "",
        day: "Today",
        unread: true,
        link: `/approvals?open=${encodeURIComponent(t.name)}`,
      };
    });
    return [...fromTasks, ...fromNotes].sort((a) => (a.day === "Today" ? -1 : 1));
  }, [d]);

  const filtered = tab === "unread" ? items.filter((i) => i.unread) : items;

  // Group by day
  const grouped = useMemo(() => {
    const map = new Map<string, BellItem[]>();
    for (const it of filtered) {
      const arr = map.get(it.day) ?? [];
      arr.push(it);
      map.set(it.day, arr);
    }
    return [...map.entries()];
  }, [filtered]);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  function handleMarkAll() {
    if (!d) return;
    markAllNotificationsRead(d.notes.map((n) => n.id));
  }

  function openItem(item: BellItem) {
    if (item.id.startsWith("task-")) return; // tasks are link-only
    markNotificationRead(item.id);
  }

  return (
    <div className="bellwrap" ref={wrapRef}>
      <button
        type="button"
        className={`eo-bell${count > 0 && open ? " ping" : ""}`}
        aria-label={`Notifications${count ? ` (${count})` : ""}`}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-controls="npanel"
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
      >
        <Icon name="i-bell" />
        {count ? <span className="eo-bell__n">{count > 99 ? "99+" : count}</span> : null}
      </button>

      {open ? (
        <section
          aria-label="Notifications"
          className="npanel"
          id="npanel"
          role="dialog"
        >
          <div className="npanel__h">
            <h2>Notifications</h2>
            {unreadNotes > 0 ? (
              <button type="button" onClick={handleMarkAll}>
                Mark all as read
              </button>
            ) : null}
          </div>
          <div className="npanel__tabs" role="tablist">
            <button
              type="button"
              role="tab"
              aria-selected={tab === "unread"}
              onClick={() => setTab("unread")}
            >
              {unreadNotes > 0 ? `Unread (${unreadNotes})` : "Unread"}
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={tab === "all"}
              onClick={() => setTab("all")}
            >
              All
            </button>
          </div>
          <div className="npanel__list">
            {filtered.length === 0 ? (
              <div className="nempty">You're all caught up.</div>
            ) : (
              grouped.map(([day, dayItems]) => (
                <div key={day}>
                  <div className="ngroup">{day}</div>
                  {dayItems.map((item) => {
                    const isTask = item.id.startsWith("task-");
                    const content = (
                      <>
                        <span
                          className="ic"
                          style={{
                            ["--ic-tint" as string]: item.tint,
                            ["--ic-tone" as string]: item.tone,
                          }}
                        >
                          <Icon name={item.icon} />
                        </span>
                        <div>
                          <p dangerouslySetInnerHTML={{ __html: item.html }} />
                          {item.time ? <time>{item.time}</time> : null}
                        </div>
                        <span className="dot" style={{ visibility: item.unread ? "visible" : "hidden" }} />
                      </>
                    );
                    return isTask || item.link ? (
                      <Link
                        key={item.id}
                        to={item.link ?? "#"}
                        className={`nitem${item.unread ? "" : " read"}`}
                        onClick={() => {
                          openItem(item);
                          setOpen(false);
                        }}
                      >
                        {content}
                      </Link>
                    ) : (
                      <div
                        key={item.id}
                        className={`nitem${item.unread ? "" : " read"}`}
                        role="button"
                        tabIndex={0}
                        onClick={() => openItem(item)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            openItem(item);
                          }
                        }}
                      >
                        {content}
                      </div>
                    );
                  })}
                </div>
              ))
            )}
          </div>
          <div className="npanel__f">
            <span>Only things addressed to you</span>
            <Link to="/approvals" onClick={() => setOpen(false)}>
              Notification settings
            </Link>
          </div>
        </section>
      ) : null}
    </div>
  );
}

function escapeHtml(s: string): string {
  return String(s).replace(
    /[&<>"]/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!,
  );
}
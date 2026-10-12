/**
 * My account → Notifications (gap 01 C5): every customer-audience event — application received, info
 * requested, quote issued, audit date proposed, NC raised, certificate issued, calibration ready,
 * comment acknowledged, case replied — with read / unread state.
 * Wired to Core /account/notifications/feed (Frappe Notification Log).
 */
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Icon, type IconName } from "@eswasaone/shared-ui";
import { answerNps, listNpsForCustomer, useCrm, type NpsSurvey } from "@eswasaone/shared-ui/crm";
import { markAllNotificationsRead, markNotificationRead, type AppNotification } from "@eswasaone/shared-ui/notify";
import { fetchNotificationFeed, type NotificationFeedEntry } from "../../api/misc";
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

/** Map a Notification Log entry to the AppNotification shape the UI expects. */
function toAppNotification(e: NotificationFeedEntry): AppNotification {
  let kind: AppNotification["kind"] = "info";
  if (e.document_type === "Certification Application") kind = "application";
  else if (e.document_type === "Audit") kind = "audit";
  else if (e.document_type === "Certificate") kind = "certificate";

  // subject like "[R-C1] Application submitted: APP-2026-00027" → readable title
  const title = e.subject?.replace(/^\[.*?\]\s*/, "") || "Notification";

  return {
    id: e.id,
    audience: "customer" as const,
    to: "",
    kind,
    title,
    body: e.body ?? "",
    at: e.created_at ?? new Date().toISOString(),
    read: e.read,
    link: e.link ?? undefined,
    channel: [],
  };
}

export function useCustomerNotifications() {
  const { user } = useAuth();
  const [data, setData] = useState<AppNotification[] | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const feed = await fetchNotificationFeed(50);
        if (cancelled) return;
        const mapped = feed.items.map(toAppNotification);
        setData(mapped);
      } catch {
        if (!cancelled) setData([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [user?.email]);

  return { data, loading };
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
      <NpsCards />
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

/** Net Promoter Score after a milestone (04 P3): certificate issued, calibration delivered. */
function NpsCards() {
  const { user } = useAuth();
  const res = useCrm(() => listNpsForCustomer(user?.email ?? "demo"), [user?.email]);
  const open = res.data ?? [];
  if (!open.length) return null;
  return (
    <div className="crm-stack" style={{ marginBottom: 14 }}>
      {open.map((n) => (
        <NpsCard key={n.id} n={n} />
      ))}
    </div>
  );
}

function NpsCard({ n }: { n: NpsSurvey }) {
  const [score, setScore] = useState<number | null>(null);
  const [comment, setComment] = useState("");
  const [done, setDone] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  if (done) return <div className="crm-banner crm-banner--ok"><div>{done}</div></div>;
  return (
    <div className="crm-card">
      <b>How likely are you to recommend ESWASA {n.trigger === "certificate_issued" ? "certification" : "calibration"} to a colleague?</b>
      <p className="crm-small" style={{ margin: "2px 0 8px" }}>
        About {n.ref}. 0 = not at all likely, 10 = extremely likely.
      </p>
      <div className="crm-seg" role="radiogroup" aria-label="Score from 0 to 10" style={{ flexWrap: "wrap" }}>
        {Array.from({ length: 11 }, (_, i) => (
          <button key={i} type="button" role="radio" aria-checked={score === i} className={score === i ? "on" : ""} onClick={() => setScore(i)}>
            {i}
          </button>
        ))}
      </div>
      {score !== null ? (
        <>
          <label className="crm-field" style={{ marginTop: 8 }}>
            {score >= 9 ? "What did we do well?" : "What should we do better?"} (optional)
            <textarea className="crm-textarea" rows={2} value={comment} onChange={(e) => setComment(e.target.value)} />
          </label>
          {err ? <p className="eo-error">{err}</p> : null}
          <button
            type="button"
            className="abtn"
            style={{ marginTop: 8 }}
            onClick={() =>
              void answerNps(n.id, score, comment).then(
                () => setDone("Thank you — your feedback goes straight to the team."),
                (e: Error) => setErr(e.message),
              )
            }
          >
            Send
          </button>
        </>
      ) : null}
    </div>
  );
}

import { Link, useNavigate } from "react-router-dom";
import { Icon } from "@eswasaone/shared-ui";
import { useAuth } from "../auth/AuthProvider";
import { auditsHref } from "./audits";
import { useHomeData } from "./home/useHomeData";
import "../styles/home-more.css";

/**
 * Field Home — next-audit hero, quick actions, today's schedule, Me glance.
 * Hydrates from on-device snapshots, then refreshes from API.
 */
export function HomeScreen() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { next, schedule, me, fromCache, refreshing } = useHomeData();
  const firstName =
    (user?.full_name || user?.username || "").split(/\s+/)[0] || "there";

  const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(next.mapsQuery)}`;

  return (
    <section className="field-screen" aria-label={`Home for ${firstName}`}>
      {fromCache || refreshing ? (
        <p className="hm-cache-note" role="status">
          {fromCache
            ? "Showing last saved on this device — reconnect to sync."
            : "Updating…"}
        </p>
      ) : null}
      <article className="hm-next">
        <div className="hm-next__lbl">NEXT AUDIT · {next.whenLabel}</div>
        <h2 className="hm-next__title">{next.company}</h2>
        <div className="hm-next__meta">
          <span>
            <Icon name="i-badge" />
            {next.standard} · {next.stage}
          </span>
          <span>
            <Icon name="i-clock" />
            {next.time}
          </span>
          <span>
            <Icon name="i-pin" />
            {next.location}
          </span>
        </div>
        <div className="hm-next__act">
          <Link className="hm-next__go" to={auditsHref({ open: next.id })}>
            <Icon name="i-play" />
            Start audit
          </Link>
          <a
            className="hm-next__dir"
            href={mapsUrl}
            target="_blank"
            rel="noopener noreferrer"
          >
            <Icon name="i-map" />
            Directions
          </a>
        </div>
      </article>

      <nav className="hm-qa" aria-label="Quick actions">
        <Link to="/audits">
          <span className="hm-qa__ic hm-qa__ic--audits">
            <Icon name="i-clipboard" />
          </span>
          Audits
        </Link>
        <Link to="/me?tab=leave">
          <span className="hm-qa__ic hm-qa__ic--leave">
            <Icon name="i-cal" />
          </span>
          Leave
        </Link>
        <Link to="/me?tab=pay">
          <span className="hm-qa__ic hm-qa__ic--pay">
            <Icon name="i-dollar" />
          </span>
          Payslip
        </Link>
        <Link to="/me?tab=claims">
          <span className="hm-qa__ic hm-qa__ic--claim">
            <Icon name="i-file" />
          </span>
          Claim
        </Link>
      </nav>

      <h3 className="hm-sec">Today&apos;s schedule</h3>
      <div className="hm-card">
        {schedule.map((item) => (
          <button
            key={item.id}
            type="button"
            className="hm-row"
            onClick={() => navigate(auditsHref({ open: item.id }))}
          >
            <span className="hm-row__ic">
              <Icon name="i-badge" />
            </span>
            <div className="hm-row__body">
              <b>{item.title}</b>
              <span>{item.subtitle}</span>
            </div>
            <span className="hm-stt">
              <span className="hm-stt__dot" />
              {item.time}
            </span>
          </button>
        ))}
      </div>

      <h3 className="hm-sec">Me</h3>
      <div className="hm-card">
        <div className="hm-glance">
          <div>
            <div className="hm-glance__big">
              {me.leaveDaysLeft}{" "}
              <span style={{ fontSize: 12, color: "var(--muted)", fontWeight: 600 }}>
                days
              </span>
            </div>
            <div style={{ fontSize: 12, color: "var(--muted-2)" }}>
              Annual leave left
            </div>
          </div>
          <div className="hm-glance__r">
            <Link className="hm-link" to="/me?tab=leave">
              Request →
            </Link>
          </div>
        </div>
        <div className="hm-glance" style={{ borderTop: "1px solid var(--line-2)" }}>
          <div>
            <div className="hm-glance__big">{me.nextPayday}</div>
            <div style={{ fontSize: 12, color: "var(--muted-2)" }}>Next payday</div>
          </div>
          <div className="hm-glance__r">
            <Link className="hm-link" to="/me?tab=pay">
              Payslips →
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}

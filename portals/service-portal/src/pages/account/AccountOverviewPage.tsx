import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Icon, type IconName, type AccountOverview } from "@eswasaone/shared-ui";
import { useAccount } from "./AccountContext";
import { getOverview } from "../../api/account";
import { actionsRequired, listApplications, schemeTitle, type ApplicationDetail } from "../../api/certification";
import { stageTitle } from "../../certification/flows";
import { Skeleton } from "./Skeleton";

export function AccountOverviewPage() {
  const { entity } = useAccount();
  const [data, setData] = useState<AccountOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [apps, setApps] = useState<ApplicationDetail[]>([]);

  useEffect(() => {
    let cancelled = false;
    void listApplications()
      .then((a) => {
        if (!cancelled) setApps(a);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void getOverview(entity)
      .then((d) => {
        if (cancelled) return;
        setData(d);
        setLoading(false);
      })
      .catch(() => {
        /* session lock/expiry handled globally — keep skeleton until unlock */
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [entity]);

  if (loading || !data) {
    return (
      <section className="panel is-on">
        <div className="ovgrid">
          <Skeleton lines={5} />
          <Skeleton lines={4} />
        </div>
      </section>
    );
  }

  const isBiz = entity === "business";

  return (
    <section className="panel is-on" role="tabpanel">
      <div className="ovgrid">
        {/* Left column */}
        <div style={{ display: "flex", flexDirection: "column", gap: 16, minWidth: 0 }}>
          {/* Alerts */}
          {data.alerts.length > 0 ? (
            <div className="card">
              <div className="card__head">
                <h3>For your attention</h3>
              </div>
              <div className="alerts">
                {data.alerts.map((a) => (
                  <div
                    key={a.id}
                    className="alert"
                    style={{
                      ["--tint" as string]: a.tint,
                      ["--border-tint" as string]: a.border_tint,
                      ["--tone" as string]: a.tone === "alert" ? "#9F1239" : a.tone === "pending" ? "#92400E" : "#075985",
                    }}
                  >
                    <span className="alert__ic">
                      <Icon name={a.icon as IconName} />
                    </span>
                    <div className="alert__body">
                      <b>{a.title}</b>
                      <span>{a.body}</span>
                      <Link className="alert__cta" to={a.href ?? "/account"}>
                        {a.cta}
                        <Icon name="i-cright" width={12} height={12} />
                      </Link>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {/* Certification applications */}
          {apps.length > 0 ? (
            <div className="card">
              <div className="card__head">
                <h3>Certification applications</h3>
                <Link to="/account/applications">
                  View all <Icon name="i-cright" width={13} height={13} />
                </Link>
              </div>
              <ul className="actfeed">
                {apps.slice(0, 3).map((a) => {
                  const todo = actionsRequired(a);
                  return (
                    <li key={a.id}>
                      <span
                        className="actfeed__ic"
                        style={{ ["--tint" as string]: todo.length ? "#FEF3C7" : "#ECEEFC", ["--tone" as string]: todo.length ? "#92400E" : "#313391" }}
                      >
                        <Icon name={todo.length ? "i-warn" : "i-badge"} />
                      </span>
                      <div className="actfeed__body">
                        <b>{schemeTitle(a.scheme)}</b>
                        <span>
                          {a.id} · {stageTitle(a.flow, a.stage)}
                        </span>
                        {todo.length ? <time>{todo[0]}</time> : null}
                      </div>
                      <Link className="actfeed__link" to={`/certification/${encodeURIComponent(a.id)}`} aria-label={`Open ${a.id}`}>
                        <Icon name="i-cright" width={14} height={14} />
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ) : null}

          {/* Recent activity */}
          <div className="card">
            <div className="card__head">
              <h3>Recent activity</h3>
              <Link to="/account/orders">
                View all <Icon name="i-cright" width={13} height={13} />
              </Link>
            </div>
            <ul className="actfeed">
              {data.feed.map((f) => (
                <li key={f.id}>
                  <span
                    className="actfeed__ic"
                    style={{ ["--tint" as string]: f.tint, ["--tone" as string]: f.tone }}
                  >
                    <Icon name={f.icon as IconName} />
                  </span>
                  <div className="actfeed__body">
                    <b>{f.title}</b>
                    <span>{f.subtitle}</span>
                    <time>{f.time}</time>
                  </div>
                  <Link className="actfeed__link" to={f.href ?? "/account"} aria-label="View">
                    <Icon name="i-cright" width={14} height={14} />
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Right column */}
        <div style={{ display: "flex", flexDirection: "column", gap: 16, minWidth: 0 }}>
          {/* Quick actions */}
          <div className="card">
            <div className="card__head">
              <h3>Quick actions</h3>
            </div>
            <div className="qa">
              <Link className="qabtn" to="/certification/apply">
                <span className="qabtn__ic" style={{ ["--ic-tint" as string]: "#ECEEFC", ["--ic-tone" as string]: "#313391" }}>
                  <Icon name="i-badge" />
                </span>
                <span className="qabtn__body">
                  <b>Apply for certification</b>
                  <span>Start a new scheme application</span>
                </span>
              </Link>
              <Link className="qabtn" to="/standards">
                <span className="qabtn__ic" style={{ ["--ic-tint" as string]: "#FEF6DC", ["--ic-tone" as string]: "#B8860B" }}>
                  <Icon name="i-book" />
                </span>
                <span className="qabtn__body">
                  <b>Buy standards</b>
                  <span>Browse the SZNS catalogue</span>
                </span>
              </Link>
              <Link className="qabtn" to="/training">
                <span className="qabtn__ic" style={{ ["--ic-tint" as string]: "#F0E9FB", ["--ic-tone" as string]: "#7C3AED" }}>
                  <Icon name="i-cap" />
                </span>
                <span className="qabtn__body">
                  <b>Enrol in training</b>
                  <span>24 courses with digital cert</span>
                </span>
              </Link>
              <Link className="qabtn" to="/verify">
                <span className="qabtn__ic" style={{ ["--ic-tint" as string]: "#DCFCE7", ["--ic-tone" as string]: "#15803D" }}>
                  <Icon name="i-eye" />
                </span>
                <span className="qabtn__body">
                  <b>Verify a certificate</b>
                  <span>Check any ESWASA number</span>
                </span>
              </Link>
            </div>
          </div>

          {/* Account summary */}
          <div className="card">
            <div className="card__head">
              <h3>Account summary</h3>
            </div>
            <div className="card__body">
              <ul className="actfeed">
                {data.summary.map((s) => (
                  <li key={s.id}>
                    <span
                      className="actfeed__ic"
                      style={{ ["--tint" as string]: s.tint, ["--tone" as string]: s.tone }}
                    >
                      <Icon name={s.icon as IconName} />
                    </span>
                    <div className="actfeed__body">
                      <b>{s.title}</b>
                      <span>{s.subtitle}</span>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </div>

      {/* KPI stats — rendered into the workspace header */}
      <StatsInjector stats={data.stats} isBiz={isBiz} />
    </section>
  );
}

/* Mounts the KPI stats into the workspace header's stats slot */
function StatsInjector({ stats }: { stats: AccountOverview["stats"]; isBiz: boolean }) {
  useEffect(() => {
    const slot = document.querySelector(".workspace__stats");
    if (!slot) return;
    slot.innerHTML = "";
    for (const s of stats.items) {
      const el = document.createElement("div");
      el.className = `wstat${s.accent ? " wstat--accent" : ""}`;
      el.innerHTML = `<b>${s.value}</b><span>${s.label}</span>`;
      slot.appendChild(el);
    }
  }, [stats]);
  return null;
}
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Icon } from "@eswasaone/shared-ui";
import {
  actionsRequired,
  listApplications,
  listQuotes,
  respondToQuote,
  schemeForQuote,
  schemeTitle,
  type ApplicationDetail,
  type Quote,
} from "../../api/certification";
import { FLOW_SHORT, fmtDate, stageProgress, stageTitle } from "../../certification/flows";
import { useToast } from "../../ui/Toast";
import { Skeleton } from "./Skeleton";

type Filter = "all" | "action" | "active" | "certified" | "closed";

function isClosed(a: ApplicationDetail) {
  return a.stage === "withdrawn";
}

export function AccountApplicationsPage() {
  const [apps, setApps] = useState<ApplicationDetail[]>([]);
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Filter>("all");
  const [busy, setBusy] = useState<string | null>(null);
  const { showToast } = useToast();

  function load() {
    setLoading(true);
    void Promise.all([listApplications(), listQuotes()])
      .then(([a, q]) => {
        setApps(a);
        setQuotes(q);
      })
      .finally(() => setLoading(false));
  }

  useEffect(load, []);

  const filtered = useMemo(() => {
    return apps.filter((a) => {
      if (filter === "action") return actionsRequired(a).length > 0;
      if (filter === "certified") return !!a.certificate;
      if (filter === "closed") return isClosed(a);
      if (filter === "active") return !a.certificate && !isClosed(a);
      return true;
    });
  }, [apps, filter]);

  const openQuotes = quotes.filter((q) => q.status === "requested" || q.status === "issued");
  const actionCount = apps.filter((a) => actionsRequired(a).length > 0).length;

  async function answer(q: Quote, accept: boolean) {
    setBusy(q.id);
    try {
      await respondToQuote(q.id, accept);
      showToast(accept ? "Quote accepted. Continue to the application." : "Quote declined");
      load();
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="panel is-on" role="tabpanel">
      <div className="panel__head">
        <div>
          <h2>Certification applications</h2>
          <p>Quotes, applications, audits and certificates in one place.</p>
        </div>
        <div className="actions">
          <Link className="abtn ghost" to="/certification/quote">
            <Icon name="i-dollar" /> Request a quote
          </Link>
          <Link className="abtn primary" to="/certification/apply">
            <Icon name="i-plus" /> New application
          </Link>
        </div>
      </div>

      {openQuotes.length ? (
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="card__head">
            <h3>Quotes</h3>
          </div>
          <div className="cf-apps" style={{ padding: "0 16px 16px" }}>
            {openQuotes.map((q) => (
              <div className="cf-app" key={q.id}>
                <div>
                  <span className="cf-app__ref">{q.id}</span>
                  <b>{q.standards || FLOW_SHORT[q.flow]}</b>
                  <div className="cf-app__meta">
                    <span className="cf-chip cf-chip--muted">{FLOW_SHORT[q.flow]}</span>
                    {q.status === "requested" ? (
                      <span className="cf-chip">
                        <Icon name="i-clock" /> Quote due {fmtDate(q.due_by)}
                      </span>
                    ) : (
                      <span className="cf-chip cf-chip--gold">
                        SZL {q.total?.toLocaleString() ?? "—"} · valid until {fmtDate(q.valid_until)}
                      </span>
                    )}
                  </div>
                </div>
                {q.status === "issued" ? (
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
                    <button type="button" className="abtn ghost" disabled={busy === q.id} onClick={() => void answer(q, false)}>
                      Decline
                    </button>
                    <Link
                      className="abtn primary"
                      to={`/certification/apply?scheme=${schemeForQuote(q)}&quote=${encodeURIComponent(q.id)}`}
                    >
                      <Icon name="i-check" /> Accept &amp; apply
                    </Link>
                  </div>
                ) : (
                  <span className="cf-chip cf-chip--muted">Being prepared</span>
                )}
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <div className="toolbar">
        <select
          className="toolbar__select"
          aria-label="Filter applications"
          value={filter}
          onChange={(e) => setFilter(e.target.value as Filter)}
        >
          <option value="all">All applications ({apps.length})</option>
          <option value="action">Needs my action ({actionCount})</option>
          <option value="active">In progress</option>
          <option value="certified">Certified</option>
          <option value="closed">Withdrawn</option>
        </select>
      </div>

      {loading ? (
        <div className="cf-apps">
          <Skeleton lines={3} />
          <Skeleton lines={3} />
        </div>
      ) : filtered.length === 0 ? (
        <div className="empty">
          <span className="empty__ic">
            <Icon name="i-badge" />
          </span>
          <b>{apps.length ? "Nothing matches this filter" : "No applications yet"}</b>
          <p>Request a quote or start an application. You can track every stage here.</p>
          <Link to="/certification">Explore certification</Link>
        </div>
      ) : (
        <div className="cf-apps">
          {filtered.map((a) => {
            const todo = actionsRequired(a);
            return (
              <Link className="cf-app" key={a.id} to={`/certification/${encodeURIComponent(a.id)}`}>
                <div>
                  <span className="cf-app__ref">
                    {a.id} · applied {fmtDate(a.created_at)}
                  </span>
                  <b>{schemeTitle(a.scheme)}</b>
                  <div className="cf-app__meta">
                    <span className="cf-chip cf-chip--muted">{FLOW_SHORT[a.flow]}</span>
                    <span className={`cf-chip${a.certificate ? " cf-chip--green" : isClosed(a) ? " cf-chip--muted" : ""}`}>
                      {stageTitle(a.flow, a.stage)}
                    </span>
                    {todo.map((t) => (
                      <span key={t} className="cf-chip cf-chip--amber">
                        <Icon name="i-warn" /> {t}
                      </span>
                    ))}
                  </div>
                  {!isClosed(a) ? (
                    <div className="cf-progress" aria-label={`${stageProgress(a.flow, a.stage)}% through the process`}>
                      <i style={{ width: `${stageProgress(a.flow, a.stage)}%` }} />
                    </div>
                  ) : null}
                </div>
                <Icon name="i-cright" />
              </Link>
            );
          })}
        </div>
      )}
    </section>
  );
}

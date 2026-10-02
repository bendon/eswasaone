import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Icon } from "@eswasaone/shared-ui";
import { useAccount } from "./AccountContext";
import { listEnrolments, type Enrolment } from "../../api/training";
import { useToast } from "../../ui/Toast";
import { Skeleton } from "./Skeleton";

export function AccountTrainingPage() {
  const { entity, activeEntity } = useAccount();
  const [items, setItems] = useState<Enrolment[]>([]);
  const [loading, setLoading] = useState(true);
  const { showToast } = useToast();

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void listEnrolments(entity)
      .then((e) => {
        if (!cancelled) {
          setItems(e);
          setLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [entity]);

  const subtitle = entity === "business"
    ? "Team enrolments and completed courses"
    : "Your enrolled courses and completed training";

  return (
    <section className="panel is-on" role="tabpanel">
      <div className="panel__head">
        <div>
          <h2>Training</h2>
          <p>{subtitle}</p>
        </div>
        <div className="actions">
          <Link className="abtn ghost" to="/training">
            <Icon name="i-cap" /> Browse courses
          </Link>
        </div>
      </div>

      {loading ? (
        <div className="trgrid">
          <Skeleton lines={4} />
          <Skeleton lines={4} />
        </div>
      ) : items.length === 0 ? (
        <div className="empty">
          <span className="empty__ic"><Icon name="i-cap" /></span>
          <b>No courses yet</b>
          <p>Enrol in a course to see your progress here.</p>
          <Link to="/training">Browse courses</Link>
        </div>
      ) : (
        <div className="trgrid">
          {items.map((t) => {
            const hasBar = typeof t.progress === "number" && t.progress > 0;
            return (
              <article key={t.id} className="trow" style={{ ["--accent" as string]: t.accent }}>
                <div className="trow__top">
                  <span
                    className="certcard__chip"
                    style={{ ["--chip-tint" as string]: t.tint, ["--chip-tone" as string]: t.tone }}
                  >
                    {t.chip}
                  </span>
                  {t.code ? <span className="trow__code">{t.code}</span> : null}
                </div>
                <h3>{t.title}</h3>
                <p className="trow__desc">{t.desc}</p>
                {hasBar ? (
                  <div className="trow__bar">
                    <div className="trow__bar-track">
                      <div className="trow__bar-fill" style={{ width: `${t.progress}%` }} />
                    </div>
                    <div className="trow__bar-meta">
                      <span><b>{t.progress}%</b> complete</span>
                      <span>{t.progressLabel}</span>
                    </div>
                  </div>
                ) : null}
                <div className="trow__foot">
                  <div className="trow__meta">
                    {t.meta.map((m, i) => (
                      <span key={i}><Icon name="i-clock" width={13} height={13} />{m}</span>
                    ))}
                  </div>
                  <div className="trow__actions">
                    {t.chip === "In progress" ? (
                      <button
                        type="button"
                        className="abtn primary"
                        onClick={() => showToast("Resuming where you left off…")}
                      >
                        <Icon name="i-cright" /> Continue
                      </button>
                    ) : null}
                    {t.chip === "Completed" ? (
                      <button
                        type="button"
                        className="abtn ghost"
                        onClick={() => showToast("Preparing certificate download…")}
                      >
                        <Icon name="i-download" /> Certificate
                      </button>
                    ) : null}
                    {t.chip === "Available" ? (
                      <Link className="abtn primary" to="/training">
                        <Icon name="i-send" /> Enrol
                      </Link>
                    ) : null}
                    {t.chip === "Team enrolment" ? (
                      <button
                        type="button"
                        className="abtn ghost"
                        onClick={() => showToast("Opening delegate manager…")}
                      >
                        Manage delegates
                      </button>
                    ) : null}
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Icon } from "@eswasaone/shared-ui";
import { useAccount } from "./AccountContext";
import { listCertificates, type Certificate } from "../../api/certification";
import { useToast } from "../../ui/Toast";
import { Skeleton } from "./Skeleton";

export function AccountCertificatesPage() {
  const { entity, activeEntity } = useAccount();
  const [certs, setCerts] = useState<Certificate[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [schemeFilter, setSchemeFilter] = useState("all");
  const { showToast } = useToast();

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void listCertificates(entity)
      .then((c) => {
        if (!cancelled) {
          setCerts(c);
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

  const filtered = useMemo(() => {
    let items = certs;
    if (query.trim()) {
      const q = query.toLowerCase();
      items = items.filter(
        (c) =>
          c.num.toLowerCase().includes(q) ||
          c.title.toLowerCase().includes(q) ||
          (c.holder || "").toLowerCase().includes(q),
      );
    }
    if (schemeFilter !== "all") {
      items = items.filter((c) => c.chip.toLowerCase() === schemeFilter);
    }
    return items;
  }, [certs, query, schemeFilter]);

  const subtitle = entity === "business"
    ? `Certificates issued to ${activeEntity?.name ?? "this business"}`
    : "Training certificates issued to you";

  return (
    <section className="panel is-on" role="tabpanel">
      <div className="panel__head">
        <div>
          <h2>Certificates</h2>
          <p>{subtitle}</p>
        </div>
        <div className="actions">
          <Link className="abtn ghost" to="/verify">
            <Icon name="i-eye" /> Verify externally
          </Link>
        </div>
      </div>

      <div className="toolbar">
        <label className="toolbar__input">
          <Icon name="i-search" width={17} height={17} />
          <input
            type="search"
            placeholder="Search by certificate number or scheme…"
            aria-label="Search certificates"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
        <select
          className="toolbar__select"
          aria-label="Scheme"
          value={schemeFilter}
          onChange={(e) => setSchemeFilter(e.target.value)}
        >
          <option value="all">All schemes</option>
          <option value="training">Training</option>
          <option value="management system">Management system</option>
          <option value="food safety">Food safety</option>
          <option value="product">Product</option>
        </select>
      </div>

      {loading ? (
        <div className="certgrid">
          <Skeleton lines={4} />
          <Skeleton lines={4} />
          <Skeleton lines={4} />
        </div>
      ) : filtered.length === 0 ? (
        <div className="empty">
          <span className="empty__ic"><Icon name="i-badge" /></span>
          <b>No certificates yet</b>
          <p>Complete a course or certification to receive your first certificate.</p>
          <Link to="/training">Browse courses</Link>
        </div>
      ) : (
        <div className="certgrid">
          {filtered.map((c) => (
            <article key={c.id} className="certcard" style={{ ["--accent" as string]: c.accent }}>
              <div className="certcard__top">
                <span
                  className="certcard__chip"
                  style={{ ["--chip-tint" as string]: c.tint, ["--chip-tone" as string]: c.tone }}
                >
                  {c.chip}
                </span>
                {c.expiring ? (
                  <span className="pill pill--pending" style={{ marginLeft: "auto" }}>Expiring soon</span>
                ) : null}
              </div>
              <h3>{c.title}</h3>
              <div className="certcard__holder">Holder · <b>{c.holder}</b></div>
              <dl className="certcard__facts">
                <div className="certcard__fact">
                  <dt>Certificate no.</dt>
                  <dd>{c.num}</dd>
                </div>
                <div className="certcard__fact">
                  <dt>Expires</dt>
                  <dd>{c.expires}</dd>
                </div>
                <div className="certcard__fact">
                  <dt>Issued</dt>
                  <dd>{c.issued}</dd>
                </div>
                <div className="certcard__fact">
                  <dt>Status</dt>
                  <dd style={{ color: "var(--green)" }}>Valid</dd>
                </div>
              </dl>
              <div className="certcard__actions">
                <button
                  type="button"
                  className="abtn ghost"
                  onClick={() => showToast("Preparing download…")}
                >
                  <Icon name="i-download" /> PDF
                </button>
                <Link className="abtn primary" to="/verify">
                  <Icon name="i-eye" /> Verify
                </Link>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { getStandard, type StandardSummary } from "../api/standards";
import { useAuth } from "../auth/AuthProvider";
import { Breadcrumbs } from "../components/Breadcrumbs";
import { safeText } from "../lib/safe";

export function StandardDetailPage() {
  const { id = "" } = useParams();
  const [item, setItem] = useState<StandardSummary | null>(null);
  const [busy, setBusy] = useState(true);
  const { user, requireAuth } = useAuth();

  useEffect(() => {
    setBusy(true);
    void getStandard(id).then((s) => {
      setItem(s);
      setBusy(false);
    });
  }, [id]);

  function buy() {
    if (!item) return;
    if (
      !requireAuth({
        title: "Sign in to buy",
        reason: `You were about to buy ${item.code}.`,
        next: `/standards/${id}`,
      })
    ) {
      return;
    }
    window.location.assign(`/estore/checkout?item=${encodeURIComponent(item.code)}`);
  }

  if (busy) {
    return (
      <div className="page">
        <Breadcrumbs
          items={[
            { label: "Home", to: "/" },
            { label: "Standards & e-Store", to: "/standards" },
            { label: "Loading…" },
          ]}
        />
        <p className="page-note">Loading…</p>
      </div>
    );
  }

  if (!item) {
    return (
      <div className="page">
        <Breadcrumbs
          items={[
            { label: "Home", to: "/" },
            { label: "Standards & e-Store", to: "/standards" },
            { label: "Not found" },
          ]}
        />
        <p className="page-note">Standard not found.</p>
        <Link to="/standards">← Catalogue</Link>
      </div>
    );
  }

  return (
    <div className="page">
      <Breadcrumbs
        items={[
          { label: "Home", to: "/" },
          { label: "Standards & e-Store", to: "/standards" },
          { label: item.code },
        ]}
      />
      <h1 className="page-h">{safeText(item.code)}</h1>
      <p className="page-lead">{safeText(item.title)}</p>
      <div className="meta-row">
        <span>{safeText(item.sector)}</span>
        <span>{item.year}</span>
        <span>{safeText(item.status)}</span>
        <span>{safeText(item.price || "See e-store")}</span>
      </div>
      <div className="prose">
        <h2>Abstract</h2>
        <p>
          {safeText(
            item.abstract || "Summary available after purchase of the licensed standard.",
          )}
        </p>
        <p className="page-note">
          Licensed standards are paraphrased only in free answers. Purchase for full normative text.
        </p>
      </div>
      <button type="button" className="btn-primary" onClick={buy}>
        Buy {safeText(item.code)}
        {!user ? " (sign in)" : ""}
      </button>
    </div>
  );
}

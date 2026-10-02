import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { getApplication, type CertificationApplication } from "../api/certification";
import { Breadcrumbs } from "../components/Breadcrumbs";
import { safeText } from "../lib/safe";

export function CertificationTrackPage() {
  const { id = "" } = useParams();
  const [app, setApp] = useState<CertificationApplication | null>(null);

  useEffect(() => {
    void getApplication(id).then(setApp);
  }, [id]);

  if (!app) {
    return (
      <div className="page">
        <Breadcrumbs
          items={[
            { label: "Home", to: "/" },
            { label: "Certification", to: "/certification" },
            { label: "Loading…" },
          ]}
        />
        <p className="page-note">Loading case…</p>
      </div>
    );
  }

  return (
    <div className="page">
      <Breadcrumbs
        items={[
          { label: "Home", to: "/" },
          { label: "Certification", to: "/certification" },
          { label: app.id },
        ]}
      />
      <h1 className="page-h">{safeText(app.id)}</h1>
      <p className="page-lead">{safeText(app.scheme)}</p>
      <div className="meta-row">
        <span>Status: {safeText(app.status)}</span>
        <span>{safeText(app.applicant)}</span>
      </div>
      <p className="page-note">Audits, NCs and certificate details appear here as the case advances.</p>
    </div>
  );
}

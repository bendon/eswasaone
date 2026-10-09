import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Icon } from "@eswasaone/shared-ui";
import { getStatusRegister, type RegisterEntry, type StatusRegister } from "../api/certification";
import { Breadcrumbs } from "../components/Breadcrumbs";
import { CHARTER, FLOW_LABEL, fmtDate, type CertFlow } from "../certification/flows";

const TABS: CertFlow[] = ["ms", "product", "ingelo"];

const SECTIONS: { key: keyof StatusRegister; title: string; empty: string }[] = [
  { key: "suspended", title: "Currently suspended certifications", empty: "No certifications are currently under suspension." },
  {
    key: "withdrawn",
    title: "Withdrawn / cancelled certifications",
    empty: "No certifications have been withdrawn or cancelled.",
  },
  {
    key: "reduced",
    title: "Reduced-scope certifications",
    empty: "No certifications are currently operating under a reduced scope.",
  },
];

export function CertificationStatusPage() {
  const [params, setParams] = useSearchParams();
  const flow = (TABS.includes(params.get("flow") as CertFlow) ? params.get("flow") : "ms") as CertFlow;
  const [reg, setReg] = useState<StatusRegister | null>(null);
  const [q, setQ] = useState("");
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setReg(null);
    setFailed(false);
    getStatusRegister(flow)
      .then(setReg)
      .catch(() => setFailed(true));
  }, [flow]);

  const match = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return (e: RegisterEntry) =>
      !needle || `${e.holder} ${e.certificate} ${e.scope}`.toLowerCase().includes(needle);
  }, [q]);

  return (
    <div className="page">
      <Breadcrumbs
        items={[
          { label: "Home", to: "/" },
          { label: "Certification", to: "/certification" },
          { label: "Status register" },
        ]}
      />
      <header className="cf-head">
        <div>
          <span className="cf-head__kicker">Public record · CER_PR_026</span>
          <h1>Certification status register</h1>
          <p>
            Public record of suspended, withdrawn and reduced-scope certifications. To confirm that a
            specific certificate is valid, use the verification check. No phone call needed.
          </p>
        </div>
        <Link className="cf-btn cf-btn--gold" to="/verify">
          <Icon name="i-shield-c" /> Verify a certificate
        </Link>
      </header>

      <div className="cf-tabs" role="tablist" aria-label="Certification type">
        {TABS.map((t) => (
          <button
            key={t}
            type="button"
            role="tab"
            aria-selected={t === flow}
            onClick={() => setParams({ flow: t })}
          >
            {FLOW_LABEL[t]}
          </button>
        ))}
      </div>

      <div className="cf-track" style={{ marginTop: 0 }}>
        <div>
          <label className="cf-field" style={{ maxWidth: 420, marginBottom: 14 }}>
            <span className="lbl">Search the register</span>
            <input
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Company, certificate number or scope"
            />
          </label>
          {failed ? (
            <div className="cf-note cf-note--warn" role="alert">
              <Icon name="i-warn" />
              <span>
                <b>The register couldn’t be loaded.</b> No entries are shown because we can’t confirm them. See
                ESWASA’s published register:{" "}
                <a href={`https://www.eswasa.co.sz/certification-status-${flow === "ms" ? "management-systems" : flow}.php`} target="_blank" rel="noopener noreferrer">
                  eswasa.co.sz
                </a>
                .
              </span>
            </div>
          ) : null}
          <div className="cf-reg" hidden={failed}>
            {SECTIONS.map((sec) => {
              const rows = (reg?.[sec.key] ?? []).filter(match);
              return (
                <section className="cf-card" key={sec.key}>
                  <div className="cf-card__h">
                    <h2>{sec.title}</h2>
                    <span className={`cf-chip${rows.length ? " cf-chip--red" : " cf-chip--muted"}`}>
                      {reg ? rows.length : "…"}
                    </span>
                  </div>
                  {!reg ? (
                    <p className="cf-empty">Loading…</p>
                  ) : rows.length === 0 ? (
                    <p className="cf-empty">{q ? "No entries match your search." : sec.empty}</p>
                  ) : (
                    <div style={{ overflowX: "auto" }}>
                      <table>
                        <thead>
                          <tr>
                            <th>Holder</th>
                            <th>Certificate</th>
                            <th>Scope</th>
                            <th>Since</th>
                            {sec.key !== "withdrawn" ? <th>Reason</th> : null}
                          </tr>
                        </thead>
                        <tbody>
                          {rows.map((e) => (
                            <tr key={e.certificate}>
                              <td>{e.holder}</td>
                              <td className="font-code">{e.certificate}</td>
                              <td>{e.scope}</td>
                              <td>{fmtDate(e.since)}</td>
                              {sec.key !== "withdrawn" ? <td>{e.reason ?? "—"}</td> : null}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </section>
              );
            })}
          </div>
        </div>

        <aside className="cf-side">
          <section className="cf-card">
            <h3>Appeals</h3>
            <p style={{ fontSize: 13.5, color: "var(--muted)" }}>
              Certified clients may lodge a written appeal within {CHARTER.appealWindowDays} days of an adverse
              decision (CER_PR_002). Appeal from your application tracker.
            </p>
            <Link className="cf-btn cf-btn--ghost cf-btn--sm" to="/account/applications" style={{ marginTop: 10 }}>
              My applications
            </Link>
          </section>
          <section className="cf-card">
            <h3>Complaints about a certified client</h3>
            <p style={{ fontSize: 13.5, color: "var(--muted)" }}>
              Handled under CER_PR_006. Acknowledged within {CHARTER.complaintAckDays} working days, resolved
              within {CHARTER.complaintResolveDays} where possible.
            </p>
            <Link className="cf-btn cf-btn--ghost cf-btn--sm" to="/complaints?topic=certification" style={{ marginTop: 10 }}>
              Raise a complaint
            </Link>
          </section>
          <section className="cf-card">
            <h3>Requests for information</h3>
            <p style={{ fontSize: 13.5, color: "var(--muted)" }}>
              Written requests about a client’s certification status follow CER_PR_015. Marketing &amp; Sales
              Officer: (+268) 2518 4633 · (+268) 7806 8944.
            </p>
          </section>
        </aside>
      </div>
    </div>
  );
}

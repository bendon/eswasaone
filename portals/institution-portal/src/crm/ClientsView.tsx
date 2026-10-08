import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Icon, ModuleHeader } from "@eswasaone/shared-ui";
import {
  CrmEmpty,
  clientHealth,
  daysFromNow,
  isOpen,
  listCases,
  listClients,
  useCrm,
  type ClientTier,
  type Region,
} from "@eswasaone/shared-ui/crm";
import { CrmGate } from "./shared";

const TIER_LABEL: Record<ClientTier, string> = { key: "Key account", growth: "Growth", standard: "Standard", prospect: "Prospect" };
const REGIONS: Region[] = ["Hhohho", "Manzini", "Lubombo", "Shiselweni"];

/** Client register — every organisation ESWASA serves, with health and certification at a glance. */
export function CrmClientsView() {
  const navigate = useNavigate();
  const [q, setQ] = useState("");
  const [sector, setSector] = useState("all");
  const [region, setRegion] = useState("all");
  const [tier, setTier] = useState("all");
  const [health, setHealth] = useState("all");
  const [certified, setCertified] = useState("all");

  const res = useCrm(async () => {
    const [clients, cases] = await Promise.all([listClients(), listCases({ includeAppeals: false })]);
    return { clients, cases };
  });

  return (
    <CrmGate res={res} what="Clients">
      {({ clients, cases }) => {
        const sectors = [...new Set(clients.map((c) => c.sector))].sort();
        const rows = clients
          .map((c) => ({ c, h: clientHealth(c, cases) }))
          .filter(({ c }) => !q.trim() || `${c.name} ${c.reg_no ?? ""} ${c.contacts.map((x) => x.name).join(" ")}`.toLowerCase().includes(q.trim().toLowerCase()))
          .filter(({ c }) => sector === "all" || c.sector === sector)
          .filter(({ c }) => region === "all" || c.region === region)
          .filter(({ c }) => tier === "all" || c.tier === tier)
          .filter(({ h }) => health === "all" || h.band === health)
          .filter(({ c }) =>
            certified === "all" ? true : certified === "yes" ? c.certificates.some((x) => x.status === "valid") : !c.certificates.some((x) => x.status === "valid"),
          );
        const atRisk = clients.filter((c) => clientHealth(c, cases).band === "risk").length;

        return (
          <>
            <ModuleHeader
              title="Clients"
              subtitle="One record per organisation — certificates, lab work, training, orders, invoices and cases together"
              summary={[
                { label: "Clients", value: clients.length },
                { label: "Key accounts", value: clients.filter((c) => c.tier === "key").length },
                { label: "At risk", value: atRisk, variant: atRisk ? "breach" : "ok" },
              ]}
            />
            <div className="crm-toolbar">
              <Link className="crm-btn crm-btn--pri crm-btn--sm" to="/crm/clients/new">
                <Icon name="i-plus" /> New client
              </Link>
              <Link className="crm-btn crm-btn--sm" to="/crm/contacts">
                Contacts
              </Link>
              <div className="crm-search">
                <Icon name="i-search" />
                <input className="crm-input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, registration or contact" aria-label="Search clients" />
              </div>
              <select className="crm-select" style={{ width: "auto" }} value={sector} onChange={(e) => setSector(e.target.value)} aria-label="Sector">
                <option value="all">All sectors</option>
                {sectors.map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
              <select className="crm-select" style={{ width: "auto" }} value={region} onChange={(e) => setRegion(e.target.value)} aria-label="Region">
                <option value="all">All regions</option>
                {REGIONS.map((r) => (
                  <option key={r}>{r}</option>
                ))}
              </select>
              <select className="crm-select" style={{ width: "auto" }} value={tier} onChange={(e) => setTier(e.target.value)} aria-label="Tier">
                <option value="all">All tiers</option>
                {(Object.keys(TIER_LABEL) as ClientTier[]).map((t) => (
                  <option key={t} value={t}>
                    {TIER_LABEL[t]}
                  </option>
                ))}
              </select>
              <select className="crm-select" style={{ width: "auto" }} value={health} onChange={(e) => setHealth(e.target.value)} aria-label="Health">
                <option value="all">Any health</option>
                <option value="good">Healthy</option>
                <option value="watch">Watch</option>
                <option value="risk">At risk</option>
              </select>
              <select className="crm-select" style={{ width: "auto" }} value={certified} onChange={(e) => setCertified(e.target.value)} aria-label="Certified">
                <option value="all">Certified or not</option>
                <option value="yes">Holds a valid certificate</option>
                <option value="no">No valid certificate</option>
              </select>
            </div>

            {rows.length === 0 ? (
              <CrmEmpty title="No clients match" detail="Clear a filter to see more." />
            ) : (
              <div className="crm-card crm-card--flush">
                <div className="crm-table-wrap">
                  <table className="crm-table">
                    <thead>
                      <tr>
                        <th>Client</th>
                        <th>Tier</th>
                        <th>Certificates</th>
                        <th>Next due</th>
                        <th>Open cases</th>
                        <th>Balance</th>
                        <th>Health</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map(({ c, h }) => {
                        const valid = c.certificates.filter((x) => x.status === "valid");
                        const nextDates = [
                          ...c.certificates.filter((x) => x.status === "valid").flatMap((x) => [x.expires, x.next_surveillance ?? ""]),
                          ...c.instruments.map((i) => i.next_due),
                        ]
                          .filter(Boolean)
                          .filter((d) => daysFromNow(d) >= -30)
                          .sort();
                        const next = nextDates[0];
                        const open = cases.filter((x) => x.client_id === c.id && isOpen(x)).length;
                        const owed = c.invoices.filter((i) => i.status !== "paid").reduce((s, i) => s + i.amount, 0);
                        const overdue = c.invoices.some((i) => i.status === "overdue");
                        return (
                          <tr key={c.id} className="is-click" onClick={() => navigate(`/crm/clients/${c.id}`)}>
                            <td>
                              <b>{c.name}</b>
                              <span className="crm-small">
                                {c.sector} · {c.region}
                                {c.exporter ? " · Exporter" : ""}
                              </span>
                            </td>
                            <td>
                              <span className={`crm-pill ${c.tier === "key" ? "crm-pill--gold" : c.tier === "prospect" ? "crm-pill--outline" : "crm-pill--slate"}`}>
                                {c.status === "dormant" ? "Dormant" : TIER_LABEL[c.tier]}
                              </span>
                            </td>
                            <td>
                              {valid.length ? `${valid.length} valid` : "—"}
                              {c.certificates.some((x) => x.status === "suspended") ? <span className="crm-small" style={{ color: "var(--red)" }}>1 suspended</span> : null}
                            </td>
                            <td className="crm-small">{next ? `${daysFromNow(next)}d` : "—"}</td>
                            <td>{open || "—"}</td>
                            <td className="num" style={{ color: overdue ? "var(--red)" : undefined }}>
                              {owed ? `E ${owed.toLocaleString()}` : "—"}
                            </td>
                            <td>
                              <span className={`crm-health crm-health--${h.band}`}>{h.score}</span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </>
        );
      }}
    </CrmGate>
  );
}

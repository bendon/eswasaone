import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Icon, ModuleHeader } from "@eswasaone/shared-ui";
import {
  CrmEmpty,
  convertSignal,
  fmtDay,
  fmtE,
  listClients,
  listSignals,
  renewals,
  useCrm,
  useCrmToast,
  type RenewalItem,
} from "@eswasaone/shared-ui/crm";
import { CrmGate, useActor } from "./shared";

type Bucket = "overdue" | "30" | "60" | "90";

const BUCKETS: { id: Bucket; label: string; test: (d: number) => boolean; tone?: string }[] = [
  { id: "overdue", label: "Overdue", test: (d) => d < 0, tone: "red" },
  { id: "30", label: "Next 30 days", test: (d) => d >= 0 && d <= 30, tone: "amber" },
  { id: "60", label: "31–60 days", test: (d) => d > 30 && d <= 60 },
  { id: "90", label: "61–90 days", test: (d) => d > 60 && d <= 90 },
];

const KIND_LABEL: Record<RenewalItem["kind"], string> = {
  certificate: "Certificate renewal",
  surveillance: "Surveillance audit",
  calibration: "Calibration",
};

/** Renewals radar — recurring revenue and compliance dates that must not slip. */
export function CrmRenewalsView() {
  const actor = useActor();
  const navigate = useNavigate();
  const [toast, showToast] = useCrmToast();
  const [bucket, setBucket] = useState<Bucket>("30");
  const [kind, setKind] = useState<RenewalItem["kind"] | "all">("all");

  const res = useCrm(async () => {
    const [clients, signals] = await Promise.all([listClients(), listSignals()]);
    return { items: renewals(clients, signals, 90), signals };
  });

  return (
    <CrmGate res={res} what="Renewals">
      {({ items, signals }) => {
        const b = BUCKETS.find((x) => x.id === bucket)!;
        const rows = items.filter((i) => b.test(i.days)).filter((i) => kind === "all" || i.kind === kind);
        const untouched = items.filter((i) => i.days <= 30 && i.outreach === "none").length;

        const startOutreach = async (i: RenewalItem) => {
          const sig = signals.find(
            (s) =>
              s.client_id === i.client_id &&
              s.status !== "converted" &&
              ((i.kind === "certificate" && s.kind === "cert_expiring") ||
                (i.kind === "surveillance" && s.kind === "surveillance_due") ||
                (i.kind === "calibration" && s.kind === "calibration_due")),
          );
          if (sig) {
            const o = await convertSignal(sig.id, actor);
            showToast(`Opportunity ${o.id} created`);
            navigate(`/crm/pipeline?open=${o.id}`);
          } else {
            navigate(`/crm/pipeline?new=1&client=${i.client_id}`);
          }
        };

        return (
          <>
            <ModuleHeader
              title="Renewals radar"
              subtitle="Certificates, surveillance audits and calibrations coming due — so no client lapses by accident"
              summary={[
                { label: "Due in 90 days", value: items.filter((i) => i.days >= 0).length },
                { label: "No outreach ≤30d", value: untouched, variant: untouched ? "due" : "ok" },
                { label: "Value at stake", value: fmtE(items.reduce((s, i) => s + i.value_estimate, 0)) },
              ]}
            />
            <div className="crm-buckets">
              {BUCKETS.map((x) => {
                const list = items.filter((i) => x.test(i.days));
                return (
                  <button key={x.id} type="button" className={`crm-bucket${bucket === x.id ? " on" : ""}${x.tone ? ` crm-bucket--${x.tone}` : ""}`} onClick={() => setBucket(x.id)}>
                    <b>{list.length}</b>
                    <span>{x.label}</span>
                    <em>{fmtE(list.reduce((s, i) => s + i.value_estimate, 0))}</em>
                  </button>
                );
              })}
            </div>
            <div className="crm-toolbar">
              <div className="crm-seg">
                {(["all", "certificate", "surveillance", "calibration"] as const).map((k) => (
                  <button key={k} type="button" className={kind === k ? "on" : ""} onClick={() => setKind(k)}>
                    {k === "all" ? "All" : KIND_LABEL[k]}
                  </button>
                ))}
              </div>
            </div>
            {rows.length === 0 ? (
              <CrmEmpty icon="i-cal" title="Nothing due in this window" />
            ) : (
              <div className="crm-card crm-card--flush">
                <div className="crm-table-wrap">
                  <table className="crm-table">
                    <thead>
                      <tr>
                        <th>Client</th>
                        <th>What</th>
                        <th>Due</th>
                        <th>Outreach</th>
                        <th className="num">Est. value</th>
                        <th />
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((i) => (
                        <tr key={i.id}>
                          <td>
                            <Link className="crm-link" to={`/crm/clients/${i.client_id}`}>
                              {i.client_name}
                            </Link>
                          </td>
                          <td>
                            <span className="crm-pill crm-pill--outline">{KIND_LABEL[i.kind]}</span>
                            <span className="crm-small">{i.label}</span>
                          </td>
                          <td>
                            {fmtDay(i.due)}
                            <span className="crm-small" style={{ color: i.days < 0 ? "var(--red)" : i.days <= 14 ? "var(--amber)" : undefined }}>
                              {i.days < 0 ? `${-i.days} days overdue` : `in ${i.days} days`}
                            </span>
                          </td>
                          <td>
                            <span className={`crm-pill crm-pill--${i.outreach === "booked" ? "green" : i.outreach === "contacted" ? "navy" : "amber"}`}>
                              {i.outreach === "none" ? "Not contacted" : i.outreach === "booked" ? "In pipeline" : "Contacted"}
                            </span>
                          </td>
                          <td className="num">{fmtE(i.value_estimate)}</td>
                          <td style={{ textAlign: "right" }}>
                            {i.outreach === "none" ? (
                              <button type="button" className="crm-btn crm-btn--sm" onClick={() => void startOutreach(i)}>
                                <Icon name="i-trend" /> Start renewal
                              </button>
                            ) : null}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
            {toast}
          </>
        );
      }}
    </CrmGate>
  );
}

/**
 * Certification Approval Committee session (gap 05; workflow map §3.1 Decision for CAC schemes).
 * Lists files in Decision for schemes the CAC decides, with the technical review, lab status and
 * conflicts (audit team / technical reviewer can't decide). Decisions go through the same ActionBar,
 * so separation of duties and R-C3 / R-C4 apply.
 */
import { Link } from "react-router-dom";
import { actOnApplication, appActions, getCertSettings, labBlock, listApplications } from "@eswasaone/shared-ui/certification";
import { fmtDate } from "@eswasaone/shared-ui/record";
import { Acts, Empty, Gate, PageHead, useDomain, useStaffActor, useToast } from "../domain/ui";

export function CacSessionView() {
  const actor = useStaffActor();
  const [toast, show] = useToast();
  const res = useDomain(() => listApplications({ state: "Decision" }), []);
  const cac = new Set(getCertSettings().schemes.filter((s) => s.cac).map((s) => s.code));
  return (
    <Gate res={res} what="CAC agenda">
      {(apps) => {
        const rows = apps.filter((a) => cac.has(a.scheme));
        const others = apps.filter((a) => !cac.has(a.scheme));
        return (
          <div className="crm-stack">
            {toast}
            <PageHead title="Certification Approval Committee" sub="Product, combined and Ingelo files are decided here. Members who audited or reviewed a file must recuse." actions={<Link className="crm-btn crm-btn--sm" to="/certification/decisions">All decisions</Link>} />
            {rows.map((a) => {
              const conflicted = [...(a.duties?.["Audit team"] ?? []), ...(a.duties?.["Technical reviewer"] ?? [])];
              const lab = labBlock(a);
              return (
                <div key={a.id} className="crm-card">
                  <div className="crm-row">
                    <b style={{ flex: 1 }}>
                      <Link className="crm-link" to={`/certification/applications/${a.id}`}>
                        {a.org}
                      </Link>{" "}
                      <span className="crm-small">
                        {a.id} · {a.standard} · in Decision since {fmtDate([...a.history].reverse().find((h) => h.to === "Decision")?.at)}
                      </span>
                    </b>
                  </div>
                  <p style={{ margin: "6px 0" }}>
                    <b>Technical review:</b> {a.technical_review ? `${a.technical_review.by} recommends ${a.technical_review.recommendation} — ${a.technical_review.justification}` : "missing"}
                  </p>
                  <p className="crm-small">
                    Must recuse: {conflicted.join(", ") || "nobody"}
                    {conflicted.includes(actor.name) ? " — including you" : ""}
                  </p>
                  {lab ? <div className="crm-banner crm-banner--err">{lab}</div> : <div className="crm-banner crm-banner--ok">Lab results approved and conforming.</div>}
                  <Acts actions={appActions(a.id, actor).filter((x) => ["grant", "grant_conditions", "refuse", "return_review"].includes(x.action))} state={a.state} toast={show} act={(x, input) => actOnApplication(a.id, x.action, actor, input)} />
                </div>
              );
            })}
            {!rows.length ? <Empty title="Nothing on the CAC agenda" /> : null}
            {others.length ? <p className="crm-small">{others.length} management-system file(s) are with the Certification Manager instead.</p> : null}
          </div>
        );
      }}
    </Gate>
  );
}

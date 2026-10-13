import { useState } from "react";
import { useApiResource } from "../hooks/useApiResource";
import { EmptyState, ResourceGate } from "../components/PageStates";
import { useInstitution } from "../layout/InstitutionLayout";
import type { HrMyItems } from "../api/types";
import { errorText, hrSend } from "../hr/api";
import { ItemStatus } from "../hr/items/Items";
import { Banner, fmtDay } from "./parts";

/**
 * E11 My items (HR additions plan 02): what HR has issued to me, and an Acknowledge button for anything I haven't
 * confirmed yet. The same acknowledgement can be done from the card in Approvals. Live GET /hr/me/items.
 */
export function MyItems() {
  const { user, sessionKey } = useInstitution();
  const res = useApiResource<HrMyItems>("/hr/me/items", { enabled: Boolean(user), refreshKey: sessionKey });
  const [d, setD] = useState<HrMyItems | null>(null);
  const data = d ?? res.data;
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function acknowledge(name: string) {
    setBusy(name);
    setErr(null);
    try {
      setD(await hrSend<HrMyItems>(`/hr/me/items/${encodeURIComponent(name)}/acknowledge`));
    } catch (e) {
      setErr(errorText(e, "Not acknowledged."));
    } finally {
      setBusy(null);
    }
  }

  return (
    <ResourceGate loading={res.loading} error={res.error} onRetry={res.reload} refreshing={res.refreshing} hasData={Boolean(data)} skeleton="list">
      {data ? (
        <div className="hr-view">
          <div className="hr-head">
            <div>
              <h2>My items</h2>
              <p>Equipment and cards HR has issued to you. Hand them back to HR or your line manager when you leave.</p>
            </div>
          </div>
          {err ? (
            <Banner kind="bad" title="Not acknowledged">
              {err}
            </Banner>
          ) : null}
          {data.waiting ? (
            <Banner kind="info" title={`${data.waiting} item${data.waiting === 1 ? "" : "s"} to acknowledge`}>
              Check you received {data.waiting === 1 ? "it" : "them"}, then acknowledge.
            </Banner>
          ) : null}
          {data.items.length ? (
            <div className="hr-box">
              <div className="hr-box__b">
                <div className="hr-out">
                  {data.items.map((i) => (
                    <div className="hr-out__i" key={i.name}>
                      <div>
                        <b>
                          {i.item_type}
                          {i.tag ? ` ${i.tag}` : ""}
                        </b>
                        <span className="s">
                          {i.description ? `${i.description}. ` : ""}Issued {fmtDay(i.issued_on, true)}
                          {i.return_due ? `, return by ${fmtDay(i.return_due, true)}` : ""}
                          {i.returned_on ? `, returned ${fmtDay(i.returned_on, true)}` : ""}
                        </span>
                      </div>
                      <span className="r">
                        {i.status === "Issued" ? (
                          <button type="button" className="btn pri sm" disabled={busy === i.name} onClick={() => void acknowledge(i.name)}>
                            {busy === i.name ? "Saving…" : "Acknowledge"}
                          </button>
                        ) : (
                          <ItemStatus i={i} />
                        )}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <EmptyState title="Nothing issued to you" detail="Items HR issues to you, such as a laptop or access card, appear here." />
          )}
        </div>
      ) : null}
    </ResourceGate>
  );
}

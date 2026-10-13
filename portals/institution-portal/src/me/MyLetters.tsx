import { useState } from "react";
import { FormDrawer, type FormDrawerField } from "@eswasaone/shared-ui";
import { useApiResource } from "../hooks/useApiResource";
import { EmptyState, ResourceGate } from "../components/PageStates";
import { useInstitution } from "../layout/InstitutionLayout";
import type { HrMyLetters } from "../api/types";
import { errorText, hrSend } from "../hr/api";
import { letterPdf, LetterStatus } from "../hr/letters/Letters";
import { Banner, fmtDay } from "./parts";

/**
 * E12 My letters (HR additions plan 03): ask HR for an employment confirmation letter (for a bank or an embassy),
 * see where the request is, and download letters HR has issued to me. HR prepares it; the requester never can.
 * Live GET/POST /hr/me/letters.
 */
export function MyLetters() {
  const { user, sessionKey } = useInstitution();
  const res = useApiResource<HrMyLetters>("/hr/me/letters", { enabled: Boolean(user), refreshKey: sessionKey });
  const [d, setD] = useState<HrMyLetters | null>(null);
  const data = d ?? res.data;
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const fields: FormDrawerField[] = [
    { name: "purpose", label: "What is it for", required: true, placeholder: "e.g. Bank loan, embassy visa" },
    { name: "addressed_to", label: "Addressed to (optional)", type: "textarea", placeholder: "e.g. The Manager, Standard Bank, Mbabane" },
  ];

  async function submit(v: Record<string, string>) {
    setBusy(true);
    setErr(null);
    try {
      setD(await hrSend<HrMyLetters>("/hr/me/letters", { purpose: v.purpose?.trim() ?? "", addressed_to: v.addressed_to?.trim() || null }));
      setAsking(false);
    } catch (e) {
      setErr(errorText(e, "Not sent."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <ResourceGate loading={res.loading} error={res.error} onRetry={res.reload} refreshing={res.refreshing} hasData={Boolean(data)} skeleton="list">
      {data ? (
        <div className="hr-view">
          <div className="hr-head">
            <div>
              <h2>My letters</h2>
              <p>Letters HR has issued to you, and employment confirmation letters you asked for.</p>
            </div>
            {data.employee && data.can_request ? (
              <button type="button" className="btn pri" onClick={() => setAsking(true)}>
                Ask for a confirmation letter
              </button>
            ) : null}
          </div>
          {data.employee && !data.ready ? (
            <Banner kind="info" title="HR can't prepare confirmation letters yet">
              {data.reason ?? "Awaiting ESWASA (A3): no wording for Employment confirmation."} You can still ask; HR prepares it once the wording is in.
            </Banner>
          ) : null}
          {data.letters.length ? (
            <div className="hr-box">
              <div className="hr-box__b">
                <div className="hr-out">
                  {data.letters.map((l) => (
                    <div className="hr-out__i" key={l.name}>
                      <div>
                        <b>{l.letter_type} letter</b>
                        <span className="s">
                          {l.purpose ? `For ${l.purpose}. ` : ""}
                          {l.status === "Requested"
                            ? `Asked ${fmtDay(l.requested_on, true)}. HR is preparing it.`
                            : `Issued ${fmtDay(l.issued_on, true)}`}
                        </span>
                      </div>
                      <span className="r">
                        {l.has_file && l.status === "Issued" ? (
                          <a className="btn ghost sm" href={letterPdf(l.name)} target="_blank" rel="noreferrer">
                            Download
                          </a>
                        ) : (
                          <LetterStatus l={l} />
                        )}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <EmptyState title="No letters yet" detail="Ask for an employment confirmation letter when a bank or embassy needs one." />
          )}
          <FormDrawer
            key={asking ? "open" : "closed"}
            open={asking}
            title="Ask for an employment confirmation letter"
            mode="create"
            submitLabel="Send to HR"
            fields={fields}
            busy={busy}
            error={err}
            onClose={() => setAsking(false)}
            onSubmit={submit}
          >
            <p className="hr-note">It confirms your post, department and date of joining. It doesn't state your pay.</p>
          </FormDrawer>
        </div>
      ) : null}
    </ResourceGate>
  );
}

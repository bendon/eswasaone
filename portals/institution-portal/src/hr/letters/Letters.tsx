import { useState } from "react";
import { FormDrawer, type FormDrawerField } from "@eswasaone/shared-ui";
import { useApiResource } from "../../hooks/useApiResource";
import { EmptyState, ResourceGate } from "../../components/PageStates";
import { useInstitution } from "../../layout/InstitutionLayout";
import type { HrLetter, HrLetterEligible, HrLetterList, HrLetterType } from "../../api/types";
import { Banner, fmtDay, StatusPill } from "../../me/parts";
import { errorText, fileUrl, hrSend } from "../api";

/**
 * HR letters (HR additions plan 03): the record Letters tab and the letter links where the event happens.
 * HR makes each letter from its approved record in one action (probation confirmed, contract renewed or made
 * permanent, promotion, transfer); warning letters come from the case (HR Manager or case owner). Staff ask for
 * an employment confirmation letter in My letters; it shows here as Requested with a Prepare button.
 * Wording is ESWASA's (A3): a type without it shows "Awaiting ESWASA (A3)" and can't be made. Never pay.
 */

const CLS: Record<string, string> = { Requested: "leave", Issued: "ok", Cancelled: "mute" };
const CONFIRMATION = "Employment confirmation";

export function LetterStatus({ l }: { l: HrLetter }) {
  return <StatusPill cls={CLS[l.status] ?? "info"} label={l.status} />;
}

export function letterPdf(name: string): string {
  return fileUrl(`/hr/letters/${encodeURIComponent(name)}/file`);
}

type Pending = { title: string; path: string; body: Record<string, unknown>; addressee?: string | null };

/** The addressee, then make the letter. Used for new letters and for preparing a staff request. */
function AddresseeDrawer({ pending, onClose, onDone }: { pending: Pending | null; onClose: () => void; onDone: (d: HrLetterList) => void }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const fields: FormDrawerField[] = [{ name: "addressed_to", label: "Addressed to (optional)", type: "textarea", placeholder: "To whom it may concern" }];
  async function submit(v: Record<string, string>) {
    if (!pending) return;
    setBusy(true);
    setErr(null);
    try {
      onDone(await hrSend<HrLetterList>(pending.path, { ...pending.body, addressed_to: v.addressed_to?.trim() || null }));
    } catch (e) {
      setErr(errorText(e, "The letter wasn't made."));
    } finally {
      setBusy(false);
    }
  }
  return (
    <FormDrawer
      key={pending?.path ?? "closed"}
      open={Boolean(pending)}
      title={pending?.title ?? "Generate letter"}
      mode="create"
      submitLabel="Generate letter"
      fields={fields}
      values={{ addressed_to: pending?.addressee ?? "" }}
      busy={busy}
      error={err}
      onClose={onClose}
      onSubmit={submit}
    >
      <p className="hr-note">The letter is printed with ESWASA's wording, filed on the person's documents, and the person is told it is ready. It never shows pay.</p>
    </FormDrawer>
  );
}

function CancelDrawer({ letter, onClose, onDone }: { letter: HrLetter | null; onClose: () => void; onDone: (d: HrLetterList) => void }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  async function submit(v: Record<string, string>) {
    if (!letter) return;
    setBusy(true);
    setErr(null);
    try {
      onDone(await hrSend<HrLetterList>(`/hr/letters/${encodeURIComponent(letter.name)}/cancel`, { note: v.note?.trim() ?? "" }));
    } catch (e) {
      setErr(errorText(e, "Not cancelled."));
    } finally {
      setBusy(false);
    }
  }
  return (
    <FormDrawer
      key={letter?.name ?? "closed"}
      open={Boolean(letter)}
      title={letter ? `Cancel ${letter.letter_type.toLowerCase()} letter` : "Cancel letter"}
      mode="edit"
      submitLabel="Cancel letter"
      fields={[{ name: "note", label: "Why", type: "textarea", required: true }]}
      values={{ note: "" }}
      busy={busy}
      error={err}
      onClose={onClose}
      onSubmit={submit}
    >
      <p className="hr-note">The file is kept; the letter shows as cancelled.</p>
    </FormDrawer>
  );
}

function typeOf(types: HrLetterType[], letterType: string): HrLetterType | undefined {
  return types.find((t) => t.letter_type === letterType);
}

/** Record Letters tab (HR). */
export function LettersPanel({ employee }: { employee: string }) {
  const { sessionKey } = useInstitution();
  const res = useApiResource<HrLetterList>(`/hr/employees/${encodeURIComponent(employee)}/letters`, { refreshKey: sessionKey });
  const [d, setD] = useState<HrLetterList | null>(null);
  const data = d ?? res.data;
  const [pending, setPending] = useState<Pending | null>(null);
  const [cancelling, setCancelling] = useState<HrLetter | null>(null);
  const base = `/hr/employees/${encodeURIComponent(employee)}/letters`;

  function generate(e: HrLetterEligible) {
    setPending({ title: `${e.letter_type} letter`, path: base, body: { letter_type: e.letter_type, source_name: e.source_name } });
  }

  return (
    <ResourceGate loading={res.loading} error={res.error} onRetry={res.reload} refreshing={res.refreshing} hasData={Boolean(data)} skeleton="list">
      {data ? (
        <div className="hr-view">
          <LetterLibrary types={data.types} />
          <div className="hr-box">
            <div className="hr-box__h">
              <div>
                <h3>Make a letter</h3>
                <p>From an approved or completed record. Each record gets one letter.</p>
              </div>
              {typeOf(data.types, CONFIRMATION)?.ready ? (
                <button
                  type="button"
                  className="btn ghost sm"
                  onClick={() => setPending({ title: "Employment confirmation letter", path: base, body: { letter_type: CONFIRMATION } })}
                >
                  Employment confirmation letter
                </button>
              ) : null}
            </div>
            <div className="hr-box__b">
              {data.eligible.length ? (
                <div className="hr-out">
                  {data.eligible.map((e) => {
                    const t = typeOf(data.types, e.letter_type);
                    return (
                      <div className="hr-out__i" key={`${e.letter_type}:${e.source_name}`}>
                        <div>
                          <b>{e.letter_type}</b>
                          <span className="s">{e.label}</span>
                          {!e.letter && t && !t.ready ? <span className="s">{t.reason}</span> : null}
                        </div>
                        <span className="r">
                          {e.letter ? (
                            <a className="hr-lnk" href={letterPdf(e.letter)} target="_blank" rel="noreferrer">
                              Letter (PDF)
                            </a>
                          ) : (
                            <button type="button" className="btn pri sm" disabled={!t?.ready} title={t?.ready ? undefined : t?.reason ?? undefined} onClick={() => generate(e)}>
                              Generate letter
                            </button>
                          )}
                        </span>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="hr-note">No approved probation, contract, promotion or transfer record yet.</p>
              )}
            </div>
          </div>
          {data.letters.length ? (
            <div className="hr-box hr-scroll">
              <table className="hr-table">
                <thead>
                  <tr>
                    <th>Letter</th>
                    <th>For</th>
                    <th>Date</th>
                    <th>Status</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {data.letters.map((l) => (
                    <tr key={l.name}>
                      <td>
                        {l.letter_type}
                        <div className="sub mono">{l.name}</div>
                      </td>
                      <td>
                        {l.purpose ?? l.source_name ?? "—"}
                        {l.addressed_to ? <div className="sub">{l.addressed_to}</div> : null}
                        {l.note ? <div className="sub">{l.note}</div> : null}
                      </td>
                      <td>{l.issued_on ? fmtDay(l.issued_on, true) : l.requested_on ? `Asked ${fmtDay(l.requested_on, true)}` : "—"}</td>
                      <td>
                        <LetterStatus l={l} />
                      </td>
                      <td>
                        {l.has_file ? (
                          <a className="hr-lnk" href={letterPdf(l.name)} target="_blank" rel="noreferrer">
                            Open PDF
                          </a>
                        ) : null}
                        {l.status === "Requested" ? (
                          <button
                            type="button"
                            className="btn pri sm"
                            onClick={() =>
                              setPending({ title: `Prepare ${l.letter_type.toLowerCase()} letter`, path: `/hr/letters/${encodeURIComponent(l.name)}/generate`, body: {}, addressee: l.addressed_to })
                            }
                          >
                            Prepare
                          </button>
                        ) : null}
                        {data.can_cancel && l.status !== "Cancelled" ? (
                          <>
                            {" "}
                            <button type="button" className="btn ghost sm" onClick={() => setCancelling(l)}>
                              Cancel
                            </button>
                          </>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState title="No letters yet" detail="Letters HR makes for this person, and letters they ask for, appear here." />
          )}
          <AddresseeDrawer
            pending={pending}
            onClose={() => setPending(null)}
            onDone={(next) => {
              setD(next);
              setPending(null);
            }}
          />
          <CancelDrawer
            letter={cancelling}
            onClose={() => setCancelling(null)}
            onDone={(next) => {
              setD(next);
              setCancelling(null);
            }}
          />
        </div>
      ) : null}
    </ResourceGate>
  );
}

/** Which letter types can be made, and which wait for ESWASA's wording (A3). */
function LetterLibrary({ types }: { types: HrLetterType[] }) {
  const waiting = types.filter((t) => !t.ready);
  if (!waiting.length) return null;
  return (
    <Banner kind="info" title={`${waiting.length} letter type${waiting.length === 1 ? "" : "s"} can't be made yet`}>
      {waiting.map((t) => t.reason ?? `Awaiting ESWASA (A3): no wording for ${t.letter_type}.`).join(" ")}
    </Banner>
  );
}

/**
 * "Letter (PDF)" once a letter exists for this record, or "Generate letter" for HR. Shown where the event
 * happens (contract, promotion and transfer history, probation). Renders nothing for people who aren't HR.
 */
export function LetterLink({ employee, sourceName, letterType }: { employee: string; sourceName: string; letterType?: string }) {
  const { user, sessionKey } = useInstitution();
  const roles = user?.roles ?? [];
  const hr = roles.some((r) => r === "HR Manager" || r === "HR User" || r === "System Manager");
  const res = useApiResource<HrLetterList>(`/hr/employees/${encodeURIComponent(employee)}/letters`, { enabled: hr, refreshKey: sessionKey, quiet: true });
  const [d, setD] = useState<HrLetterList | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const data = d ?? res.data;
  if (!hr || !data) return null;
  const e = data.eligible.find((x) => x.source_name === sourceName && (!letterType || x.letter_type === letterType));
  if (!e) return null;
  if (e.letter)
    return (
      <a className="hr-lnk" href={letterPdf(e.letter)} target="_blank" rel="noreferrer">
        Letter (PDF)
      </a>
    );
  const t = typeOf(data.types, e.letter_type);
  async function make() {
    setBusy(true);
    setErr(null);
    try {
      setD(await hrSend<HrLetterList>(`/hr/employees/${encodeURIComponent(employee)}/letters`, { letter_type: e!.letter_type, source_name: e!.source_name }));
    } catch (x) {
      setErr(errorText(x, "The letter wasn't made."));
    } finally {
      setBusy(false);
    }
  }
  return (
    <span>
      <button type="button" className="btn ghost sm" disabled={busy || !t?.ready} title={t?.ready ? undefined : t?.reason ?? undefined} onClick={() => void make()}>
        {busy ? "Making…" : "Generate letter"}
      </button>
      {!t?.ready ? <span className="sub"> {t?.reason}</span> : null}
      {err ? <span className="hr-note hr-bad"> {err}</span> : null}
    </span>
  );
}

/** The warning letter on a disciplinary case: the case readers (HR Manager, case owner) make and open it. */
export function WarningLetterLink({ employee, caseId, letter, onMade }: { employee: string; caseId: string; letter?: string | null; onMade: () => void }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  if (letter)
    return (
      <a className="hr-lnk" href={letterPdf(letter)} target="_blank" rel="noreferrer">
        Warning letter (PDF)
      </a>
    );
  async function make() {
    setBusy(true);
    setErr(null);
    try {
      await hrSend<HrLetterList>(`/hr/employees/${encodeURIComponent(employee)}/letters`, { letter_type: "Warning", source_name: caseId });
      onMade();
    } catch (x) {
      setErr(errorText(x, "The letter wasn't made."));
    } finally {
      setBusy(false);
    }
  }
  return (
    <span>
      <button type="button" className="btn ghost sm" disabled={busy} onClick={() => void make()}>
        {busy ? "Making…" : "Generate warning letter"}
      </button>
      {err ? <span className="hr-note hr-bad"> {err}</span> : null}
    </span>
  );
}

/** Letters for the given types on one page (the contract page): each approved record with its letter action. HR only. */
export function LetterLinks({ employee, types, title }: { employee: string; types: string[]; title: string }) {
  const { user, sessionKey } = useInstitution();
  const hr = (user?.roles ?? []).some((r) => r === "HR Manager" || r === "HR User" || r === "System Manager");
  const res = useApiResource<HrLetterList>(`/hr/employees/${encodeURIComponent(employee)}/letters`, { enabled: hr, refreshKey: sessionKey, quiet: true });
  const rows = (res.data?.eligible ?? []).filter((e) => types.includes(e.letter_type));
  if (!hr || !rows.length) return null;
  return (
    <div className="hr-box">
      <div className="hr-box__h">
        <div>
          <h3>{title}</h3>
        </div>
      </div>
      <div className="hr-box__b">
        <div className="hr-out">
          {rows.map((e) => (
            <div className="hr-out__i" key={e.source_name}>
              <div>
                <b>{e.letter_type}</b>
                <span className="s">{e.label}</span>
              </div>
              <span className="r">
                <LetterLink employee={employee} sourceName={e.source_name} letterType={e.letter_type} />
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

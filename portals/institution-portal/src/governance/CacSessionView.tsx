import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { AuthError, Icon, ModuleHeader, Toast, useDialogs } from "@eswasaone/shared-ui";
import type { CertificationApplication, CertificationAuditsResponse } from "../api/types";
import { EmptyState, ResourceGate } from "../components/PageStates";
import { RequireStaff } from "../components/RequireStaff";
import { useApiResource } from "../hooks/useApiResource";
import { useInstitution } from "../layout/InstitutionLayout";
import { listDecisions, listFindings, recordDecision, type DeskDecision, type DeskFinding } from "../certification/deskApi";
import { bodyFor, buildDecisionRows, type DecisionRow } from "../certification/decisionQueue";
import { CHARTER, FLOW_LABEL, fmtDate } from "../certification/pipeline";
import { useStoreResource } from "@eswasaone/shared-ui/store";
import { govStore, recordDeclaration, setAttendance } from "@eswasaone/shared-ui/governance";
import { actorFrom } from "../approvals/live";

/** CAC members from the governance store (Board → Settings → Bodies). */
export type CacMember = { id: string; name: string; interest: string; role: "Chair" | "Member" | "Secretary" };

/**
 * Board → CAC. The Certification Approval Committee sits as a governance committee and decides
 * product (and combined) certification independently of the audit team (product.php; ISO/IEC 17065 §7.6).
 * Same queue and blockers as Certification → Decisions (decisionQueue.ts); the decision is recorded
 * through deskApi.recordDecision so both screens stay in step.
 * Members, sittings, attendance and recusals live in the governance store (CAC body + its meetings);
 * recusals are recorded as per-meeting declarations of interest so they show in the register.
 */

type Sitting = { id: string; title: string; date?: string };
type Outcome = "grant" | "grant_conditions" | "refuse";

export function CacSessionView() {
  const { user, sessionKey, openAuth } = useInstitution();
  const dialogs = useDialogs();
  const [params, setParams] = useSearchParams();
  const apps = useApiResource<{ items?: CertificationApplication[] }>("/certification/applications?limit=200", {
    enabled: Boolean(user),
    refreshKey: sessionKey,
  });
  const audits = useApiResource<CertificationAuditsResponse>("/certification/audits", {
    enabled: Boolean(user),
    refreshKey: sessionKey,
  });
  const [findings, setFindings] = useState<DeskFinding[]>([]);
  const [decisions, setDecisions] = useState<Record<string, DeskDecision>>({});
  const gov = useStoreResource([govStore], () => {
    const s = govStore.read();
    const body = s.bodies.CAC;
    const meetings = Object.values(s.meetings)
      .filter((m) => m.body_id === "CAC" && m.state !== "Cancelled")
      .sort((a, b) => b.scheduled_at.localeCompare(a.scheduled_at));
    return structuredClone({ body, meetings, members: s.members });
  }, []);
  const [flash, setFlash] = useState<string | null>(null);
  const actor = useMemo(() => actorFrom(user), [user]);
  const QUORUM = gov.data?.body?.quorum ?? 3;
  const CAC_MEMBERS: CacMember[] = useMemo(
    () =>
      (gov.data?.body?.members ?? []).map((name) => ({
        id: name,
        name,
        interest: gov.data?.members[name]?.title ?? "",
        role: name === gov.data?.body?.secretary ? "Secretary" : name === gov.data?.body?.chair ? "Chair" : "Member",
      })),
    [gov.data],
  );
  const sittings: Sitting[] = useMemo(
    () => (gov.data?.meetings ?? []).map((m) => ({ id: m.id, title: m.title, date: m.scheduled_at })),
    [gov.data],
  );

  const load = useCallback(() => {
    void listFindings().then(setFindings);
    setDecisions(listDecisions());
  }, []);
  useEffect(load, [load]);

  const sittingId = params.get("sitting") || sittings[0]?.id || "";
  const sitting = sittings.find((s) => s.id === sittingId) ?? sittings[0];
  const meeting = gov.data?.meetings.find((m) => m.id === sitting?.id);
  const present: Record<string, boolean> = Object.fromEntries(
    CAC_MEMBERS.map((m) => [m.id, meeting?.attendance[m.name]?.present ?? meeting?.attendance[m.name]?.rsvp === "yes"]),
  );
  const recusals: Record<string, string[]> = {};
  for (const d of meeting?.declarations ?? []) if (d.item_id) (recusals[d.item_id] ??= []).push(d.member);

  const agenda = useMemo(
    () =>
      buildDecisionRows(apps.data?.items ?? [], audits.data?.items, findings).filter(
        (r) => bodyFor(r.flow) === "Certification Approval Committee",
      ),
    [apps.data, audits.data, findings],
  );
  const decided = useMemo(
    () =>
      Object.values(decisions)
        .filter((d) => d.body === "Certification Approval Committee")
        .sort((a, b) => b.at.localeCompare(a.at))
        .slice(0, 6),
    [decisions],
  );

  const caseId = params.get("case") || agenda[0]?.app.id || "";
  const selected = agenda.find((r) => r.app.id === caseId) ?? null;
  const voting = CAC_MEMBERS.filter((m) => m.role !== "Secretary");

  function setParam(k: string, v: string) {
    const next = new URLSearchParams(params);
    next.set(k, v);
    setParams(next, { replace: true });
  }

  return (
    <RequireStaff reason="Staff sign-in required for the CAC">
      {dialogs.host}
      <Toast message={flash} />
      <ResourceGate
        loading={apps.loading}
        refreshing={apps.refreshing}
        error={apps.error}
        onRetry={apps.reload}
        hasData={apps.data != null}
        skeleton="panel"
        label="Loading CAC session…"
      >
        <>
          <ModuleHeader
            title="Certification Approval Committee"
            subtitle="Decides product certification independently of the audit team. Members declare conflicts per file; decisions need a quorum."
            summary={[
              { label: "Files on agenda", value: agenda.length, variant: agenda.length ? "due" : "ok" },
              { label: "Ready to decide", value: agenda.filter((r) => !r.blockers.length).length, variant: "ok" },
              { label: "Members present", value: `${voting.filter((m) => present[m.id]).length}/${voting.length}` },
              { label: "Quorum", value: QUORUM },
            ]}
            extra={
              <div className="r">
                <select className="sel" aria-label="CAC sitting" value={sitting?.id ?? ""} onChange={(e) => setParam("sitting", e.target.value)}>
                  {sittings.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.title}
                      {s.date ? ` · ${fmtDate(s.date)}` : ""}
                    </option>
                  ))}
                </select>
                <Link className="btn ghost" to="/certification/decisions">
                  <Icon name="i-scroll" /> All decisions
                </Link>
              </div>
            }
          />

          <div className="cac">
            <aside className="cac__side">
              <section className="cac-card">
                <h3>Agenda</h3>
                {agenda.length === 0 ? (
                  <p className="cac-muted">No product files waiting. Files arrive once audit and testing are complete.</p>
                ) : (
                  <ol className="cac-agenda">
                    {agenda.map((r, i) => (
                      <li key={r.app.id}>
                        <button
                          type="button"
                          className={r.app.id === caseId ? "on" : undefined}
                          onClick={() => setParam("case", r.app.id)}
                        >
                          <span className="n">{i + 1}</span>
                          <span className="t">
                            <b>{r.app.applicant}</b>
                            <small>
                              {r.app.id} · {FLOW_LABEL[r.flow]}
                            </small>
                          </span>
                          <span className={`sla ${r.blockers.length ? "breach" : "ok"}`}>
                            <span className="d" />
                            {r.blockers.length ? "blocked" : "ready"}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ol>
                )}
              </section>

              <section className="cac-card">
                <h3>Attendance</h3>
                {CAC_MEMBERS.map((m) => (
                  <label key={m.id} className="cac-check">
                    <input
                      type="checkbox"
                      checked={Boolean(present[m.id])}
                      disabled={!meeting}
                      onChange={(e) => meeting && void setAttendance(meeting.id, m.name, { present: e.target.checked }, actor)}
                    />
                    <span>
                      <b>{m.name}</b>
                      {m.role !== "Member" ? ` (${m.role})` : ""}
                      <small>{m.interest}</small>
                    </span>
                  </label>
                ))}
              </section>

              {decided.length ? (
                <section className="cac-card">
                  <h3>Recent CAC decisions</h3>
                  {decided.map((d) => (
                    <p key={d.application_id} className="cac-muted">
                      <b>{d.application_id}</b> — {d.outcome} · {fmtDate(d.at)}
                    </p>
                  ))}
                </section>
              ) : null}
            </aside>

            <div>
              {selected ? (
                <DecisionPack
                  key={selected.app.id}
                  row={selected}
                  sitting={sitting}
                  voting={voting}
                  quorum={QUORUM}
                  present={present}
                  recused={recusals[selected.app.id] ?? []}
                  onRecuse={(ids) => {
                    if (!meeting) return;
                    const added = ids.filter((x) => !(recusals[selected.app.id] ?? []).includes(x));
                    for (const name of added)
                      void recordDeclaration({ member: name, kind: "meeting", meeting_id: meeting.id, item_id: selected.app.id, interest: `Recused from ${selected.app.applicant} (${selected.app.id})`, recorded_by: actor.name });
                  }}
                  who={user?.full_name || user?.username || "CAC Secretary"}
                  dialogs={dialogs}
                  onDecided={(msg) => {
                    setFlash(msg);
                    load();
                    apps.reload();
                  }}
                  onAuth={(reason) => openAuth(reason)}
                />
              ) : (
                <EmptyState title="Select a file" detail="Choose a case from the agenda to review its decision pack." />
              )}
            </div>
          </div>
        </>
      </ResourceGate>
    </RequireStaff>
  );
}

function DecisionPack({
  row,
  sitting,
  voting,
  quorum: QUORUM,
  present,
  recused,
  onRecuse,
  who,
  dialogs,
  onDecided,
  onAuth,
}: {
  row: DecisionRow;
  sitting?: Sitting;
  voting: CacMember[];
  quorum: number;
  present: Record<string, boolean>;
  recused: string[];
  onRecuse: (ids: string[]) => void;
  who: string;
  dialogs: ReturnType<typeof useDialogs>;
  onDecided: (msg: string) => void;
  onAuth: (reason?: string) => void;
}) {
  const eligible = voting.filter((m) => present[m.id] && !recused.includes(m.id));
  const [outcome, setOutcome] = useState<Outcome>("grant");
  const [basis, setBasis] = useState("");
  const [conditions, setConditions] = useState("");
  const [votes, setVotes] = useState({ for: eligible.length, against: 0, abstained: 0 });
  const [busy, setBusy] = useState(false);
  const auditorOnCac =
    row.auditor && voting.find((m) => m.name.toLowerCase().includes(row.auditor!.toLowerCase().split(" ").pop() ?? "~"));

  useEffect(() => {
    setVotes((v) => ({ ...v, for: Math.max(0, eligible.length - v.against - v.abstained) }));
  }, [eligible.length]);

  const total = votes.for + votes.against + votes.abstained;
  const quorate = eligible.length >= QUORUM;
  const granting = outcome !== "refuse";
  const carried = granting ? votes.for > votes.against : votes.against >= votes.for;
  const problems = [
    !quorate ? `Not quorate — ${eligible.length} eligible voting members after recusals; ${QUORUM} required.` : null,
    total > eligible.length ? `More votes (${total}) than eligible members (${eligible.length}).` : null,
    granting && row.blockers.length ? `Cannot grant: ${row.blockers.join(" · ")}.` : null,
    granting && row.lab.some((l) => l.status === "fail") ? "Cannot grant: a laboratory result failed." : null,
    total > 0 && !carried ? "The vote does not carry this outcome." : null,
    outcome === "grant_conditions" && !conditions.trim() ? "State the conditions." : null,
  ].filter(Boolean) as string[];

  async function record() {
    if (!basis.trim()) {
      await dialogs.alert({ message: "Record the basis for the decision.", kind: "error" });
      return;
    }
    const ok = await dialogs.confirm({
      title: granting ? `Grant certification to ${row.app.applicant}?` : `Refuse certification for ${row.app.applicant}?`,
      message: granting
        ? `Moves ${row.app.id} to Certified. The certificate, register entry, invoice and QR are issued (R-C3).`
        : `The client is notified with reasons and may appeal within ${CHARTER.appealDays} days (CER_PR_002).`,
      confirmLabel: granting ? "Grant" : "Refuse",
      danger: !granting,
    });
    if (!ok) return;
    const names = (ids: string[]) => voting.filter((m) => ids.includes(m.id)).map((m) => m.name).join(", ");
    const note = [
      basis.trim(),
      outcome === "grant_conditions" ? `Conditions: ${conditions.trim()}` : null,
      `${sitting?.title ?? "CAC sitting"}${sitting?.date ? ` (${fmtDate(sitting.date)})` : ""}`,
      `Votes ${votes.for} for / ${votes.against} against / ${votes.abstained} abstained`,
      recused.length ? `Recused: ${names(recused)}` : null,
    ]
      .filter(Boolean)
      .join(" — ");
    setBusy(true);
    try {
      await recordDecision({
        application_id: row.app.id,
        outcome: granting ? "granted" : "refused",
        body: "Certification Approval Committee",
        decided_by: who,
        note,
        at: new Date().toISOString(),
      });
      onDecided(`${row.app.id}: certification ${granting ? "granted" : "refused"} by the CAC`);
    } catch (err) {
      if (err instanceof AuthError && err.authRequired) onAuth(err.reason);
      else await dialogs.alert({ message: err instanceof Error ? err.message : "Decision failed", kind: "error" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="cac-pack">
      <section className="cac-card">
        <div className="cac-card__h">
          <div>
            <small className="mono">{row.app.id}</small>
            <h3>{row.app.applicant}</h3>
          </div>
          <Link className="btn ghost sm" to={`/certification/decisions?open=${encodeURIComponent(row.app.id)}`}>
            <Icon name="i-open" /> Case file
          </Link>
        </div>
        <div className="kv"><b>Path</b><span>{FLOW_LABEL[row.flow]}</span></div>
        <div className="kv"><b>Scheme</b><span>{row.app.scheme}</span></div>
        <div className="kv"><b>Applied</b><span>{fmtDate(row.app.created_at)}</span></div>
        <div className="kv"><b>Lead auditor</b><span>{row.auditor ?? "—"}</span></div>
      </section>

      <div className="cac-2">
        <section className="cac-card">
          <h3>Findings</h3>
          {row.findings.length ? (
            row.findings.map((f) => (
              <p key={f.id} className="cac-muted">
                <b>{f.id}</b> {f.severity} · {f.status}
              </p>
            ))
          ) : (
            <p className="cac-muted">None raised.</p>
          )}
        </section>
        <section className="cac-card">
          <h3>Laboratory</h3>
          {row.lab.length ? (
            row.lab.map((l) => (
              <p key={l.id} className="cac-muted">
                <b>{l.field}</b> · {l.status}
              </p>
            ))
          ) : (
            <p className="cac-muted">No results recorded.</p>
          )}
        </section>
      </div>

      <section className="cac-card">
        <h3>Conflicts of interest</h3>
        <p className="cac-muted">Members with an interest in this applicant recuse and are excluded from quorum and vote.</p>
        {auditorOnCac ? (
          <p className="cac-warn">The lead auditor appears to sit on the CAC — they must recuse.</p>
        ) : null}
        <div className="cac-chips">
          {voting.map((m) => (
            <label key={m.id} className={`cac-chip${recused.includes(m.id) ? " on" : ""}`} aria-disabled={!present[m.id]}>
              <input
                type="checkbox"
                disabled={!present[m.id]}
                checked={recused.includes(m.id)}
                onChange={(e) => onRecuse(e.target.checked ? [...recused, m.id] : recused.filter((x) => x !== m.id))}
              />
              {m.name}
              {recused.includes(m.id) ? " — recused" : ""}
            </label>
          ))}
        </div>
      </section>

      <section className="cac-card">
        <h3>Decision</h3>
        <div className="cac-outcomes" role="radiogroup" aria-label="Decision">
          {(
            [
              ["grant", "Grant", "Issue certificate / permit"],
              ["grant_conditions", "Grant with conditions", "Conditions followed up at surveillance"],
              ["refuse", "Refuse", `Reasons sent; ${CHARTER.appealDays}-day appeal window`],
            ] as [Outcome, string, string][]
          ).map(([k, label, hint]) => (
            <label key={k} className={`cac-outcome${outcome === k ? " on" : ""}`}>
              <input type="radio" name={`outcome-${row.app.id}`} checked={outcome === k} onChange={() => setOutcome(k)} />
              <span>
                <b>{label}</b>
                <small>{hint}</small>
              </span>
            </label>
          ))}
        </div>
        {outcome === "grant_conditions" ? (
          <label className="cac-field">
            Conditions
            <textarea value={conditions} onChange={(e) => setConditions(e.target.value)} />
          </label>
        ) : null}
        <label className="cac-field">
          Basis for the decision (recorded on file and sent to the client)
          <textarea value={basis} onChange={(e) => setBasis(e.target.value)} />
        </label>
        <div className="cac-votes">
          {(["for", "against", "abstained"] as const).map((k) => (
            <label key={k} className="cac-field">
              Votes {k}
              <input
                inputMode="numeric"
                value={votes[k]}
                onChange={(e) => setVotes((v) => ({ ...v, [k]: Number(e.target.value.replace(/\D/g, "")) || 0 }))}
              />
            </label>
          ))}
        </div>
        {problems.map((p) => (
          <p key={p} className="cac-warn">
            {p}
          </p>
        ))}
        <div className="cac-actions">
          <button
            type="button"
            className={`btn ${granting ? "gold" : "ghost"}`}
            disabled={busy || problems.length > 0 || total === 0}
            onClick={() => void record()}
          >
            <Icon name="i-check" /> {busy ? "Recording…" : "Record CAC decision"}
          </button>
        </div>
      </section>
    </div>
  );
}

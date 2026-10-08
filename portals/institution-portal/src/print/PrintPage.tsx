/**
 * Printable documents (gap 01 C10): /print/:kind/:id with ESWASA letterhead, verify link and
 * signature blocks, styled for @media print. Kinds: minutes, resolution, pack, quote, certificate,
 * refusal, certquote, auditplan, calcert, invoice.
 * TODO: wire real — server-rendered PDF with a signed QR (GET /documents/{kind}/{id}.pdf) for gate documents.
 */
import { useEffect, useState, type ReactNode } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { BrandLogo } from "@eswasaone/shared-ui";
import { listQuotes, quoteTotals, type CrmQuote } from "@eswasaone/shared-ui/crm";
import { getInvoice } from "@eswasaone/shared-ui/billing";
import { auditReportFor, getApplication, getCertificate } from "@eswasaone/shared-ui/certification";
import { getJob, getMetSettings, listAllInstruments } from "@eswasaone/shared-ui/metrology";
import { AuditPlanDoc, CalCertificateDoc, CalLabelsDoc, CertificateDoc, CertQuoteDoc, CrmQuoteDoc, InvoiceDoc, RefusalLetterDoc } from "@eswasaone/shared-ui/print";
import { getMeeting, getResolution, govStore, packBriefing, tally, type MeetingBundle } from "@eswasaone/shared-ui/governance";

const fmt = (iso?: string) => (iso ? new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" }) : "—");

function Letterhead({ title, reference, status }: { title: string; reference: string; status?: string }) {
  return (
    <>
      <div className="eo-print__lh">
        <BrandLogo variant="mark" />
        <div>
          <b>Eswatini Standards Authority (ESWASA)</b>
          <span>Mbabane Business Park, Mbabane · +268 2518 4633 · info@eswasa.co.sz</span>
        </div>
        <div className="eo-print__qr">
          <span>Verify</span>
          <br />
          <b style={{ fontSize: 11, color: "#1f3a78" }}>eswasa.co.sz/verify/{reference}</b>
        </div>
      </div>
      <h1>{title}</h1>
      <p style={{ margin: "0 0 18px", color: "#555" }}>
        Reference <b>{reference}</b>
        {status ? ` · ${status}` : ""}
      </p>
    </>
  );
}

function Signatures({ left, right }: { left: string; right: string }) {
  return (
    <div className="eo-print__sig">
      <div>{left}</div>
      <div>{right}</div>
    </div>
  );
}

export function PrintPage() {
  const { kind = "", id = "" } = useParams();
  const [params] = useSearchParams();
  const [body, setBody] = useState<ReactNode>(<p>Loading…</p>);

  useEffect(() => {
    let alive = true;
    const set = (n: ReactNode) => alive && setBody(n);
    (async () => {
      try {
        if (kind === "minutes") set(<MinutesDoc b={(await getMeeting(id))!} />);
        else if (kind === "resolution") {
          const r = await getResolution(id);
          if (!r) throw new Error("Resolution not found");
          const t = tally(r.resolution);
          set(
            <>
              <Letterhead title={`Resolution of the ${r.body.name}`} reference={r.resolution.id} status={r.resolution.state} />
              <h2>{r.resolution.title}</h2>
              <p style={{ fontSize: 15 }}>{r.resolution.text}</p>
              <table>
                <tbody>
                  <tr>
                    <th>Adopted</th>
                    <td>{r.resolution.kind === "written" ? "By written resolution" : `At ${r.meeting?.title ?? "meeting"} on ${fmt(r.meeting?.scheduled_at)}`}</td>
                  </tr>
                  <tr>
                    <th>Vote</th>
                    <td>
                      {t.for} for · {t.against} against · {t.abstain} abstained{t.recused ? ` · ${t.recused} recused` : ""}
                    </td>
                  </tr>
                  <tr>
                    <th>Decided</th>
                    <td>{fmt(r.resolution.decided_at)}</td>
                  </tr>
                </tbody>
              </table>
              {r.actions.length ? (
                <>
                  <h2>Actions</h2>
                  <table>
                    <thead>
                      <tr>
                        <th>Action</th>
                        <th>Owner</th>
                        <th>Due</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {r.actions.map((a) => (
                        <tr key={a.id}>
                          <td>{a.description}</td>
                          <td>{a.owner}</td>
                          <td>{fmt(a.due)}</td>
                          <td>{a.state}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </>
              ) : null}
              <Signatures left={`Chair — ${r.body.chair}`} right={`Company Secretary — ${r.body.secretary}`} />
            </>,
          );
        } else if (kind === "pack") {
          const p = govStore.read().packs[id];
          if (!p) throw new Error("Pack not found");
          const v = Number(params.get("v")) || p.issued_version || p.versions.length;
          const snap = p.versions.find((x) => x.v === v);
          const b = await getMeeting(p.meeting_id);
          set(
            <>
              <Letterhead title={`Board pack — ${b?.meeting.title}`} reference={`${p.id}-v${v}`} status={`Version ${v}${p.issued_version === v ? " (issued)" : ""} · frozen ${fmt(snap?.assembled_at)}`} />
              <h2>Contents</h2>
              <ol>{snap?.sections.map((s) => <li key={s.id}>{s.title}</li>)}</ol>
              {snap?.sections.map((s, i) => (
                <section key={s.id} style={{ pageBreakBefore: i ? "always" : undefined }}>
                  <h2>
                    {i + 1}. {s.title}
                  </h2>
                  <p style={{ whiteSpace: "pre-wrap" }}>{s.content}</p>
                  {s.figures ? (
                    <table>
                      <tbody>
                        {Object.entries(s.figures).map(([k, val]) => (
                          <tr key={k}>
                            <th>{k}</th>
                            <td>{val}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  ) : null}
                </section>
              ))}
            </>,
          );
        } else if (kind === "auditreport") {
          const r = auditReportFor(id, params.get("visit") ?? "");
          if (!r) throw new Error("No saved audit report for this visit");
          set(
            <>
              <Letterhead title="Audit report" reference={`${id} / ${r.visit_id} v${r.version}`} status={`Saved ${fmt(r.at)} by ${r.by}`} />
              <p style={{ whiteSpace: "pre-wrap" }}>{r.text}</p>
            </>,
          );
        } else if (kind === "briefing") {
          const br = packBriefing(id, Number(params.get("v")) || undefined, { includeRestricted: params.get("restricted") === "1" });
          if (!br) throw new Error("Nothing assembled yet for this pack");
          set(
            <>
              <Letterhead title={`Board briefing — ${br.meeting}`} reference={`${id}-v${br.version}-brief`} status={`Prepared from pack v${br.version}, frozen ${fmt(br.assembled_at)}. Assistant draft — check against the pack.`} />
              <p style={{ whiteSpace: "pre-wrap" }}>{br.text.split("\n").slice(2).join("\n")}</p>
            </>,
          );
        } else if (kind === "quote") {
          const q: CrmQuote | undefined = (await listQuotes()).find((x) => x.id === id);
          if (!q) throw new Error("Quote not found");
          set(<CrmQuoteDoc q={q} totals={quoteTotals(q)} acceptUrl={`${window.location.origin}/quotes/${q.id}?code=${q.public_code ?? ""}`} />);
        } else if (kind === "certificate") {
          const c = getCertificate(id);
          if (!c) throw new Error("Certificate not found");
          set(<CertificateDoc cert={c.cert} />);
        } else if (kind === "refusal" || kind === "certquote" || kind === "auditplan") {
          const b = getApplication(id);
          if (!b) throw new Error("Application not found");
          set(kind === "refusal" ? <RefusalLetterDoc app={b.app} /> : kind === "certquote" ? <CertQuoteDoc app={b.app} /> : <AuditPlanDoc app={b.app} visits={b.visits} />);
        } else if (kind === "calcert") {
          const j = getJob(id);
          if (!j) throw new Error("Job not found");
          set(<CalCertificateDoc job={j.job} method={j.method} refs={j.refs} settings={j.settings} />);
        } else if (kind === "cal-label") {
          const j = getJob(id);
          if (!j) throw new Error("Job not found");
          const regs = listAllInstruments();
          const due = (itemId: string) => {
            const it = j.job.items.find((x) => x.id === itemId);
            const ins = regs.find((r) => r.id === it?.instrument_id || r.serial === it?.serial);
            if (ins?.next_due) return ins.next_due;
            if (!j.job.certificate) return undefined;
            const d = new Date(j.job.certificate.issued_at);
            d.setMonth(d.getMonth() + getMetSettings().default_interval_months);
            return d.toISOString();
          };
          set(<CalLabelsDoc job={j.job} due={due} />);
        } else if (kind === "invoice") {
          const inv = getInvoice(id);
          if (!inv) throw new Error("Invoice not found");
          set(<InvoiceDoc inv={inv} />);
        } else set(<p>Unknown document type “{kind}”.</p>);
      } catch (e) {
        set(<p>{e instanceof Error ? e.message : String(e)}</p>);
      }
    })();
    return () => {
      alive = false;
    };
  }, [kind, id, params]);

  return (
    <>
      <div className="eo-print__bar">
        <button type="button" className="crm-btn" onClick={() => window.close()}>
          Close
        </button>
        <button type="button" className="crm-btn crm-btn--pri" onClick={() => window.print()}>
          Print / save as PDF
        </button>
      </div>
      <article className="eo-print">{body}</article>
    </>
  );
}

function MinutesDoc({ b }: { b: MeetingBundle }) {
  if (!b) return <p>Meeting not found.</p>;
  const m = b.meeting;
  const approved = m.state === "Minutes approved";
  return (
    <>
      <Letterhead title={`Minutes — ${m.title}`} reference={m.id} status={approved ? `Approved at ${m.minutes?.approved_at_meeting} on ${fmt(m.minutes?.approved_at)}` : "DRAFT — not yet approved"} />
      <p>
        {b.body.name} · {fmt(m.scheduled_at)} · {m.venue}
      </p>
      {!m.minutes ? (
        <p>Minutes have not been started.</p>
      ) : (
        <>
          <p>{m.minutes.general}</p>
          {m.agenda.map((it, i) => (
            <div key={it.id}>
              <h2>
                {i + 1}. {it.title}
              </h2>
              <p>{m.minutes!.items[it.id] || "—"}</p>
            </div>
          ))}
        </>
      )}
      <Signatures left={`Chair — ${b.body.chair}`} right={`Secretary — ${b.body.secretary}`} />
    </>
  );
}

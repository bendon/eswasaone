/**
 * Printable documents (gap 01 C10): /print/:kind/:id with ESWASA letterhead, verify link and
 * signature blocks, styled for @media print. Kinds: minutes, resolution, pack, quote.
 * TODO: wire real — server-rendered PDF with a signed QR (GET /documents/{kind}/{id}.pdf) for gate documents.
 */
import { useEffect, useState, type ReactNode } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { BrandLogo } from "@eswasaone/shared-ui";
import { listQuotes, quoteTotals, type CrmQuote } from "@eswasaone/shared-ui/crm";
import { getMeeting, getResolution, govStore, tally, type MeetingBundle } from "@eswasaone/shared-ui/governance";

const fmt = (iso?: string) => (iso ? new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" }) : "—");
const money = (n: number) => `E ${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

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
        } else if (kind === "quote") {
          const q: CrmQuote | undefined = (await listQuotes()).find((x) => x.id === id);
          if (!q) throw new Error("Quote not found");
          const t = quoteTotals(q);
          set(
            <>
              <Letterhead title="Quotation" reference={q.id} status={`Valid until ${fmt(q.valid_until)}`} />
              <p>
                To: <b>{q.client_name}</b>
              </p>
              <table>
                <thead>
                  <tr>
                    <th>Service</th>
                    <th>Qty</th>
                    <th>Unit price</th>
                    <th>Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {q.lines.map((l, i) => (
                    <tr key={i}>
                      <td>{l.label}</td>
                      <td>{l.qty}</td>
                      <td>{money(l.unit_price)}</td>
                      <td>{money(l.qty * l.unit_price)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <table style={{ width: 320, marginLeft: "auto" }}>
                <tbody>
                  <tr>
                    <th>Subtotal</th>
                    <td>{money(t.subtotal)}</td>
                  </tr>
                  {t.discount ? (
                    <tr>
                      <th>Discount ({q.discount_pct}%)</th>
                      <td>−{money(t.discount)}</td>
                    </tr>
                  ) : null}
                  <tr>
                    <th>VAT 15%</th>
                    <td>{money(t.vat)}</td>
                  </tr>
                  <tr>
                    <th>Total</th>
                    <td>
                      <b>{money(t.total)}</b>
                    </td>
                  </tr>
                </tbody>
              </table>
              {q.notes ? <p>{q.notes}</p> : null}
              <p style={{ fontSize: 12, color: "#555" }}>Accept this quote online from your ESWASA account, or sign and return it.</p>
              <Signatures left={`For ESWASA — ${q.created_by}`} right="Accepted for the client (name, signature, date)" />
            </>,
          );
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

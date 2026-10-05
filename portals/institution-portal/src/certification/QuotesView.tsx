import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AuthError,
  DataRow,
  ModuleHeader,
  RecordDrawer,
  Toast,
  Toolbar,
  useDialogs,
  type DataMetaItem,
  type DrawerAction,
  type DrawerSection,
  type SummaryTile,
} from "@eswasaone/shared-ui";
import { EmptyState } from "../components/PageStates";
import { RequireStaff } from "../components/RequireStaff";
import { useInstitution } from "../layout/InstitutionLayout";
import {
  createDeskApplication,
  issueQuote,
  listDeskQuotes,
  setQuoteStatus,
  type DeskQuote,
  type QuoteLine,
  type QuoteStatus,
} from "./deskApi";
import { CHARTER, FLOW_LABEL, fmtDate, workingDaysSince, type CertFlow } from "./pipeline";

/** Quotes: RFQ queue (qoute_certification.php), fee builder, issue, convert to application. */

const STATUS_LABEL: Record<QuoteStatus, string> = {
  requested: "Requested",
  issued: "Issued",
  accepted: "Accepted",
  declined: "Declined",
  expired: "Expired",
};

/** Indicative rate card. TODO: wire real (ERPNext price list for certification items). */
const RATE = { application: 2500, auditorDay: 6500, certification: 4000, sampling: 7800, surveillanceDay: 6500 };

function defaultLines(q: DeskQuote): QuoteLine[] {
  if (q.flow === "ingelo") {
    return [
      { label: "Application fee (Ingelo, subsidised)", amount: 0 },
      { label: "Certification assessment (subsidised)", amount: 0 },
    ];
  }
  const staff = Number(q.employees || "0");
  const sites = Math.max(1, Number(q.sites || "1"));
  const days = Math.max(2, Math.ceil(staff / 40) + sites); // rough IAF MD5-style sizing
  const lines: QuoteLine[] = [{ label: "Application fee", amount: RATE.application }];
  if (q.flow !== "product") {
    lines.push({ label: "Stage 1 audit (1 auditor-day)", amount: RATE.auditorDay });
    lines.push({ label: `Stage 2 audit (${days} auditor-days)`, amount: RATE.auditorDay * days });
  } else {
    lines.push({ label: "Initial factory assessment (1 auditor-day)", amount: RATE.auditorDay });
  }
  if (q.flow === "product" || q.flow === "combined") {
    lines.push({ label: "Sampling & accredited laboratory testing", amount: RATE.sampling });
  }
  lines.push({ label: q.flow === "product" ? "Permit fee" : "Certification fee", amount: RATE.certification });
  return lines;
}

function slaOf(q: DeskQuote): { kind: "breach" | "due" | "ok"; text: string } {
  if (q.status !== "requested") {
    if (q.status === "issued" && q.valid_until && new Date(q.valid_until) < new Date())
      return { kind: "breach", text: "validity lapsed" };
    return { kind: "ok", text: STATUS_LABEL[q.status].toLowerCase() };
  }
  const wd = workingDaysSince(q.requested_at) ?? 0;
  const left = CHARTER.quoteDays - wd;
  if (left < 0) return { kind: "breach", text: `${-left}wd over charter` };
  if (left <= 1) return { kind: "due", text: `due in ${left}wd` };
  return { kind: "ok", text: `due in ${left}wd` };
}

const SCHEME_FOR_FLOW: Record<CertFlow, string> = {
  ms: "iso9001",
  product: "product",
  ingelo: "ingelo",
  combined: "combined",
};

export function QuotesView() {
  const { openAuth } = useInstitution();
  const dialogs = useDialogs();
  const [items, setItems] = useState<DeskQuote[] | null>(null);
  const [status, setStatus] = useState("All statuses");
  const [flow, setFlow] = useState("All paths");
  const [search, setSearch] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const [lines, setLines] = useState<QuoteLine[]>([]);
  const [validDays, setValidDays] = useState(30);
  const [notes, setNotes] = useState("");
  const [flash, setFlash] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    void listDeskQuotes().then(setItems);
  }, []);
  useEffect(load, [load]);

  const list = items ?? [];
  const selected = list.find((q) => q.id === openId) ?? null;

  useEffect(() => {
    if (!selected) return;
    setLines(selected.lines?.length ? selected.lines : defaultLines(selected));
    setNotes(selected.notes ?? "");
    setValidDays(30);
  }, [selected?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return list.filter((x) => {
      if (status !== "All statuses" && STATUS_LABEL[x.status] !== status) return false;
      if (flow !== "All paths" && FLOW_LABEL[x.flow] !== flow) return false;
      if (q && !`${x.id} ${x.org} ${x.standards} ${x.contact}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [list, status, flow, search]);

  const requested = list.filter((q) => q.status === "requested");
  const breached = requested.filter((q) => slaOf(q).kind === "breach").length;
  const summary: SummaryTile[] = [
    { label: "Awaiting quote", value: requested.length, variant: requested.length ? "due" : "ok" },
    { label: "Over 5-day charter", value: breached, variant: breached ? "breach" : "ok" },
    { label: "Issued, awaiting client", value: list.filter((q) => q.status === "issued").length },
    { label: "Accepted", value: list.filter((q) => q.status === "accepted").length, variant: "ok" },
  ];

  const total = lines.reduce((n, l) => n + (Number.isFinite(l.amount) ? l.amount : 0), 0);

  async function issue(q: DeskQuote) {
    const ok = await dialogs.confirm({
      title: `Issue ${q.id}?`,
      message: `Send a quote of SZL ${total.toLocaleString()} to ${q.contact_email}, valid ${validDays} days.`,
      confirmLabel: "Issue quote",
    });
    if (!ok) return;
    setBusy(true);
    try {
      await issueQuote(q.id, lines, validDays, notes);
      setFlash(`Quote ${q.id} issued to ${q.org}`);
      load();
    } finally {
      setBusy(false);
    }
  }

  async function mark(q: DeskQuote, s: QuoteStatus) {
    setQuoteStatus(q.id, s);
    setFlash(`${q.id} marked ${STATUS_LABEL[s].toLowerCase()}`);
    load();
  }

  async function convert(q: DeskQuote) {
    const ok = await dialogs.confirm({
      title: `Open an application for ${q.org}?`,
      message: "Creates a certification application linked to this quote. The client completes the remaining details online.",
      confirmLabel: "Create application",
    });
    if (!ok) return;
    setBusy(true);
    try {
      const res = await createDeskApplication({
        scheme: SCHEME_FOR_FLOW[q.flow],
        flow: q.flow,
        applicant_org: q.org,
        applicant_name: q.contact || q.org,
        contact_email: q.contact_email,
        contact_phone: q.phone ?? "",
        channel: `quote ${q.id}`,
        received_at: new Date().toISOString().slice(0, 10),
        notes: q.scope,
      });
      setQuoteStatus(q.id, "accepted", res.id);
      setFlash(`Application ${res.id} created from ${q.id}`);
      load();
    } catch (err) {
      if (err instanceof AuthError && err.authRequired) openAuth(err.reason);
      else await dialogs.alert({ message: err instanceof Error ? err.message : "Could not create application", kind: "error" });
    } finally {
      setBusy(false);
    }
  }

  const sections: DrawerSection[] = selected
    ? [
        {
          heading: "Request",
          content: (
            <>
              <div className="kv"><b>Path</b><span>{FLOW_LABEL[selected.flow]}</span></div>
              <div className="kv"><b>Standards</b><span>{selected.standards || "—"}</span></div>
              <div className="kv"><b>Scope</b><span>{selected.scope || "—"}</span></div>
              <div className="kv"><b>Employees / sites</b><span>{selected.employees || "—"} / {selected.sites || "—"}</span></div>
              <div className="kv"><b>Contact</b><span>{selected.contact} · {selected.contact_email}</span></div>
              <div className="kv"><b>Requested</b><span>{fmtDate(selected.requested_at)}</span></div>
              {selected.application_id ? (
                <div className="kv"><b>Application</b><span className="mono">{selected.application_id}</span></div>
              ) : null}
            </>
          ),
        },
        {
          heading: selected.status === "requested" ? "Fee builder" : "Quote",
          content: (
            <>
              {lines.map((l, i) => (
                <div className="kv" key={i} style={{ gap: 8 }}>
                  {selected.status === "requested" ? (
                    <>
                      <input
                        aria-label={`Line ${i + 1} description`}
                        value={l.label}
                        onChange={(e) => setLines(lines.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))}
                        style={{ flex: 1, font: "inherit", padding: "6px 8px", border: "1px solid var(--line)", borderRadius: 8 }}
                      />
                      <input
                        aria-label={`Line ${i + 1} amount`}
                        inputMode="numeric"
                        value={String(l.amount)}
                        onChange={(e) =>
                          setLines(lines.map((x, j) => (j === i ? { ...x, amount: Number(e.target.value.replace(/[^\d]/g, "")) || 0 } : x)))
                        }
                        style={{ width: 110, font: "inherit", padding: "6px 8px", border: "1px solid var(--line)", borderRadius: 8, textAlign: "right" }}
                      />
                      <button type="button" className="btn ghost sm" onClick={() => setLines(lines.filter((_, j) => j !== i))} aria-label="Remove line">
                        ×
                      </button>
                    </>
                  ) : (
                    <>
                      <b style={{ fontWeight: 500 }}>{l.label}</b>
                      <span className="mono">SZL {l.amount.toLocaleString()}</span>
                    </>
                  )}
                </div>
              ))}
              {selected.status === "requested" ? (
                <button type="button" className="btn ghost sm" onClick={() => setLines([...lines, { label: "", amount: 0 }])}>
                  + Add line
                </button>
              ) : null}
              <div className="kv" style={{ borderTop: "2px solid var(--ink)", marginTop: 8, paddingTop: 8 }}>
                <b>Total</b>
                <span className="mono" style={{ fontWeight: 800 }}>SZL {total.toLocaleString()}</span>
              </div>
              <div className="kv">
                <b>Annual surveillance</b>
                <span>{selected.flow === "ingelo" ? "Per Ingelo scheme" : `≈ SZL ${(RATE.surveillanceDay * 2).toLocaleString()} / year (quoted separately)`}</span>
              </div>
              {selected.status === "requested" ? (
                <>
                  <div className="kv">
                    <b>Valid for (days)</b>
                    <input
                      type="number"
                      min={7}
                      value={validDays}
                      onChange={(e) => setValidDays(Number(e.target.value) || 30)}
                      style={{ width: 90, font: "inherit", padding: "6px 8px", border: "1px solid var(--line)", borderRadius: 8 }}
                    />
                  </div>
                  <textarea
                    aria-label="Notes to client"
                    placeholder="Notes to client (assumptions, exclusions, audit-day basis)"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    style={{ width: "100%", minHeight: 70, font: "inherit", padding: 8, border: "1px solid var(--line)", borderRadius: 8, marginTop: 8 }}
                  />
                </>
              ) : (
                <div className="kv"><b>Valid until</b><span>{fmtDate(selected.valid_until)}</span></div>
              )}
            </>
          ),
        },
      ]
    : [];

  const actions: DrawerAction[] = selected
    ? [
        ...(selected.status === "requested"
          ? [{ label: busy ? "…" : "Issue quote", variant: "gold" as const, onClick: () => void issue(selected), disabled: busy || total < 0 }]
          : []),
        ...(selected.status === "issued"
          ? [
              { label: "Client accepted", variant: "pri" as const, onClick: () => void mark(selected, "accepted") },
              { label: "Declined", variant: "ghost" as const, onClick: () => void mark(selected, "declined") },
              { label: "Expired", variant: "ghost" as const, onClick: () => void mark(selected, "expired") },
            ]
          : []),
        ...(selected.status === "accepted" && !selected.application_id
          ? [{ label: "Create application", variant: "gold" as const, onClick: () => void convert(selected), disabled: busy }]
          : []),
        { label: "Close", variant: "ghost" as const, onClick: () => setOpenId(null) },
      ]
    : [];

  return (
    <RequireStaff reason="Staff sign-in required">
      <ModuleHeader
        title="Quotes"
        subtitle={`Requests for quotation from the portal. Charter: issue within ${CHARTER.quoteDays} working days of complete information.`}
        summary={summary}
      />
      {dialogs.host}
      <Toolbar
        filters={[
          { label: "Status", value: status, options: ["All statuses", ...Object.values(STATUS_LABEL)], onChange: setStatus },
          { label: "Path", value: flow, options: ["All paths", ...Object.values(FLOW_LABEL)], onChange: setFlow },
        ]}
        search={{ value: search, onChange: setSearch, placeholder: "Search organisation, contact or reference…" }}
      />
      <Toast message={flash} />
      {items === null ? (
        <EmptyState title="Loading quotes…" detail="" />
      ) : filtered.length === 0 ? (
        <EmptyState
          title={list.length ? "No quotes match" : "No quote requests yet"}
          detail={list.length ? "Adjust the filters above." : "Requests from /certification/quote appear here."}
        />
      ) : (
        <div className="data-list">
          {filtered.map((q) => {
            const sla = slaOf(q);
            const meta: DataMetaItem[] = [
              { label: FLOW_LABEL[q.flow], tag: true },
              { label: q.standards || "Standard to confirm" },
              { label: `Requested ${fmtDate(q.requested_at)}` },
              ...(q.total !== undefined ? [{ label: `SZL ${q.total.toLocaleString()}`, mono: true }] : []),
              { label: sla.text, sla: sla.kind },
            ];
            return (
              <DataRow
                key={q.id}
                icon="i-dollar"
                iconVariant={q.status === "requested" ? "amber" : q.status === "accepted" ? "green" : "navy"}
                title={q.org}
                badge={q.id}
                meta={meta}
                onOpen={() => setOpenId(q.id)}
              />
            );
          })}
        </div>
      )}
      <RecordDrawer
        open={!!selected}
        onClose={() => setOpenId(null)}
        reference={selected?.id}
        title={selected?.org ?? ""}
        subtitle={selected ? <span className="stagechip">{STATUS_LABEL[selected.status]}</span> : null}
        sections={sections}
        actions={actions}
      />
    </RequireStaff>
  );
}

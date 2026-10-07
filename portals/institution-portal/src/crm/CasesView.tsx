import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Icon, ModuleHeader } from "@eswasaone/shared-ui";
import {
  CrmBanner,
  CrmDrawer,
  CrmEmpty,
  SlaChip,
  StatePill,
  caseSla,
  fmtWhen,
  getCrmConfig,
  isCommercialOnly,
  isOpen,
  listCases,
  listClients,
  lodgeCase,
  useCrm,
  useCrmToast,
  type Case,
  type CaseChannel,
  type CaseType,
  type Client,
  type CrmConfig,
} from "@eswasaone/shared-ui/crm";
import { CrmGate, useActor } from "./shared";

type Queue = "mine" | "team" | "unassigned" | "breaching" | "awaiting" | "open" | "all";

const QUEUES: { id: Queue; label: string }[] = [
  { id: "mine", label: "Mine" },
  { id: "unassigned", label: "Unassigned" },
  { id: "breaching", label: "Breaching" },
  { id: "awaiting", label: "Awaiting customer" },
  { id: "open", label: "All open" },
  { id: "all", label: "All" },
];

const CHANNEL_LABEL: Record<CaseChannel, string> = {
  web: "Web form",
  account: "Customer account",
  email: "Email",
  phone: "Phone",
  walk_in: "Walk-in",
  whatsapp: "WhatsApp",
  verify_scan: "Verify page",
};

/** Service-desk queues: every complaint, enquiry and report except appeals (panel only). */
export function CrmCasesView({ appeals = false }: { appeals?: boolean }) {
  const actor = useActor();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [toast, showToast] = useCrmToast();
  const queue = (params.get("queue") as Queue) || (appeals ? "open" : "open");
  const [type, setType] = useState<CaseType | "all">("all");
  const [team, setTeam] = useState("all");
  const [q, setQ] = useState("");
  const [logOpen, setLogOpen] = useState(params.get("new") === "1");

  const res = useCrm(async () => {
    const [cases, cfg, clients] = await Promise.all([listCases({ includeAppeals: true }), getCrmConfig(), listClients()]);
    return { cases, cfg, clients };
  });

  const firewall = isCommercialOnly(actor);

  return (
    <CrmGate res={res} what={appeals ? "Appeals" : "Cases"}>
      {({ cases, cfg, clients }) => {
        const scoped = cases
          .filter((c) => (appeals ? c.type === "appeal" : c.type !== "appeal"))
          .filter((c) => !(firewall && cfg.case_types[c.type].restricted));
        const withSla = scoped.map((c) => ({ c, sla: caseSla(c, cfg.case_types[c.type]) }));
        const inQueue = (id: Queue) =>
          withSla.filter(({ c, sla }) => {
            switch (id) {
              case "mine":
                return isOpen(c) && c.assignee === actor.name;
              case "team":
                return isOpen(c);
              case "unassigned":
                return isOpen(c) && !c.assignee;
              case "breaching":
                return isOpen(c) && sla.status === "breach";
              case "awaiting":
                return c.state === "Awaiting Customer";
              case "open":
                return isOpen(c);
              default:
                return true;
            }
          });
        const t = q.trim().toLowerCase();
        const rows = inQueue(queue)
          .filter(({ c }) => type === "all" || c.type === type)
          .filter(({ c }) => team === "all" || c.team === team)
          .filter(
            ({ c }) =>
              !t ||
              c.ref.toLowerCase().includes(t) ||
              c.subject.toLowerCase().includes(t) ||
              (c.reporter.name ?? "").toLowerCase().includes(t) ||
              (clients.find((x) => x.id === c.client_id)?.name ?? "").toLowerCase().includes(t),
          )
          .sort((a, b) => {
            const pr = { urgent: 0, high: 1, normal: 2, low: 3 };
            if (isOpen(a.c) !== isOpen(b.c)) return isOpen(a.c) ? -1 : 1;
            if (a.sla.status !== b.sla.status) return a.sla.status === "breach" ? -1 : b.sla.status === "breach" ? 1 : a.sla.status === "due" ? -1 : 1;
            if (pr[a.c.priority] !== pr[b.c.priority]) return pr[a.c.priority] - pr[b.c.priority];
            return a.sla.remaining - b.sla.remaining;
          });
        const openCount = withSla.filter(({ c }) => isOpen(c)).length;
        const breachCount = inQueue("breaching").length;
        const types = (Object.keys(cfg.case_types) as CaseType[]).filter((k) => (appeals ? k === "appeal" : k !== "appeal"));

        return (
          <>
            <ModuleHeader
              title={appeals ? "Appeals" : "Cases"}
              subtitle={
                appeals
                  ? "Appeals against certification decisions — heard by a panel independent of the original decision"
                  : "Enquiries, complaints, product and mark reports from every channel"
              }
              summary={[
                { label: "Open", value: openCount },
                { label: "Breaching", value: breachCount, variant: breachCount ? "breach" : "ok" },
                { label: "Awaiting customer", value: inQueue("awaiting").length },
              ]}
              extra={
                appeals ? undefined : (
                  <button type="button" className="crm-btn crm-btn--pri" onClick={() => setLogOpen(true)}>
                    <Icon name="i-phone" /> Log a case
                  </button>
                )
              }
            />

            {appeals ? (
              <CrmBanner tone="lock">
                Restricted to the appeals panel. Appeals are never assigned to the person who made the contested decision, and
                commercial staff can't see them (ISO/IEC 17065 §7.13).
              </CrmBanner>
            ) : firewall ? (
              <CrmBanner tone="lock">
                You're signed in with a commercial role, so product reports, mark misuse and appeals are hidden. This keeps sales
                separate from certification decisions.
              </CrmBanner>
            ) : null}

            <div className="crm-toolbar">
              <div className="crm-seg" role="tablist" aria-label="Queues">
                {QUEUES.map((qq) => {
                  const n = inQueue(qq.id).length;
                  return (
                    <button
                      key={qq.id}
                      type="button"
                      role="tab"
                      aria-selected={queue === qq.id}
                      className={queue === qq.id ? "on" : ""}
                      onClick={() => {
                        const p = new URLSearchParams(params);
                        p.set("queue", qq.id);
                        setParams(p, { replace: true });
                      }}
                    >
                      {qq.label}
                      {qq.id !== "all" ? <span className={`n${qq.id === "breaching" && n ? " red" : ""}`}>{n}</span> : null}
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="crm-toolbar">
              <div className="crm-search">
                <Icon name="i-search" />
                <input className="crm-input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search ref, subject, person or company" aria-label="Search cases" />
              </div>
              {!appeals ? (
                <select className="crm-select" style={{ width: "auto" }} value={type} onChange={(e) => setType(e.target.value as CaseType | "all")} aria-label="Type">
                  <option value="all">All types</option>
                  {types
                    .filter((k) => !(firewall && cfg.case_types[k].restricted))
                    .map((k) => (
                      <option key={k} value={k}>
                        {cfg.case_types[k].short}
                      </option>
                    ))}
                </select>
              ) : null}
              <select className="crm-select" style={{ width: "auto" }} value={team} onChange={(e) => setTeam(e.target.value)} aria-label="Team">
                <option value="all">All teams</option>
                {cfg.teams.map((tm) => (
                  <option key={tm} value={tm}>
                    {tm}
                  </option>
                ))}
              </select>
            </div>

            {rows.length === 0 ? (
              <CrmEmpty icon="i-check-c" title="Nothing in this queue" detail="Try another queue or clear the filters." />
            ) : (
              <div className="crm-card crm-card--flush">
                <div className="crm-table-wrap">
                  <table className="crm-table">
                    <thead>
                      <tr>
                        <th>Case</th>
                        <th>From / about</th>
                        <th>State</th>
                        <th>SLA</th>
                        <th>Team · owner</th>
                        <th>Updated</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map(({ c, sla }) => {
                        const client = clients.find((x) => x.id === c.client_id);
                        return (
                          <tr key={c.ref} className="is-click" onClick={() => navigate(`/crm/cases/${c.ref}`)}>
                            <td style={{ maxWidth: 360 }}>
                              <div className="crm-row" style={{ gap: 6 }}>
                                {c.priority === "urgent" || c.priority === "high" ? (
                                  <span className={`crm-prio crm-prio--${c.priority}`}>{c.priority}</span>
                                ) : null}
                                <b>{c.subject}</b>
                              </div>
                              <span className="crm-small">
                                <span className="crm-mono">{c.ref}</span> · {cfg.case_types[c.type].short} · {CHANNEL_LABEL[c.channel]}
                              </span>
                            </td>
                            <td>
                              {c.reporter.anonymous ? "Anonymous" : c.reporter.name ?? "—"}
                              <span className="crm-small">{client?.name ?? c.about?.label ?? c.reporter.organisation ?? ""}</span>
                            </td>
                            <td>
                              <StatePill state={c.state} />
                            </td>
                            <td>
                              <SlaChip sla={sla} />
                            </td>
                            <td>
                              {c.team}
                              <span className="crm-small">{c.assignee ?? "Unassigned"}</span>
                            </td>
                            <td className="crm-small">{fmtWhen(c.updated_at)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            <LogCaseDrawer
              open={logOpen}
              cfg={cfg}
              clients={clients}
              onClose={() => {
                setLogOpen(false);
                if (params.get("new")) {
                  const p = new URLSearchParams(params);
                  p.delete("new");
                  setParams(p, { replace: true });
                }
              }}
              onLogged={(c) => {
                setLogOpen(false);
                showToast(`Logged ${c.ref}`);
                navigate(`/crm/cases/${c.ref}`);
              }}
              agent={actor.name}
            />
            {toast}
          </>
        );
      }}
    </CrmGate>
  );
}

/** Staff-logged case for phone, walk-in, email and WhatsApp contacts. */
function LogCaseDrawer({
  open,
  cfg,
  clients,
  agent,
  onClose,
  onLogged,
}: {
  open: boolean;
  cfg: CrmConfig;
  clients: Client[];
  agent: string;
  onClose: () => void;
  onLogged: (c: Case) => void;
}) {
  const [type, setType] = useState<CaseType>("enquiry");
  const [channel, setChannel] = useState<CaseChannel>("phone");
  const [subject, setSubject] = useState("");
  const [description, setDescription] = useState("");
  const [clientId, setClientId] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [anonymous, setAnonymous] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setErr(null);
  }, [open]);

  const sorted = useMemo(() => [...clients].sort((a, b) => a.name.localeCompare(b.name)), [clients]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      const client = clients.find((c) => c.id === clientId);
      const c = await lodgeCase({
        type,
        channel,
        subject,
        description,
        logged_by: agent,
        about: client ? { kind: "client", label: client.name, client_id: client.id } : undefined,
        reporter: anonymous
          ? { anonymous: true, preferred: "phone" }
          : { anonymous: false, name, email: email || undefined, phone: phone || undefined, organisation: client?.name, preferred: phone ? "phone" : "email" },
      });
      setSubject("");
      setDescription("");
      setName("");
      setEmail("");
      setPhone("");
      onLogged(c);
    } catch (e2) {
      setErr(e2 instanceof Error ? e2.message : String(e2));
    } finally {
      setBusy(false);
    }
  }

  return (
    <CrmDrawer
      open={open}
      onClose={onClose}
      title="Log a case"
      subtitle="For phone calls, walk-ins, emails and WhatsApp messages. The customer gets the same reference and tracking as online cases."
      footer={
        <>
          <button type="button" className="crm-btn" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" form="crm-log-case" className="crm-btn crm-btn--pri" disabled={busy || !subject.trim() || !description.trim()}>
            {busy ? "Logging…" : "Log case"}
          </button>
        </>
      }
    >
      {err ? <CrmBanner tone="err">{err}</CrmBanner> : null}
      <form id="crm-log-case" className="crm-form" onSubmit={submit}>
        <div className="crm-form crm-form--2">
          <label className="crm-field">
            Type
            <select className="crm-select" value={type} onChange={(e) => setType(e.target.value as CaseType)}>
              {(Object.keys(cfg.case_types) as CaseType[])
                .filter((k) => k !== "appeal")
                .map((k) => (
                  <option key={k} value={k}>
                    {cfg.case_types[k].label}
                  </option>
                ))}
            </select>
          </label>
          <label className="crm-field">
            Channel
            <select className="crm-select" value={channel} onChange={(e) => setChannel(e.target.value as CaseChannel)}>
              {(["phone", "walk_in", "email", "whatsapp"] as CaseChannel[]).map((ch) => (
                <option key={ch} value={ch}>
                  {CHANNEL_LABEL[ch]}
                </option>
              ))}
            </select>
          </label>
        </div>
        <label className="crm-field">
          Subject
          <input className="crm-input" value={subject} onChange={(e) => setSubject(e.target.value)} required />
        </label>
        <label className="crm-field">
          What the customer said
          <textarea className="crm-textarea" value={description} onChange={(e) => setDescription(e.target.value)} required />
        </label>
        <label className="crm-field">
          Company (client register)
          <select className="crm-select" value={clientId} onChange={(e) => setClientId(e.target.value)}>
            <option value="">— Not a registered client —</option>
            {sorted.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <label className="crm-check">
          <input type="checkbox" checked={anonymous} onChange={(e) => setAnonymous(e.target.checked)} />
          Caller wants to stay anonymous
        </label>
        {!anonymous ? (
          <div className="crm-form crm-form--2">
            <label className="crm-field">
              Name
              <input className="crm-input" value={name} onChange={(e) => setName(e.target.value)} />
            </label>
            <label className="crm-field">
              Phone
              <input className="crm-input" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+268" />
            </label>
            <label className="crm-field" style={{ gridColumn: "1 / -1" }}>
              Email
              <input className="crm-input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            </label>
          </div>
        ) : (
          <span className="crm-small">Give the caller the reference and tracking code shown after logging so they can follow up.</span>
        )}
      </form>
    </CrmDrawer>
  );
}

export function CrmAppealsView() {
  return <CrmCasesView appeals />;
}

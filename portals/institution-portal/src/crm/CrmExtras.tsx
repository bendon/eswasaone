/**
 * CRM additions (gap 04): client create/edit with duplicate detection and merge (R4), contacts with
 * portal invites (R5), contact directory and contact-centre console (P2), knowledge base (P2),
 * service contracts (P2), signal rules + generators (R10) and the campaign hand-off (R9).
 */
import { useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Icon } from "@eswasaone/shared-ui";
import {
  articleFromCase,
  contractFromQuote,
  createCampaignDraft,
  createClient,
  findClientDuplicates,
  getClient,
  getSignalRules,
  inviteContact,
  listAllContacts,
  listArticles,
  listCampaigns,
  listCases,
  listClients,
  listContracts,
  listQuotes,
  lookupContacts,
  markCampaignSent,
  mergeClients,
  runSignalGenerators,
  saveArticle,
  saveContact,
  saveContract,
  saveSignalRules,
  setContactActive,
  signalGenerators,
  updateClientDetails,
  useCrm,
  type CaseType,
  type Client,
  type Contact,
  type CrmActor,
  type KbArticle,
  type Region,
  type ServiceContract,
  type Signal,
  type SignalRules,
} from "@eswasaone/shared-ui/crm";
import { ReasonDialog } from "@eswasaone/shared-ui/workflow";
import { CrmGate, useActor } from "./shared";

const REGIONS: Region[] = ["Hhohho", "Manzini", "Lubombo", "Shiselweni"];
const fmt = (iso?: string) => (iso ? new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }) : "—");

function useFlash(): [React.ReactNode, (m: string) => void] {
  const [m, setM] = useState<string | null>(null);
  return [m ? <div className="crm-toast" role="status">{m}</div> : null, (x: string) => (setM(x), window.setTimeout(() => setM(null), 3000))];
}

/* ---------------- client form (new / edit) with duplicates ---------------- */

export function ClientFormPage() {
  const { id } = useParams();
  const actor = useActor();
  const nav = useNavigate();
  const res = useCrm(async () => (id ? await getClient(id) : null), [id]);
  return <CrmGate res={res} what="Client">{(c) => <ClientForm key={c?.id ?? "new"} client={c} actor={actor} onSaved={(cid) => nav(`/crm/clients/${cid}`)} />}</CrmGate>;
}

function ClientForm({ client, actor, onSaved }: { client: Client | null; actor: CrmActor; onSaved: (id: string) => void }) {
  const [v, setV] = useState({
    name: client?.name ?? "",
    sector: client?.sector ?? "Food & beverage",
    region: client?.region ?? ("Manzini" as Region),
    tier: client?.tier ?? ("prospect" as Client["tier"]),
    employees: String(client?.employees ?? ""),
    exporter: client?.exporter ?? false,
    reg_no: client?.reg_no ?? "",
    address: client?.address ?? "",
    website: client?.website ?? "",
    account_manager: client?.account_manager ?? "",
    contact: "",
    email: "",
    phone: "",
  });
  const [err, setErr] = useState<string | null>(null);
  const [merge, setMerge] = useState<Client | null>(null);
  const dups = useMemo(() => findClientDuplicates(v.name, v.reg_no || undefined, client?.id), [v.name, v.reg_no, client?.id]);
  const set = (k: keyof typeof v) => (e: { target: { value: string } }) => setV({ ...v, [k]: e.target.value });
  const save = async () => {
    setErr(null);
    try {
      const base = { name: v.name, sector: v.sector, region: v.region, tier: v.tier, employees: Number(v.employees) || undefined, exporter: v.exporter, reg_no: v.reg_no || undefined, address: v.address || undefined, website: v.website || undefined, account_manager: v.account_manager || undefined };
      if (client) {
        await updateClientDetails(client.id, base, actor);
        onSaved(client.id);
      } else {
        const c = await createClient({ ...base, contact: v.contact ? { name: v.contact, role: "Main contact", email: v.email || undefined, phone: v.phone || undefined, primary: true } : undefined }, actor);
        onSaved(c.id);
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  };
  return (
    <div className="crm-stack" style={{ maxWidth: 860 }}>
      <Link className="crm-ws__back" to={client ? `/crm/clients/${client.id}` : "/crm/clients"}>
        <Icon name="i-cleft" /> {client ? client.name : "Clients"}
      </Link>
      <h2 style={{ margin: 0 }}>{client ? "Edit client" : "New client"}</h2>
      {dups.length ? (
        <div className="crm-banner crm-banner--info">
          <b>Possible duplicate:</b>{" "}
          {dups.map((d) => (
            <span key={d.id}>
              <Link className="crm-link" to={`/crm/clients/${d.id}`}>
                {d.name}
              </Link>{" "}
              ({d.id}){client ? (
                <>
                  {" "}
                  <button type="button" className="crm-link" onClick={() => setMerge(d)}>
                    Merge into this record
                  </button>
                </>
              ) : null}
              {"  "}
            </span>
          ))}
          {!client ? " — open it instead of creating a second record." : ""}
        </div>
      ) : null}
      <div className="crm-card crm-form crm-grid crm-grid--2">
        <label className="crm-field">
          Organisation name *
          <input className="crm-input" value={v.name} onChange={set("name")} />
        </label>
        <label className="crm-field">
          Registration number
          <input className="crm-input" value={v.reg_no} onChange={set("reg_no")} />
        </label>
        <label className="crm-field">
          Sector
          <input className="crm-input" value={v.sector} onChange={set("sector")} />
        </label>
        <label className="crm-field">
          Region
          <select className="crm-select" value={v.region} onChange={set("region")}>
            {REGIONS.map((r) => (
              <option key={r}>{r}</option>
            ))}
          </select>
        </label>
        <label className="crm-field">
          Tier
          <select className="crm-select" value={v.tier} onChange={set("tier")}>
            {["key", "growth", "standard", "prospect"].map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>
        </label>
        <label className="crm-field">
          Employees
          <input className="crm-input" type="number" value={v.employees} onChange={set("employees")} />
        </label>
        <label className="crm-field">
          Address
          <input className="crm-input" value={v.address} onChange={set("address")} />
        </label>
        <label className="crm-field">
          Website
          <input className="crm-input" value={v.website} onChange={set("website")} />
        </label>
        <label className="crm-field">
          Account manager
          <input className="crm-input" value={v.account_manager} onChange={set("account_manager")} />
        </label>
        <label className="crm-check" style={{ alignSelf: "end" }}>
          <input type="checkbox" checked={v.exporter} onChange={(e) => setV({ ...v, exporter: e.target.checked })} /> Exporter
        </label>
        {!client ? (
          <>
            <label className="crm-field">
              Main contact
              <input className="crm-input" value={v.contact} onChange={set("contact")} />
            </label>
            <label className="crm-field">
              Contact email
              <input className="crm-input" value={v.email} onChange={set("email")} />
            </label>
            <label className="crm-field">
              Contact phone
              <input className="crm-input" value={v.phone} onChange={set("phone")} />
            </label>
          </>
        ) : null}
      </div>
      {err ? <p className="eo-error">{err}</p> : null}
      <button type="button" className="crm-btn crm-btn--pri" style={{ alignSelf: "flex-start" }} disabled={!v.name.trim()} onClick={() => void save()}>
        {client ? "Save changes" : "Create client"}
      </button>
      {merge && client ? (
        <ReasonDialog
          title={`Merge ${merge.name} into ${client.name}`}
          consequence={`Contacts, certificates, cases, opportunities and quotes of ${merge.id} move to ${client.id}; ${merge.id} is retired. This can't be undone.`}
          danger
          confirmLabel="Merge"
          onClose={() => setMerge(null)}
          onSubmit={async () => {
            await mergeClients(client.id, merge.id, actor);
            setMerge(null);
            onSaved(client.id);
          }}
        />
      ) : null}
    </div>
  );
}

/* ---------------- contacts on Client 360 ---------------- */

export function ContactsManager({ client }: { client: Client }) {
  const actor = useActor();
  const [toast, flash] = useFlash();
  const [edit, setEdit] = useState<Partial<Contact> | null>(null);
  const act = (fn: () => Promise<unknown>, ok: string) => void fn().then(() => flash(ok), (e: Error) => flash(e.message));
  return (
    <div className="crm-stack">
      {toast}
      <div className="crm-row">
        <span className="crm-small" style={{ flex: 1 }}>
          Portal users linked to this client see its certificates, quotes, calibration jobs and invoices in their Service account.
        </span>
        <button type="button" className="crm-btn crm-btn--sm crm-btn--pri" onClick={() => setEdit({ name: "", role: "", email: "", phone: "" })}>
          <Icon name="i-plus" /> Add contact
        </button>
      </div>
      <table className="crm-table">
        <thead>
          <tr>
            <th>Name</th>
            <th>Role</th>
            <th>Email / phone</th>
            <th>Portal</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {client.contacts.map((c) => (
            <tr key={c.id} style={c.active === false ? { opacity: 0.5 } : undefined}>
              <td>
                <b>{c.name}</b> {c.primary ? <span className="crm-pill crm-pill--gold">Primary</span> : null}
                {c.active === false ? <span className="crm-pill crm-pill--slate">Inactive</span> : null}
              </td>
              <td>{c.role}</td>
              <td className="crm-small">
                {c.email ?? "—"}
                <br />
                {c.phone ?? ""}
              </td>
              <td>{c.portal ? <span className="crm-pill crm-pill--green">{c.portal.status} {fmt(c.portal.invited_at)}</span> : "—"}</td>
              <td className="num" style={{ whiteSpace: "nowrap" }}>
                <button type="button" className="crm-link" onClick={() => setEdit(c)}>
                  Edit
                </button>
                {" · "}
                {c.active === false ? (
                  <button type="button" className="crm-link" onClick={() => act(() => setContactActive(client.id, c.id, true, actor), "Reactivated")}>
                    Reactivate
                  </button>
                ) : (
                  <button type="button" className="crm-link" onClick={() => act(() => setContactActive(client.id, c.id, false, actor), "Deactivated")}>
                    Deactivate
                  </button>
                )}
                {!c.portal && c.email && c.active !== false ? (
                  <>
                    {" · "}
                    <button type="button" className="crm-link" onClick={() => act(() => inviteContact(client.id, c.id, actor), `Invite sent to ${c.email}`)}>
                      Invite to portal
                    </button>
                  </>
                ) : null}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {edit ? (
        <ReasonDialog
          title={edit.id ? `Edit ${edit.name}` : "Add contact"}
          confirmLabel="Save"
          onClose={() => setEdit(null)}
          onSubmit={async () => {
            await saveContact(client.id, { id: edit.id, name: edit.name ?? "", role: edit.role ?? "", email: edit.email || undefined, phone: edit.phone || undefined, primary: edit.primary }, actor);
            setEdit(null);
            flash("Saved.");
          }}
        >
          <div className="crm-grid crm-grid--2">
            {(["name", "role", "email", "phone"] as const).map((k) => (
              <label key={k} className="crm-field">
                {k[0].toUpperCase() + k.slice(1)}
                <input className="crm-input" value={edit[k] ?? ""} onChange={(e) => setEdit({ ...edit, [k]: e.target.value })} />
              </label>
            ))}
          </div>
          <label className="crm-check">
            <input type="checkbox" checked={Boolean(edit.primary)} onChange={(e) => setEdit({ ...edit, primary: e.target.checked })} /> Primary contact
          </label>
        </ReasonDialog>
      ) : null}
    </div>
  );
}

/* ---------------- contact directory ---------------- */

export function ContactsDirectory() {
  const [q, setQ] = useState("");
  const res = useCrm(() => listAllContacts(), []);
  return (
    <CrmGate res={res} what="Contacts">
      {(rows) => {
        const t = q.toLowerCase().replace(/\s/g, "");
        const shown = rows.filter(({ contact, client }) => !t || `${contact.name}${contact.email}${contact.phone}${client.name}`.toLowerCase().replace(/\s/g, "").includes(t));
        return (
          <div className="crm-stack">
            <div className="crm-toolbar">
              <input className="crm-input" style={{ maxWidth: 320 }} placeholder="Search name, phone or email" value={q} onChange={(e) => setQ(e.target.value)} />
              <span className="crm-small">{shown.length} contacts</span>
              <Link className="crm-btn crm-btn--sm" to="/crm/console" style={{ marginLeft: "auto" }}>
                <Icon name="i-phone" /> Contact-centre console
              </Link>
            </div>
            <table className="crm-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Client</th>
                  <th>Role</th>
                  <th>Email</th>
                  <th>Phone</th>
                </tr>
              </thead>
              <tbody>
                {shown.map(({ contact: c, client }) => (
                  <tr key={c.id}>
                    <td>
                      <b>{c.name}</b> {c.portal ? <span className="crm-pill crm-pill--green">Portal</span> : null}
                    </td>
                    <td>
                      <Link className="crm-link" to={`/crm/clients/${client.id}`}>
                        {client.name}
                      </Link>
                    </td>
                    <td>{c.role}</td>
                    <td>{c.email ?? "—"}</td>
                    <td>{c.phone ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      }}
    </CrmGate>
  );
}

/* ---------------- contact-centre console ---------------- */

export function ContactConsole() {
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Awaited<ReturnType<typeof lookupContacts>>>([]);
  const [busy, setBusy] = useState(false);
  const search = async (value: string) => {
    setQ(value);
    if (value.replace(/\D/g, "").length < 3 && value.length < 3) return setHits([]);
    setBusy(true);
    try {
      setHits(await lookupContacts(value));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="crm-stack">
      <div className="crm-card">
        <div className="crm-card__h">
          <h3>Who's calling?</h3>
        </div>
        <input className="crm-input" style={{ fontSize: 18, padding: 12 }} autoFocus placeholder="Type the caller's phone number, email or name" value={q} onChange={(e) => void search(e.target.value)} />
        <p className="crm-small">{busy ? "Searching…" : hits.length ? `${hits.length} match(es)` : "Matches contacts on client records and people who lodged cases."}</p>
      </div>
      {hits.map(({ client, contact, open_cases }) => (
        <div key={`${client.id}-${contact.id}`} className="crm-card">
          <div className="crm-row">
            <div style={{ flex: 1 }}>
              <b style={{ fontSize: 16 }}>{contact.name}</b> <span className="crm-small">{contact.role}</span>
              <p className="crm-small" style={{ margin: "2px 0" }}>
                {contact.phone ?? ""} {contact.email ?? ""}
              </p>
              <p style={{ margin: 0 }}>{client.id ? <Link className="crm-link" to={`/crm/clients/${client.id}`}>{client.name}</Link> : client.name}</p>
            </div>
            <Link className="crm-btn crm-btn--pri" to={`/crm/cases?new=1&phone=${encodeURIComponent(contact.phone ?? "")}&name=${encodeURIComponent(contact.name)}${client.id ? `&client=${client.id}` : ""}`}>
              <Icon name="i-plus" /> Log this call
            </Link>
          </div>
          {open_cases.length ? (
            <ul className="crm-small" style={{ margin: "8px 0 0", paddingLeft: 18 }}>
              {open_cases.map((c) => (
                <li key={c.ref}>
                  <Link className="crm-link" to={`/crm/cases/${c.ref}`}>
                    {c.ref}
                  </Link>{" "}
                  {c.subject} — {c.state}
                </li>
              ))}
            </ul>
          ) : (
            <p className="crm-small">No open cases.</p>
          )}
        </div>
      ))}
    </div>
  );
}

/* ---------------- knowledge base ---------------- */

const CASE_TYPES: CaseType[] = ["enquiry", "service_complaint", "product_report", "mark_misuse", "billing_dispute", "feedback"];

export function KnowledgeView() {
  const actor = useActor();
  const [toast, flash] = useFlash();
  const [edit, setEdit] = useState<Partial<KbArticle> | null>(null);
  const [fromCase, setFromCase] = useState("");
  const res = useCrm(async () => ({ articles: await listArticles(), resolved: (await listCases({ state: "all" })).filter((c) => c.resolution && c.type !== "appeal") }), []);
  return (
    <CrmGate res={res} what="Knowledge base">
      {({ articles, resolved }) => (
        <div className="crm-stack">
          {toast}
          <div className="crm-toolbar">
            <span className="crm-small" style={{ flex: 1 }}>
              Published articles appear on the Service portal's Help page and as suggestions in the complaint form.
            </span>
            <select className="crm-select" style={{ width: "auto" }} value={fromCase} onChange={(e) => setFromCase(e.target.value)} aria-label="Resolved case">
              <option value="">From a resolved case…</option>
              {resolved.map((c) => (
                <option key={c.ref} value={c.ref}>
                  {c.ref} {c.subject}
                </option>
              ))}
            </select>
            <button type="button" className="crm-btn crm-btn--sm" disabled={!fromCase} onClick={() => void articleFromCase(fromCase, actor).then((a) => (setEdit(a), setFromCase("")), (e: Error) => flash(e.message))}>
              Create draft
            </button>
            <button type="button" className="crm-btn crm-btn--sm crm-btn--pri" onClick={() => setEdit({ title: "", body: "", tags: [], types: ["enquiry"], status: "draft" })}>
              <Icon name="i-plus" /> New article
            </button>
          </div>
          {articles.map((a) => (
            <div key={a.id} className="crm-card">
              <div className="crm-row">
                <b style={{ flex: 1 }}>{a.title}</b>
                <span className={`crm-pill crm-pill--${a.status === "published" ? "green" : "amber"}`}>{a.status}</span>
                <button type="button" className="crm-link" onClick={() => setEdit(a)}>
                  Edit
                </button>
              </div>
              <p className="crm-small" style={{ margin: "4px 0" }}>
                {a.body.slice(0, 220)}
                {a.body.length > 220 ? "…" : ""}
              </p>
              <span className="crm-small">
                {a.types.join(", ")} · {a.helpful} found it helpful · updated {fmt(a.updated_at)} by {a.by}
                {a.from_case ? ` · from ${a.from_case}` : ""}
              </span>
            </div>
          ))}
          {edit ? (
            <ReasonDialog
              title={edit.id ? "Edit article" : "New article"}
              confirmLabel="Save"
              onClose={() => setEdit(null)}
              onSubmit={async () => {
                await saveArticle({ id: edit.id, title: edit.title ?? "", body: edit.body ?? "", tags: edit.tags ?? [], types: edit.types ?? [], status: edit.status ?? "draft", by: actor.name, from_case: edit.from_case }, actor);
                setEdit(null);
                flash("Article saved.");
              }}
            >
              <label className="crm-field">
                Title
                <input className="crm-input" value={edit.title ?? ""} onChange={(e) => setEdit({ ...edit, title: e.target.value })} />
              </label>
              <label className="crm-field">
                Body
                <textarea className="crm-textarea" style={{ minHeight: 140 }} value={edit.body ?? ""} onChange={(e) => setEdit({ ...edit, body: e.target.value })} />
              </label>
              <label className="crm-field">
                Tags (comma separated)
                <input className="crm-input" value={(edit.tags ?? []).join(", ")} onChange={(e) => setEdit({ ...edit, tags: e.target.value.split(",").map((x) => x.trim()).filter(Boolean) })} />
              </label>
              <div className="crm-row">
                {CASE_TYPES.map((t) => (
                  <label key={t} className="crm-check">
                    <input type="checkbox" checked={(edit.types ?? []).includes(t)} onChange={(e) => setEdit({ ...edit, types: e.target.checked ? [...(edit.types ?? []), t] : (edit.types ?? []).filter((x) => x !== t) })} /> {t.replace("_", " ")}
                  </label>
                ))}
              </div>
              <label className="crm-check">
                <input type="checkbox" checked={edit.status === "published"} onChange={(e) => setEdit({ ...edit, status: e.target.checked ? "published" : "draft" })} /> Published
              </label>
            </ReasonDialog>
          ) : null}
        </div>
      )}
    </CrmGate>
  );
}

/* ---------------- contracts ---------------- */

export function ContractsView() {
  const [toast, flash] = useFlash();
  const [add, setAdd] = useState(false);
  const res = useCrm(async () => ({ contracts: await listContracts(), quotes: (await listQuotes()).filter((q) => q.status === "accepted"), clients: await listClients() }), []);
  return (
    <CrmGate res={res} what="Contracts">
      {({ contracts, quotes, clients }) => {
        const unconverted = quotes.filter((q) => !contracts.some((c) => c.quote_id === q.id));
        return (
          <div className="crm-stack">
            {toast}
            <div className="crm-toolbar">
              <span className="crm-small" style={{ flex: 1 }}>
                Service agreements after a quote is accepted, with renewal reminders.
              </span>
              {unconverted.map((q) => (
                <button key={q.id} type="button" className="crm-btn crm-btn--sm" onClick={() => void contractFromQuote(q.id).then(() => flash("Agreement created."), (e: Error) => flash(e.message))}>
                  From {q.id}
                </button>
              ))}
              <button type="button" className="crm-btn crm-btn--sm crm-btn--pri" onClick={() => setAdd(true)}>
                <Icon name="i-plus" /> New agreement
              </button>
            </div>
            <table className="crm-table">
              <thead>
                <tr>
                  <th>Agreement</th>
                  <th>Client</th>
                  <th>Term</th>
                  <th>Value</th>
                  <th>Renewal</th>
                </tr>
              </thead>
              <tbody>
                {contracts.map((c) => {
                  const days = Math.ceil((new Date(c.end).getTime() - Date.now()) / 86_400_000);
                  return (
                    <tr key={c.id}>
                      <td>
                        <b>{c.title}</b>
                        <span className="crm-small">
                          {c.id} · {c.kind.replace(/_/g, " ")}
                          {c.quote_id ? ` · ${c.quote_id}` : ""}
                        </span>
                      </td>
                      <td>
                        <Link className="crm-link" to={`/crm/clients/${c.client_id}`}>
                          {c.client_name}
                        </Link>
                      </td>
                      <td>
                        {fmt(c.start)} → {fmt(c.end)}
                      </td>
                      <td>E {c.value.toLocaleString()}</td>
                      <td>{c.status !== "active" ? <span className="crm-pill crm-pill--slate">{c.status}</span> : days < 0 ? <span className="crm-pill crm-pill--red">Ended</span> : days <= c.renewal_reminder_days ? <span className="crm-pill crm-pill--amber">Renew in {days} d</span> : <span className="crm-pill crm-pill--green">{days} d left</span>}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {add ? (
              <ReasonDialog
                title="New service agreement"
                fields={[
                  { key: "client", label: "Client", type: "select", required: true, options: clients.map((c) => ({ value: c.id, label: c.name })) },
                  { key: "kind", label: "Kind", type: "select", required: true, options: ["certification_agreement", "calibration_contract", "training_agreement", "standards_subscription"].map((k) => ({ value: k, label: k.replace(/_/g, " ") })) },
                  { key: "title", label: "Title", required: true },
                  { key: "start", label: "Start", type: "date", required: true },
                  { key: "end", label: "End", type: "date", required: true },
                  { key: "value", label: "Value (E)", type: "number", required: true },
                ]}
                onClose={() => setAdd(false)}
                onSubmit={async (v) => {
                  const p = v.payload ?? {};
                  await saveContract({ client_id: p.client, client_name: clients.find((c) => c.id === p.client)?.name ?? "", kind: p.kind as ServiceContract["kind"], title: p.title, start: new Date(p.start).toISOString(), end: new Date(p.end).toISOString(), value: Number(p.value), renewal_reminder_days: 60, status: "active" });
                  setAdd(false);
                  flash("Agreement saved.");
                }}
              />
            ) : null}
          </div>
        );
      }}
    </CrmGate>
  );
}

/* ---------------- signal rules (settings section) ---------------- */

export function SignalRulesCard() {
  const res = useCrm(() => getSignalRules(), []);
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <CrmGate res={res} what="Signal rules">
      {(r) => <SignalRulesForm key={JSON.stringify(r)} rules={r} msg={msg} setMsg={setMsg} />}
    </CrmGate>
  );
}

function SignalRulesForm({ rules, msg, setMsg }: { rules: SignalRules; msg: string | null; setMsg: (m: string | null) => void }) {
  const [r, setR] = useState(rules);
  const gens = signalGenerators();
  const num = (k: "expiry_horizon_days" | "calibration_horizon_days" | "abandoned_age_days", label: string) => (
    <label className="crm-field">
      {label}
      <input className="crm-input" type="number" value={r[k]} onChange={(e) => setR({ ...r, [k]: Number(e.target.value) })} />
    </label>
  );
  return (
    <div className="crm-card">
      <div className="crm-card__h">
        <div>
          <h3>Signal rules</h3>
          <p>What creates a commercial signal, and how far ahead. Compliance signals never become sales leads.</p>
        </div>
      </div>
      <div className="crm-grid crm-grid--3">
        {num("expiry_horizon_days", "Certificate expiry horizon (days)")}
        {num("calibration_horizon_days", "Calibration due horizon (days)")}
        {num("abandoned_age_days", "Abandoned journey age (days)")}
      </div>
      <p className="crm-small" style={{ margin: "10px 0 4px" }}>
        TBT impact levels that create signals
      </p>
      <div className="crm-row">
        {(["high", "medium", "low"] as const).map((l) => (
          <label key={l} className="crm-check">
            <input type="checkbox" checked={r.tbt_levels.includes(l)} onChange={(e) => setR({ ...r, tbt_levels: e.target.checked ? [...r.tbt_levels, l] : r.tbt_levels.filter((x) => x !== l) })} /> {l}
          </label>
        ))}
      </div>
      <p className="crm-small" style={{ margin: "10px 0 4px" }}>
        Generators
      </p>
      <div className="crm-row">
        {(Object.keys(r.generators) as (keyof SignalRules["generators"])[]).map((k) => (
          <label key={k} className="crm-check" title={gens.filter((g) => g.key === k).map((g) => g.label).join(", ") || "No generator registered yet"}>
            <input type="checkbox" checked={r.generators[k]} onChange={(e) => setR({ ...r, generators: { ...r.generators, [k]: e.target.checked } })} /> {k}
          </label>
        ))}
      </div>
      <div className="crm-row" style={{ marginTop: 12 }}>
        <button type="button" className="crm-btn crm-btn--sm crm-btn--pri" onClick={() => void saveSignalRules(r).then(() => setMsg("Saved."))}>
          Save rules
        </button>
        <button type="button" className="crm-btn crm-btn--sm" onClick={() => void runSignalGenerators().then((x) => setMsg(x.created ? `Created ${x.created} signal(s): ${Object.entries(x.by).map(([k, n]) => `${k} ${n}`).join(", ")}` : "No new signals."))}>
          <Icon name="i-spark" /> Run generators now
        </button>
        {msg ? <span className="crm-small">{msg}</span> : null}
      </div>
    </div>
  );
}

/* ---------------- campaign hand-off (R9) ---------------- */

export function CampaignButton({ signals }: { signals: Signal[] }) {
  const actor = useActor();
  const nav = useNavigate();
  const [open, setOpen] = useState(false);
  const clientIds = [...new Set(signals.map((s) => s.client_id).filter(Boolean))] as string[];
  return (
    <>
      <button type="button" className="crm-btn crm-btn--sm" disabled={!clientIds.length} title={clientIds.length ? "Hands the selected clients to Marketing as a campaign draft" : "Select signals that belong to a client"} onClick={() => setOpen(true)}>
        <Icon name="i-mega" /> Outreach campaign
      </button>
      {open ? (
        <ReasonDialog
          title="Create campaign draft"
          consequence={`Creates a Marketing campaign draft for ${clientIds.length} client(s) and records the outreach on each client's activity.`}
          reasonLabel="Message"
          requires="note"
          initialReason={signals[0] ? `Following up on: ${signals[0].title}` : ""}
          fields={[{ key: "name", label: "Campaign name", required: true }]}
          onClose={() => setOpen(false)}
          onSubmit={async (v) => {
            const d = await createCampaignDraft({ name: v.payload?.name ?? "Outreach", client_ids: clientIds, signal_kind: signals[0]?.kind, message: v.note ?? "" }, actor);
            setOpen(false);
            nav(`/marketing?campaign=${d.id}`);
          }}
        />
      ) : null}
    </>
  );
}

export function CampaignDraftsPanel() {
  const actor = useActor();
  const res = useCrm(async () => ({ campaigns: await listCampaigns(), clients: await listClients() }), []);
  if (!res.data?.campaigns.length) return null;
  const { campaigns, clients } = res.data;
  return (
    <div className="crm-card" style={{ marginBottom: 16 }}>
      <div className="crm-card__h">
        <h3>Campaign drafts from CRM</h3>
      </div>
      {campaigns.map((c) => (
        <div key={c.id} className="crm-row" style={{ padding: "6px 0", borderBottom: "1px solid var(--line)" }}>
          <span style={{ flex: 1 }}>
            <b>{c.name}</b> <span className="crm-small">({c.id}, {c.signal_kind?.replace(/_/g, " ") ?? "manual"})</span>
            <span className="crm-small" style={{ display: "block" }}>
              {c.client_ids.map((id) => clients.find((x) => x.id === id)?.name ?? id).join(", ")} — “{c.message}”
            </span>
          </span>
          {c.status === "draft" ? (
            <button type="button" className="crm-btn crm-btn--sm crm-btn--pri" onClick={() => void markCampaignSent(c.id, actor)}>
              Mark sent
            </button>
          ) : (
            <span className="crm-pill crm-pill--green">Sent</span>
          )}
        </div>
      ))}
    </div>
  );
}

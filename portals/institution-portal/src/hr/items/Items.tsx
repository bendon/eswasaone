import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { FormDrawer, type FormDrawerField } from "@eswasaone/shared-ui";
import { useApiResource } from "../../hooks/useApiResource";
import { EmptyState, ResourceGate } from "../../components/PageStates";
import { RequireStaff } from "../../components/RequireStaff";
import { useInstitution } from "../../layout/InstitutionLayout";
import type { HrEmployeeItems, HrIssuedItem, HrIssuedItemList } from "../../api/types";
import { Banner, Crumbs, fmtDay, StatusPill } from "../../me/parts";
import { errorText, hrSend } from "../api";

/**
 * Items issued to staff (HR additions plan 02): the record Items tab (HR and the line manager), the H19 register
 * (HR) and the "Items still out" box on a leaver's offboarding. HR issues; the holder acknowledges in Approvals or
 * My items; HR or the line manager takes items back; only an HR Manager marks one lost or written off, with a note.
 * Item types are ESWASA's list (A2): until it exists, nothing can be issued and the screens say so.
 */

const CLS: Record<string, string> = { Issued: "leave", Acknowledged: "info", Returned: "ok", Lost: "bad", "Written off": "mute" };
const OUT = new Set(["Issued", "Acknowledged"]);
const AWAITING = "Awaiting ESWASA (A2): the list of items issued to staff. Add the item types in HR setup first.";

export function ItemStatus({ i }: { i: HrIssuedItem }) {
  return (
    <>
      <StatusPill cls={CLS[i.status] ?? "info"} label={i.status} />
      {i.overdue ? (
        <>
          {" "}
          <StatusPill cls="bad" label="Overdue" />
        </>
      ) : null}
    </>
  );
}

function itemLabel(i: HrIssuedItem): string {
  return [i.item_type, i.tag].filter(Boolean).join(" ");
}

/** People / Issued items, at the top of the Directory and the register. */
export function DirectorySwitch({ current }: { current: "people" | "items" }) {
  const navigate = useNavigate();
  const views: Array<["people" | "items", string, string]> = [
    ["people", "People", "/hr/directory"],
    ["items", "Issued items", "/hr/items"],
  ];
  return (
    <nav className="hr-struct-tabs" aria-label="Directory views">
      {views.map(([id, text, to]) => (
        <button key={id} type="button" className={current === id ? "on" : undefined} aria-current={current === id ? "page" : undefined} onClick={() => navigate(to)}>
          {text}
        </button>
      ))}
    </nav>
  );
}

/** Take back, or (HR Manager) mark lost or written off. Calls back with the person's items after the change. */
function ReturnDrawer({
  item,
  canWriteOff,
  onClose,
  onDone,
}: {
  item: HrIssuedItem | null;
  canWriteOff: boolean;
  onClose: () => void;
  onDone: (d: HrEmployeeItems) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const outcomes = canWriteOff ? ["Returned", "Lost", "Written off"] : ["Returned"];
  const fields: FormDrawerField[] = [
    { name: "outcome", label: "What happened", type: "select", required: true, options: outcomes.map((o) => ({ value: o, label: o })) },
    { name: "condition_in", label: "Condition when returned", placeholder: "e.g. good, screen cracked" },
    { name: "note", label: canWriteOff ? "Note (needed if lost or written off)" : "Note", type: "textarea" },
  ];
  async function submit(v: Record<string, string>) {
    if (!item) return;
    setBusy(true);
    setErr(null);
    try {
      const d = await hrSend<HrEmployeeItems>(`/hr/items/${encodeURIComponent(item.name)}/return`, {
        outcome: v.outcome || "Returned",
        condition_in: v.condition_in?.trim() || null,
        note: v.note?.trim() || null,
      });
      onDone(d);
    } catch (e) {
      setErr(errorText(e, "Not saved."));
    } finally {
      setBusy(false);
    }
  }
  return (
    <FormDrawer
      key={item?.name ?? "closed"}
      open={Boolean(item)}
      title={item ? `Take back ${itemLabel(item)}` : "Take back"}
      mode="edit"
      submitLabel="Record"
      fields={fields}
      values={{ outcome: "Returned", condition_in: "", note: "" }}
      busy={busy}
      error={err}
      onClose={onClose}
      onSubmit={submit}
    />
  );
}

function IssueDrawer({ open, employee, types, onClose, onDone }: { open: boolean; employee: string; types: string[]; onClose: () => void; onDone: (d: HrEmployeeItems) => void }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const fields: FormDrawerField[] = [
    { name: "item_type", label: "Item type", type: "select", required: true, options: types.map((t) => ({ value: t, label: t })) },
    { name: "description", label: "Description", type: "textarea", placeholder: "Make and model" },
    { name: "tag", label: "Serial or asset tag" },
    { name: "condition_out", label: "Condition when issued" },
    { name: "return_due", label: "Return by (optional)", type: "date" },
  ];
  async function submit(v: Record<string, string>) {
    setBusy(true);
    setErr(null);
    try {
      const d = await hrSend<HrEmployeeItems>(`/hr/employees/${encodeURIComponent(employee)}/items`, {
        item_type: v.item_type,
        description: v.description?.trim() || null,
        tag: v.tag?.trim() || null,
        condition_out: v.condition_out?.trim() || null,
        return_due: v.return_due || null,
      });
      onDone(d);
    } catch (e) {
      setErr(errorText(e, "Not issued."));
    } finally {
      setBusy(false);
    }
  }
  return (
    <FormDrawer
      key={open ? "open" : "closed"}
      open={open}
      title="Issue an item"
      mode="create"
      submitLabel="Issue"
      fields={fields}
      busy={busy}
      error={err}
      onClose={onClose}
      onSubmit={submit}
    >
      <p className="hr-note">The person gets an “Acknowledge receipt” card in Approvals.</p>
    </FormDrawer>
  );
}

function ItemsTable({ items, person, onReturn }: { items: HrIssuedItem[]; person?: boolean; onReturn?: (i: HrIssuedItem) => void }) {
  return (
    <div className="hr-box hr-scroll">
      <table className="hr-table">
        <thead>
          <tr>
            {person ? <th>Person</th> : null}
            <th>Item</th>
            <th>Issued</th>
            <th>Acknowledged</th>
            <th>Return by</th>
            <th>Status</th>
            {onReturn ? <th /> : null}
          </tr>
        </thead>
        <tbody>
          {items.map((i) => (
            <tr key={i.name}>
              {person ? (
                <td>
                  <Link className="hr-lnk" to={`/hr/directory/${encodeURIComponent(i.employee)}/record`}>
                    {i.employee_name ?? i.employee}
                  </Link>
                  {i.department ? <div className="sub">{i.department}</div> : null}
                </td>
              ) : null}
              <td>
                {i.item_type}
                {i.tag ? <span className="mono"> {i.tag}</span> : null}
                {i.description ? <div className="sub">{i.description}</div> : null}
                {i.note ? <div className="sub">{i.note}</div> : null}
              </td>
              <td>{fmtDay(i.issued_on, true)}</td>
              <td>{i.acknowledged_on ? fmtDay(i.acknowledged_on, true) : OUT.has(i.status) ? "Not yet" : "—"}</td>
              <td>{i.returned_on ? `Returned ${fmtDay(i.returned_on, true)}` : fmtDay(i.return_due, true)}</td>
              <td>
                <ItemStatus i={i} />
              </td>
              {onReturn ? (
                <td>
                  {OUT.has(i.status) ? (
                    <button type="button" className="btn ghost sm" onClick={() => onReturn(i)}>
                      Return
                    </button>
                  ) : null}
                </td>
              ) : null}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Record Items tab: HR and the line manager. HR issues; HR or the line manager takes items back. */
export function ItemsPanel({ employee }: { employee: string }) {
  const { sessionKey } = useInstitution();
  const res = useApiResource<HrEmployeeItems>(`/hr/employees/${encodeURIComponent(employee)}/items`, { refreshKey: sessionKey });
  const [d, setD] = useState<HrEmployeeItems | null>(null);
  const data = d ?? res.data;
  const [issuing, setIssuing] = useState(false);
  const [returning, setReturning] = useState<HrIssuedItem | null>(null);
  return (
    <ResourceGate loading={res.loading} error={res.error} onRetry={res.reload} refreshing={res.refreshing} hasData={Boolean(data)} skeleton="list">
      {data ? (
        <div className="hr-view">
          {data.can_issue ? (
            data.types.length ? (
              <div>
                <button type="button" className="btn pri" onClick={() => setIssuing(true)}>
                  Issue item
                </button>
              </div>
            ) : (
              <Banner kind="info" title="Items can't be issued yet">
                {AWAITING}
              </Banner>
            )
          ) : null}
          {data.items.length ? (
            <ItemsTable items={data.items} onReturn={data.can_return ? setReturning : undefined} />
          ) : (
            <EmptyState title="No items issued" detail="Laptops, phones, cards and equipment issued to this person appear here." />
          )}
          <IssueDrawer
            open={issuing}
            employee={employee}
            types={data.types}
            onClose={() => setIssuing(false)}
            onDone={(next) => {
              setD(next);
              setIssuing(false);
            }}
          />
          <ReturnDrawer
            item={returning}
            canWriteOff={data.can_write_off}
            onClose={() => setReturning(null)}
            onDone={(next) => {
              setD(next);
              setReturning(null);
            }}
          />
        </div>
      ) : null}
    </ResourceGate>
  );
}

/** Offboarding: what the leaver still holds, with Return buttons. The clearance task waits until this is empty. */
export function ItemsOutBox({ items, canWriteOff, onChanged }: { items: HrIssuedItem[]; canWriteOff: boolean; onChanged: () => void }) {
  const [returning, setReturning] = useState<HrIssuedItem | null>(null);
  if (!items.length) return null;
  return (
    <div className="hr-box">
      <div className="hr-box__h">
        <div>
          <h3>Items still out ({items.length})</h3>
          <p>“Return issued items” can be ticked once everything is back, lost or written off.</p>
        </div>
      </div>
      <div className="hr-box__b">
        <div className="hr-out">
          {items.map((i) => (
            <div className="hr-out__i" key={i.name}>
              <div>
                <b>{itemLabel(i)}</b>
                <span className="s">
                  Issued {fmtDay(i.issued_on, true)}
                  {i.return_due ? `, return by ${fmtDay(i.return_due, true)}` : ""}
                </span>
              </div>
              <span className="r">
                <ItemStatus i={i} />{" "}
                <button type="button" className="btn ghost sm" onClick={() => setReturning(i)}>
                  Return
                </button>
              </span>
            </div>
          ))}
        </div>
      </div>
      <ReturnDrawer
        item={returning}
        canWriteOff={canWriteOff}
        onClose={() => setReturning(null)}
        onDone={() => {
          setReturning(null);
          onChanged();
        }}
      />
    </div>
  );
}

const STATUS_FILTERS: Array<[string, string]> = [
  ["out", "Still out"],
  ["", "All"],
  ["Returned", "Returned"],
  ["Lost", "Lost"],
  ["Written off", "Written off"],
];

/** H19 Issued items register (HR): everything issued, with filters and overdue items highlighted. */
export function ItemsRegister() {
  const { user, sessionKey } = useInstitution();
  const [params, setParams] = useSearchParams();
  const status = params.get("status") ?? "out";
  const type = params.get("type") ?? "";
  const overdue = params.get("overdue") === "1";
  const q = new URLSearchParams();
  if (status) q.set("status", status);
  if (type) q.set("item_type", type);
  if (overdue) q.set("overdue", "true");
  const res = useApiResource<HrIssuedItemList>(`/hr/items?${q.toString()}`, { enabled: Boolean(user), refreshKey: sessionKey });
  const d = res.data;
  const [returning, setReturning] = useState<HrIssuedItem | null>(null);
  const canWriteOff = (user?.roles ?? []).some((r) => r === "HR Manager" || r === "System Manager");

  function set(key: string, value: string) {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else if (key === "status") next.set(key, "");
    else next.delete(key);
    setParams(next, { replace: true });
  }

  return (
    <RequireStaff reason="Staff sign-in required">
      <div className="hr hr-view">
        <Crumbs items={[["Directory", "/hr/directory"], ["Issued items"]]} />
        <DirectorySwitch current="items" />
        <div className="hr-head">
          <div>
            <h2>Issued items</h2>
            <p>{d ? `${d.out} still out, ${d.overdue} overdue.` : "What staff hold, and what is due back."}</p>
          </div>
        </div>
        <div className="hr-filters">
          <label className="hr-f">
            <span>Status</span>
            <select className="hr-in" value={status} onChange={(e) => set("status", e.target.value)}>
              {STATUS_FILTERS.map(([v, l]) => (
                <option key={l} value={v}>
                  {l}
                </option>
              ))}
            </select>
          </label>
          <label className="hr-f">
            <span>Item type</span>
            <select className="hr-in" value={type} onChange={(e) => set("type", e.target.value)}>
              <option value="">All types</option>
              {(d?.types ?? []).map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </label>
          <label className="hr-f" style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            <input type="checkbox" checked={overdue} onChange={(e) => set("overdue", e.target.checked ? "1" : "")} />
            <span>Overdue only</span>
          </label>
        </div>
        <ResourceGate loading={res.loading} error={res.error} onRetry={res.reload} refreshing={res.refreshing} hasData={Boolean(d)} skeleton="list">
          {d ? (
            <>
              {!d.types.length ? (
                <Banner kind="info" title="No item types yet">
                  {AWAITING}
                </Banner>
              ) : null}
              {d.items.length ? (
                <ItemsTable items={d.items} person onReturn={setReturning} />
              ) : (
                <EmptyState title="Nothing here" detail="No issued items match these filters." />
              )}
            </>
          ) : null}
        </ResourceGate>
        <ReturnDrawer
          item={returning}
          canWriteOff={canWriteOff}
          onClose={() => setReturning(null)}
          onDone={() => {
            setReturning(null);
            res.reload();
          }}
        />
      </div>
    </RequireStaff>
  );
}

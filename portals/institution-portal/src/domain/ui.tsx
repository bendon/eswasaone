/**
 * Shared bits for the Certification, Field, Metrology and Standards screens (gaps 05–08):
 * one resource hook over every domain store, page header, KPI tile, act wrapper and CSV export.
 */
import { useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { Icon } from "@eswasaone/shared-ui";
import { billingStore } from "@eswasaone/shared-ui/billing";
import { certStore } from "@eswasaone/shared-ui/certification";
import { fieldStore } from "@eswasaone/shared-ui/field";
import { metStore } from "@eswasaone/shared-ui/metrology";
import { notifyStore } from "@eswasaone/shared-ui/notify";
import { docsStore } from "@eswasaone/shared-ui/record";
import { stdStore } from "@eswasaone/shared-ui/standards";
import { useStoreResource, type StoreResource } from "@eswasaone/shared-ui/store";
import { taskStore } from "@eswasaone/shared-ui/tasks";
import { ActionBar, type ActInput, type ActionOption } from "@eswasaone/shared-ui/workflow";

export { Gate, WfPill, useStaffActor, fmtDay, fmtDayTime, daysTo, Bar } from "../board/ui";

export function useDomain<T>(load: () => Promise<T> | T, deps: unknown[] = []): StoreResource<T> {
  return useStoreResource([certStore, fieldStore, metStore, stdStore, billingStore, taskStore, docsStore, notifyStore], load, deps);
}

export function useToast(): [ReactNode, (msg: string) => void] {
  const [msg, setMsg] = useState<string | null>(null);
  const show = (m: string) => {
    setMsg(m);
    window.setTimeout(() => setMsg(null), 3200);
  };
  return [msg ? <div className="crm-toast" role="status">{msg}</div> : null, show];
}

export function PageHead({ title, sub, actions }: { title: string; sub?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="crm-toolbar" style={{ justifyContent: "space-between", alignItems: "flex-start" }}>
      <div>
        <h3 style={{ margin: 0, fontSize: 17 }}>{title}</h3>
        {sub ? <p className="crm-small" style={{ margin: "4px 0 0" }}>{sub}</p> : null}
      </div>
      {actions ? <div className="crm-row">{actions}</div> : null}
    </div>
  );
}

export function Tile({ label, value, sub, tone, to }: { label: string; value: ReactNode; sub?: ReactNode; tone?: "red" | "amber" | "green"; to?: string }) {
  const body = (
    <>
      <div className="crm-kpi__l">{label}</div>
      <div className="crm-kpi__v">{value}</div>
      {sub ? <div className="crm-kpi__s">{sub}</div> : null}
    </>
  );
  const cls = `crm-kpi${tone ? ` crm-kpi--${tone}` : ""}`;
  return to ? (
    <Link to={to} className={cls}>
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  );
}

/** ActionBar with a toast on success; errors surface inside the reason dialog. */
export function Acts({ actions, state, act, toast, hide = [], size }: { actions: ActionOption[]; state: string; act: (a: ActionOption, input: ActInput) => Promise<unknown>; toast: (m: string) => void; hide?: string[]; size?: "sm" | "md" }) {
  return (
    <ActionBar
      size={size}
      actions={actions.filter((a) => !hide.includes(a.action))}
      state={state}
      onAct={async (a, input) => {
        await act(a, input);
        toast(`${a.label}: done.`);
      }}
    />
  );
}

export function Empty({ icon = "i-check-c", title, children }: { icon?: Parameters<typeof Icon>[0]["name"]; title: string; children?: ReactNode }) {
  return (
    <div className="crm-empty">
      <Icon name={icon} />
      <b>{title}</b>
      {children ? <p>{children}</p> : null}
    </div>
  );
}

export function downloadCsv(name: string, rows: Record<string, unknown>[]): void {
  if (!rows.length) return;
  const cols = Object.keys(rows[0]);
  const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const csv = [cols.join(","), ...rows.map((r) => cols.map((c) => esc(r[c])).join(","))].join("\n");
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
  a.download = name;
  a.click();
  URL.revokeObjectURL(a.href);
}

export const errText = (e: unknown) => (e instanceof Error ? e.message : String(e));

/** Run a write, toast the result or the error. */
export async function run(fn: () => unknown, toast: (m: string) => void, ok: string): Promise<boolean> {
  try {
    await fn();
    toast(ok);
    return true;
  } catch (e) {
    toast(errText(e));
    return false;
  }
}

export const STATE_FILTER_ALL = "";

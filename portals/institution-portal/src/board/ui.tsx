/**
 * Shared bits for the Board & Governance screens (gap 03) and the member area.
 */
import { useMemo, type ReactNode } from "react";
import { CrmBanner, CrmNotConnected } from "@eswasaone/shared-ui/crm";
import { govStore } from "@eswasaone/shared-ui/governance";
import { notifyStore } from "@eswasaone/shared-ui/notify";
import { docsStore } from "@eswasaone/shared-ui/record";
import { useStoreResource, type StoreResource } from "@eswasaone/shared-ui/store";
import { taskStore } from "@eswasaone/shared-ui/tasks";
import { displayState, stateTone, type Actor, type WorkflowDef } from "@eswasaone/shared-ui/workflow";
import { PageSkeleton } from "../components/PageStates";
import { useInstitution } from "../layout/InstitutionLayout";
import { actorFrom } from "../approvals/live";

export function useGov<T>(load: () => Promise<T> | T, deps: unknown[] = []): StoreResource<T> {
  return useStoreResource([govStore, taskStore, docsStore, notifyStore], load, deps);
}

export function useStaffActor(): Actor {
  const { user } = useInstitution();
  return useMemo(() => actorFrom(user), [user]);
}

export function Gate<T>({ res, what, children }: { res: StoreResource<T>; what: string; children: (data: NonNullable<T>) => ReactNode }) {
  if (res.loading && res.data === undefined) return <PageSkeleton variant="list" label={`Loading ${what.toLowerCase()}…`} />;
  if (res.notConnected) return <CrmNotConnected what={what} />;
  if (res.error) return <CrmBanner tone="err">{res.error}</CrmBanner>;
  if (res.data === undefined || res.data === null) return <CrmBanner tone="err">{what} not found.</CrmBanner>;
  return <>{children(res.data as NonNullable<T>)}</>;
}

export function WfPill<R>({ def, state, audience = "staff" }: { def: WorkflowDef<R>; state: string; audience?: "staff" | "member" | "customer" }) {
  return <span className={`crm-pill crm-pill--${stateTone(def, state)}`}>{displayState(def, state, audience)}</span>;
}

export const fmtDay = (iso?: string) => (iso ? new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }) : "—");
export const fmtDayTime = (iso?: string) => (iso ? new Date(iso).toLocaleString(undefined, { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—");
export const daysTo = (iso: string) => Math.ceil((new Date(iso).getTime() - Date.now()) / 86_400_000);

export function riskTone(score: number, appetite?: number): "red" | "amber" | "green" | "navy" {
  if (appetite !== undefined && score > appetite) return "red";
  if (score >= 15) return "red";
  if (score >= 10) return "amber";
  if (score >= 5) return "navy";
  return "green";
}

export function Toasty({ msg }: { msg: string | null }) {
  return msg ? (
    <div className="crm-toast" role="status">
      {msg}
    </div>
  ) : null;
}

export function Bar({ pct, tone = "navy" }: { pct: number; tone?: "navy" | "green" | "amber" | "red" }) {
  const color = { navy: "var(--navy)", green: "var(--green)", amber: "var(--amber)", red: "var(--red)" }[tone];
  return (
    <div className="crm-bar__track" title={`${pct}%`}>
      <div className="crm-bar__fill" style={{ width: `${Math.max(0, Math.min(100, pct))}%`, background: color }} />
    </div>
  );
}

export const VOTE_LABEL = { for: "For", against: "Against", abstain: "Abstain", recused: "Recused" } as const;

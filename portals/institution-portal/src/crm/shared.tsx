import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { Icon, type IconName } from "@eswasaone/shared-ui";
import {
  CrmBanner,
  CrmNotConnected,
  type CrmActor,
  type CrmResource,
  type SignalKind,
} from "@eswasaone/shared-ui/crm";
import { PageSkeleton } from "../components/PageStates";
import { useInstitution } from "../layout/InstitutionLayout";

/** Current staff member as a CRM actor (name + roles). */
export function useActor(): CrmActor {
  const { user } = useInstitution();
  return {
    name: user?.full_name || user?.username || "Staff",
    roles: user?.roles ?? [],
  };
}

/** Standard loading / not-connected / error handling for CRM resources. */
export function CrmGate<T>({
  res,
  what,
  skeleton = "list",
  children,
}: {
  res: CrmResource<T>;
  what: string;
  skeleton?: "list" | "dashboard" | "panel";
  children: (data: T) => ReactNode;
}) {
  if (res.loading && res.data === undefined) return <PageSkeleton variant={skeleton} label={`Loading ${what.toLowerCase()}…`} />;
  if (res.notConnected) return <CrmNotConnected what={what} />;
  if (res.error) return <CrmBanner tone="err">{res.error}</CrmBanner>;
  if (res.data === undefined) return null;
  return <>{children(res.data)}</>;
}

export function Kpi({
  label,
  value,
  sub,
  tone,
  to,
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  tone?: "red" | "amber" | "green";
  to?: string;
}) {
  const body = (
    <>
      <div className="crm-kpi__l">{label}</div>
      <div className="crm-kpi__v">{value}</div>
      {sub ? <div className="crm-kpi__s">{sub}</div> : null}
    </>
  );
  const cls = `crm-kpi${tone ? ` crm-kpi--${tone}` : ""}`;
  return to ? (
    <Link to={to} className={cls} style={{ color: "inherit", textDecoration: "none" }}>
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  );
}

export const SIGNAL_META: Record<SignalKind, { label: string; icon: IconName; tone: "" | "gold" | "red" | "green" | "purple" }> = {
  cert_expiring: { label: "Certificate expiring", icon: "i-badge", tone: "gold" },
  surveillance_due: { label: "Surveillance due", icon: "i-cal", tone: "" },
  calibration_due: { label: "Calibration due", icon: "i-gauge", tone: "" },
  compulsory_standard: { label: "New compulsory standard", icon: "i-file", tone: "purple" },
  tbt_notification: { label: "TBT notification", icon: "i-globe", tone: "purple" },
  abandoned_applicability: { label: "Abandoned journey", icon: "i-steps", tone: "gold" },
  standard_purchase: { label: "Standard bought, not certified", icon: "i-book", tone: "green" },
  nc_training: { label: "Nonconformity → training", icon: "i-cap", tone: "green" },
  inbound_enquiry: { label: "Inbound quote request", icon: "i-mail", tone: "green" },
  repeat_complaints: { label: "Repeat complaints (compliance)", icon: "i-shield", tone: "red" },
  lapsed_client: { label: "Lapsed client", icon: "i-trend-down", tone: "red" },
};

export function SignalIcon({ kind }: { kind: SignalKind }) {
  const m = SIGNAL_META[kind];
  return (
    <span className={`crm-signal__ic${m.tone ? ` crm-signal__ic--${m.tone}` : ""}`}>
      <Icon name={m.icon} />
    </span>
  );
}

export const STAGE_LABEL = {
  qualify: "Qualify",
  proposal: "Proposal",
  negotiation: "Negotiation",
  won: "Won",
  lost: "Lost",
} as const;

export const QUOTE_STATUS: Record<string, { label: string; tone: string }> = {
  draft: { label: "Draft", tone: "slate" },
  pending_approval: { label: "Awaiting approval", tone: "amber" },
  sent: { label: "Sent", tone: "navy" },
  accepted: { label: "Accepted", tone: "green" },
  declined: { label: "Declined", tone: "red" },
  expired: { label: "Expired", tone: "slate" },
};

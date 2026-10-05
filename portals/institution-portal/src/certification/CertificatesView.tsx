import { useEffect, useMemo, useState } from "react";
import { useApiResource } from "../hooks/useApiResource";
import { EmptyState, ResourceGate } from "../components/PageStates";
import { RequireStaff } from "../components/RequireStaff";
import { useInstitution } from "../layout/InstitutionLayout";
import type {
  CertificationCertificates,
  CertificationCertificatesResponse,
} from "../api/types";
import {
  AuthError,
  DataRow,
  useDialogs,
  ModuleHeader,
  RecordDrawer,
  Toolbar,
  Toast,
  type SummaryTile,
  type DataMetaItem,
  type DrawerSection,
  type DrawerAction,
} from "@eswasaone/shared-ui";
import {
  certificatePdf,
  registerAction,
  renewCertificate,
  revokeCertificate,
  verifyCertificate,
  type RegisterKind,
} from "./deskApi";
import { flowForScheme } from "./pipeline";

/** Certificates — issued certificates with verification. */

/** Expiry status for a certificate. */
type ExpiryKind = "valid" | "expiring" | "expired";

const EXPIRY_LABEL: Record<ExpiryKind, string> = {
  valid: "Valid",
  expiring: "Expiring soon",
  expired: "Expired",
};

/** Threshold (days) before expiry to flag "expiring soon". */
const EXPIRY_SOON_DAYS = 30;

function expiryFor(expires?: string | null): ExpiryKind {
  if (!expires) return "valid"; // TODO: wire real — some schemes are permanent.
  const t = Date.parse(expires);
  if (Number.isNaN(t)) return "valid";
  const now = Date.now();
  const days = (t - now) / 86_400_000;
  if (days < 0) return "expired";
  if (days <= EXPIRY_SOON_DAYS) return "expiring";
  return "valid";
}

function expirySla(expires?: string | null): "breach" | "due" | "ok" | undefined {
  const k = expiryFor(expires);
  if (k === "expired") return "breach";
  if (k === "expiring") return "due";
  return "ok";
}

function fmtDate(s?: string | null): string {
  if (!s) return "—";
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return s;
  return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

export function CertificatesView() {
  const { openAuth, user, sessionKey } = useInstitution();
  const {
    data,
    loading,
    refreshing, error,
    authRequired,
    reload,
  } = useApiResource<CertificationCertificatesResponse>(
    "/certification/certificates",
    { enabled: Boolean(user), refreshKey: sessionKey },
  );

  const [search, setSearch] = useState("");
  const [flash, setFlash] = useState<string | null>(null);
  const [openRef, setOpenRef] = useState<string | null>(null);
  const [standardFilter, setStandardFilter] = useState("");
  const [busy, setBusy] = useState(false);
  const dialogs = useDialogs();

  useEffect(() => {
    if (authRequired) openAuth("Staff sign-in required");
  }, [authRequired, openAuth]);

  const items = data?.items ?? [];

  const standards = useMemo(
    () => Array.from(new Set(items.map((c) => c.scheme))).sort(),
    [items],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items.filter((c) => {
      if (standardFilter && c.scheme !== standardFilter) return false;
      if (!q) return true;
      const hay = `${c.id} ${c.holder} ${c.scheme}`.toLowerCase();
      return hay.includes(q);
    });
  }, [items, search, standardFilter]);

  const selected = items.find((c) => c.id === openRef) ?? null;

  const activeCount = useMemo(
    () => items.filter((c) => expiryFor(c.expires) === "valid").length,
    [items],
  );
  const expiringCount = useMemo(
    () => items.filter((c) => expiryFor(c.expires) === "expiring").length,
    [items],
  );
  const expiredCount = useMemo(
    () => items.filter((c) => expiryFor(c.expires) === "expired").length,
    [items],
  );

  const summary: SummaryTile[] = [
    { label: "Total issued", value: items.length },
    { label: "Active", value: activeCount, variant: "ok" },
    { label: "Expiring soon", value: expiringCount, variant: "due" },
    { label: "Expired", value: expiredCount, variant: expiredCount ? "breach" : "ok" },
  ];

  async function guarded(fn: () => Promise<void>) {
    setBusy(true);
    try {
      await fn();
    } catch (err) {
      if (err instanceof AuthError && err.authRequired) openAuth(err.reason);
      else setFlash(err instanceof Error ? err.message : "Action failed");
    } finally {
      setBusy(false);
    }
  }

  function verify(c: CertificationCertificates) {
    void guarded(async () => {
      const res = await verifyCertificate(c.id);
      setFlash(res.valid ? `${c.id} verifies as valid${res.subject ? `: ${res.subject}` : ""}` : `${c.id} did not verify. Check the register.`);
    });
  }

  function download(c: CertificationCertificates) {
    void guarded(async () => {
      const url = await certificatePdf(c.id);
      if (url) window.open(url, "_blank", "noopener");
      else setFlash("Signed PDF not available yet (print format pending).");
    });
  }

  async function renew(c: CertificationCertificates) {
    const ok = await dialogs.confirm({
      title: `Renew ${c.id}?`,
      message: "Use after a successful recertification audit. A new 3-year cycle starts.",
      confirmLabel: "Renew",
    });
    if (!ok) return;
    void guarded(async () => {
      await renewCertificate(c.id);
      setFlash(`${c.id} renewed`);
      reload();
    });
  }

  async function changeStatus(c: CertificationCertificates, kind: RegisterKind) {
    const title =
      kind === "suspended" ? `Suspend ${c.id}?` : kind === "reduced" ? `Reduce scope of ${c.id}?` : `Withdraw ${c.id}?`;
    const reason = await dialogs.prompt({
      title,
      message:
        kind === "withdrawn"
          ? "Withdrawal revokes the certificate and publishes it on the register (CER_PR_026). The client may appeal within 90 days."
          : "Published on the public status register (CER_PR_026). The client may appeal within 90 days.",
      label: kind === "reduced" ? "Remaining scope, and the reason" : "Reason",
      confirmLabel: kind === "suspended" ? "Suspend" : kind === "reduced" ? "Reduce scope" : "Withdraw",
    });
    if (!reason) return;
    void guarded(async () => {
      if (kind === "withdrawn") await revokeCertificate(c.id);
      await registerAction(kind, {
        flow: flowForScheme(c.scheme),
        holder: c.holder,
        certificate: c.id,
        scope: kind === "reduced" ? reason : c.scheme,
        reason,
      });
      setFlash(`${c.id} ${kind === "reduced" ? "scope reduced" : kind}. The register is updated.`);
      reload();
    });
  }

  const drawerSections: DrawerSection[] = selected
    ? [
        {
          heading: "Certificate details",
          content: (
            <>
              <div className="kv">
                <b>Certificate no.</b>
                <span className="mono">{selected.id}</span>
              </div>
              <div className="kv">
                <b>Holder</b>
                <span>{selected.holder}</span>
              </div>
              <div className="kv">
                <b>Standard</b>
                <span>{selected.scheme}</span>
              </div>
              <div className="kv">
                <b>Issued</b>
                <span>{fmtDate(selected.issued)}</span>
              </div>
              <div className="kv">
                <b>Expires</b>
                <span>{fmtDate(selected.expires)}</span>
              </div>
              <div className="kv">
                <b>Status</b>
                <span className="stagechip">
                  {EXPIRY_LABEL[expiryFor(selected.expires)]}
                </span>
              </div>
            </>
          ),
        },
        {
          heading: "Scope",
          content: (
            <div className="kv">
              <b>Scope</b>
              <span>{selected.scheme}</span>
            </div>
          ),
        },
        {
          heading: "Accreditation",
          content: (
            <div className="kv">
              <b>Accreditation</b>
              <span>ESWASA accredited</span>
            </div>
          ),
        },
        {
          heading: "History",
          content: (
            <>
              <div className="kv">
                <b>Issued</b>
                <span>{fmtDate(selected.issued)}</span>
              </div>
              <div className="kv">
                <b>Last reviewed</b>
                <span>{fmtDate(selected.issued)}</span>
              </div>
              <div className="kv">
                <b>Expires</b>
                <span>{fmtDate(selected.expires)}</span>
              </div>
            </>
          ),
        },
      ]
    : [];

  const drawerActions: DrawerAction[] = selected
    ? [
        { label: "Verify", icon: "i-shield-c", variant: "gold", onClick: () => verify(selected), disabled: busy },
        { label: "PDF", icon: "i-download", variant: "pri", onClick: () => download(selected), disabled: busy },
        { label: "Renew", variant: "ghost", onClick: () => void renew(selected), disabled: busy },
        { label: "Suspend", variant: "ghost", onClick: () => void changeStatus(selected, "suspended"), disabled: busy },
        { label: "Reduce scope", variant: "ghost", onClick: () => void changeStatus(selected, "reduced"), disabled: busy },
        { label: "Withdraw", variant: "ghost", onClick: () => void changeStatus(selected, "withdrawn"), disabled: busy },
        { label: "Close", variant: "ghost", onClick: () => setOpenRef(null) },
      ]
    : [];

  return (
    <RequireStaff reason="Staff sign-in required">
      <ResourceGate
        loading={loading}
        refreshing={refreshing}
        error={error}
        onRetry={reload}
        hasData={data != null}
        skeleton="list"
        label="Loading certificates…"
      >
        <>
          <ModuleHeader
            title="Certificates"
            subtitle="Issued certificates with QR verification."
            summary={summary}
          />

          <Toolbar
            filters={[
              {
                label: "Filter certificates by standard",
                value: standardFilter,
                options: ["All standards", ...standards],
                onChange: (v) => setStandardFilter(v === "All standards" ? "" : v),
              },
            ]}
            search={{
              value: search,
              onChange: setSearch,
              placeholder: "Search holder or certificate ID…",
            }}
          />

          {dialogs.host}
          <Toast message={flash} />

          {filtered.length === 0 ? (
            <EmptyState
              title={items.length ? "No certificates match" : "Nothing here yet"}
              detail={
                items.length
                  ? "Adjust the search above."
                  : "Certificates will appear once they are issued."
              }
            />
          ) : (
            <div className="data-list">
              {filtered.map((c) => {
                const ex = expiryFor(c.expires);
                const sla = expirySla(c.expires);
                const meta: DataMetaItem[] = [
                  { label: c.scheme, tag: true },
                  { label: `Issued ${fmtDate(c.issued)}` },
                  { label: `Expires ${fmtDate(c.expires)}` },
                  { label: EXPIRY_LABEL[ex], sla: sla },
                ];
                return (
                  <DataRow
                    key={c.id}
                    icon="i-award"
                    iconVariant="green"
                    title={c.holder}
                    badge={c.id}
                    meta={meta}
                    onOpen={() => setOpenRef(c.id)}
                  />
                );
              })}
            </div>
          )}

          <RecordDrawer
            open={!!selected}
            onClose={() => setOpenRef(null)}
            reference={selected?.id}
            title={selected?.holder ?? ""}
            subtitle={
              selected ? (
                <span className="stagechip">
                  {EXPIRY_LABEL[expiryFor(selected.expires)]}
                </span>
              ) : null
            }
            sections={drawerSections}
            actions={drawerActions}
          />
        </>
      </ResourceGate>
    </RequireStaff>
  );
}
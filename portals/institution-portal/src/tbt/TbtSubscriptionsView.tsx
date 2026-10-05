import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useApiResource } from "../hooks/useApiResource";
import { EmptyState, ResourceGate } from "../components/PageStates";
import { RequireStaff } from "../components/RequireStaff";
import { useInstitution } from "../layout/InstitutionLayout";
import {
  DataRow,
  ModuleHeader,
  RecordDrawer,
  Toast,
  type DataMetaItem,
  type DrawerAction,
  type DrawerSection,
  type SummaryTile,
} from "@eswasaone/shared-ui";
import { apiFetch, AuthError, Icon } from "@eswasaone/shared-ui";
import type {
  TbtSubscriptionsResponse,
  TbtSubscription,
} from "../api/types";
import { fmtDate, KvGrid, readStr } from "./sub-views";

/** Subscriptions — TBT alert subscriptions with create form and record drawer. */

/** Split a comma-separated string into trimmed, non-empty tokens. */
function splitCsv(value: string): string[] {
  return value
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);
}

function joinCsv(arr?: string[] | null): string {
  return arr?.filter(Boolean).join(", ") ?? "";
}

/** Subscription state for summary. */
type SubState = "active" | "paused" | "expired";

function stateFor(sub: TbtSubscription): SubState {
  const s = sub as unknown as { [k: string]: unknown };
  const status = readStr(s, "status")?.toLowerCase();
  if (status?.includes("pause")) return "paused";
  if (status?.includes("expir")) return "expired";
  return sub.active ? "active" : "paused";
}

/** stagechip colour pairs for subscription states. */
const STATE_CHIPS: Record<SubState, { bg: string; fg: string; label: string }> = {
  active: { bg: "var(--green-l)", fg: "#166534", label: "Active" },
  paused: { bg: "var(--amber-l)", fg: "#92400e", label: "Paused" },
  expired: { bg: "var(--bg)", fg: "var(--muted)", label: "Expired" },
};

export function TbtSubscriptionsView() {
  const { openAuth, user, sessionKey } = useInstitution();
  const {
    data,
    loading,
    refreshing, error,
    authRequired,
    reload,
  } = useApiResource<TbtSubscriptionsResponse>("/tbt/subscriptions", {
    enabled: Boolean(user),
    refreshKey: sessionKey,
  });

  const [email, setEmail] = useState("");
  const [countries, setCountries] = useState("");
  const [sectors, setSectors] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);
  const [selected, setSelected] = useState<TbtSubscription | null>(null);

  useEffect(() => {
    if (authRequired) openAuth("Staff sign-in required");
  }, [authRequired, openAuth]);

  const items = data?.items ?? [];

  const sorted = useMemo(
    () =>
      items
        .slice()
        .sort((a, b) => (a.active === b.active ? 0 : a.active ? -1 : 1)),
    [items],
  );

  const summary: SummaryTile[] = useMemo(() => {
    let active = 0;
    let paused = 0;
    let expired = 0;
    for (const sub of items) {
      const st = stateFor(sub);
      if (st === "active") active++;
      else if (st === "paused") paused++;
      else expired++;
    }
    return [
      { label: "Total", value: items.length },
      { label: "Active", value: active, variant: "ok" },
      { label: "Paused", value: paused, variant: "due" },
      { label: "Expired", value: expired, variant: expired ? "breach" : "ok" },
    ];
  }, [items]);

  function flashMsg(_kind: "ok" | "err", msg: string) {
    setFlash(msg);
  }

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const trimmedEmail = email.trim();
    if (!trimmedEmail) {
      flashMsg("err", "Email is required.");
      return;
    }
    const countryList = splitCsv(countries);
    const sectorList = splitCsv(sectors);
    setSubmitting(true);
    setFlash(null);
    try {
      // Contract requires `confirm`; pass sector/hs_code/jurisdiction-mapped fields.
      // TODO: wire real — map countries/sectors to hs_code/jurisdiction once backend expands.
      const body = {
        email: trimmedEmail,
        sector: sectorList.join(","),
        jurisdiction: countryList.join(","),
        confirm: true,
      };
      await apiFetch<{ ok: boolean; id?: string }>("/tbt/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      flashMsg("ok", "Subscription created. Check your inbox to confirm.");
      setEmail("");
      setCountries("");
      setSectors("");
      reload();
    } catch (err: unknown) {
      if (err instanceof AuthError && err.authRequired) {
        openAuth(err.reason);
        flashMsg("err", "Sign in required to manage subscriptions.");
      } else {
        flashMsg(
          "err",
          err instanceof Error ? err.message : "Failed to create subscription.",
        );
      }
    } finally {
      setSubmitting(false);
    }
  }

  const drawerSections: DrawerSection[] = useMemo(() => {
    if (!selected) return [];
    const s = selected as unknown as { [k: string]: unknown };
    const st = stateFor(selected);
    const chip = STATE_CHIPS[st];
    return [
      {
        heading: "Subscription details",
        content: (
          <KvGrid
            rows={[
              { label: "Email", value: selected.email },
              { label: "ID", value: selected.id },
              {
                label: "Status",
                value: (
                  <span className="stagechip" style={{ background: chip.bg, color: chip.fg }}>
                    <span className="d" style={{ background: chip.fg }} />
                    {chip.label}
                  </span>
                ),
              },
            ]}
          />
        ),
      },
      {
        heading: "Categories",
        content: (
          <KvGrid
            rows={[
              { label: "Countries", value: joinCsv(selected.countries) || "—" },
              { label: "Sectors", value: joinCsv(selected.sectors) || "—" },
            ]}
          />
        ),
      },
      {
        heading: "Contact & preferences",
        content: (
          <KvGrid
            rows={[
              { label: "Contact", value: readStr(s, "contact") ?? selected.email },
              { label: "Notification prefs", value: readStr(s, "notification_prefs") ?? readStr(s, "prefs") ?? "Email" },
              { label: "Last notification", value: fmtDate(readStr(s, "last_notification") ?? readStr(s, "last_sent")) },
            ]}
          />
        ),
      },
    ];
  }, [selected]);

  const drawerActions: DrawerAction[] = useMemo(
    () =>
      selected
        ? [
            {
              label: "Pause",
              icon: "i-lock",
              variant: "gold",
              onClick: () => flashMsg("ok", `Pausing ${selected.email} (TODO: wire real)`),
            },
            {
              label: "Close",
              variant: "ghost",
              onClick: () => setSelected(null),
            },
          ]
        : [],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [selected],
  );

  return (
    <RequireStaff reason="Staff sign-in required">
      <ResourceGate
        loading={loading}
        refreshing={refreshing}
        error={error}
        onRetry={reload}
        hasData={data != null}
        skeleton="list"
        label="Loading subscriptions…"
      >
        <>
          <ModuleHeader
            title="Subscriptions"
            subtitle="Manage TBT alert subscriptions by sector and country."
            summary={summary}
          />

          <Toast message={flash} />

          <div
            style={{
              display: "grid",
              gap: 20,
              gridTemplateColumns: "minmax(320px, 1fr) minmax(320px, 1.2fr)",
              alignItems: "start",
            }}
          >
            {/* New subscription form */}
            <form className="panel" onSubmit={handleSubmit} style={{ padding: 18 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
                <Icon name="i-plus" />
                <h3 style={{ margin: 0, fontSize: 15, fontWeight: 800 }}>
                  New subscription
                </h3>
              </div>

              <label style={{ display: "block", marginBottom: 10 }}>
                <span style={{ display: "block", fontSize: 12, marginBottom: 4, color: "var(--muted-2)" }}>
                  Email
                </span>
                <input
                  type="email"
                  className="inp"
                  placeholder="name@institution.org"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  aria-label="Subscriber email"
                  required
                />
              </label>

              <label style={{ display: "block", marginBottom: 10 }}>
                <span style={{ display: "block", fontSize: 12, marginBottom: 4, color: "var(--muted-2)" }}>
                  Countries (comma-separated)
                </span>
                <input
                  type="text"
                  className="inp"
                  placeholder="e.g. Eswatini, South Africa, Kenya"
                  value={countries}
                  onChange={(e) => setCountries(e.target.value)}
                  aria-label="Countries"
                />
              </label>

              <label style={{ display: "block", marginBottom: 14 }}>
                <span style={{ display: "block", fontSize: 12, marginBottom: 4, color: "var(--muted-2)" }}>
                  Sectors (comma-separated)
                </span>
                <input
                  type="text"
                  className="inp"
                  placeholder="e.g. Food, Textiles, Chemicals"
                  value={sectors}
                  onChange={(e) => setSectors(e.target.value)}
                  aria-label="Sectors"
                />
              </label>

              <button
                type="submit"
                className="btn gold"
                disabled={submitting}
              >
                <Icon name="i-send" />
                {submitting ? "Subscribing…" : "Subscribe"}
              </button>
            </form>

            {/* Existing subscriptions */}
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {sorted.length === 0 ? (
                <EmptyState
                  title="No subscriptions yet"
                  detail="Create your first subscription using the form on the left."
                />
              ) : (
                <div className="data-list">
                  {sorted.map((sub: TbtSubscription) => {
                    const st = stateFor(sub);
                    const chip = STATE_CHIPS[st];
                    const s = sub as unknown as { [k: string]: unknown };
                    const meta: DataMetaItem[] = [
                      { label: joinCsv(sub.countries) || "All countries", tag: true },
                      { label: joinCsv(sub.sectors) || "All sectors" },
                      { label: fmtDate(readStr(s, "last_notification") ?? readStr(s, "last_sent")) },
                      { label: chip.label, sla: st === "active" ? "ok" : st === "paused" ? "due" : "breach" },
                    ];
                    return (
                      <DataRow
                        key={sub.id}
                        icon="i-mail"
                        iconVariant={st === "active" ? "green" : st === "paused" ? "amber" : "navy"}
                        title={sub.email}
                        badge={sub.id}
                        meta={meta}
                        onOpen={() => setSelected(sub)}
                      />
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          <RecordDrawer
            open={Boolean(selected)}
            onClose={() => setSelected(null)}
            reference={selected?.id}
            title={selected?.email ?? ""}
            subtitle={
              selected ? (
                <span className="stagechip" style={{ background: STATE_CHIPS[stateFor(selected)].bg, color: STATE_CHIPS[stateFor(selected)].fg }}>
                  <span className="d" style={{ background: STATE_CHIPS[stateFor(selected)].fg }} />
                  {STATE_CHIPS[stateFor(selected)].label}
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
/** System Admin — Access Security (LAN CIDRs + device allowlist for /institution). */
import { useEffect, useState, type FormEvent } from "react";
import { apiFetch, AuthError, Icon, useDialogs } from "@eswasaone/shared-ui";
import type {
  AdminAccessDevice,
  AdminAccessDevicesResponse,
  AdminAccessEvaluateResult,
  AdminAccessEvent,
  AdminAccessEventsResponse,
  AdminAccessNetwork,
  AdminAccessNetworksResponse,
  AdminAccessPolicy,
} from "../api/types";
import { useApiResource } from "../hooks/useApiResource";
import { EmptyState, ErrorState, LoadingState } from "../components/PageStates";

type StatusKind = "ok" | "warn" | "err" | "info";

function StatusPill({ status, label }: { status: StatusKind | string; label?: string }) {
  const kind =
    status === "ok" || status === "approved" || status === "allow"
      ? "ok"
      : status === "warn" || status === "pending"
        ? "warn"
        : status === "err" || status === "deny" || status === "revoked" || status === "expired"
          ? "err"
          : "info";
  const text = label ?? String(status);
  return (
    <span className={`admin-st admin-st--${kind}`}>
      <span className="admin-st__d" />
      {text}
    </span>
  );
}

type Props = {
  enabled: boolean;
  refreshKey: string | number;
  onFlash: (msg: string) => void;
  onAuthRequired: () => void;
};

export function AccessSecurityTab({ enabled, refreshKey, onFlash, onAuthRequired }: Props) {
  const dialogs = useDialogs();
  const policyRes = useApiResource<AdminAccessPolicy>("/admin/access/policy", {
    enabled,
    refreshKey,
  });
  const networksRes = useApiResource<AdminAccessNetworksResponse>("/admin/access/networks", {
    enabled,
    refreshKey,
  });
  const devicesRes = useApiResource<AdminAccessDevicesResponse>("/admin/access/devices", {
    enabled,
    refreshKey,
  });
  const eventsRes = useApiResource<AdminAccessEventsResponse>("/admin/access/events?limit=40", {
    enabled,
    refreshKey,
  });

  const [policyForm, setPolicyForm] = useState<AdminAccessPolicy | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [evalIp, setEvalIp] = useState("");
  const [evalFp, setEvalFp] = useState("");
  const [evalResult, setEvalResult] = useState<AdminAccessEvaluateResult | null>(null);

  const [netLabel, setNetLabel] = useState("");
  const [netCidr, setNetCidr] = useState("");
  const [devLabel, setDevLabel] = useState("");
  const [devFp, setDevFp] = useState("");
  const [devOwner, setDevOwner] = useState("");

  useEffect(() => {
    if (policyRes.data) setPolicyForm(policyRes.data);
  }, [policyRes.data]);

  const handleErr = (err: unknown, fallback: string) => {
    if (err instanceof AuthError) {
      onAuthRequired();
      return;
    }
    onFlash(err instanceof Error ? err.message : fallback);
  };

  const savePolicy = async () => {
    if (!policyForm) return;
    const ok = await dialogs.confirm({
      title: "Save access policy",
      message: policyForm.enforce_off_lan
        ? "Turn on off-network enforcement?\n\nDevices outside trusted networks that are not on the allowlist will be blocked from the institution portal."
        : "Save the access security policy?\n\nChanges apply to staff sign-in checks.",
      confirmLabel: "Save policy",
      danger: Boolean(policyForm.enforce_off_lan),
    });
    if (!ok) {
      return;
    }
    setBusy("policy");
    try {
      const saved = await apiFetch<AdminAccessPolicy>("/admin/access/policy", {
        method: "PUT",
        body: JSON.stringify({ confirm: true, policy: policyForm }),
      });
      setPolicyForm(saved);
      policyRes.reload();
      onFlash("Access policy saved");
    } catch (err) {
      handleErr(err, "Failed to save policy");
    } finally {
      setBusy(null);
    }
  };

  const addNetwork = async (e: FormEvent) => {
    e.preventDefault();
    if (!netLabel.trim() || !netCidr.trim()) return;
    const ok = await dialogs.confirm({
      title: "Add trusted network",
      message: `Add trusted network ${netCidr.trim()}?\n\nStaff on this network will be treated as on-site.`,
      confirmLabel: "Add network",
    });
    if (!ok) return;
    setBusy("net-add");
    try {
      await apiFetch<AdminAccessNetwork>("/admin/access/networks", {
        method: "POST",
        body: JSON.stringify({
          confirm: true,
          label: netLabel.trim(),
          cidr: netCidr.trim(),
          enabled: true,
        }),
      });
      setNetLabel("");
      setNetCidr("");
      networksRes.reload();
      onFlash("Network added");
    } catch (err) {
      handleErr(err, "Failed to add network");
    } finally {
      setBusy(null);
    }
  };

  const removeNetwork = async (id: string, label: string) => {
    const ok = await dialogs.confirm({
      title: "Remove trusted network",
      message: `Remove trusted network “${label}”?\n\nStaff on that network may need an approved device to keep access.`,
      confirmLabel: "Remove",
      danger: true,
    });
    if (!ok) return;
    setBusy(`net-${id}`);
    try {
      await apiFetch(`/admin/access/networks/${encodeURIComponent(id)}?confirm=true`, {
        method: "DELETE",
      });
      networksRes.reload();
      onFlash("Network removed");
    } catch (err) {
      handleErr(err, "Failed to remove network");
    } finally {
      setBusy(null);
    }
  };

  const addDevice = async (e: FormEvent) => {
    e.preventDefault();
    if (!devLabel.trim() || !devFp.trim()) return;
    const ok = await dialogs.confirm({
      title: "Approve device",
      message: `Register device “${devLabel.trim()}” as approved?\n\nThat device will be allowed to use the institution portal.`,
      confirmLabel: "Approve device",
    });
    if (!ok) return;
    setBusy("dev-add");
    try {
      await apiFetch<AdminAccessDevice>("/admin/access/devices", {
        method: "POST",
        body: JSON.stringify({
          confirm: true,
          label: devLabel.trim(),
          fingerprint: devFp.trim(),
          owner_username: devOwner.trim() || null,
          status: "approved",
        }),
      });
      setDevLabel("");
      setDevFp("");
      setDevOwner("");
      devicesRes.reload();
      onFlash("Device registered");
    } catch (err) {
      handleErr(err, "Failed to register device");
    } finally {
      setBusy(null);
    }
  };

  const setDeviceStatus = async (
    id: string,
    status: AdminAccessDevice["status"],
    label: string,
  ) => {
    const ok = await dialogs.confirm({
      title: "Update device",
      message: `Set device “${label}” to ${status}?`,
      confirmLabel: "Update",
      danger: status === "revoked",
    });
    if (!ok) return;
    setBusy(`dev-${id}`);
    try {
      await apiFetch(`/admin/access/devices/${encodeURIComponent(id)}`, {
        method: "PATCH",
        body: JSON.stringify({ confirm: true, status }),
      });
      devicesRes.reload();
      onFlash(`Device ${status}`);
    } catch (err) {
      handleErr(err, "Failed to update device");
    } finally {
      setBusy(null);
    }
  };

  const runEvaluate = async () => {
    setBusy("eval");
    try {
      const res = await apiFetch<AdminAccessEvaluateResult>("/admin/access/evaluate", {
        method: "POST",
        body: JSON.stringify({
          ip: evalIp.trim() || null,
          fingerprint: evalFp.trim() || null,
          record: true,
        }),
      });
      setEvalResult(res);
      eventsRes.reload();
    } catch (err) {
      handleErr(err, "Evaluate failed");
    } finally {
      setBusy(null);
    }
  };

  if (policyRes.loading && !policyForm) return <LoadingState label="Loading access security…" />;
  if (policyRes.error) return <ErrorState message={policyRes.error} onRetry={policyRes.reload} />;

  const networks = networksRes.data?.items ?? [];
  const devices = devicesRes.data?.items ?? [];
  const events = eventsRes.data?.items ?? [];

  return (
    <div className="admin-access">
      <p className="admin-note" style={{ marginBottom: 16 }}>
        Controls who may open <code>/institution</code> from outside Eswasa LAN/WAN. Trusted
        networks skip the device check; off-LAN clients need an approved device. Enforcement is
        configured here; wire nginx <code>auth_request</code> to{" "}
        <code>GET /api/auth/institution-access</code> before turning on{" "}
        <strong>Enforce off-LAN</strong>.
      </p>

      <div className="row c2" style={{ marginBottom: 16 }}>
        <div className="panel" style={{ padding: 0 }}>
          <div className="admin-card-h">
            <span className="admin-ic">
              <Icon name="i-lock" />
            </span>
            <b>Policy</b>
            <span style={{ marginLeft: "auto" }}>
              <button
                type="button"
                className="btn-ghost"
                style={{ minHeight: 32, padding: "0 12px", fontSize: 12 }}
                disabled={busy === "policy" || !policyForm}
                onClick={() => void savePolicy()}
              >
                {busy === "policy" ? "Saving…" : "Save"}
              </button>
            </span>
          </div>
          {policyForm ? (
            <div style={{ padding: "8px 18px 18px" }}>
              <div className="admin-kv">
                <span className="admin-kv__k">Enforce off-LAN</span>
                <span className="admin-kv__r">
                  <button
                    type="button"
                    className={`admin-tog${policyForm.enforce_off_lan ? " on" : ""}`}
                    aria-pressed={policyForm.enforce_off_lan}
                    onClick={() =>
                      setPolicyForm((p) =>
                        p ? { ...p, enforce_off_lan: !p.enforce_off_lan } : p,
                      )
                    }
                  />
                </span>
              </div>
              <div className="admin-kv">
                <span className="admin-kv__k">Fail closed</span>
                <span className="admin-kv__r">
                  <button
                    type="button"
                    className={`admin-tog${policyForm.fail_closed ? " on" : ""}`}
                    aria-pressed={policyForm.fail_closed}
                    onClick={() =>
                      setPolicyForm((p) => (p ? { ...p, fail_closed: !p.fail_closed } : p))
                    }
                  />
                </span>
              </div>
              <div className="admin-kv">
                <span className="admin-kv__k">Deny redirect</span>
                <span className="admin-kv__r">
                  <input
                    className="admin-in"
                    value={policyForm.redirect_path}
                    onChange={(e) =>
                      setPolicyForm((p) => (p ? { ...p, redirect_path: e.target.value } : p))
                    }
                  />
                </span>
              </div>
              <div className="admin-kv">
                <span className="admin-kv__k">Notes</span>
                <span className="admin-kv__r">
                  <input
                    className="admin-in"
                    value={policyForm.notes ?? ""}
                    onChange={(e) =>
                      setPolicyForm((p) => (p ? { ...p, notes: e.target.value || null } : p))
                    }
                  />
                </span>
              </div>
              <StatusPill
                status={policyForm.enforce_off_lan ? "warn" : "ok"}
                label={policyForm.enforce_off_lan ? "enforcing when edge wired" : "not enforced"}
              />
            </div>
          ) : null}
        </div>

        <div className="panel" style={{ padding: 0 }}>
          <div className="admin-card-h">
            <span className="admin-ic">
              <Icon name="i-search" />
            </span>
            <b>Test access</b>
            <span style={{ marginLeft: "auto" }}>
              <button
                type="button"
                className="btn-ghost"
                style={{ minHeight: 32, padding: "0 12px", fontSize: 12 }}
                disabled={busy === "eval"}
                onClick={() => void runEvaluate()}
              >
                {busy === "eval" ? "…" : "Evaluate"}
              </button>
            </span>
          </div>
          <div style={{ padding: "8px 18px 18px" }}>
            <div className="admin-kv">
              <span className="admin-kv__k">Client IP</span>
              <span className="admin-kv__r">
                <input
                  className="admin-in"
                  placeholder="e.g. 41.x.x.x"
                  value={evalIp}
                  onChange={(e) => setEvalIp(e.target.value)}
                />
              </span>
            </div>
            <div className="admin-kv">
              <span className="admin-kv__k">Device fingerprint</span>
              <span className="admin-kv__r">
                <input
                  className="admin-in"
                  placeholder="token / cert fp"
                  value={evalFp}
                  onChange={(e) => setEvalFp(e.target.value)}
                />
              </span>
            </div>
            {evalResult ? (
              <div style={{ marginTop: 10 }}>
                <StatusPill
                  status={evalResult.allowed ? "allow" : "deny"}
                  label={evalResult.allowed ? `allow · ${evalResult.reason}` : `deny · ${evalResult.reason}`}
                />
                <p style={{ fontSize: 12, color: "var(--muted)", marginTop: 8 }}>
                  Trusted net: {evalResult.on_trusted_network ? "yes" : "no"}
                  {evalResult.device_status ? ` · device ${evalResult.device_status}` : ""}
                  {" · "}redirect {evalResult.redirect_path}
                </p>
              </div>
            ) : (
              <p style={{ fontSize: 12, color: "var(--muted)", marginTop: 8 }}>
                Leave blank to use this request’s IP / device cookie.
              </p>
            )}
          </div>
        </div>
      </div>

      <div className="panel" style={{ padding: 0, marginBottom: 16 }}>
        <div className="admin-card-h">
          <span className="admin-ic">
            <Icon name="i-globe" />
          </span>
          <b>Trusted networks (LAN / WAN)</b>
        </div>
        <div style={{ padding: "12px 18px 18px" }}>
          <form className="btn-row" style={{ marginBottom: 12, flexWrap: "wrap", gap: 8 }} onSubmit={addNetwork}>
            <input
              className="admin-in"
              style={{ minWidth: 160 }}
              placeholder="Label"
              value={netLabel}
              onChange={(e) => setNetLabel(e.target.value)}
            />
            <input
              className="admin-in"
              style={{ minWidth: 160 }}
              placeholder="CIDR e.g. 196.x.x.0/24"
              value={netCidr}
              onChange={(e) => setNetCidr(e.target.value)}
            />
            <button type="submit" className="btn-ghost" style={{ minHeight: 32, fontSize: 12 }} disabled={busy === "net-add"}>
              Add network
            </button>
          </form>
          {networksRes.loading ? (
            <LoadingState label="Loading networks…" />
          ) : networks.length === 0 ? (
            <EmptyState title="No trusted networks" />
          ) : (
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Label</th>
                  <th>CIDR</th>
                  <th>Status</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {networks.map((n) => (
                  <tr key={n.id}>
                    <td className="name">{n.label}</td>
                    <td className="admin-code">{n.cidr}</td>
                    <td>
                      <StatusPill status={n.enabled ? "ok" : "warn"} label={n.enabled ? "enabled" : "disabled"} />
                    </td>
                    <td>
                      <button
                        type="button"
                        className="btn-ghost"
                        style={{ minHeight: 28, fontSize: 11, padding: "0 10px" }}
                        disabled={busy === `net-${n.id}`}
                        onClick={() => void removeNetwork(n.id, n.label)}
                      >
                        Remove
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      <div className="panel" style={{ padding: 0, marginBottom: 16 }}>
        <div className="admin-card-h">
          <span className="admin-ic">
            <Icon name="i-monitor" />
          </span>
          <b>Device allowlist</b>
        </div>
        <div style={{ padding: "12px 18px 18px" }}>
          <form className="btn-row" style={{ marginBottom: 12, flexWrap: "wrap", gap: 8 }} onSubmit={addDevice}>
            <input
              className="admin-in"
              style={{ minWidth: 140 }}
              placeholder="Device label"
              value={devLabel}
              onChange={(e) => setDevLabel(e.target.value)}
            />
            <input
              className="admin-in"
              style={{ minWidth: 180 }}
              placeholder="Fingerprint / token"
              value={devFp}
              onChange={(e) => setDevFp(e.target.value)}
            />
            <input
              className="admin-in"
              style={{ minWidth: 140 }}
              placeholder="Owner username"
              value={devOwner}
              onChange={(e) => setDevOwner(e.target.value)}
            />
            <button type="submit" className="btn-ghost" style={{ minHeight: 32, fontSize: 12 }} disabled={busy === "dev-add"}>
              Approve device
            </button>
          </form>
          {devicesRes.loading ? (
            <LoadingState label="Loading devices…" />
          ) : devices.length === 0 ? (
            <EmptyState title="No devices registered" />
          ) : (
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Device</th>
                  <th>Owner</th>
                  <th>Fingerprint</th>
                  <th>Status</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {devices.map((d) => (
                  <tr key={d.id}>
                    <td className="name">{d.label}</td>
                    <td>{d.owner_username ?? "—"}</td>
                    <td className="admin-code" style={{ maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis" }}>
                      {d.fingerprint}
                    </td>
                    <td>
                      <StatusPill status={d.status} label={d.status} />
                    </td>
                    <td className="btn-row" style={{ gap: 4 }}>
                      {d.status !== "approved" ? (
                        <button
                          type="button"
                          className="btn-ghost"
                          style={{ minHeight: 28, fontSize: 11, padding: "0 8px" }}
                          disabled={busy === `dev-${d.id}`}
                          onClick={() => void setDeviceStatus(d.id, "approved", d.label)}
                        >
                          Approve
                        </button>
                      ) : null}
                      {d.status !== "revoked" ? (
                        <button
                          type="button"
                          className="btn-ghost"
                          style={{ minHeight: 28, fontSize: 11, padding: "0 8px" }}
                          disabled={busy === `dev-${d.id}`}
                          onClick={() => void setDeviceStatus(d.id, "revoked", d.label)}
                        >
                          Revoke
                        </button>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      <div className="panel" style={{ padding: 0 }}>
        <div className="admin-card-h">
          <span className="admin-ic">
            <Icon name="i-clipboard" />
          </span>
          <b>Access events</b>
          <span style={{ marginLeft: "auto" }}>
            <StatusPill status="info" label={`${events.length} recent`} />
          </span>
        </div>
        <div style={{ padding: "8px 18px 18px" }}>
          {eventsRes.loading ? (
            <LoadingState label="Loading events…" />
          ) : events.length === 0 ? (
            <EmptyState title="No access events yet" />
          ) : (
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Time</th>
                  <th>Outcome</th>
                  <th>Reason</th>
                  <th>IP</th>
                  <th>User</th>
                </tr>
              </thead>
              <tbody>
                {events.map((ev: AdminAccessEvent) => (
                  <tr key={ev.id}>
                    <td className="admin-code">{ev.time}</td>
                    <td>
                      <StatusPill status={ev.outcome} label={ev.outcome} />
                    </td>
                    <td>{ev.reason}</td>
                    <td className="admin-code">{ev.ip ?? "—"}</td>
                    <td>{ev.username ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}

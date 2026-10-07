import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import { useSearchParams } from "react-router-dom";
import {
  apiFetch,
  AuthError,
  Icon,
  inviteStaff,
  RecordDrawer,
  useDialogs,
  type IconName,
  type InviteStaffRequest,
  Select,
} from "@eswasaone/shared-ui";
import type {
  AdminBackupsResponse,
  AdminCommandResult,
  AdminEmailSettings,
  AdminIntegrationsResponse,
  AdminJobsSnapshot,
  AdminLogsResponse,
  AdminOverview,
  AdminSchedulerResponse,
  AdminSystemSettings,
  AdminUpdatesResponse,
  AdminUserSummary,
  AdminUsersResponse,
} from "../api/types";
import { useApiResource } from "../hooks/useApiResource";
import { EmptyState, ErrorState, LoadingState, PageHeader } from "../components/PageStates";
import { CompanyProfilePanel } from "../components/CompanyProfilePanel";
import { RequireStaff } from "../components/RequireStaff";
import { useInstitution } from "../layout/InstitutionLayout";
import { AccessSecurityTab } from "../admin/AccessSecurityTab";

type TabId =
  | "overview"
  | "updates"
  | "company"
  | "settings"
  | "access"
  | "users"
  | "automation"
  | "backups"
  | "logs"
  | "integrations";

const TABS: { id: TabId; label: string; icon: IconName }[] = [
  { id: "overview", label: "Overview", icon: "i-monitor" },
  { id: "updates", label: "Updates", icon: "i-refresh" },
  { id: "company", label: "Company", icon: "i-building" },
  { id: "settings", label: "Settings", icon: "i-sliders" },
  { id: "access", label: "Access Security", icon: "i-lock" },
  { id: "users", label: "Users & Roles", icon: "i-users" },
  { id: "automation", label: "Automation", icon: "i-clock" },
  { id: "backups", label: "Data & Backups", icon: "i-download" },
  { id: "logs", label: "Logs", icon: "i-clipboard" },
  { id: "integrations", label: "Integrations", icon: "i-link" },
];

const INVITE_ROLE_OPTIONS = [
  "ESWASA Staff",
  "Desk User",
  "System Manager",
  "Certification Officer",
  "Accounts User",
  "HR User",
  "Sales User",
];

type StatusKind = "ok" | "warn" | "err" | "info" | "current" | "update" | "unknown";

function StatusPill({ status, label }: { status: StatusKind | string; label?: string }) {
  const kind =
    status === "current" || status === "ok"
      ? "ok"
      : status === "update" || status === "warn"
        ? "warn"
        : status === "err"
          ? "err"
          : "info";
  const text =
    label ??
    (status === "current"
      ? "current"
      : status === "update"
        ? "update"
        : status === "unknown"
          ? "unknown"
          : status);
  return (
    <span className={`admin-st admin-st--${kind}`}>
      <span className="admin-st__d" />
      {text}
    </span>
  );
}

function Flash({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <p style={{ margin: "0 0 14px", fontSize: 13, color: "var(--navy)", fontWeight: 600 }}>
      {message}
    </p>
  );
}

export function SystemAdminPage() {
  const { openAuth, user, sessionKey } = useInstitution();
  const dialogs = useDialogs();
  const [searchParams] = useSearchParams();
  const initialTab = (searchParams.get("tab") as TabId | null) || "overview";
  const [tab, setTab] = useState<TabId>(
    TABS.some((t) => t.id === initialTab) ? initialTab : "overview",
  );
  const [flash, setFlash] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [consoleLines, setConsoleLines] = useState<string[]>([]);
  const [consoleStatus, setConsoleStatus] = useState<"idle" | "running" | "done" | "error">("idle");
  const [logKind, setLogKind] = useState<"error" | "activity">("error");
  const [showInvite, setShowInvite] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteName, setInviteName] = useState("");
  const [inviteRole, setInviteRole] = useState(INVITE_ROLE_OPTIONS[0]);
  const [inviteBusy, setInviteBusy] = useState(false);
  const [inviteErr, setInviteErr] = useState<string | null>(null);
  const [inviteMsg, setInviteMsg] = useState<string | null>(null);

  const [sysForm, setSysForm] = useState<AdminSystemSettings>({});
  const [updateOpts, setUpdateOpts] = useState({
    channel: "stable",
    backup_before: true,
    migrate: true,
    maintenance: true,
  });

  // User role management drawer
  const [editUser, setEditUser] = useState<string | null>(null);
  const [userDetail, setUserDetail] = useState<{
    user: AdminUserSummary;
    roles: string[];
  } | null>(null);
  const [availableRoles, setAvailableRoles] = useState<string[]>([]);
  const [roleProfiles, setRoleProfiles] = useState<
    Array<{ name: string; audience: string; summary: string; roles: string[] }>
  >([]);
  const [roleBusy, setRoleBusy] = useState<string | null>(null);

  const isSysAdmin = useMemo(() => {
    const roles = new Set(user?.roles ?? []);
    return roles.has("System Manager") || roles.has("Administrator");
  }, [user]);

  const enabled = Boolean(user) && isSysAdmin;

  const overview = useApiResource<AdminOverview>("/admin/overview", {
    enabled: enabled && (tab === "overview" || tab === "updates"),
    refreshKey: `${sessionKey}:${tab}`,
  });
  const updates = useApiResource<AdminUpdatesResponse>("/admin/updates", {
    enabled: enabled && tab === "updates",
    refreshKey: sessionKey,
  });
  const systemSettings = useApiResource<AdminSystemSettings>("/admin/settings/system", {
    enabled: enabled && tab === "settings",
    refreshKey: sessionKey,
  });
  const emailSettings = useApiResource<AdminEmailSettings>("/admin/settings/email", {
    enabled: enabled && tab === "settings",
    refreshKey: sessionKey,
  });
  const users = useApiResource<AdminUsersResponse>("/admin/users", {
    enabled: enabled && tab === "users",
    refreshKey: sessionKey,
  });
  const scheduler = useApiResource<AdminSchedulerResponse>("/admin/scheduler", {
    enabled: enabled && tab === "automation",
    refreshKey: sessionKey,
  });
  const jobs = useApiResource<AdminJobsSnapshot>("/admin/jobs", {
    enabled: enabled && tab === "automation",
    refreshKey: sessionKey,
  });
  const backups = useApiResource<AdminBackupsResponse>("/admin/backups", {
    enabled: enabled && (tab === "backups" || tab === "overview"),
    refreshKey: sessionKey,
  });
  const logs = useApiResource<AdminLogsResponse>(`/admin/logs?kind=${logKind}`, {
    enabled: enabled && tab === "logs",
    refreshKey: `${sessionKey}:${logKind}`,
  });
  const integrations = useApiResource<AdminIntegrationsResponse>("/admin/integrations", {
    enabled: enabled && tab === "integrations",
    refreshKey: sessionKey,
  });

  useEffect(() => {
    const authHit =
      overview.authRequired ||
      updates.authRequired ||
      systemSettings.authRequired ||
      emailSettings.authRequired ||
      users.authRequired ||
      scheduler.authRequired ||
      jobs.authRequired ||
      backups.authRequired ||
      logs.authRequired ||
      integrations.authRequired;
    if (authHit) openAuth("Staff sign-in required for system administration");
  }, [
    overview.authRequired,
    updates.authRequired,
    systemSettings.authRequired,
    emailSettings.authRequired,
    users.authRequired,
    scheduler.authRequired,
    jobs.authRequired,
    backups.authRequired,
    logs.authRequired,
    integrations.authRequired,
    openAuth,
  ]);

  useEffect(() => {
    if (systemSettings.data) setSysForm({ ...systemSettings.data });
  }, [systemSettings.data]);

  useEffect(() => {
    if (updates.data?.channel) {
      setUpdateOpts((o) => ({ ...o, channel: updates.data!.channel }));
    }
  }, [updates.data]);

  // Load user detail + curated roles + job profiles when Manage opens
  useEffect(() => {
    if (!enabled || !editUser) return;
    let cancelled = false;
    setRoleBusy("load");
    void (async () => {
      try {
        const [detail, rolesRes, instProfiles, extProfiles] = await Promise.all([
          apiFetch<{ user: AdminUserSummary; roles: string[] }>(
            `/admin/users/${encodeURIComponent(editUser)}/roles`,
          ),
          apiFetch<{ items: Array<{ name: string }> }>("/admin/roles?curated=true"),
          apiFetch<{
            items: Array<{ name: string; audience: string; summary: string; roles: string[] }>;
          }>("/admin/role-profiles?audience=institution"),
          apiFetch<{
            items: Array<{ name: string; audience: string; summary: string; roles: string[] }>;
          }>("/admin/role-profiles?audience=external"),
        ]);
        if (cancelled) return;
        setUserDetail(detail);
        setAvailableRoles(rolesRes.items.map((r) => r.name));
        setRoleProfiles([...instProfiles.items, ...extProfiles.items]);
      } catch (err) {
        if (cancelled) return;
        if (err instanceof AuthError && err.authRequired) openAuth(err.reason);
        else setFlash(err instanceof Error ? err.message : "User detail load failed");
      } finally {
        if (!cancelled) setRoleBusy(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [editUser, enabled, openAuth]);

  async function runCommand(
    key: string,
    label: string,
    path: string,
    body: Record<string, unknown>,
    opts?: { reload?: () => void; onLines?: (lines: string[]) => void },
  ) {
    const ok = await dialogs.confirm({
      title: label,
      message: `${label}?\n\nThis will run on the live system and may take a moment.`,
      confirmLabel: label,
    });
    if (!ok) return;
    setBusy(key);
    setFlash(null);
    try {
      const res = await apiFetch<AdminCommandResult>(path, {
        method: "POST",
        body: JSON.stringify(body),
      });
      if (opts?.onLines && res.lines?.length) opts.onLines(res.lines);
      setFlash(res.message ?? (res.ok ? `${label} completed` : `${label} failed`));
      opts?.reload?.();
    } catch (err) {
      if (err instanceof AuthError && err.authRequired) openAuth(err.reason);
      else setFlash(err instanceof Error ? err.message : `${label} failed`);
    } finally {
      setBusy(null);
    }
  }

  async function runUpdate() {
    const ok = await dialogs.confirm({
      title: "Run system update",
      message:
        "Run a full system update?\n\nThe site will enter maintenance while updates apply and services restart. Take a backup first.",
      confirmLabel: "Run update",
      danger: true,
    });
    if (!ok) {
      return;
    }
    setBusy("update");
    setFlash(null);
    setConsoleStatus("running");
    setConsoleLines(["# Starting update…"]);
    try {
      const res = await apiFetch<AdminCommandResult>("/admin/updates/run", {
        method: "POST",
        body: JSON.stringify({
          confirm: true,
          channel: updateOpts.channel,
          backup_before: updateOpts.backup_before,
          migrate: updateOpts.migrate,
          maintenance: updateOpts.maintenance,
          dry_run: false,
        }),
      });
      setConsoleLines(res.lines?.length ? res.lines : [res.message ?? (res.ok ? "OK" : "Failed")]);
      setConsoleStatus(res.ok ? "done" : "error");
      setFlash(res.message ?? (res.ok ? "Update finished" : "Update failed"));
      updates.reload();
      overview.reload();
    } catch (err) {
      setConsoleStatus("error");
      const msg = err instanceof Error ? err.message : "Update failed";
      setConsoleLines((prev) => [...prev, msg]);
      if (err instanceof AuthError && err.authRequired) openAuth(err.reason);
      else setFlash(msg);
    } finally {
      setBusy(null);
    }
  }

  async function saveSystemSettings() {
    const ok = await dialogs.confirm({
      title: "Save system settings",
      message: "Save these system settings?\n\nChanges take effect immediately for all staff.",
      confirmLabel: "Save settings",
    });
    if (!ok) return;
    setBusy("save-sys");
    setFlash(null);
    try {
      const saved = await apiFetch<AdminSystemSettings>("/admin/settings/system", {
        method: "PATCH",
        body: JSON.stringify({ confirm: true, values: sysForm }),
      });
      setSysForm(saved);
      setFlash("System settings saved");
      systemSettings.reload();
    } catch (err) {
      if (err instanceof AuthError && err.authRequired) openAuth(err.reason);
      else setFlash(err instanceof Error ? err.message : "Save failed");
    } finally {
      setBusy(null);
    }
  }

  async function testEmail() {
    const to = await dialogs.prompt({
      title: "Send test email",
      message: "Enter the address that should receive the test message.",
      label: "Email",
      inputType: "email",
      placeholder: "you@example.com",
      confirmLabel: "Send test",
    });
    if (!to?.trim()) return;
    await runCommand("test-email", `Send test email to ${to.trim()}`, "/admin/settings/email/test", {
      confirm: true,
      to: to.trim(),
    });
  }

  async function toggleUser(name: string, enabledNext: boolean) {
    const verb = enabledNext ? "Enable" : "Disable";
    const ok = await dialogs.confirm({
      title: `${verb} user`,
      message: `${verb} user “${name}”?\n\n${
        enabledNext
          ? "They will be able to sign in again."
          : "They will no longer be able to sign in."
      }`,
      confirmLabel: verb,
      danger: !enabledNext,
    });
    if (!ok) return;
    setBusy(`user:${name}`);
    setFlash(null);
    try {
      await apiFetch(`/admin/users/${encodeURIComponent(name)}`, {
        method: "PATCH",
        body: JSON.stringify({ confirm: true, enabled: enabledNext }),
      });
      setFlash(`${verb}d ${name}`);
      users.reload();
    } catch (err) {
      if (err instanceof AuthError && err.authRequired) openAuth(err.reason);
      else setFlash(err instanceof Error ? err.message : "User update failed");
    } finally {
      setBusy(null);
    }
  }

  async function toggleUserAndReload(name: string, enabledNext: boolean) {
    const verb = enabledNext ? "Enable" : "Disable";
    const ok = await dialogs.confirm({
      title: `${verb} user`,
      message: `${verb} user “${name}”?`,
      confirmLabel: verb,
      danger: !enabledNext,
    });
    if (!ok) return;
    setBusy(`user:${name}`);
    try {
      await apiFetch(`/admin/users/${encodeURIComponent(name)}`, {
        method: "PATCH",
        body: JSON.stringify({ confirm: true, enabled: enabledNext }),
      });
      setFlash(`${verb}d ${name}`);
      users.reload();
      try {
        const detail = await apiFetch<{ user: AdminUserSummary; roles: string[] }>(
          `/admin/users/${encodeURIComponent(name)}/roles`,
        );
        setUserDetail(detail);
      } catch {
        /* keep existing detail on refresh failure */
      }
    } catch (err) {
      if (err instanceof AuthError && err.authRequired) openAuth(err.reason);
      else setFlash(err instanceof Error ? err.message : "User update failed");
    } finally {
      setBusy(null);
    }
  }

  async function assignProfile(name: string, profile: string) {
    const ok = await dialogs.confirm({
      title: "Apply job profile",
      message: `Apply job profile “${profile}” to ${name}? This expands the Institution staff pack (DocPerms / workflow).`,
      confirmLabel: "Apply profile",
    });
    if (!ok) return;
    setRoleBusy(`profile:${profile}`);
    try {
      await apiFetch(`/admin/users/${encodeURIComponent(name)}`, {
        method: "PATCH",
        body: JSON.stringify({ confirm: true, role_profile_name: profile }),
      });
      const detail = await apiFetch<{ user: AdminUserSummary; roles: string[] }>(
        `/admin/users/${encodeURIComponent(name)}/roles`,
      );
      setUserDetail(detail);
      users.reload();
      setFlash(`Applied profile ${profile} to ${name}`);
    } catch (err) {
      if (err instanceof AuthError && err.authRequired) openAuth(err.reason);
      else setFlash(err instanceof Error ? err.message : "Assign profile failed");
    } finally {
      setRoleBusy(null);
    }
  }

  async function addRole(name: string, role: string) {
    setRoleBusy(`add:${role}`);
    try {
      await apiFetch(`/admin/users/${encodeURIComponent(name)}/roles`, {
        method: "POST",
        body: JSON.stringify({ role, confirm: true }),
      });
      setFlash(`Added ${role} to ${name}`);
      const detail = await apiFetch<{ user: AdminUserSummary; roles: string[] }>(
        `/admin/users/${encodeURIComponent(name)}/roles`,
      );
      setUserDetail(detail);
      users.reload();
    } catch (err) {
      if (err instanceof AuthError && err.authRequired) openAuth(err.reason);
      else setFlash(err instanceof Error ? err.message : "Add role failed");
    } finally {
      setRoleBusy(null);
    }
  }

  async function removeRole(name: string, role: string) {
    const ok = await dialogs.confirm({
      title: "Remove role",
      message: `Remove role “${role}” from “${name}”?`,
      confirmLabel: "Remove",
      danger: true,
    });
    if (!ok) return;
    setRoleBusy(`rm:${role}`);
    try {
      await apiFetch(
        `/admin/users/${encodeURIComponent(name)}/roles/${encodeURIComponent(role)}`,
        { method: "DELETE" },
      );
      setFlash(`Removed ${role} from ${name}`);
      const detail = await apiFetch<{ user: AdminUserSummary; roles: string[] }>(
        `/admin/users/${encodeURIComponent(name)}/roles`,
      );
      setUserDetail(detail);
      users.reload();
    } catch (err) {
      if (err instanceof AuthError && err.authRequired) openAuth(err.reason);
      else setFlash(err instanceof Error ? err.message : "Remove role failed");
    } finally {
      setRoleBusy(null);
    }
  }

  async function handleInvite(e: FormEvent) {
    e.preventDefault();
    setInviteBusy(true);
    setInviteErr(null);
    setInviteMsg(null);
    try {
      const body: InviteStaffRequest = {
        email: inviteEmail,
        full_name: inviteName,
        roles: [inviteRole],
      };
      const res = await inviteStaff(body);
      setInviteMsg(res.message ?? `Invited ${res.email}`);
      setInviteEmail("");
      setInviteName("");
      users.reload();
    } catch (err) {
      setInviteErr(err instanceof Error ? err.message : "Invite failed");
    } finally {
      setInviteBusy(false);
    }
  }

  if (!isSysAdmin) {
    return (
      <RequireStaff reason="Staff sign-in required for system administration">
        <EmptyState
          title="System Manager role required"
          detail="Only System Manager or Administrator can open System Administration."
        />
      </RequireStaff>
    );
  }

  return (
    <RequireStaff reason="Staff sign-in required for system administration">
      <PageHeader
        title="System Administration"
        subtitle="Update the platform, configure settings, and manage users. These actions change the live system, so handle with care."
      />

      <div className="admin-tabs" role="tablist" aria-label="System administration">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            className={`admin-tab${tab === t.id ? " on" : ""}`}
            onClick={() => {
              setTab(t.id);
              setFlash(null);
            }}
          >
            <Icon name={t.icon} />
            {t.label}
          </button>
        ))}
      </div>

      <Flash message={flash} />

      {tab === "overview" ? (
        <OverviewTab
          overview={overview}
          busy={busy}
          onGoUpdates={() => setTab("updates")}
          onAction={(key, label, path, body) =>
            void runCommand(key, label, path, body, {
              reload: () => {
                overview.reload();
                backups.reload();
              },
            })
          }
        />
      ) : null}

      {tab === "updates" ? (
        <UpdatesTab
          updates={updates}
          updateOpts={updateOpts}
          setUpdateOpts={setUpdateOpts}
          busy={busy}
          consoleLines={consoleLines}
          consoleStatus={consoleStatus}
          onRunUpdate={() => void runUpdate()}
          onBackup={() =>
            void runCommand("backup", "Backup now", "/admin/actions/backup", {
              confirm: true,
              with_files: true,
            })
          }
        />
      ) : null}

      {tab === "company" ? (
        <CompanyProfilePanel enabled={enabled} refreshKey={sessionKey} />
      ) : null}

      {tab === "settings" ? (
        <SettingsTab
          system={systemSettings}
          email={emailSettings}
          sysForm={sysForm}
          setSysForm={setSysForm}
          busy={busy}
          onSave={() => void saveSystemSettings()}
          onTestEmail={() => void testEmail()}
          onOpenAccess={() => setTab("access")}
        />
      ) : null}

      {tab === "access" ? (
        <AccessSecurityTab
          enabled={enabled}
          refreshKey={sessionKey ?? 0}
          onFlash={setFlash}
          onAuthRequired={() => openAuth()}
        />
      ) : null}

      {tab === "users" ? (
        <UsersTab
          users={users}
          busy={busy}
          showInvite={showInvite}
          setShowInvite={setShowInvite}
          invite={{
            email: inviteEmail,
            setEmail: setInviteEmail,
            name: inviteName,
            setName: setInviteName,
            role: inviteRole,
            setRole: setInviteRole,
            busy: inviteBusy,
            err: inviteErr,
            msg: inviteMsg,
            onSubmit: (ev) => void handleInvite(ev),
          }}
          onToggle={(name, next) => void toggleUser(name, next)}
          onManage={(name) => {
            setEditUser(name);
            setUserDetail(null);
          }}
        />
      ) : null}

      <RecordDrawer
        open={!!editUser}
        onClose={() => {
          setEditUser(null);
          setUserDetail(null);
        }}
        reference={userDetail?.user.name ?? editUser ?? ""}
        title={userDetail?.user.full_name ?? editUser ?? ""}
        subtitle={
          <span className="stagechip">
            {userDetail?.user.enabled ? "enabled" : "disabled"}
          </span>
        }
        sections={[
          {
            heading: "User Details",
            content: (
              <>
                <div className="kv">
                  <b>Username</b>
                  <span>{userDetail?.user.name ?? "—"}</span>
                </div>
                <div className="kv">
                  <b>Email</b>
                  <span>{userDetail?.user.email ?? "—"}</span>
                </div>
                <div className="kv">
                  <b>Last active</b>
                  <span>{userDetail?.user.last_active ?? "—"}</span>
                </div>
                <div className="kv">
                  <b>User type</b>
                  <span>{userDetail?.user.user_type ?? "—"}</span>
                </div>
                <div className="kv">
                  <b>Status</b>
                  <span>
                    <StatusPill
                      status={userDetail?.user.enabled ? "ok" : "err"}
                      label={userDetail?.user.enabled ? "enabled" : "disabled"}
                    />
                  </span>
                </div>
              </>
            ),
          },
          {
            heading: "Job profile",
            content: (
              <div className="role-mgmt">
                <div className="kv" style={{ width: "100%" }}>
                  <b>Current</b>
                  <span>{userDetail?.user.role_profile_name || "None"}</span>
                </div>
                <p style={{ color: "var(--muted-2)", fontSize: 12.5, margin: "0 0 8px", width: "100%" }}>
                  Apply an Institution (or Board/TC) job pack. Citizen / Business packs belong on the
                  Service Portal, not here.
                </p>
                <div className="role-add">
                  <Select
                    block
                    aria-label="Apply job profile"
                    value=""
                    placeholder="+ Apply job profile…"
                    disabled={roleBusy !== null}
                    onChange={(v) => {
                      if (v && editUser) void assignProfile(editUser, v);
                    }}
                    options={(["institution", "external"] as const).flatMap((aud) =>
                      roleProfiles
                        .filter((p) => p.audience === aud)
                        .map((p) => ({
                          value: p.name,
                          label: p.name,
                          title: p.summary,
                          group: aud === "external" ? "External (Board / TC)" : "Institution staff",
                        })),
                    )}
                  />
                </div>
              </div>
            ),
          },
          {
            heading: "Roles",
            content: (
              <div className="role-mgmt">
                {(userDetail?.roles ?? []).map((role) => (
                  <span key={role} className="role-chip">
                    {role}
                    <button
                      type="button"
                      aria-label={`Remove ${role}`}
                      disabled={roleBusy === `rm:${role}`}
                      onClick={() => editUser && void removeRole(editUser, role)}
                    >
                      ×
                    </button>
                  </span>
                ))}
                {(!userDetail?.roles || userDetail.roles.length === 0) && roleBusy === null ? (
                  <p style={{ color: "var(--muted-2)", margin: "4px 0 0" }}>No roles assigned.</p>
                ) : null}
                {roleBusy === "load" ? (
                  <p style={{ color: "var(--muted-2)", margin: "8px 0 0" }}>Loading roles…</p>
                ) : null}
                <div className="role-add">
                  <Select
                    block
                    aria-label="Add curated role"
                    value=""
                    placeholder="+ Add curated role…"
                    disabled={roleBusy !== null}
                    onChange={(v) => {
                      if (v && editUser) void addRole(editUser, v);
                    }}
                    options={availableRoles.filter((r) => !(userDetail?.roles ?? []).includes(r))}
                  />
                </div>
              </div>
            ),
          },
        ]}
        actions={[
          {
            label: userDetail?.user.enabled ? "Disable" : "Enable",
            variant: "ghost",
            onClick: () => {
              if (editUser && userDetail) {
                void toggleUserAndReload(editUser, !userDetail.user.enabled);
              }
            },
            disabled: !userDetail || busy === `user:${editUser}`,
          },
          {
            label: "Close",
            variant: "ghost",
            onClick: () => {
              setEditUser(null);
              setUserDetail(null);
            },
          },
        ]}
      />

      {tab === "automation" ? (
        <AutomationTab
          scheduler={scheduler}
          jobs={jobs}
          busy={busy}
          onRunJob={(job) =>
            void runCommand(
              `job:${job}`,
              `Run scheduled job “${job}”`,
              `/admin/scheduler/${encodeURIComponent(job)}/run`,
              { confirm: true },
              { reload: () => scheduler.reload() },
            )
          }
          onRetryFailed={() =>
            void runCommand(
              "retry-failed",
              "Retry failed background jobs",
              "/admin/jobs/retry-failed",
              { confirm: true },
              { reload: () => jobs.reload() },
            )
          }
        />
      ) : null}

      {tab === "backups" ? (
        <BackupsTab
          backups={backups}
          busy={busy}
          onBackup={() =>
            void runCommand(
              "backup",
              "Backup now (with files)",
              "/admin/actions/backup",
              { confirm: true, with_files: true },
              { reload: () => backups.reload() },
            )
          }
        />
      ) : null}

      {tab === "logs" ? (
        <LogsTab
          logs={logs}
          logKind={logKind}
          setLogKind={setLogKind}
        />
      ) : null}

      {tab === "integrations" ? <IntegrationsTab integrations={integrations} /> : null}
    </RequireStaff>
  );
}

function OverviewTab({
  overview,
  busy,
  onGoUpdates,
  onAction,
}: {
  overview: ReturnType<typeof useApiResource<AdminOverview>>;
  busy: string | null;
  onGoUpdates: () => void;
  onAction: (key: string, label: string, path: string, body: Record<string, unknown>) => void;
}) {
  if (overview.loading) return <LoadingState label="Loading overview…" />;
  if (overview.error) return <ErrorState message={overview.error} onRetry={overview.reload} />;
  if (!overview.data) return <EmptyState title="No overview data" />;

  const d = overview.data;
  const servicesOk = d.services.every((s) => s.status === "ok");

  return (
    <>
      <section className="kpis" style={{ marginBottom: 16 }}>
        <div className="kpi">
          <div className="kpi__label">Frappe Framework</div>
          <div className="kpi__val" style={{ fontFamily: "var(--font-mono)", fontSize: 20 }}>
            {d.frappe_version}
          </div>
          <div style={{ marginTop: 6 }}>
            <StatusPill
              status={d.frappe_status}
              label={d.frappe_status === "ok" ? "Up to date" : d.frappe_status}
            />
          </div>
        </div>
        <div className="kpi">
          <div className="kpi__label">ERPNext</div>
          <div className="kpi__val" style={{ fontFamily: "var(--font-mono)", fontSize: 20 }}>
            {d.erpnext_version}
          </div>
          <div style={{ marginTop: 6 }}>
            <StatusPill
              status={d.erpnext_status}
              label={d.erpnext_status === "ok" ? "Up to date" : "Update available"}
            />
          </div>
        </div>
        <div className="kpi">
          <div className="kpi__label">Active users</div>
          <div className="kpi__val">
            {d.active_users}
            {d.seat_limit != null ? (
              <small style={{ fontSize: 12, color: "var(--muted)", fontWeight: 600 }}>
                {" "}
                / {d.seat_limit} seats
              </small>
            ) : null}
          </div>
          {d.online_now != null ? (
            <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 4 }}>
              {d.online_now} online now
            </div>
          ) : null}
        </div>
        <div className="kpi">
          <div className="kpi__label">Last backup</div>
          <div className="kpi__val">{d.last_backup_ago ?? "—"}</div>
          <div style={{ marginTop: 6 }}>
            {d.last_backup_ok != null ? (
              <StatusPill status={d.last_backup_ok ? "ok" : "err"} label={d.last_backup_ok ? "ok" : "failed"} />
            ) : null}
          </div>
        </div>
      </section>

      <div className="row c2" style={{ marginTop: 0 }}>
        <div className="panel" style={{ padding: 0 }}>
          <div className="admin-card-h">
            <span className="admin-ic">
              <Icon name="i-monitor" />
            </span>
            <b>Services &amp; health</b>
            <span style={{ marginLeft: "auto" }}>
              <StatusPill status={servicesOk ? "ok" : "warn"} label={servicesOk ? "All operational" : "Attention"} />
            </span>
          </div>
          <div style={{ padding: "4px 18px 12px" }}>
            {d.services.map((s) => (
              <div key={s.name} className="admin-svc">
                <span style={{ fontWeight: 600 }}>{s.name}</span>
                {s.meta ? (
                  <span style={{ color: "var(--muted-2)", fontSize: 12, fontFamily: "var(--font-mono)" }}>
                    {s.meta}
                  </span>
                ) : null}
                <span style={{ marginLeft: "auto" }}>
                  <StatusPill status={s.status} label={s.detail ?? s.status} />
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className="panel" style={{ padding: 0 }}>
          <div className="admin-card-h">
            <span className="admin-ic">
              <Icon name="i-grid" />
            </span>
            <b>Installed apps</b>
            <span style={{ marginLeft: "auto" }}>
              <StatusPill
                status={d.updates_available > 0 ? "warn" : "ok"}
                label={d.updates_available > 0 ? `${d.updates_available} updates` : "current"}
              />
            </span>
          </div>
          <div style={{ padding: "8px 10px 12px", overflowX: "auto" }}>
            <table className="admin-table">
              <thead>
                <tr>
                  <th>App</th>
                  <th>Installed</th>
                  <th>Latest</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {d.apps.map((a) => (
                  <tr key={a.app}>
                    <td style={{ fontWeight: 600 }}>{a.app}</td>
                    <td className="admin-code">{a.installed}</td>
                    <td className="admin-code">{a.latest ?? "—"}</td>
                    <td>
                      <StatusPill status={a.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div className="sec-label">Quick actions</div>
      <div className="btn-row" style={{ marginTop: 0 }}>
        <button type="button" className="btn-primary" onClick={onGoUpdates}>
          Check for updates
        </button>
        <button
          type="button"
          className="btn-ghost"
          disabled={busy === "backup"}
          onClick={() =>
            onAction("backup", "Backup now", "/admin/actions/backup", {
              confirm: true,
              with_files: true,
            })
          }
        >
          Backup now
        </button>
        <button
          type="button"
          className="btn-ghost"
          disabled={busy === "cache"}
          onClick={() =>
            onAction("cache", "Clear cache", "/admin/actions/clear-cache", { confirm: true })
          }
        >
          Clear cache
        </button>
        <button
          type="button"
          className="btn-ghost"
          disabled={busy === "restart"}
          onClick={() =>
            onAction("restart", "Restart services", "/admin/actions/restart", { confirm: true })
          }
        >
          Restart services
        </button>
        <button
          type="button"
          className="btn-ghost"
          style={{ borderColor: "#F4C2D4", color: "var(--red)" }}
          disabled={busy === "maintenance"}
          onClick={() =>
            onAction("maintenance", "Enable maintenance mode", "/admin/actions/maintenance", {
              confirm: true,
              enabled: true,
            })
          }
        >
          Maintenance mode
        </button>
      </div>
      {d.site || d.environment ? (
        <p style={{ fontSize: 12.5, color: "var(--muted-2)", marginTop: 12 }}>
          {d.environment ?? "env"} · {d.site}
        </p>
      ) : null}
    </>
  );
}

function UpdatesTab({
  updates,
  updateOpts,
  setUpdateOpts,
  busy,
  consoleLines,
  consoleStatus,
  onRunUpdate,
  onBackup,
}: {
  updates: ReturnType<typeof useApiResource<AdminUpdatesResponse>>;
  updateOpts: { channel: string; backup_before: boolean; migrate: boolean; maintenance: boolean };
  setUpdateOpts: React.Dispatch<
    React.SetStateAction<{
      channel: string;
      backup_before: boolean;
      migrate: boolean;
      maintenance: boolean;
    }>
  >;
  busy: string | null;
  consoleLines: string[];
  consoleStatus: string;
  onRunUpdate: () => void;
  onBackup: () => void;
}) {
  return (
    <>
      <div className="admin-banner">
        <Icon name="i-warn" />
        <div>
          <b>Take a backup before updating.</b>
          <p>
            Updating pulls new code and runs database migrations. The site enters maintenance mode
            during migrate &amp; restart. Schedule outside working hours.
          </p>
        </div>
      </div>

      {updates.loading ? (
        <LoadingState label="Loading updates…" />
      ) : updates.error ? (
        <ErrorState message={updates.error} onRetry={updates.reload} />
      ) : (
        <div className="row c2">
          <div className="panel" style={{ padding: 0 }}>
            <div className="admin-card-h">
              <span className="admin-ic">
                <Icon name="i-refresh" />
              </span>
              <b>Available updates</b>
              <span style={{ marginLeft: "auto" }}>
                <button type="button" className="btn-ghost" style={{ minHeight: 32, padding: "0 12px", fontSize: 12 }} onClick={() => updates.reload()}>
                  Re-check
                </button>
              </span>
            </div>
            <div style={{ padding: "8px 10px 12px", overflowX: "auto" }}>
              {(updates.data?.items ?? []).length === 0 ? (
                <EmptyState title="No updates available" />
              ) : (
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th>App</th>
                      <th>Current</th>
                      <th>Latest</th>
                      <th>Notes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(updates.data?.items ?? []).map((a) => (
                      <tr key={a.app}>
                        <td style={{ fontWeight: 600 }}>{a.app}</td>
                        <td className="admin-code">{a.installed}</td>
                        <td className="admin-code">{a.latest ?? "—"}</td>
                        <td>{a.notes ?? "—"}</td>
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
                <Icon name="i-gauge" />
              </span>
              <b>Run update</b>
            </div>
            <div style={{ padding: "8px 18px 18px" }}>
              <div className="admin-kv">
                <span className="admin-kv__k">Update channel</span>
                <span className="admin-kv__r">
                  <Select
                    aria-label="Update channel"
                    value={updateOpts.channel}
                    onChange={(v) => setUpdateOpts((o) => ({ ...o, channel: v }))}
                    options={["stable", "hotfix"]}
                  />
                </span>
              </div>
              {(
                [
                  ["backup_before", "Backup before update"],
                  ["migrate", "Run migrate after pull"],
                  ["maintenance", "Maintenance mode during"],
                ] as const
              ).map(([key, label]) => (
                <div key={key} className="admin-kv">
                  <span className="admin-kv__k">{label}</span>
                  <span className="admin-kv__r">
                    <button
                      type="button"
                      className={`admin-tog${updateOpts[key] ? " on" : ""}`}
                      aria-pressed={updateOpts[key]}
                      onClick={() => setUpdateOpts((o) => ({ ...o, [key]: !o[key] }))}
                    />
                  </span>
                </div>
              ))}
              <div className="btn-row" style={{ marginTop: 14 }}>
                <button
                  type="button"
                  className="btn-primary"
                  style={{ background: "var(--gold)", color: "var(--gold-ink)" }}
                  disabled={busy === "update"}
                  onClick={onRunUpdate}
                >
                  {busy === "update" ? "Running…" : "Run update"}
                </button>
                <button type="button" className="btn-ghost" disabled={busy === "backup"} onClick={onBackup}>
                  Backup only
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="panel" style={{ marginTop: 16, padding: 0 }}>
        <div className="admin-card-h">
          <span className="admin-ic">
            <Icon name="i-monitor" />
          </span>
          <b>Update console</b>
          <span style={{ marginLeft: "auto" }}>
            <StatusPill
              status={
                consoleStatus === "error" ? "err" : consoleStatus === "done" ? "ok" : consoleStatus === "running" ? "info" : "info"
              }
              label={consoleStatus}
            />
          </span>
        </div>
        <div style={{ padding: "14px 18px" }}>
          <pre className="admin-console">
            {consoleLines.length ? consoleLines.join("\n") : "# update output will appear here…"}
          </pre>
        </div>
      </div>
    </>
  );
}

function SettingsTab({
  system,
  email,
  sysForm,
  setSysForm,
  busy,
  onSave,
  onTestEmail,
  onOpenAccess,
}: {
  system: ReturnType<typeof useApiResource<AdminSystemSettings>>;
  email: ReturnType<typeof useApiResource<AdminEmailSettings>>;
  sysForm: AdminSystemSettings;
  setSysForm: React.Dispatch<React.SetStateAction<AdminSystemSettings>>;
  busy: string | null;
  onSave: () => void;
  onTestEmail: () => void;
  onOpenAccess: () => void;
}) {
  if (system.loading || email.loading) return <LoadingState label="Loading settings…" />;
  if (system.error) return <ErrorState message={system.error} onRetry={system.reload} />;
  if (email.error) return <ErrorState message={email.error} onRetry={email.reload} />;

  const em = email.data;

  return (
    <div className="row c2">
      <div className="panel" style={{ padding: 0 }}>
        <div className="admin-card-h">
          <span className="admin-ic">
            <Icon name="i-sliders" />
          </span>
          <b>General: System Settings</b>
          <span style={{ marginLeft: "auto" }}>
            <button
              type="button"
              className="btn-ghost"
              style={{ minHeight: 32, padding: "0 12px", fontSize: 12 }}
              disabled={busy === "save-sys"}
              onClick={onSave}
            >
              {busy === "save-sys" ? "Saving…" : "Save"}
            </button>
          </span>
        </div>
        <div style={{ padding: "8px 18px 18px" }}>
          {(
            [
              ["time_zone", "Time zone"],
              ["date_format", "Date format"],
              ["currency", "Currency"],
              ["number_format", "Number format"],
              ["session_expiry", "Session expiry"],
            ] as const
          ).map(([key, label]) => (
            <div key={key} className="admin-kv">
              <span className="admin-kv__k">{label}</span>
              <span className="admin-kv__r">
                <input
                  className="admin-in"
                  value={sysForm[key] ?? ""}
                  onChange={(e) => setSysForm((f) => ({ ...f, [key]: e.target.value }))}
                />
              </span>
            </div>
          ))}
          <div className="admin-kv">
            <span className="admin-kv__k">Enable scheduler</span>
            <span className="admin-kv__r">
              <button
                type="button"
                className={`admin-tog${sysForm.enable_scheduler ? " on" : ""}`}
                aria-pressed={Boolean(sysForm.enable_scheduler)}
                onClick={() =>
                  setSysForm((f) => ({ ...f, enable_scheduler: !f.enable_scheduler }))
                }
              />
            </span>
          </div>
          <div className="admin-kv">
            <span className="admin-kv__k">Force HTTPS</span>
            <span className="admin-kv__r">
              <button
                type="button"
                className={`admin-tog${sysForm.force_https ? " on" : ""}`}
                aria-pressed={Boolean(sysForm.force_https)}
                onClick={() => setSysForm((f) => ({ ...f, force_https: !f.force_https }))}
              />
            </span>
          </div>
        </div>
      </div>

      <div className="panel" style={{ padding: 0 }}>
        <div className="admin-card-h">
          <span className="admin-ic">
            <Icon name="i-mail" />
          </span>
          <b>Email: SMTP / Email Account</b>
          <span style={{ marginLeft: "auto" }}>
            {em ? (
              <StatusPill status={em.outgoing_ok ? "ok" : "warn"} label={em.outgoing_ok ? "outgoing OK" : "not OK"} />
            ) : null}
          </span>
        </div>
        <div style={{ padding: "8px 18px 18px" }}>
          {!em ? (
            <EmptyState title="No email settings" />
          ) : (
            <>
              <div className="admin-kv">
                <span className="admin-kv__k">Outgoing (SMTP) host</span>
                <span className="admin-code">
                  {em.smtp_host ? `${em.smtp_host}${em.smtp_port != null ? `:${em.smtp_port}` : ""}` : "—"}
                </span>
              </div>
              <div className="admin-kv">
                <span className="admin-kv__k">From address</span>
                <span className="admin-code">{em.from_address ?? "—"}</span>
              </div>
              <div className="admin-kv">
                <span className="admin-kv__k">TLS</span>
                <span className="admin-kv__r">
                  <StatusPill status={em.use_tls ? "ok" : "warn"} label={em.use_tls ? "on" : "off"} />
                </span>
              </div>
              <div className="admin-kv">
                <span className="admin-kv__k">Incoming (IMAP)</span>
                <span className="admin-kv__r">
                  <StatusPill
                    status={em.incoming_set ? "ok" : "warn"}
                    label={em.incoming_set ? "set" : "not set"}
                  />
                </span>
              </div>
              <div className="btn-row" style={{ marginTop: 14 }}>
                <button type="button" className="btn-ghost" style={{ minHeight: 32, padding: "0 12px", fontSize: 12 }} onClick={onTestEmail}>
                  Send test email
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      <div className="panel" style={{ padding: 0, gridColumn: "1 / -1" }}>
        <div className="admin-card-h">
          <span className="admin-ic">
            <Icon name="i-lock" />
          </span>
          <b>Security &amp; Institution access</b>
          <span style={{ marginLeft: "auto" }}>
            <button
              type="button"
              className="btn-ghost"
              style={{ minHeight: 32, padding: "0 12px", fontSize: 12 }}
              onClick={onOpenAccess}
            >
              Open Access Security →
            </button>
          </span>
        </div>
        <div style={{ padding: "12px 18px 18px", fontSize: 13, color: "var(--muted)" }}>
          Manage LAN/WAN CIDRs, device allowlist, and off-LAN enforcement for{" "}
          <code>/institution</code>. Non-allowlisted devices outside trusted networks redirect to
          the Service Portal root once nginx is wired.
        </div>
      </div>
    </div>
  );
}

function UsersTab({
  users,
  busy,
  showInvite,
  setShowInvite,
  invite,
  onToggle,
  onManage,
}: {
  users: ReturnType<typeof useApiResource<AdminUsersResponse>>;
  busy: string | null;
  showInvite: boolean;
  setShowInvite: (v: boolean) => void;
  invite: {
    email: string;
    setEmail: (v: string) => void;
    name: string;
    setName: (v: string) => void;
    role: string;
    setRole: (v: string) => void;
    busy: boolean;
    err: string | null;
    msg: string | null;
    onSubmit: (e: FormEvent) => void;
  };
  onToggle: (name: string, enabled: boolean) => void;
  onManage: (name: string) => void;
}) {
  return (
    <>
      <div className="btn-row" style={{ marginTop: 0, marginBottom: 14 }}>
        <button type="button" className="btn-primary" onClick={() => setShowInvite(!showInvite)}>
          Invite user
        </button>
      </div>

      {showInvite ? (
        <section className="panel" style={{ marginBottom: 16, maxWidth: 520 }}>
          <h3 style={{ marginTop: 0 }}>Invite staff</h3>
          <form onSubmit={invite.onSubmit} style={{ display: "grid", gap: 12 }}>
            <label style={{ display: "grid", gap: 6, fontWeight: 600, fontSize: 13 }}>
              Full name
              <input
                required
                className="admin-in"
                style={{ width: "100%" }}
                value={invite.name}
                onChange={(e) => invite.setName(e.target.value)}
              />
            </label>
            <label style={{ display: "grid", gap: 6, fontWeight: 600, fontSize: 13 }}>
              Work email
              <input
                type="email"
                required
                className="admin-in"
                style={{ width: "100%" }}
                value={invite.email}
                onChange={(e) => invite.setEmail(e.target.value)}
              />
            </label>
            <label style={{ display: "grid", gap: 6, fontWeight: 600, fontSize: 13 }}>
              Role
              <Select block value={invite.role} onChange={invite.setRole} options={INVITE_ROLE_OPTIONS} />
            </label>
            {invite.err ? <p style={{ color: "var(--red)", margin: 0 }}>{invite.err}</p> : null}
            {invite.msg ? <p style={{ color: "var(--navy)", margin: 0 }}>{invite.msg}</p> : null}
            <button type="submit" className="btn-primary" disabled={invite.busy}>
              {invite.busy ? "Sending…" : "Send invite"}
            </button>
          </form>
        </section>
      ) : null}

      {users.loading ? (
        <LoadingState label="Loading users…" />
      ) : users.error ? (
        <ErrorState message={users.error} onRetry={users.reload} />
      ) : (
        <div className="panel" style={{ padding: 0 }}>
          <div className="admin-card-h">
            <span className="admin-ic">
              <Icon name="i-users" />
            </span>
            <b>Users</b>
            <span style={{ marginLeft: "auto" }}>
              <StatusPill
                status="info"
                label={`${users.data?.active ?? 0} active · ${users.data?.disabled ?? 0} disabled`}
              />
            </span>
          </div>
          <div style={{ padding: "8px 10px 12px", overflowX: "auto" }}>
            {(users.data?.items ?? []).length === 0 ? (
              <EmptyState title="No users" />
            ) : (
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>User</th>
                    <th>Role profile</th>
                    <th>Last active</th>
                    <th>Status</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {(users.data?.items ?? []).map((u) => (
                    <tr key={u.name}>
                      <td>
                        <div style={{ fontWeight: 600 }}>{u.full_name || u.name}</div>
                        {u.email ? (
                          <div style={{ fontSize: 12, color: "var(--muted-2)" }}>{u.email}</div>
                        ) : null}
                      </td>
                      <td>{u.role_profile_name ?? "—"}</td>
                      <td>{u.last_active ?? "—"}</td>
                      <td>
                        <StatusPill status={u.enabled ? "ok" : "err"} label={u.enabled ? "enabled" : "disabled"} />
                      </td>
                      <td>
                        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                          <button
                            type="button"
                            className="btn-ghost"
                            style={{ minHeight: 32, padding: "0 12px", fontSize: 12 }}
                            onClick={() => onManage(u.name)}
                          >
                            Manage
                          </button>
                          <button
                            type="button"
                            className="btn-ghost"
                            style={{ minHeight: 32, padding: "0 12px", fontSize: 12 }}
                            disabled={busy === `user:${u.name}`}
                            onClick={() => onToggle(u.name, !u.enabled)}
                          >
                            {u.enabled ? "Disable" : "Enable"}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}
      <p style={{ fontSize: 12.5, color: "var(--muted-2)", marginTop: 12 }}>
        Roles &amp; permissions are enforced by Frappe RBAC. This screen never bypasses the
        permission model.
      </p>
    </>
  );
}

function AutomationTab({
  scheduler,
  jobs,
  busy,
  onRunJob,
  onRetryFailed,
}: {
  scheduler: ReturnType<typeof useApiResource<AdminSchedulerResponse>>;
  jobs: ReturnType<typeof useApiResource<AdminJobsSnapshot>>;
  busy: string | null;
  onRunJob: (job: string) => void;
  onRetryFailed: () => void;
}) {
  if (scheduler.loading || jobs.loading) return <LoadingState label="Loading automation…" />;
  if (scheduler.error) return <ErrorState message={scheduler.error} onRetry={scheduler.reload} />;
  if (jobs.error) return <ErrorState message={jobs.error} onRetry={jobs.reload} />;

  const sch = scheduler.data;
  const snap = jobs.data;

  return (
    <>
      <div className="panel" style={{ marginBottom: 16, padding: 0 }}>
        <div className="admin-card-h">
          <span className="admin-ic">
            <Icon name="i-clock" />
          </span>
          <b>Scheduler</b>
          <span style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 10 }}>
            <StatusPill
              status={sch?.enabled ? "ok" : "warn"}
              label={
                sch?.heartbeat_ago
                  ? `heartbeat ${sch.heartbeat_ago}`
                  : sch?.enabled
                    ? "enabled"
                    : "disabled"
              }
            />
          </span>
        </div>
        <div style={{ padding: "8px 10px 12px", overflowX: "auto" }}>
          {(sch?.jobs ?? []).length === 0 ? (
            <EmptyState title="No scheduled jobs" />
          ) : (
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Scheduled job</th>
                  <th>Method</th>
                  <th>Frequency</th>
                  <th>Last run</th>
                  <th>Status</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {(sch?.jobs ?? []).map((j) => (
                  <tr key={j.name}>
                    <td style={{ fontWeight: 600 }}>{j.name}</td>
                    <td className="admin-code">{j.method}</td>
                    <td>{j.frequency}</td>
                    <td>{j.last_run ?? "—"}</td>
                    <td>
                      <StatusPill
                        status={j.status === "ok" || j.status === "Completed" ? "ok" : "warn"}
                        label={j.status}
                      />
                    </td>
                    <td>
                      <button
                        type="button"
                        className="btn-ghost"
                        style={{ minHeight: 32, padding: "0 12px", fontSize: 12 }}
                        disabled={busy === `job:${j.name}`}
                        onClick={() => onRunJob(j.name)}
                      >
                        Run now
                      </button>
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
            <Icon name="i-refresh" />
          </span>
          <b>Background jobs</b>
          <span style={{ marginLeft: "auto" }}>
            {snap ? (
              <StatusPill
                status={snap.failed > 0 ? "warn" : "ok"}
                label={snap.failed > 0 ? `${snap.failed} failed` : "healthy"}
              />
            ) : null}
          </span>
        </div>
        <div style={{ padding: "16px 18px" }}>
          {snap ? (
            <section className="kpis" style={{ marginBottom: 0 }}>
              <div className="kpi">
                <div className="kpi__label">Running</div>
                <div className="kpi__val">{snap.running}</div>
              </div>
              <div className="kpi">
                <div className="kpi__label">Queued</div>
                <div className="kpi__val">{snap.queued}</div>
              </div>
              <div className="kpi">
                <div className="kpi__label">Completed 24h</div>
                <div className="kpi__val">{snap.completed_24h.toLocaleString()}</div>
              </div>
              <div className="kpi">
                <div className="kpi__label">Failed</div>
                <div className="kpi__val" style={{ color: snap.failed ? "var(--red)" : undefined }}>
                  {snap.failed}
                </div>
              </div>
            </section>
          ) : (
            <EmptyState title="No job snapshot" />
          )}
          <div className="btn-row" style={{ marginTop: 16 }}>
            <button
              type="button"
              className="btn-ghost"
              style={{ minHeight: 32, padding: "0 12px", fontSize: 12 }}
              disabled={busy === "retry-failed"}
              onClick={onRetryFailed}
            >
              Retry failed
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

function BackupsTab({
  backups,
  busy,
  onBackup,
}: {
  backups: ReturnType<typeof useApiResource<AdminBackupsResponse>>;
  busy: string | null;
  onBackup: () => void;
}) {
  if (backups.loading) return <LoadingState label="Loading backups…" />;
  if (backups.error) return <ErrorState message={backups.error} onRetry={backups.reload} />;

  const policy = backups.data?.policy;

  return (
    <>
      <div className="btn-row" style={{ marginTop: 0, marginBottom: 14 }}>
        <button type="button" className="btn-primary" disabled={busy === "backup"} onClick={onBackup}>
          {busy === "backup" ? "Backing up…" : "Backup now (with files)"}
        </button>
      </div>
      <div className="row c2">
        <div className="panel" style={{ padding: 0 }}>
          <div className="admin-card-h">
            <span className="admin-ic">
              <Icon name="i-download" />
            </span>
            <b>Recent backups</b>
            <span style={{ marginLeft: "auto" }}>
              {policy?.offsite != null ? (
                <StatusPill status={policy.offsite ? "ok" : "warn"} label={policy.offsite ? "offsite ✓" : "local only"} />
              ) : null}
            </span>
          </div>
          <div style={{ padding: "8px 10px 12px", overflowX: "auto" }}>
            {(backups.data?.items ?? []).length === 0 ? (
              <EmptyState title="No backups listed" />
            ) : (
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>Timestamp</th>
                    <th>Size</th>
                    <th>Type</th>
                    <th>Path</th>
                  </tr>
                </thead>
                <tbody>
                  {(backups.data?.items ?? []).map((b) => (
                    <tr key={b.path}>
                      <td className="admin-code">{b.timestamp}</td>
                      <td>{b.size ?? "—"}</td>
                      <td>{b.backup_type ?? "—"}</td>
                      <td className="admin-code" style={{ fontSize: 11 }}>
                        {b.path}
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
              <Icon name="i-sliders" />
            </span>
            <b>Backup policy</b>
          </div>
          <div style={{ padding: "8px 18px 18px" }}>
            {!policy ? (
              <EmptyState title="No policy returned" />
            ) : (
              <>
                <div className="admin-kv">
                  <span className="admin-kv__k">Frequency</span>
                  <span className="admin-code">{policy.frequency ?? "—"}</span>
                </div>
                <div className="admin-kv">
                  <span className="admin-kv__k">Include files</span>
                  <StatusPill status={policy.include_files ? "ok" : "warn"} label={policy.include_files ? "yes" : "no"} />
                </div>
                <div className="admin-kv">
                  <span className="admin-kv__k">Retention</span>
                  <span className="admin-code">
                    {policy.retention_days != null ? `${policy.retention_days} days` : "—"}
                  </span>
                </div>
                <div className="admin-kv">
                  <span className="admin-kv__k">Offsite</span>
                  <StatusPill status={policy.offsite ? "ok" : "warn"} label={policy.offsite ? "configured" : "not set"} />
                </div>
                <div className="admin-kv">
                  <span className="admin-kv__k">Encrypt at rest</span>
                  <StatusPill status={policy.encrypt ? "ok" : "warn"} label={policy.encrypt ? "on" : "off"} />
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

function LogsTab({
  logs,
  logKind,
  setLogKind,
}: {
  logs: ReturnType<typeof useApiResource<AdminLogsResponse>>;
  logKind: "error" | "activity";
  setLogKind: (k: "error" | "activity") => void;
}) {
  return (
    <div className="panel" style={{ padding: 0 }}>
      <div className="admin-card-h">
        <span className="admin-ic">
          <Icon name="i-clipboard" />
        </span>
        <b>{logKind === "error" ? "Error Log" : "Activity Log"}</b>
        <span style={{ marginLeft: "auto" }}>
          <button
            type="button"
            className="btn-ghost"
            style={{ minHeight: 32, padding: "0 12px", fontSize: 12 }}
            onClick={() => setLogKind(logKind === "error" ? "activity" : "error")}
          >
            {logKind === "error" ? "Activity Log" : "Error Log"}
          </button>
        </span>
      </div>
      <div style={{ padding: "8px 10px 12px", overflowX: "auto" }}>
        {logs.loading ? (
          <LoadingState label="Loading logs…" />
        ) : logs.error ? (
          <ErrorState message={logs.error} onRetry={logs.reload} />
        ) : (logs.data?.items ?? []).length === 0 ? (
          <EmptyState title="No log entries" />
        ) : (
          <table className="admin-table">
            <thead>
              <tr>
                <th>Time</th>
                <th>Source</th>
                <th>Message</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {(logs.data?.items ?? []).map((row, i) => (
                <tr key={row.name ?? `${row.time}-${i}`}>
                  <td className="admin-code">{row.time}</td>
                  <td>{row.source}</td>
                  <td>{row.message}</td>
                  <td>
                    <StatusPill status={row.level} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function IntegrationsTab({
  integrations,
}: {
  integrations: ReturnType<typeof useApiResource<AdminIntegrationsResponse>>;
}) {
  if (integrations.loading) return <LoadingState label="Loading integrations…" />;
  if (integrations.error) {
    return <ErrorState message={integrations.error} onRetry={integrations.reload} />;
  }
  const items = integrations.data?.items ?? [];
  if (!items.length) return <EmptyState title="No integrations" />;

  return (
    <div className="admin-int-grid">
      {items.map((it) => (
        <div key={it.id} className="panel" style={{ padding: 0 }}>
          <div className="admin-card-h">
            <span className="admin-ic">
              <Icon name="i-link" />
            </span>
            <b>{it.title}</b>
          </div>
          <div style={{ padding: "14px 18px 18px" }}>
            <StatusPill status={it.status} label={it.detail} />
            {it.href ? (
              <div className="btn-row" style={{ marginTop: 14 }}>
                <a className="btn-ghost" style={{ minHeight: 32, padding: "0 12px", fontSize: 12 }} href={it.href}>
                  Open
                </a>
              </div>
            ) : null}
          </div>
        </div>
      ))}
    </div>
  );
}

// silence unused ReactNode import if tree-shaken differently
void (0 as unknown as ReactNode);

import { useEffect, useMemo, useState } from "react";
import { useApiResource } from "../hooks/useApiResource";
import { EmptyState, ResourceGate } from "../components/PageStates";
import { useInstitution } from "../layout/InstitutionLayout";
import { actionLinesFromBody, plainText } from "../lib/plainText";
import {
  FormDrawer,
  Icon,
  RecordDrawer,
  Toast,
  useConfirmAction,
  type DrawerAction,
  type DrawerSection,
  type FormDrawerField,
  Select,
} from "@eswasaone/shared-ui";
import type {
  GovernanceResolution,
  GovernanceResolutionsResponse,
  ResolutionAction,
  ResolutionActionsResponse,
} from "../api/types";

const RST: Record<string, string> = {
  Passed: "navy",
  Deferred: "warn",
  Implemented: "ok",
  Rejected: "bad",
  Draft: "info",
};

function toneFor(status?: string): string {
  if (!status) return "mute";
  if (status in RST) return RST[status]!;
  const k = status.toLowerCase();
  if (k.includes("pass") || k.includes("adopt")) return "navy";
  if (k.includes("implement")) return "ok";
  if (k.includes("defer")) return "warn";
  if (k.includes("reject")) return "bad";
  return "mute";
}

function actionTone(status: ResolutionAction["status"]): string {
  if (status === "Overdue") return "bad";
  if (status === "Completed") return "ok";
  return "warn";
}

function voteLabel(r: GovernanceResolution): string {
  if (r.votes_for == null && r.votes_against == null && r.votes_abstained == null) return "—";
  return `${r.votes_for ?? 0}/${r.votes_against ?? 0}/${r.votes_abstained ?? 0}`;
}

const RES_FIELDS: FormDrawerField[] = [
  { name: "title", label: "Resolution", type: "textarea", required: true },
  { name: "meeting", label: "Meeting ref", required: true },
];

/** Resolutions & actions — GET /governance/actions + /governance/resolutions. */
export function ResolutionsView() {
  const { openAuth, user, sessionKey } = useInstitution();
  const { confirmAction, host } = useConfirmAction();
  const resolutions = useApiResource<GovernanceResolutionsResponse>("/governance/resolutions", {
    enabled: Boolean(user),
    refreshKey: sessionKey,
  });
  const [actionFilter, setActionFilter] = useState("");
  const actionsPath =
    actionFilter && actionFilter !== "Open"
      ? `/governance/actions?status=${encodeURIComponent(actionFilter)}`
      : "/governance/actions";
  const actionsRes = useApiResource<ResolutionActionsResponse>(actionsPath, {
    enabled: Boolean(user),
    refreshKey: `${sessionKey}:${actionFilter}`,
  });

  const [flash, setFlash] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);

  useEffect(() => {
    if (resolutions.authRequired || actionsRes.authRequired) {
      openAuth("Staff sign-in required");
    }
  }, [resolutions.authRequired, actionsRes.authRequired, openAuth]);

  const items = resolutions.data?.items ?? [];
  const openRes = items.find((r) => r.id === openId) ?? null;

  const actions = useMemo(() => {
    const list = actionsRes.data?.items ?? [];
    if (!actionFilter || actionFilter === "Open") {
      return list.filter((a) => a.status !== "Completed");
    }
    return list;
  }, [actionsRes.data, actionFilter]);

  const completedCount = useMemo(
    () => (actionsRes.data?.items ?? []).filter((a) => a.status === "Completed").length,
    [actionsRes.data],
  );
  const actionCounts = useMemo(() => {
    const map = new Map<string, number>();
    for (const a of actionsRes.data?.items ?? []) {
      if (!a.resolution) continue;
      map.set(a.resolution, (map.get(a.resolution) ?? 0) + 1);
    }
    return map;
  }, [actionsRes.data]);

  const drawerSections: DrawerSection[] = openRes
    ? [
        {
          heading: "Resolution",
          content: (
            <>
              <div className="kv">
                <b>Ref</b>
                <span>{openRes.id}</span>
              </div>
              <div className="kv">
                <b>Meeting</b>
                <span>{openRes.meeting || "—"}</span>
              </div>
              <div className="kv">
                <b>Outcome</b>
                <span>{openRes.outcome || "—"}</span>
              </div>
              <div className="kv">
                <b>Vote</b>
                <span>{voteLabel(openRes)}</span>
              </div>
              <div className="kv">
                <b>Status</b>
                <span className={`st ${toneFor(openRes.status)}`}>{openRes.status}</span>
              </div>
              {(() => {
                const actions = actionLinesFromBody(openRes.text);
                const body = plainText(openRes.text);
                if (!body && !actions.length) return null;
                if (actions.length) {
                  return (
                    <div className="kv" style={{ alignItems: "flex-start" }}>
                      <b>Actions</b>
                      <ul style={{ margin: 0, paddingLeft: "1.1rem" }}>
                        {actions.map((a) => (
                          <li key={a}>{a}</li>
                        ))}
                      </ul>
                    </div>
                  );
                }
                return (
                  <div className="kv" style={{ alignItems: "flex-start" }}>
                    <b>Text</b>
                    <span style={{ whiteSpace: "pre-wrap" }}>{body}</span>
                  </div>
                );
              })()}
            </>
          ),
        },
      ]
    : [];

  const drawerActions: DrawerAction[] = openRes
    ? [
        ...(openRes.allowed_actions ?? []).map((act) => ({
          label: act.label,
          icon: "i-check" as const,
          variant: (act.danger ? "ghost" : "gold") as DrawerAction["variant"],
          onClick: () => {
            void (async () => {
              const ok = await confirmAction({
                title: act.label,
                message: `${act.label} for ${openRes.id}?`,
                consequence: act.consequence ?? undefined,
                ruleId: act.rule_id ?? undefined,
                confirmLabel: act.label,
                danger: act.danger,
              });
              // TODO: wire real — resolution act endpoint when contract adds it
              if (ok) setFlash(`${act.label}: TODO (${openRes.id})`);
            })();
          },
        })),
        {
          label: "Close",
          variant: "ghost",
          onClick: () => setOpenId(null),
        },
      ]
    : [];

  async function onRecord(values: Record<string, string>) {
    const ok = await confirmAction({
      title: "Record resolution",
      message: `Record resolution against ${values.meeting}?`,
      ruleId: "R-G3",
      confirmLabel: "Record",
    });
    // TODO: wire real — POST /governance/resolutions when create lands
    if (!ok) return;
    setFlash("Resolution recorded: TODO");
    setFormOpen(false);
  }

  async function updateProgress(a: ResolutionAction) {
    const ok = await confirmAction({
      title: "Update progress",
      message: `Log a progress update for “${a.description}”?`,
      ruleId: "R-G8",
      confirmLabel: "Update",
    });
    // TODO: wire real — PATCH resolution action when contract lands
    if (!ok) return;
    setFlash(`Progress update: TODO (${a.id})`);
  }

  const loading = resolutions.loading && actionsRes.loading;
  const error = resolutions.error || actionsRes.error;

  return (
    <ResourceGate
      loading={loading}
      refreshing={resolutions.refreshing || actionsRes.refreshing}
      error={error}
      onRetry={() => {
        void resolutions.reload();
        void actionsRes.reload();
      }}
      hasData={resolutions.data != null || actionsRes.data != null}
      skeleton="list"
      label="Loading resolutions…"
    >
      <div className="gov">
        {host}
        <Toast message={flash} />

        <div className="panel" style={{ marginBottom: 16 }}>
          <div className="panel__h">
            <div>
              <h3>Action tracker</h3>
              <p>Every action raised by a resolution, until it is closed</p>
            </div>
            <div className="r">
              <Select
                aria-label="Filter actions"
                value={actionFilter}
                onChange={setActionFilter}
                options={[{ value: "", label: "All open" }, "Overdue", "Open", "Completed"]}
              />
            </div>
          </div>
          <div className="tbl-wrap">
            {actions.length === 0 ? (
              <EmptyState
                title="No actions"
                detail={
                  completedCount > 0 && (!actionFilter || actionFilter === "Open")
                    ? `${completedCount} completed. Switch the filter to Completed to review them.`
                    : "Actions appear once resolutions raise them."
                }
              />
            ) : (
              <table>
                <thead>
                  <tr>
                    <th>Action</th>
                    <th>Resolution</th>
                    <th>Owner</th>
                    <th>Due</th>
                    <th>Progress</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {actions.map((a) => (
                    <tr key={a.id} onClick={() => void updateProgress(a)}>
                      <td className="t">{a.description}</td>
                      <td>
                        <span className="mono">{a.resolution || "—"}</span>
                      </td>
                      <td>{a.owner || "—"}</td>
                      <td>{a.due_date || "—"}</td>
                      <td>
                        <div
                          className={`prog${a.status === "Overdue" ? " late" : ""}`}
                          title={`${a.progress}%`}
                        >
                          <i style={{ width: `${a.progress}%` }} />
                        </div>
                      </td>
                      <td>
                        <span className={`st ${actionTone(a.status)}`}>{a.status}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        <div className="panel">
          <div className="panel__h">
            <div>
              <h3>Resolutions register</h3>
              <p>All resolutions of the Board and its committees</p>
            </div>
            <div className="r">
              <button type="button" className="btn pri sm" onClick={() => setFormOpen(true)}>
                <Icon name="i-plus" />
                Record resolution
              </button>
            </div>
          </div>
          <div className="tbl-wrap">
            {items.length === 0 ? (
              <EmptyState
                title="Nothing here yet"
                detail="Resolutions will appear once they are drafted."
              />
            ) : (
              <table>
                <thead>
                  <tr>
                    <th>Ref</th>
                    <th>Resolution</th>
                    <th>Meeting</th>
                    <th>Vote</th>
                    <th>Actions</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((r) => (
                    <tr key={r.id} onClick={() => setOpenId(r.id)}>
                      <td>
                        <span className="mono">{r.id}</span>
                      </td>
                      <td className="t">{r.title}</td>
                      <td>{r.meeting || "—"}</td>
                      <td>{voteLabel(r)}</td>
                      <td>{actionCounts.get(r.id) ?? "—"}</td>
                      <td>
                        <span className={`st ${toneFor(r.status)}`}>{r.status}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        <RecordDrawer
          open={Boolean(openRes)}
          onClose={() => setOpenId(null)}
          reference={openRes?.id}
          title={openRes?.title ?? "Resolution"}
          subtitle={openRes ? `Meeting: ${openRes.meeting || "—"}` : null}
          sections={drawerSections}
          actions={drawerActions}
        />

        <FormDrawer
          open={formOpen}
          title="Record resolution"
          mode="create"
          fields={RES_FIELDS}
          onClose={() => setFormOpen(false)}
          onSubmit={onRecord}
        />
      </div>
    </ResourceGate>
  );
}

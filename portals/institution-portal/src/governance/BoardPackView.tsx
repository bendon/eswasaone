import { useEffect, useState } from "react";
import { useApiResource } from "../hooks/useApiResource";
import { EmptyState, ResourceGate } from "../components/PageStates";
import { useInstitution } from "../layout/InstitutionLayout";
import { AuthError, Icon, Toast, useConfirmAction } from "@eswasaone/shared-ui";
import type { GovernanceOverview, GovernancePack, PackSection } from "../api/types";
import { packStatusLabel } from "./types";
import { STUB_PACK_SECTIONS, sourceLabel } from "./stubs";
import { errStatus, govPatch, govPost } from "./api";

function isReady(status: string): boolean {
  return String(status).toLowerCase() === "ready";
}

/** Board Pack — GET packs/{meeting}; issue disabled until included sections are ready. */
export function BoardPackView() {
  const { openAuth, user, sessionKey } = useInstitution();
  const { confirmAction, host } = useConfirmAction();
  const overview = useApiResource<GovernanceOverview>("/governance/overview", {
    enabled: Boolean(user),
    refreshKey: sessionKey,
  });

  const meetingId =
    overview.data?.next_meeting?.id ||
    overview.data?.pack_track?.meeting_id ||
    null;

  const packPath = meetingId ? `/governance/packs/${encodeURIComponent(meetingId)}` : null;
  const pack = useApiResource<GovernancePack>(packPath ?? "/governance/board-pack", {
    enabled: Boolean(user) && Boolean(packPath),
    refreshKey: `${sessionKey}:${meetingId ?? ""}`,
  });

  const [flash, setFlash] = useState<string | null>(null);
  const [rows, setRows] = useState<PackSection[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (overview.authRequired || pack.authRequired) openAuth("Staff sign-in required");
  }, [overview.authRequired, pack.authRequired, openAuth]);

  useEffect(() => {
    const live =
      pack.data?.sections?.length
        ? pack.data.sections
        : overview.data?.pack_track?.sections?.length
          ? overview.data.pack_track.sections
          : null;
    // TODO: wire real — drop STUB_PACK_SECTIONS when Core always returns sections
    setRows((live ?? STUB_PACK_SECTIONS).map((s) => ({ ...s })));
  }, [pack.data, overview.data]);

  const packId = pack.data?.id ?? overview.data?.pack_track?.pack_id ?? null;
  const included = rows.filter((r) => r.included);
  const readyIncluded = included.filter((r) => isReady(r.status));
  const notReady = included.filter((r) => !isReady(r.status));
  const canIssue = included.length > 0 && notReady.length === 0;

  async function persistSections(next: PackSection[]) {
    if (!packId) {
      setRows(next);
      return;
    }
    setBusy(true);
    try {
      const updated = await govPatch<GovernancePack>(
        `/governance/packs/${encodeURIComponent(packId)}/sections`,
        {
          confirm: true,
          sections: next.map((s, idx) => ({
            id: s.id,
            included: s.included,
            idx,
          })),
        },
      );
      setRows(updated.sections?.length ? updated.sections : next);
      void pack.reload();
    } catch (err) {
      if (err instanceof AuthError && err.authRequired) openAuth(err.reason);
      else setFlash(err instanceof Error ? err.message : "Could not update sections");
      setRows(next); // optimistic local until Core accepts
    } finally {
      setBusy(false);
    }
  }

  function toggleInclude(id: string) {
    const next = rows.map((r) => (r.id === id ? { ...r, included: !r.included } : r));
    void persistSections(next);
  }

  function move(id: string, dir: -1 | 1) {
    const idx = rows.findIndex((r) => r.id === id);
    const j = idx + dir;
    if (idx < 0 || j < 0 || j >= rows.length) return;
    const next = [...rows];
    const tmp = next[idx]!;
    next[idx] = next[j]!;
    next[j] = tmp;
    void persistSections(next);
  }

  async function remind(section: PackSection) {
    const ok = await confirmAction({
      title: "Remind owner",
      message: `Send a reminder to ${section.owner || "the owner"} for “${section.title}”?`,
      consequence: "Notifies the section owner via Core.",
      ruleId: "R-G4",
      confirmLabel: "Send reminder",
    });
    if (!ok) return;
    // TODO: wire real — no remind endpoint on contract yet
    setFlash(`Reminder sent — TODO (${section.owner})`);
  }

  async function assembleDraft() {
    if (!packId) {
      setFlash("No pack id — schedule a meeting first");
      return;
    }
    const ok = await confirmAction({
      title: "Assemble draft pack",
      message: "Assemble the current included sections into a draft PDF?",
      consequence: "Creates a new pack version for review. Does not issue to members.",
      ruleId: "R-G5",
      confirmLabel: "Assemble",
    });
    if (!ok) return;
    setBusy(true);
    try {
      await govPost(`/governance/packs/${encodeURIComponent(packId)}/assemble`, {
        confirm: true,
      });
      setFlash("Draft pack assembled");
      void pack.reload();
    } catch (err) {
      if (err instanceof AuthError && err.authRequired) openAuth(err.reason);
      else setFlash(err instanceof Error ? err.message : "Assemble failed");
    } finally {
      setBusy(false);
    }
  }

  async function issuePack() {
    if (!canIssue || !packId) return;
    const ok = await confirmAction({
      title: "Issue pack to members",
      message: "Issue this pack to all confirmed board members?",
      consequence: "Locks the pack, notifies members, and advances the meeting workflow.",
      ruleId: "R-G6",
      confirmLabel: "Issue pack",
    });
    if (!ok) return;
    setBusy(true);
    try {
      await govPost<GovernancePack>(`/governance/packs/${encodeURIComponent(packId)}/issue`, {
        confirm: true,
      });
      setFlash("Pack issued to members");
      void pack.reload();
      void overview.reload();
    } catch (err) {
      if (err instanceof AuthError && err.authRequired) openAuth(err.reason);
      else if (errStatus(err) === 409) {
        setFlash(
          err instanceof Error
            ? err.message
            : "Cannot issue — included sections are not all Ready",
        );
      } else {
        setFlash(err instanceof Error ? err.message : "Issue failed");
      }
    } finally {
      setBusy(false);
    }
  }

  const dueLabel =
    pack.data?.due_label || overview.data?.pack_track?.due_label || "—";
  const meetingTitle =
    pack.data?.meeting_title || overview.data?.next_meeting?.title || "Board meeting";
  const version = pack.data?.version ?? 1;
  const packStatus = pack.data?.status ?? "Draft";

  return (
    <ResourceGate
      loading={overview.loading || (Boolean(packPath) && pack.loading)}
      refreshing={overview.refreshing || pack.refreshing}
      error={overview.error || pack.error}
      onRetry={() => {
        void overview.reload();
        void pack.reload();
      }}
      hasData={true}
      skeleton="list"
      label="Loading board pack…"
    >
      <div className="gov">
        {host}
        <Toast message={flash} />

        <div className="grid g-3-2">
          <div className="panel">
            <div className="panel__h">
              <div>
                <h3>
                  {meetingTitle} — pack v{version} ({packStatus.toLowerCase()})
                </h3>
                <p>Sections pull live figures from each module. Reorder before issue.</p>
              </div>
            </div>
            {rows.length === 0 ? (
              <EmptyState
                title="No board pack"
                detail="Packs and sections appear once a live Board Pack is configured in Desk."
              />
            ) : (
              <div className="pk">
                {rows.map((s, i) => {
                  const meta = packStatusLabel(s.status);
                  return (
                    <div key={s.id} className="pk__row">
                      <div className="pk__grip" title="Reorder" aria-hidden>
                        <Icon name="i-more" />
                      </div>
                      <span className="pk__n">{i + 1}</span>
                      <div>
                        <b>{s.title}</b>
                        <span className="pk__src">
                          <Icon name="i-layers" />
                          {sourceLabel(s.source)}
                        </span>
                      </div>
                      <span className="pk__own">{s.owner || "—"}</span>
                      <span className={`pk__st st ${meta.tone}`}>{meta.label}</span>
                      <div className="pk__act">
                        <label title="Include in pack">
                          <input
                            className="cb"
                            type="checkbox"
                            checked={s.included}
                            disabled={busy}
                            onChange={() => toggleInclude(s.id)}
                            aria-label={`Include ${s.title}`}
                          />
                        </label>
                        <button
                          type="button"
                          className="btn ghost sm"
                          disabled={busy || i === 0}
                          onClick={() => move(s.id, -1)}
                          aria-label="Move up"
                        >
                          ↑
                        </button>
                        <button
                          type="button"
                          className="btn ghost sm"
                          disabled={busy || i === rows.length - 1}
                          onClick={() => move(s.id, 1)}
                          aria-label="Move down"
                        >
                          ↓
                        </button>
                        {!isReady(s.status) ? (
                          <button
                            type="button"
                            className="btn ghost sm"
                            onClick={() => void remind(s)}
                          >
                            Remind
                          </button>
                        ) : null}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="side-sum">
            <div className="panel">
              <div className="panel__h">
                <div>
                  <h3>Pack status</h3>
                </div>
              </div>
              <div className="panel__b">
                <div className="kv">
                  <b>Meeting</b>
                  <span>{meetingTitle}</span>
                </div>
                <div className="kv">
                  <b>Sections included</b>
                  <span>
                    {included.length} of {rows.length}
                  </span>
                </div>
                <div className="kv">
                  <b>Ready</b>
                  <span>{readyIncluded.length}</span>
                </div>
                <div className="kv">
                  <b>Issue deadline</b>
                  <span>{dueLabel}</span>
                </div>
                <div className="kv">
                  <b>Classification</b>
                  <span>Confidential — Board only</span>
                </div>
                <div className="note" style={{ marginTop: 10 }}>
                  {canIssue
                    ? "All included sections are ready. You can issue the pack to members."
                    : `${notReady.length} section${notReady.length === 1 ? "" : "s"} not ready. You can assemble a draft to review, but the issue button stays disabled until every included section is ready.`}
                </div>
                <div style={{ display: "flex", gap: 8, marginTop: 14, flexWrap: "wrap" }}>
                  <button
                    type="button"
                    className="btn ghost"
                    disabled={busy || !packId}
                    onClick={() => void assembleDraft()}
                  >
                    <Icon name="i-layers" />
                    Assemble draft
                  </button>
                  <button
                    type="button"
                    className="btn pri"
                    disabled={busy || !canIssue || !packId}
                    onClick={() => void issuePack()}
                    title={
                      canIssue
                        ? "Issue pack to members"
                        : "Disabled until all included sections are ready"
                    }
                  >
                    <Icon name="i-send" />
                    Issue to members
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </ResourceGate>
  );
}

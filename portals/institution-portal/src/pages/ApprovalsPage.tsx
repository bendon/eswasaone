import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  apiFetch,
  ApiError,
  AuthError,
  Icon,
  ModuleHeader,
  Toolbar,
  DataRow,
  RecordDrawer,
  Toast,
  SubTabs,
  type SummaryTile,
  type DataMetaItem,
  type DrawerSection,
  type DrawerAction,
  type SubTab,
  type IconName,
  useDialogs,
} from "@eswasaone/shared-ui";
import type { ApprovalsResponse } from "../api/types";
import {
  fromApprovalItem,
  MODULE_FILTERS,
  moduleIcon,
  primaryActionLabel,
  sortInbox,
  type InboxFamily,
  type InboxItem,
} from "../approvals/inbox";
import { useApiResource } from "../hooks/useApiResource";
import { ErrorState, LoadingState } from "../components/PageStates";
import { RequireStaff } from "../components/RequireStaff";
import { useInstitution } from "../layout/InstitutionLayout";

function itemKey(item: InboxItem): string {
  return `${item.doctype || "?"}::${item.name || item.id}`;
}

function missingActTarget(item: InboxItem): string | null {
  if (!item.live) return null;
  if (!item.doctype?.trim()) return "Missing doctype. Cannot act on this item.";
  if (!item.name?.trim()) return "Missing document name. Cannot act on this item.";
  return null;
}

type TabId = InboxFamily;

const TAB_LABEL_TO_ID: Record<string, TabId> = {
  Approvals: "approve",
  Tasks: "do",
  Alerts: "alert",
};

const TAB_DEFS: ReadonlyArray<SubTab & { manual: true }> = [
  { label: "Approvals", icon: "i-check-c", manual: true },
  { label: "Tasks", icon: "i-clipboard", manual: true },
  { label: "Alerts", icon: "i-warn", manual: true },
];

/** Map an inbox family to the DataRow icon-variant palette. */
function famIconVariant(fam: InboxFamily): "navy" | "purple" | "amber" {
  if (fam === "do") return "purple";
  if (fam === "alert") return "amber";
  return "navy";
}

/** SLA pill variant for meta + drawer tiles. */
function slaVariant(pri: InboxItem["pri"]): "breach" | "due" | "ok" {
  if (pri === "breach") return "breach";
  if (pri === "due") return "due";
  return "ok";
}

export function ApprovalsPage() {
  const { openAuth, user, sessionKey } = useInstitution();
  const dialogs = useDialogs();
  const [searchParams, setSearchParams] = useSearchParams();
  const { data, loading, error, authRequired, reload } = useApiResource<ApprovalsResponse>(
    "/approvals?limit=100",
    { enabled: Boolean(user), refreshKey: sessionKey },
  );

  const [localItems, setLocalItems] = useState<InboxItem[] | null>(null);
  const [tab, setTab] = useState<TabId>("approve");
  const [moduleFilter, setModuleFilter] = useState<string>("All modules");
  const [sortMode, setSortMode] = useState("Sort: SLA first");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [openIds, setOpenIds] = useState<Set<string>>(() => new Set());
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [drawerItem, setDrawerItem] = useState<InboxItem | null>(null);
  const [deepLinkHandled, setDeepLinkHandled] = useState(false);

  useEffect(() => {
    if (authRequired) openAuth("Staff sign-in required for approvals");
  }, [authRequired, openAuth]);

  useEffect(() => {
    if (!data) return;
    setLocalItems((data.items || []).map(fromApprovalItem));
    setSelected(new Set());
    setOpenIds(new Set());
    setDeepLinkHandled(false);
  }, [data]);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast(null), 1900);
  }, []);

  const items = localItems ?? [];

  // Deep-link from dashboard: /approvals?open=NAME (&doctype= optional)
  useEffect(() => {
    if (deepLinkHandled || items.length === 0) return;
    const openKey = searchParams.get("open");
    if (!openKey) return;
    const doctype = searchParams.get("doctype");
    const match = items.find((it) => {
      if (doctype && it.doctype !== doctype) return false;
      return it.name === openKey || it.id === openKey || itemKey(it) === openKey;
    });
    if (!match) {
      setDeepLinkHandled(true);
      return;
    }
    setTab(match.fam);
    setDrawerItem(match);
    setDeepLinkHandled(true);
    const next = new URLSearchParams(searchParams);
    next.delete("open");
    next.delete("doctype");
    setSearchParams(next, { replace: true });
  }, [items, searchParams, deepLinkHandled, setSearchParams]);

  const counts = useMemo(
    () => ({
      approve: items.filter((i) => i.fam === "approve").length,
      do: items.filter((i) => i.fam === "do").length,
      alert: items.filter((i) => i.fam === "alert").length,
      breach: items.filter((i) => i.pri === "breach").length,
      due: items.filter((i) => i.pri === "due").length,
      total: items.length,
    }),
    [items],
  );

  const summaryTiles = useMemo<SummaryTile[]>(
    () => [
      { label: "SLA\nbreached", value: counts.breach, variant: "breach" },
      { label: "Due\ntoday", value: counts.due, variant: "due" },
      { label: "Total\npending", value: counts.total },
    ],
    [counts],
  );

  const tabBadge = (label: string): number => {
    const id = TAB_LABEL_TO_ID[label];
    if (id === "approve") return counts.approve;
    if (id === "do") return counts.do;
    return counts.alert;
  };

  const subTabs = useMemo<SubTab[]>(
    () =>
      TAB_DEFS.map((t) => ({
        ...t,
        badge: tabBadge(t.label),
      })),
    // tabBadge depends on counts; recompute when counts change
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [counts],
  );

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    let rows = items.filter((i) => i.fam === tab);
    if (moduleFilter !== "All modules") {
      rows = rows.filter((i) => i.module === moduleFilter);
    }
    if (q) {
      rows = rows.filter((i) => {
        const hay = `${i.title} ${i.name} ${i.doctype} ${i.module} ${i.from || ""}`.toLowerCase();
        return hay.includes(q);
      });
    }
    return sortInbox(rows, sortMode);
  }, [items, tab, moduleFilter, query, sortMode]);

  function toggleOpen(id: string) {
    setOpenIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelect(id: string, on: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  function toggleAll(on: boolean) {
    if (!on) {
      setSelected(new Set());
      return;
    }
    setSelected(new Set(visible.map((i) => i.id)));
  }

  function removeItems(ids: string[]) {
    const drop = new Set(ids);
    setLocalItems((prev) => (prev || []).filter((i) => !drop.has(i.id)));
    setSelected((prev) => {
      const next = new Set(prev);
      ids.forEach((id) => next.delete(id));
      return next;
    });
  }

  async function actLive(item: InboxItem, action: "approve" | "reject" | "return", verbLabel: string) {
    const missing = missingActTarget(item);
    if (missing) {
      showToast(missing);
      return;
    }
    const ok = await dialogs.confirm({
      title: verbLabel,
      message: `${verbLabel} “${item.name}”?\n\nThis will record your decision and update the workflow for the team.`,
      confirmLabel: verbLabel,
      danger: verbLabel.toLowerCase().includes("reject"),
    });
    if (!ok) {
      return;
    }
    const key = itemKey(item);
    setBusyKey(key);
    try {
      const res = await apiFetch<{ message?: string }>(
        `/approvals/${encodeURIComponent(item.doctype)}/${encodeURIComponent(item.name)}/act`,
        {
          method: "POST",
          body: JSON.stringify({ action, confirm: true }),
        },
      );
      removeItems([item.id]);
      showToast(res.message ?? `${verbLabel}: ${item.name}`);
      reload();
    } catch (err) {
      if (err instanceof AuthError && err.authRequired) openAuth(err.reason);
      else if (!(err instanceof ApiError && err.notified)) {
        showToast(err instanceof Error ? err.message : "Action failed");
      }
    } finally {
      setBusyKey(null);
    }
  }

  async function actItem(item: InboxItem, outcome: string) {
    if (!item.live) {
      removeItems([item.id]);
      showToast(`${outcome}: ${item.name}`);
      return;
    }
    const action: "approve" | "reject" | "return" =
      outcome === "Rejected" ? "reject" : outcome === "Returned" ? "return" : "approve";
    await actLive(item, action, outcome);
  }

  async function bulkAct() {
    const chosen = items.filter((i) => selected.has(i.id));
    if (!chosen.length) return;
    const fams = new Set(chosen.map((i) => i.fam));
    if (fams.size > 1) {
      showToast("Select same-type items only");
      return;
    }
    const live = chosen.filter((i) => i.live);
    const stubs = chosen.filter((i) => !i.live);
    const label = bulkLabel.replace(" selected", "");
    if (live.length) {
      const ok = await dialogs.confirm({
        title: label,
        message: `${label} ${live.length} item${live.length === 1 ? "" : "s"}?\n\nThis will record your decisions and update each workflow.`,
        confirmLabel: label,
        danger: label.toLowerCase().includes("reject"),
      });
      if (!ok) {
        return;
      }
    }
    if (stubs.length) {
      removeItems(stubs.map((i) => i.id));
    }
    for (const item of live) {
      const key = itemKey(item);
      setBusyKey(key);
      try {
        const res = await apiFetch<{ message?: string }>(
          `/approvals/${encodeURIComponent(item.doctype)}/${encodeURIComponent(item.name)}/act`,
          {
            method: "POST",
            body: JSON.stringify({ action: "approve", confirm: true }),
          },
        );
        removeItems([item.id]);
        showToast(res.message ?? `${label}: ${item.name}`);
      } catch (err) {
        if (err instanceof AuthError && err.authRequired) {
          openAuth(err.reason);
          break;
        }
        if (!(err instanceof ApiError && err.notified)) {
          showToast(err instanceof Error ? err.message : "Action failed");
        }
        break;
      } finally {
        setBusyKey(null);
      }
    }
    if (stubs.length && !live.length) {
      showToast(`${stubs.length} items actioned`);
    } else if (live.length) {
      reload();
    }
  }

  const allChecked = visible.length > 0 && visible.every((i) => selected.has(i.id));
  const bulkLabel =
    tab === "approve" ? "Approve selected" : tab === "alert" ? "Acknowledge selected" : "Complete selected";

  const activeTabLabel =
    tab === "approve" ? "Approvals" : tab === "do" ? "Tasks" : "Alerts";

  /** Build meta items for a row. */
  function rowMeta(item: InboxItem): DataMetaItem[] {
    const meta: DataMetaItem[] = [
      { label: item.sla, sla: slaVariant(item.pri) },
      { label: item.module, tag: true },
      { label: `${item.doctype} · ${item.name}`, mono: true },
    ];
    if (item.from) meta.push({ label: `from ${item.from}` });
    return meta;
  }

  /** Build inline-expandable detail kv pairs from the item's detail map. */
  function rowDetail(item: InboxItem): { label: string; value: string }[] {
    return Object.entries(item.detail).map(([k, v]) => ({ label: k, value: v }));
  }

  /** Build drawer sections for the open record. */
  function drawerSections(item: InboxItem): DrawerSection[] {
    const missing = missingActTarget(item);
    const recordKvs = (
      <>
        <div className="kv"><b>Reference</b><span className="mono">{item.name}</span></div>
        <div className="kv"><b>Document type</b><span>{item.doctype}</span></div>
        <div className="kv"><b>Status</b><span>{item.detail.Status || "Pending"}</span></div>
        <div className="kv"><b>Module</b><span>{item.module}</span></div>
        <div className="kv"><b>Submitter</b><span>{item.from || "—"}</span></div>
        <div className="kv"><b>SLA</b><span>{item.sla}</span></div>
        <div className="kv"><b>Rule</b><span>{item.rule || "—"}</span></div>
      </>
    );

    const extraEntries = Object.entries(item.detail).filter(([k]) => k !== "Status");
    const detailsKvs = extraEntries.length ? (
      <>
        {extraEntries.map(([k, v]) => (
          <div key={k} className="kv"><b>{k}</b><span>{v}</span></div>
        ))}
      </>
    ) : (
      <div className="kv"><b>—</b><span>No additional metadata</span></div>
    );

    const description = (
      <p style={{ fontSize: 13, lineHeight: 1.55, color: "var(--ink)", margin: 0 }}>
        {item.title}
        {item.live ? " (live queue item; actions commit to the workflow)." : " (sample item; actions stay local)."}
      </p>
    );

    const sections: DrawerSection[] = [
      { heading: "Record", content: recordKvs },
      { heading: "Details", content: detailsKvs },
      { heading: "Description", content: description },
    ];

    if (missing) {
      sections.push({
        heading: "Notices",
        content: (
          <p style={{ fontSize: 12.5, color: "var(--red)", margin: 0 }}>{missing}</p>
        ),
      });
    }

    return sections;
  }

  /** Build drawer footer actions for the open record. */
  function drawerActions(item: InboxItem): DrawerAction[] {
    const key = itemKey(item);
    const busy = busyKey === key;
    const missing = missingActTarget(item);
    const disabled = busy || Boolean(missing);

    async function runAndClose(outcome: string) {
      const target = item;
      setDrawerItem(null);
      await actItem(target, outcome);
    }

    if (item.fam === "approve") {
      return [
        { label: "Approve", icon: "i-check", variant: "pri", onClick: () => void runAndClose("Approved"), disabled },
        { label: "Reject", variant: "ghost", onClick: () => void runAndClose("Rejected"), disabled },
        { label: "Request info", variant: "ghost", onClick: () => void runAndClose("Returned"), disabled: busy },
      ];
    }
    if (item.fam === "alert") {
      return [
        { label: "Acknowledge", icon: "i-check", variant: "pri", onClick: () => void runAndClose("Acknowledged"), disabled: busy },
        { label: "Close", variant: "ghost", onClick: () => setDrawerItem(null) },
      ];
    }
    // do-family: primary completes the next workflow step (maps to approve|Submit…).
    // Do not offer Request info / return — many do states have no return transition
    // (e.g. Board Pack Draft → Submit for Review only).
    return [
      { label: primaryActionLabel(item), icon: "i-check", variant: "pri", onClick: () => void runAndClose("Done"), disabled },
      { label: "Close", variant: "ghost", onClick: () => setDrawerItem(null) },
    ];
  }

  return (
    <RequireStaff reason="Staff sign-in required for approvals">
      {loading && !localItems ? (
        <LoadingState label="Loading approvals…" />
      ) : error && !localItems ? (
        <ErrorState message={error} onRetry={reload} />
      ) : (
        <div className="inbox">
          <ModuleHeader
            title="Your inbox"
            subtitle="Everything waiting on you, sorted by SLA and scoped to your roles."
            summary={summaryTiles}
          />

          <SubTabs
            tabs={subTabs}
            active={activeTabLabel}
            onTab={(label) => {
              const id = TAB_LABEL_TO_ID[label];
              if (id) {
                setTab(id);
                setSelected(new Set());
              }
            }}
          />

          <Toolbar
            filters={[
              {
                label: "Filter by module",
                value: moduleFilter,
                options: [...MODULE_FILTERS],
                onChange: setModuleFilter,
              },
              {
                label: "Sort inbox",
                value: sortMode,
                options: ["Sort: SLA first", "Newest", "Priority"],
                onChange: setSortMode,
              },
            ]}
            search={{
              value: query,
              onChange: setQuery,
              placeholder: "Search reference, company, standard…",
            }}
            extra={
              <label className="inbox-selectall">
                <input
                  type="checkbox"
                  className="inbox-cb"
                  checked={allChecked}
                  onChange={(e) => toggleAll(e.target.checked)}
                />
                Select all
              </label>
            }
          />

          <div className={`inbox-bulk${selected.size ? " show" : ""}`}>
            <b>{selected.size} selected</b>
            <span className="hint">Same-type items only</span>
            <div className="r">
              <button type="button" className="bb gold" onClick={() => void bulkAct()}>
                {bulkLabel}
              </button>
              <button type="button" className="bb" onClick={() => setSelected(new Set())}>
                Clear
              </button>
            </div>
          </div>

          <div className="data-list">
            {!visible.length ? (
              <div className="inbox-empty">Nothing here. You&apos;re all caught up.</div>
            ) : (
              visible.map((item) => {
                const key = itemKey(item);
                const missing = missingActTarget(item);
                const busy = busyKey === key;
                const isOpen = openIds.has(item.id);
                const famIcon: IconName = moduleIcon(item.module);

                const rowActions = (
                  <>
                    <input
                      type="checkbox"
                      className="inbox-cb"
                      checked={selected.has(item.id)}
                      onChange={(e) => toggleSelect(item.id, e.target.checked)}
                      aria-label={`Select ${item.name}`}
                    />
                    {item.fam === "approve" ? (
                      <>
                        <button
                          type="button"
                          className="inbox-btn pri"
                          disabled={busy || Boolean(missing)}
                          onClick={() => void actItem(item, "Approved")}
                        >
                          <Icon name="i-check" /> Approve
                        </button>
                        <button
                          type="button"
                          className="inbox-btn reject"
                          disabled={busy || Boolean(missing)}
                          onClick={() => void actItem(item, "Rejected")}
                        >
                          Reject
                        </button>
                      </>
                    ) : item.fam === "alert" ? (
                      <button
                        type="button"
                        className="inbox-btn ghost"
                        disabled={busy}
                        onClick={() => void actItem(item, "Acknowledged")}
                      >
                        <Icon name="i-check" /> Acknowledge
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="inbox-btn pri"
                        disabled={busy || Boolean(missing)}
                        onClick={() => void actItem(item, "Done")}
                      >
                        <Icon name="i-check" /> {primaryActionLabel(item)}
                      </button>
                    )}
                  </>
                );

                return (
                  <DataRow
                    key={item.id}
                    icon={famIcon}
                    iconVariant={famIconVariant(item.fam)}
                    title={item.title}
                    badge={item.rule}
                    meta={rowMeta(item)}
                    actions={rowActions}
                    detail={rowDetail(item)}
                    expanded={isOpen}
                    onToggleExpand={() => toggleOpen(item.id)}
                    onOpen={() => setDrawerItem(item)}
                  />
                );
              })
            )}
          </div>

          <RecordDrawer
            open={Boolean(drawerItem)}
            onClose={() => setDrawerItem(null)}
            reference={drawerItem ? `${drawerItem.doctype} · ${drawerItem.name}` : undefined}
            title={drawerItem?.title ?? ""}
            subtitle={
              drawerItem ? (
                <>
                  <span className={`sla ${slaVariant(drawerItem.pri)}`}>
                    <span className="d" />
                    {drawerItem.sla}
                  </span>
                  <span className="tag">{drawerItem.module}</span>
                  {drawerItem.from ? <span>from {drawerItem.from}</span> : null}
                </>
              ) : null
            }
            sections={drawerItem ? drawerSections(drawerItem) : []}
            actions={drawerItem ? drawerActions(drawerItem) : []}
          />

          <Toast message={toast} />
        </div>
      )}
    </RequireStaff>
  );
}
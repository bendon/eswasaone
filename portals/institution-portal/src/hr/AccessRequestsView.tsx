import { useMemo, useState } from "react";
import {
  DataRow,
  ModuleHeader,
  RecordDrawer,
  Toolbar,
  type DataMetaItem,
  type DrawerAction,
  type DrawerSection,
  type SummaryTile,
} from "@eswasaone/shared-ui";
import { EmptyState } from "../components/PageStates";
import { RequireStaff } from "../components/RequireStaff";
import { useInstitution } from "../layout/InstitutionLayout";
import {
  canReviewAccessRequests,
  listAccessRequests,
  reviewAccessRequest,
  type AccessRequestStatus,
  type ModuleAccessRequest,
} from "./accessRequests";

type StatusFilter = "all" | AccessRequestStatus;

function statusLabel(s: AccessRequestStatus): string {
  if (s === "pending") return "Pending";
  if (s === "approved") return "Approved";
  return "Rejected";
}

function statusSla(s: AccessRequestStatus): "due" | "ok" | "breach" {
  if (s === "pending") return "due";
  if (s === "approved") return "ok";
  return "breach";
}

export function AccessRequestsView() {
  const { user } = useInstitution();
  const [tick, setTick] = useState(0);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("pending");
  const [openId, setOpenId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const canReview = canReviewAccessRequests(user.roles);
  const items = useMemo(() => {
    void tick;
    return listAccessRequests();
  }, [tick]);

  const filtered = useMemo(() => {
    if (statusFilter === "all") return items;
    return items.filter((i) => i.status === statusFilter);
  }, [items, statusFilter]);

  const selected = items.find((i) => i.id === openId) ?? null;

  const tiles: SummaryTile[] = [
    { label: "Total", value: items.length },
    {
      label: "Pending",
      value: items.filter((i) => i.status === "pending").length,
      variant: "due",
    },
    {
      label: "Approved",
      value: items.filter((i) => i.status === "approved").length,
      variant: "ok",
    },
  ];

  function refresh() {
    setTick((n) => n + 1);
  }

  function decide(item: ModuleAccessRequest, decision: "approved" | "rejected") {
    if (!canReview || busy) return;
    setBusy(true);
    try {
      // TODO: wire real — PATCH /hr/access-requests/{id} then assign Desk role
      reviewAccessRequest(item.id, decision, user.username);
      refresh();
      if (openId === item.id) setOpenId(null);
    } finally {
      setBusy(false);
    }
  }

  const drawerSections: DrawerSection[] = selected
    ? [
        {
          heading: "Request",
          content: (
            <>
              <div className="kv">
                <b>Reference</b>
                <span className="mono">{selected.id}</span>
              </div>
              <div className="kv">
                <b>Module</b>
                <span>{selected.moduleLabel}</span>
              </div>
              <div className="kv">
                <b>Status</b>
                <span className="stagechip">{statusLabel(selected.status)}</span>
              </div>
              <div className="kv">
                <b>Submitted</b>
                <span>{new Date(selected.createdAt).toLocaleString()}</span>
              </div>
            </>
          ),
        },
        {
          heading: "Requester",
          content: (
            <>
              <div className="kv">
                <b>Name</b>
                <span>{selected.requesterName}</span>
              </div>
              <div className="kv">
                <b>User</b>
                <span className="mono">{selected.requesterUsername}</span>
              </div>
              <div className="kv">
                <b>Email</b>
                <span>{selected.requesterEmail || "—"}</span>
              </div>
              <div className="kv">
                <b>Note</b>
                <span>{selected.note || "—"}</span>
              </div>
            </>
          ),
        },
      ]
    : [];

  const drawerActions: DrawerAction[] =
    selected && selected.status === "pending" && canReview
      ? [
          {
            label: busy ? "Working…" : "Approve",
            variant: "pri",
            onClick: () => decide(selected, "approved"),
            disabled: busy,
          },
          {
            label: "Reject",
            variant: "ghost",
            onClick: () => decide(selected, "rejected"),
            disabled: busy,
          },
        ]
      : [];

  if (!canReview) {
    return (
      <RequireStaff reason="Staff sign-in required">
        <EmptyState
          title="Supervisor / HR only"
          detail="Module access requests are reviewed by your head of department, HR, or a System Manager."
        />
      </RequireStaff>
    );
  }

  return (
    <RequireStaff reason="Staff sign-in required">
      <ModuleHeader
        title="Access requests"
        subtitle="Staff asking for Institution module access. After you approve, a System Manager still assigns the matching role."
        summary={tiles}
      />

      <Toolbar
        filters={[
          {
            label: "Filter by status",
            value:
              statusFilter === "all"
                ? "All"
                : statusFilter === "pending"
                  ? "Pending"
                  : statusFilter === "approved"
                    ? "Approved"
                    : "Rejected",
            options: ["Pending", "Approved", "Rejected", "All"],
            onChange: (v) => {
              const key = v.toLowerCase() as StatusFilter | "all";
              setStatusFilter(key === "all" ? "all" : key);
            },
          },
        ]}
      />

      {filtered.length === 0 ? (
        <EmptyState
          title="No access requests"
          detail="When staff request a locked module, their submissions appear here for supervisor / HR review."
        />
      ) : (
        <div className="data-list">
          {filtered.map((item) => {
            const meta: DataMetaItem[] = [
              { label: item.moduleLabel, tag: true },
              { label: item.requesterName },
              { label: statusLabel(item.status), sla: statusSla(item.status) },
            ];
            return (
              <DataRow
                key={item.id}
                icon="i-lock"
                iconVariant="amber"
                title={`${item.requesterName} → ${item.moduleLabel}`}
                badge={item.id}
                meta={meta}
                onOpen={() => setOpenId(item.id)}
              />
            );
          })}
        </div>
      )}

      <RecordDrawer
        open={!!selected}
        onClose={() => setOpenId(null)}
        reference={selected?.id}
        title={selected ? selected.requesterName : ""}
        subtitle={selected ? selected.moduleLabel : null}
        sections={drawerSections}
        actions={drawerActions}
      />
    </RequireStaff>
  );
}

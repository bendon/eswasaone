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
import { EmptyState, ResourceGate } from "../components/PageStates";
import { useApiResource } from "../hooks/useApiResource";
import { errorText } from "./api";
import { RequireStaff } from "../components/RequireStaff";
import { useInstitution } from "../layout/InstitutionLayout";
import {
  canReviewAccessRequests,
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
  const { user, sessionKey } = useInstitution();
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("pending");
  const [openId, setOpenId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const [actionErr, setActionErr] = useState<string | null>(null);

  const canReview = canReviewAccessRequests(user.roles);
  const res = useApiResource<ModuleAccessRequest[]>("/hr/access-requests", { enabled: canReview, refreshKey: sessionKey });
  const items = useMemo(
    () => [...(res.data ?? [])].sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? "")),
    [res.data],
  );

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

  function open(id: string | null) {
    setOpenId(id);
    setNote("");
    setActionErr(null);
  }

  async function decide(item: ModuleAccessRequest, decision: "approved" | "rejected") {
    if (!canReview || busy) return;
    if (decision === "rejected" && !note.trim()) {
      setActionErr("Say why you're not giving access. The requester sees your note.");
      return;
    }
    setBusy(true);
    setActionErr(null);
    try {
      await reviewAccessRequest(item.id, decision, note);
      open(null);
      res.reload();
    } catch (err) {
      setActionErr(errorText(err));
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
                <span>{selected.createdAt ? new Date(selected.createdAt).toLocaleString() : "—"}</span>
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
        selected.status === "pending"
          ? {
              heading: "Your review",
              content: (
                <>
                  <label className="hr-f">
                    <span>Note to the requester (needed to reject)</span>
                    <textarea className="hr-in" rows={3} value={note} disabled={busy} onChange={(e) => setNote(e.target.value)} />
                  </label>
                  <p className="page-note">Approving gives the role for that module straight away. You can't review your own request.</p>
                  {actionErr ? (
                    <p className="page-note" role="alert">
                      {actionErr}
                    </p>
                  ) : null}
                </>
              ),
            }
          : {
              heading: "Review",
              content: (
                <>
                  <div className="kv">
                    <b>Reviewed by</b>
                    <span>{selected.reviewedBy || "—"}</span>
                  </div>
                  <div className="kv">
                    <b>When</b>
                    <span>{selected.reviewedAt ? new Date(selected.reviewedAt).toLocaleString() : "—"}</span>
                  </div>
                  <div className="kv">
                    <b>Note</b>
                    <span>{selected.reviewNote || "—"}</span>
                  </div>
                  {selected.rolesGranted ? (
                    <div className="kv">
                      <b>Role given</b>
                      <span>{selected.rolesGranted}</span>
                    </div>
                  ) : null}
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
            onClick: () => void decide(selected, "approved"),
            disabled: busy,
          },
          {
            label: "Reject",
            variant: "ghost",
            onClick: () => void decide(selected, "rejected"),
            disabled: busy,
          },
        ]
      : [];

  if (!canReview) {
    return (
      <RequireStaff reason="Staff sign-in required">
        <EmptyState
          title="Supervisor / HR only"
          detail="Module access requests are reviewed by HR or a System Manager."
        />
      </RequireStaff>
    );
  }

  return (
    <RequireStaff reason="Staff sign-in required">
      <ModuleHeader
        title="Access requests"
        subtitle="Staff asking for Institution module access. Approving gives the role for that module; the same requests also show in Approvals."
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

      <ResourceGate loading={res.loading} error={res.error} onRetry={res.reload} refreshing={res.refreshing} hasData={Boolean(res.data)}>
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
                onOpen={() => open(item.id)}
              />
            );
          })}
        </div>
      )}
      </ResourceGate>

      <RecordDrawer
        open={!!selected}
        onClose={() => open(null)}
        reference={selected?.id}
        title={selected ? selected.requesterName : ""}
        subtitle={selected ? selected.moduleLabel : null}
        sections={drawerSections}
        actions={drawerActions}
      />
    </RequireStaff>
  );
}

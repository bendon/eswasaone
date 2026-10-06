import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  DataRow,
  FormDrawer,
  ModuleHeader,
  RecordDrawer,
  Toast,
  Toolbar,
  useDialogs,
  type DataMetaItem,
  type DrawerAction,
  type DrawerSection,
  type FormDrawerField,
  type SummaryTile,
} from "@eswasaone/shared-ui";
import type { CertificationApplication } from "../api/types";
import { useApiResource } from "../hooks/useApiResource";
import { EmptyState } from "../components/PageStates";
import { RequireStaff } from "../components/RequireStaff";
import { useInstitution } from "../layout/InstitutionLayout";
import {
  listFindings,
  listLab,
  raiseFinding,
  recordLab,
  reviewCorrectiveAction,
  type DeskFinding,
  type LabEntry,
} from "./deskApi";
import { fmtDate } from "./pipeline";

/** Findings: non-conformities and corrective actions, plus laboratory results (product flow). */

const STATUS_LABEL: Record<DeskFinding["status"], string> = {
  open: "Open",
  submitted: "Awaiting review",
  accepted: "Closed",
  rejected: "Rejected, client to resubmit",
};

function dueSla(f: DeskFinding): { kind: "breach" | "due" | "ok"; text: string } {
  if (f.status === "accepted") return { kind: "ok", text: "closed" };
  const days = Math.round((Date.parse(f.due) - Date.now()) / 86_400_000);
  if (days < 0) return { kind: "breach", text: `${-days}d overdue` };
  if (days <= 7) return { kind: "due", text: `due in ${days}d` };
  return { kind: "ok", text: `due in ${days}d` };
}

type Tab = "findings" | "lab";

export function FindingsView() {
  const { user, sessionKey } = useInstitution();
  const dialogs = useDialogs();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const appFilter = params.get("open") ?? "";
  const apps = useApiResource<{ items?: CertificationApplication[] }>("/certification/applications?limit=200", {
    enabled: Boolean(user),
    refreshKey: sessionKey,
  });
  const [tab, setTab] = useState<Tab>("findings");
  const [items, setItems] = useState<DeskFinding[] | null>(null);
  const [lab, setLab] = useState<LabEntry[]>([]);
  const [status, setStatus] = useState("All statuses");
  const [openId, setOpenId] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [flash, setFlash] = useState<string | null>(null);
  const [raiseOpen, setRaiseOpen] = useState(false);
  const [labOpen, setLabOpen] = useState(false);

  const load = useCallback(() => {
    void listFindings().then(setItems);
    setLab(listLab());
  }, []);
  useEffect(load, [load]);

  const list = items ?? [];
  const appOptions = (apps.data?.items ?? []).map((a) => ({ value: a.id, label: `${a.id} · ${a.applicant}` }));
  const orgOf = (id: string) => apps.data?.items?.find((a) => a.id === id)?.applicant ?? id;

  const filtered = useMemo(
    () =>
      list.filter((f) => {
        if (appFilter && f.application_id !== appFilter) return false;
        if (status !== "All statuses" && STATUS_LABEL[f.status] !== status) return false;
        return true;
      }),
    [list, status, appFilter],
  );

  const selected = list.find((f) => f.id === openId) ?? null;
  useEffect(() => setNote(selected?.review_note ?? ""), [selected?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const open = list.filter((f) => f.status === "open" || f.status === "rejected").length;
  const awaiting = list.filter((f) => f.status === "submitted").length;
  const overdue = list.filter((f) => dueSla(f).kind === "breach").length;
  const summary: SummaryTile[] = [
    { label: "Open (client)", value: open, variant: open ? "due" : "ok" },
    { label: "Awaiting review", value: awaiting, variant: awaiting ? "due" : "ok" },
    { label: "Overdue", value: overdue, variant: overdue ? "breach" : "ok" },
    { label: "Closed", value: list.filter((f) => f.status === "accepted").length, variant: "ok" },
  ];

  /** Applications whose findings are all closed: ready for the certification decision. */
  const readyApps = useMemo(() => {
    const byApp = new Map<string, DeskFinding[]>();
    for (const f of list) byApp.set(f.application_id, [...(byApp.get(f.application_id) ?? []), f]);
    return [...byApp.entries()].filter(([, fs]) => fs.every((f) => f.status === "accepted")).map(([id]) => id);
  }, [list]);

  async function review(f: DeskFinding, accept: boolean) {
    if (!accept && !note.trim()) {
      await dialogs.alert({ message: "Add a review note telling the client what is missing.", kind: "error" });
      return;
    }
    try {
      await reviewCorrectiveAction(f.id, accept, note.trim());
    } catch (err) {
      await dialogs.alert({ message: err instanceof Error ? err.message : "Not saved", kind: "error" });
      return;
    }
    setFlash(`${f.id} ${accept ? "closed" : "returned to client"}`);
    setOpenId(null);
    load();
  }

  const raiseFields: FormDrawerField[] = [
    { name: "application_id", label: "Application", type: "select", required: true, options: appOptions },
    { name: "clause", label: "Clause / requirement", required: true, placeholder: "e.g. ISO 9001 §7.1.5" },
    {
      name: "severity",
      label: "Grading",
      type: "select",
      required: true,
      options: [
        { value: "major", label: "Major non-conformity" },
        { value: "minor", label: "Minor non-conformity" },
        { value: "observation", label: "Observation / opportunity" },
      ],
    },
    { name: "statement", label: "Finding (objective evidence)", type: "textarea", required: true },
    { name: "due", label: "Corrective action due", type: "date", required: true },
  ];

  const labFields: FormDrawerField[] = [
    { name: "application_id", label: "Application", type: "select", required: true, options: appOptions },
    { name: "sample", label: "Sample / batch", required: true },
    {
      name: "field",
      label: "Testing field",
      type: "select",
      required: true,
      options: ["Chemistry", "Microbiology", "Textiles", "Mechanical", "Civil", "Electrical"].map((x) => ({ value: x, label: x })),
    },
    {
      name: "status",
      label: "Result",
      type: "select",
      required: true,
      options: [
        { value: "in_test", label: "In testing" },
        { value: "pass", label: "Pass" },
        { value: "fail", label: "Fail" },
      ],
    },
    { name: "report", label: "Laboratory report no." },
  ];

  const sections: DrawerSection[] = selected
    ? [
        {
          heading: "Finding",
          content: (
            <>
              <div className="kv"><b>Application</b><span className="mono">{selected.application_id}</span></div>
              <div className="kv"><b>Client</b><span>{selected.org || orgOf(selected.application_id)}</span></div>
              <div className="kv"><b>Clause</b><span>{selected.clause}</span></div>
              <div className="kv"><b>Grading</b><span className="stagechip">{selected.severity}</span></div>
              <div className="kv"><b>Raised / due</b><span>{fmtDate(selected.raised_at)} → {fmtDate(selected.due)}</span></div>
              <p style={{ fontSize: 13.5, marginTop: 8 }}>{selected.statement}</p>
            </>
          ),
        },
        {
          heading: "Client corrective action",
          content: selected.response ? (
            <>
              <div className="kv"><b>Root cause</b><span>{selected.response.root_cause}</span></div>
              <div className="kv"><b>Correction</b><span>{selected.response.correction}</span></div>
              <div className="kv"><b>Corrective action</b><span>{selected.response.corrective_action}</span></div>
              <div className="kv"><b>Evidence</b><span>{selected.response.evidence.join(", ") || "—"}</span></div>
            </>
          ) : (
            <div className="kv"><b>Status</b><span>Waiting for the client to respond from their tracker.</span></div>
          ),
        },
        {
          heading: "Review",
          content: (
            <textarea
              aria-label="Review note"
              placeholder="Review note (required when returning to the client)"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              style={{ width: "100%", minHeight: 80, font: "inherit", padding: 8, border: "1px solid var(--line)", borderRadius: 8 }}
            />
          ),
        },
      ]
    : [];

  const actions: DrawerAction[] = selected
    ? [
        ...(selected.status === "submitted"
          ? [
              { label: "Accept & close", variant: "gold" as const, onClick: () => void review(selected, true) },
              { label: "Return to client", variant: "ghost" as const, onClick: () => void review(selected, false) },
            ]
          : selected.status === "open" && selected.severity === "observation"
            ? [{ label: "Close observation", variant: "pri" as const, onClick: () => void review(selected, true) }]
            : []),
        { label: "Close", variant: "ghost" as const, onClick: () => setOpenId(null) },
      ]
    : [];

  return (
    <RequireStaff reason="Staff sign-in required">
      <ModuleHeader
        title="Findings"
        subtitle="Non-conformities from Stage 1/2 audits, factory assessments and surveillance, client corrective actions, and laboratory results."
        summary={summary}
        extra={
          <div className="r">
            <div className="viewtog">
              <button type="button" className={tab === "findings" ? "on" : ""} onClick={() => setTab("findings")}>
                Non-conformities
              </button>
              <button type="button" className={tab === "lab" ? "on" : ""} onClick={() => setTab("lab")}>
                Lab results
              </button>
            </div>
            <button type="button" className="btn gold" onClick={() => (tab === "lab" ? setLabOpen(true) : setRaiseOpen(true))}>
              {tab === "lab" ? "+ Record result" : "+ Raise finding"}
            </button>
          </div>
        }
      />
      {dialogs.host}
      <Toast message={flash} />

      {appFilter ? (
        <p className="tagpill" style={{ display: "inline-flex", gap: 8, marginBottom: 12 }}>
          Showing {appFilter}
          <button type="button" className="btn ghost sm" onClick={() => setParams({})}>
            Show all
          </button>
        </p>
      ) : null}

      {readyApps.length && tab === "findings" ? (
        <div className="panel" style={{ marginBottom: 14, display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
          <b>All findings closed:</b>
          {readyApps.map((id) => (
            <button key={id} type="button" className="btn pri sm" onClick={() => navigate(`/certification/decisions?open=${encodeURIComponent(id)}`)}>
              Send {id} to decision
            </button>
          ))}
        </div>
      ) : null}

      {tab === "findings" ? (
        <>
          <Toolbar
            filters={[
              { label: "Status", value: status, options: ["All statuses", ...Object.values(STATUS_LABEL)], onChange: setStatus },
            ]}
          />
          {items === null ? (
            <EmptyState title="Loading findings…" detail="" />
          ) : filtered.length === 0 ? (
            <EmptyState
              title={list.length ? "No findings match" : "No findings recorded"}
              detail="Findings raised on desk or from the Field app appear here."
            />
          ) : (
            <div className="data-list">
              {filtered.map((f) => {
                const sla = dueSla(f);
                const meta: DataMetaItem[] = [
                  { label: f.severity, tag: true },
                  { label: f.application_id, mono: true },
                  { label: STATUS_LABEL[f.status] },
                  { label: sla.text, sla: sla.kind },
                ];
                return (
                  <DataRow
                    key={f.id}
                    icon="i-warn"
                    iconVariant={f.severity === "major" ? "red" : f.severity === "minor" ? "amber" : "navy"}
                    title={`${f.clause}: ${f.org || orgOf(f.application_id)}`}
                    badge={f.id}
                    meta={meta}
                    onOpen={() => setOpenId(f.id)}
                  />
                );
              })}
            </div>
          )}
        </>
      ) : lab.filter((l) => !appFilter || l.application_id === appFilter).length === 0 ? (
        <EmptyState title="No laboratory results yet" detail="Record sampling and accredited-lab results for product certification." />
      ) : (
        <div className="data-list">
          {lab
            .filter((l) => !appFilter || l.application_id === appFilter)
            .map((l) => (
              <DataRow
                key={l.id}
                icon="i-flask"
                iconVariant={l.status === "pass" ? "green" : l.status === "fail" ? "red" : "amber"}
                title={`${l.field}: ${l.sample}`}
                badge={l.application_id}
                meta={[
                  { label: l.status === "in_test" ? "In testing" : l.status, sla: l.status === "fail" ? "breach" : l.status === "pass" ? "ok" : "due" },
                  { label: l.report ? `Report ${l.report}` : "Report pending" },
                  { label: fmtDate(l.at) },
                ]}
              />
            ))}
        </div>
      )}

      <RecordDrawer
        open={!!selected}
        onClose={() => setOpenId(null)}
        reference={selected?.id}
        title={selected ? selected.clause : ""}
        subtitle={selected ? <span className="stagechip">{STATUS_LABEL[selected.status]}</span> : null}
        sections={sections}
        actions={actions}
      />

      <FormDrawer
        open={raiseOpen}
        title="Raise a finding"
        mode="create"
        fields={raiseFields}
        values={{ application_id: appFilter }}
        submitLabel="Raise finding"
        onClose={() => setRaiseOpen(false)}
        onSubmit={async (v) => {
          try {
          await raiseFinding({
            application_id: v.application_id,
            org: orgOf(v.application_id),
            clause: v.clause,
            severity: v.severity as DeskFinding["severity"],
            statement: v.statement,
            due: new Date(v.due).toISOString(),
          });
          } catch (err) {
            await dialogs.alert({ message: err instanceof Error ? err.message : "Not saved", kind: "error" });
            return;
          }
          setRaiseOpen(false);
          setFlash(`Finding raised on ${v.application_id}. The client is asked to respond.`);
          load();
        }}
      />

      <FormDrawer
        open={labOpen}
        title="Record a laboratory result"
        mode="create"
        fields={labFields}
        values={{ application_id: appFilter }}
        submitLabel="Save result"
        onClose={() => setLabOpen(false)}
        onSubmit={async (v) => {
          try {
          recordLab({
            application_id: v.application_id,
            sample: v.sample,
            field: v.field,
            status: v.status as LabEntry["status"],
            report: v.report || undefined,
          });
          } catch (err) {
            await dialogs.alert({ message: err instanceof Error ? err.message : "Not saved", kind: "error" });
            return;
          }
          setLabOpen(false);
          setFlash(`Result recorded for ${v.application_id}`);
          load();
        }}
      />
    </RequireStaff>
  );
}

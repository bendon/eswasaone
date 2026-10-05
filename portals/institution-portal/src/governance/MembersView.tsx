import { useEffect, useState } from "react";
import { RecordDrawer, Toast, useConfirmAction } from "@eswasaone/shared-ui";
import { useApiResource } from "../hooks/useApiResource";
import { EmptyState, ResourceGate } from "../components/PageStates";
import { useInstitution } from "../layout/InstitutionLayout";
import type {
  BoardMember,
  BoardMembersResponse,
  GovernanceBodiesResponse,
  GovernanceDeclarationsResponse,
} from "../api/types";
import { STUB_BODIES, STUB_DECLARATIONS, STUB_MEMBERS } from "./stubs";

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(-2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
}

function roleLabel(role?: string | null): string {
  if (!role) return "Member";
  if (role === "Chair") return "Chairperson";
  if (role === "Vice") return "Vice Chairperson";
  if (role === "Ex officio") return "CEO (ex officio)";
  return role;
}

function fmtTerm(d?: string | null): string {
  if (!d) return "—";
  const dt = new Date(d);
  if (Number.isNaN(dt.getTime())) return d;
  return dt.toLocaleDateString(undefined, { month: "short", year: "numeric" });
}

/** Members & committees — GET /governance/members, bodies, declarations. */
export function MembersView() {
  const { openAuth, user, sessionKey } = useInstitution();
  const { confirmAction, host } = useConfirmAction();
  const members = useApiResource<BoardMembersResponse>("/governance/members", {
    enabled: Boolean(user),
    refreshKey: sessionKey,
  });
  const bodies = useApiResource<GovernanceBodiesResponse>("/governance/bodies", {
    enabled: Boolean(user),
    refreshKey: sessionKey,
  });
  const declarations = useApiResource<GovernanceDeclarationsResponse>(
    "/governance/declarations",
    { enabled: Boolean(user), refreshKey: sessionKey },
  );

  const [flash, setFlash] = useState<string | null>(null);
  const [open, setOpen] = useState<BoardMember | null>(null);

  useEffect(() => {
    if (members.authRequired || bodies.authRequired || declarations.authRequired) {
      openAuth("Staff sign-in required");
    }
  }, [members.authRequired, bodies.authRequired, declarations.authRequired, openAuth]);

  // TODO: wire real — drop stubs when Core returns members/bodies/declarations
  const memberList = members.data?.items?.length ? members.data.items : STUB_MEMBERS;
  const bodyList = bodies.data?.items?.length
    ? bodies.data.items.filter((b) => b.type === "Committee")
    : STUB_BODIES;
  const declList = declarations.data?.items?.length
    ? declarations.data.items
    : STUB_DECLARATIONS;

  async function fileDeclaration(member: BoardMember) {
    const ok = await confirmAction({
      title: "File declaration of interest",
      message: `Record an annual declaration for ${member.full_name}?`,
      consequence: "Creates a Declaration of Interest audit entry.",
      ruleId: "R-G1",
      confirmLabel: "File declaration",
    });
    // TODO: wire real — POST /governance/declarations when create lands
    if (!ok) return;
    setFlash(`Declaration filed for ${member.full_name}: TODO`);
  }

  const loading = members.loading && bodies.loading && declarations.loading;
  const error = members.error || bodies.error || declarations.error;

  return (
    <ResourceGate
      loading={loading}
      refreshing={members.refreshing || bodies.refreshing || declarations.refreshing}
      error={error}
      onRetry={() => {
        void members.reload();
        void bodies.reload();
        void declarations.reload();
      }}
      hasData={true}
      skeleton="panel"
      label="Loading members…"
    >
      <div className="gov">
        {host}
        <Toast message={flash} />

        <div className="panel" style={{ marginBottom: 16 }}>
          <div className="panel__h">
            <div>
              <h3>Board members</h3>
              <p>{memberList.length} members including the CEO ex officio</p>
            </div>
          </div>
          {memberList.length === 0 ? (
            <EmptyState title="No members" detail="Board members appear once configured in Desk." />
          ) : (
            <div className="mem">
              {memberList.map((m) => (
                <button key={m.id} type="button" className="mc" onClick={() => setOpen(m)}>
                  <div className="mc__top">
                    <div className="mc__av" aria-hidden>
                      {initials(m.full_name)}
                    </div>
                    <div>
                      <b>{m.full_name}</b>
                      <span>{roleLabel(m.role)}</span>
                    </div>
                  </div>
                  <div className="mc__tags">
                    {(m.committees ?? []).map((c) => (
                      <i key={c}>{c}</i>
                    ))}
                  </div>
                  <div className="mc__foot">
                    <span>
                      Term <b>{fmtTerm(m.term_end)}</b>
                    </span>
                    <span>
                      Attendance{" "}
                      <b>
                        {m.attendance_pct != null ? `${Math.round(m.attendance_pct)}%` : "—"}
                      </b>
                    </span>
                    <span className={`st ${m.declaration_due ? "warn" : "ok"}`}>
                      {m.declaration_due ? "Due" : "Declared"}
                    </span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="grid g-1-1">
          <div className="panel">
            <div className="panel__h">
              <div>
                <h3>Committees</h3>
              </div>
            </div>
            <div className="tbl-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Committee</th>
                    <th>Chair</th>
                    <th>Members</th>
                    <th>Meets</th>
                  </tr>
                </thead>
                <tbody>
                  {bodyList.map((c) => (
                    <tr key={c.id}>
                      <td className="t">{c.name}</td>
                      <td>{c.chair || "—"}</td>
                      <td>{c.members?.length ?? "—"}</td>
                      <td>{c.meeting_frequency || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <div className="panel">
            <div className="panel__h">
              <div>
                <h3>Declarations of interest</h3>
                <p>Annual declaration plus per-meeting conflicts</p>
              </div>
            </div>
            <div className="tbl-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Member</th>
                    <th>Kind</th>
                    <th>Interest / action</th>
                    <th>Filed</th>
                  </tr>
                </thead>
                <tbody>
                  {declList.map((d) => (
                    <tr key={d.id}>
                      <td className="t">{d.member_name || d.member}</td>
                      <td>{d.kind}</td>
                      <td>
                        {d.action ? (
                          <span className="st bad">
                            {d.action}: {d.interest}
                          </span>
                        ) : (
                          d.interest
                        )}
                      </td>
                      <td>{d.filed_on}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <RecordDrawer
          open={Boolean(open)}
          onClose={() => setOpen(null)}
          reference={open?.id}
          title={open?.full_name ?? "Member"}
          subtitle={open ? roleLabel(open.role) : null}
          sections={
            open
              ? [
                  {
                    heading: "Membership",
                    content: (
                      <>
                        <div className="kv">
                          <b>Role</b>
                          <span>{roleLabel(open.role)}</span>
                        </div>
                        <div className="kv">
                          <b>Committees</b>
                          <span>{(open.committees ?? []).join(", ") || "—"}</span>
                        </div>
                        <div className="kv">
                          <b>Term ends</b>
                          <span>{fmtTerm(open.term_end)}</span>
                        </div>
                        <div className="kv">
                          <b>Attendance</b>
                          <span>
                            {open.attendance_pct != null
                              ? `${Math.round(open.attendance_pct)}%`
                              : "—"}
                          </span>
                        </div>
                      </>
                    ),
                  },
                ]
              : []
          }
          actions={
            open
              ? [
                  {
                    label: "File declaration",
                    icon: "i-file",
                    variant: "gold",
                    onClick: () => void fileDeclaration(open),
                  },
                  {
                    label: "Close",
                    variant: "ghost",
                    onClick: () => setOpen(null),
                  },
                ]
              : []
          }
        />
      </div>
    </ResourceGate>
  );
}

import { useState } from "react";
import { FormDrawer, type FormDrawerField } from "@eswasaone/shared-ui";
import { useApiResource } from "../../hooks/useApiResource";
import { EmptyState, ResourceGate } from "../../components/PageStates";
import { RequireStaff } from "../../components/RequireStaff";
import { useInstitution } from "../../layout/InstitutionLayout";
import { errorText, hrSend } from "../api";
import type { HrOffence, HrOffenceList } from "../../api/types";
import { Banner, Crumbs, StatusPill } from "../../me/parts";

/**
 * H10b Disciplinary code (HR additions plan 01): ESWASA's offences, each with a level and a suggested sanction,
 * and how long each kind of warning stays active. HR roles read it; HR Managers add, edit and deactivate.
 * It ships empty: ESWASA supplies the offences, sanctions and validity (A1). Nothing here is pre-filled.
 */

const OFFENCES = "/hr/disciplinary/offences";

function levelCls(level?: string | null) {
  return level === "Gross" ? "bad" : level === "Serious" ? "leave" : "info";
}

export function DisciplinaryCode() {
  const { user, sessionKey } = useInstitution();
  const res = useApiResource<HrOffenceList>(OFFENCES, { enabled: Boolean(user), refreshKey: sessionKey });
  const [d, setD] = useState<HrOffenceList | null>(null);
  const data = d ?? res.data;
  const [editing, setEditing] = useState<HrOffence | "new" | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function save(values: Record<string, string>) {
    setBusy(true);
    setErr(null);
    const body = {
      title: values.title.trim(),
      level: values.level,
      category: values.category.trim() || null,
      suggested_sanction: values.suggested_sanction || null,
      description: values.description.trim() || null,
    };
    try {
      setD(editing === "new" ? await hrSend<HrOffenceList>(OFFENCES, { code: values.code.trim(), ...body }) : await hrSend<HrOffenceList>(`${OFFENCES}/${encodeURIComponent(editing?.code ?? "")}`, body, "PATCH"));
      setEditing(null);
    } catch (e) {
      setErr(errorText(e, "Not saved."));
    } finally {
      setBusy(false);
    }
  }

  async function toggle(o: HrOffence) {
    setBusy(true);
    setErr(null);
    try {
      setD(await hrSend<HrOffenceList>(`${OFFENCES}/${encodeURIComponent(o.code)}`, { active: !o.active }, "PATCH"));
    } catch (e) {
      setErr(errorText(e, "Not saved."));
    } finally {
      setBusy(false);
    }
  }

  const fields: FormDrawerField[] = data
    ? [
        ...(editing === "new" ? [{ name: "code", label: "Code", required: true, placeholder: "ESWASA's code" } as FormDrawerField] : []),
        { name: "title", label: "Offence", required: true },
        { name: "category", label: "Category" },
        { name: "level", label: "Level", type: "select", required: true, options: data.levels.map((l) => ({ value: l, label: l })) },
        { name: "suggested_sanction", label: "Suggested sanction", type: "select", options: data.sanctions.map((s) => ({ value: s, label: s })) },
        { name: "description", label: "Description", type: "textarea" },
      ]
    : [];
  const values =
    editing && editing !== "new"
      ? { title: editing.title ?? "", category: editing.category ?? "", level: editing.level ?? "", suggested_sanction: editing.suggested_sanction ?? "", description: editing.description ?? "" }
      : undefined;
  const months = Object.entries(data?.warning_months ?? {});

  return (
    <RequireStaff reason="Staff sign-in required">
      <ResourceGate loading={res.loading} error={res.error} onRetry={res.reload} refreshing={res.refreshing} hasData={Boolean(data)} skeleton="panel">
        {data ? (
          <div className="hr hr-view">
            <Crumbs items={[["Cases", "/hr/cases"], ["Disciplinary code"]]} />
            <div className="hr-head">
              <div>
                <h2>Disciplinary code</h2>
                <p>Offences, their level and the sanction each usually carries. A disciplinary outcome names one of them.</p>
              </div>
              {data.can_edit ? (
                <div className="hr-head__r">
                  <button type="button" className="btn pri" disabled={busy} onClick={() => setEditing("new")}>
                    Add an offence
                  </button>
                </div>
              ) : null}
            </div>
            {err && !editing ? (
              <Banner kind="bad" title="Not saved">
                {err}
              </Banner>
            ) : null}
            {data.items.length ? (
              <div className="hr-box hr-scroll">
                <table className="hr-table">
                  <thead>
                    <tr>
                      <th>Code</th>
                      <th>Offence</th>
                      <th>Category</th>
                      <th>Level</th>
                      <th>Suggested sanction</th>
                      <th>Status</th>
                      {data.can_edit ? <th /> : null}
                    </tr>
                  </thead>
                  <tbody>
                    {data.items.map((o) => (
                      <tr key={o.code}>
                        <td className="mono">{o.code}</td>
                        <td>
                          {o.title}
                          {o.description ? <div className="sub">{o.description}</div> : null}
                        </td>
                        <td>{o.category ?? "—"}</td>
                        <td>{o.level ? <StatusPill cls={levelCls(o.level)} label={o.level} /> : "—"}</td>
                        <td>{o.suggested_sanction ?? "—"}</td>
                        <td>
                          <StatusPill cls={o.active ? "ok" : "mute"} label={o.active ? "Active" : "Inactive"} />
                        </td>
                        {data.can_edit ? (
                          <td>
                            <button type="button" className="btn ghost sm" disabled={busy} onClick={() => setEditing(o)}>
                              Edit
                            </button>{" "}
                            <button type="button" className="btn ghost sm" disabled={busy} onClick={() => void toggle(o)}>
                              {o.active ? "Deactivate" : "Reactivate"}
                            </button>
                          </td>
                        ) : null}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <EmptyState title="No disciplinary code yet" detail="ESWASA to supply its offences and sanctions (A1)." />
            )}
            <div className="hr-box">
              <div className="hr-box__h">
                <div>
                  <h3>How long warnings stay active</h3>
                  <p>Set in HR Settings. A lapsed warning doesn't count in a later case.</p>
                </div>
              </div>
              <div className="hr-box__b">
                <dl className="hr-kv">
                  {months.map(([sanction, n]) => (
                    <div key={sanction}>
                      <dt>{sanction}</dt>
                      <dd>{n ? `${n} months` : "Not set: awaiting ESWASA (A1)"}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            </div>
            <FormDrawer
              key={editing === "new" ? "new" : editing?.code ?? "closed"}
              open={Boolean(editing)}
              title={editing === "new" ? "Add an offence" : `Edit ${editing?.code ?? ""}`}
              mode={editing === "new" ? "create" : "edit"}
              fields={fields}
              values={values}
              busy={busy}
              error={editing ? err : null}
              onClose={() => setEditing(null)}
              onSubmit={save}
            />
          </div>
        ) : null}
      </ResourceGate>
    </RequireStaff>
  );
}

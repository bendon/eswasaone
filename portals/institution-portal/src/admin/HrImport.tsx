import { useEffect, useState } from "react";
import { apiFetch } from "@eswasaone/shared-ui";
import { useApiResource } from "../hooks/useApiResource";
import { EmptyState, ResourceGate } from "../components/PageStates";
import { useInstitution } from "../layout/InstitutionLayout";
import type { components } from "@contracts";
import { Banner, fmtDay, StatusPill } from "../me/parts";
import { errorText, fileUrl, hrUpload } from "../hr/api";

type Result = components["schemas"]["HrImportResult"];
type Run = components["schemas"]["HrImportRun"];
type Runs = components["schemas"]["HrImportRuns"];
type Job = components["schemas"]["HrImportJob"];
type MasterResult = components["schemas"]["HrMasterDataResult"];

const PASSES: Array<[number, string, string]> = [
  [1, "Pass 1: records", "One row per person: name, staff number, post, department, dates."],
  [2, "Pass 2: line managers, approvers, logins", "By staff number, after pass 1 has run."],
  [3, "Pass 3: opening leave balances", "Needs an active leave period (H14)."],
];

function ErrorsTable({ errors }: { errors: Result["errors"] }) {
  if (!errors.length) return null;
  return (
    <div className="hr-box hr-scroll">
      <table className="hr-table" aria-label="Problems in the file">
        <thead>
          <tr>
            <th>Row</th>
            <th>Staff number</th>
            <th>Column</th>
            <th>Problem</th>
          </tr>
        </thead>
        <tbody>
          {errors.map((e, i) => (
            <tr key={i}>
              <td className="mono">{e.row ?? "File"}</td>
              <td className="mono">{e.employee_number ?? "—"}</td>
              <td>{e.field ?? "—"}</td>
              <td>{e.message}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * H14 Import employees (plan 09): download the pass template, check the file (writes nothing), then run it in the
 * background (HR Manager). Any error and nothing is written. Live /hr/import/template, /dry-run, /run, /runs.
 */
export function ImportEmployees() {
  const { user, sessionKey } = useInstitution();
  const [pass, setPass] = useState(1);
  const [file, setFile] = useState<File | null>(null);
  const [goLive, setGoLive] = useState("");
  const [busy, setBusy] = useState<"check" | "run" | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [runId, setRunId] = useState<string | null>(null);
  const [run, setRun] = useState<Run | null>(null);
  const [k, setK] = useState(0);
  const runs = useApiResource<Runs>("/hr/import/runs", { enabled: Boolean(user), refreshKey: `${sessionKey}:${runId ?? ""}:${run?.status ?? ""}` });

  // Follow a started run until it finishes.
  useEffect(() => {
    if (!runId) return;
    let live = true;
    let t: number | undefined;
    const tick = () =>
      apiFetch<Run>(`/hr/import/runs/${encodeURIComponent(runId)}`, { quiet: true })
        .then((r) => {
          if (!live) return;
          setRun(r);
          if (!/done|fail|error|complete/i.test(r.status)) t = window.setTimeout(tick, 3000);
        })
        .catch((e) => live && setErr(errorText(e, "Couldn't check the run.")));
    void tick();
    return () => {
      live = false;
      if (t) window.clearTimeout(t);
    };
  }, [runId]);

  function pick(f: File | null) {
    setFile(f);
    setResult(null);
    setErr(null);
  }

  async function check() {
    setErr(null);
    setResult(null);
    if (!file) return setErr("Choose the filled-in template.");
    if (!/\.(csv|xlsx)$/i.test(file.name)) return setErr("Send a .csv or .xlsx file. Download the template for the columns.");
    setBusy("check");
    try {
      setResult(await hrUpload<Result>("/hr/import/dry-run", { file, pass: String(pass), go_live: pass === 3 ? goLive || null : null }));
    } catch (e) {
      setErr(errorText(e, "The file couldn't be checked."));
    } finally {
      setBusy(null);
    }
  }

  async function start() {
    setErr(null);
    if (!file || !result?.ok) return;
    setBusy("run");
    try {
      const job = await hrUpload<Job>("/hr/import/run", { file, pass: String(pass), go_live: pass === 3 ? goLive || null : null });
      setRun(null);
      setRunId(job.run);
      setResult(null);
      setFile(null);
      setK((x) => x + 1);
    } catch (e) {
      setErr(errorText(e, "The import didn't start."));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="hr-box" id="hr-import">
      <div className="hr-box__h">
        <div>
          <h3>Import employees</h3>
          <p>Two passes, checked before anything is saved. Run pass 1, then pass 2; pass 3 loads opening leave balances.</p>
        </div>
      </div>
      <div className="hr-box__b hr-view" style={{ gap: 12 }} key={k}>
        <label className="hr-f">
          <span>Pass</span>
          <select className="hr-in" value={pass} onChange={(e) => (setPass(Number(e.target.value)), pick(null))} disabled={busy !== null}>
            {PASSES.map(([n, label]) => (
              <option key={n} value={n}>
                {label}
              </option>
            ))}
          </select>
          <small>{PASSES.find(([n]) => n === pass)?.[2]}</small>
        </label>
        <div>
          <a className="btn ghost sm" href={fileUrl(`/hr/import/template?pass=${pass}`)}>
            Download the pass {pass} template
          </a>
        </div>
        {pass === 3 ? (
          <label className="hr-f">
            <span>Go-live date (balances are dated from it; empty means today)</span>
            <input className="hr-in" type="date" value={goLive} onChange={(e) => setGoLive(e.target.value)} disabled={busy !== null} />
          </label>
        ) : null}
        <label className="hr-f">
          <span>Filled-in file (.xlsx or .csv)</span>
          <input className="hr-in" type="file" accept=".xlsx,.csv" onChange={(e) => pick(e.target.files?.[0] ?? null)} disabled={busy !== null} />
        </label>
        <div>
          <button type="button" className="btn ghost" disabled={busy !== null} onClick={() => void check()}>
            {busy === "check" ? "Checking…" : "Check the file"}
          </button>
        </div>

        {result ? (
          <>
            <Banner kind={result.ok ? "ok" : "bad"} title={result.ok ? "Ready to import" : `${result.errors.length} ${result.errors.length === 1 ? "problem" : "problems"} to fix`}>
              {result.rows} rows: {result.create} to create, {result.update} to update, {result.unchanged} unchanged.
              {result.ok ? "" : " Fix the file and check it again. Nothing has been saved."}
            </Banner>
            <ErrorsTable errors={result.errors} />
            {result.warnings.length ? (
              <ul className="hr-note" aria-label="Warnings">
                {result.warnings.map((w) => (
                  <li key={w}>{w}</li>
                ))}
              </ul>
            ) : null}
            {result.ok ? (
              <div>
                <button type="button" className="btn pri" disabled={busy !== null} onClick={() => void start()}>
                  {busy === "run" ? "Starting…" : `Run pass ${pass}`}
                </button>
              </div>
            ) : null}
          </>
        ) : null}

        {err ? (
          <Banner kind="bad" title="Not done">
            {err}
          </Banner>
        ) : null}

        {runId ? (
          <p className="page-note" role="status">
            {run
              ? `Run ${run.id}: ${run.status}. ${run.created} created, ${run.updated} updated${run.error_count ? `, ${run.error_count} errors (nothing written)` : ""}.`
              : `Run ${runId} started. Checking…`}
          </p>
        ) : null}
        {run?.errors?.length ? <ErrorsTable errors={run.errors} /> : null}

        <ResourceGate loading={runs.loading} error={runs.error} onRetry={runs.reload} refreshing={runs.refreshing} hasData={Boolean(runs.data)} skeleton="panel">
          {runs.data?.items.length ? (
            <div className="hr-box hr-scroll">
              <table className="hr-table" aria-label="Past import runs">
                <thead>
                  <tr>
                    <th>Run</th>
                    <th>Pass</th>
                    <th>File</th>
                    <th>Result</th>
                    <th>When</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {runs.data.items.map((r) => (
                    <tr key={r.id}>
                      <td className="mono">{r.id}</td>
                      <td>{r.pass_no ?? "—"}</td>
                      <td>{r.file_name ?? "—"}</td>
                      <td>
                        {r.rows} rows, {r.created} created, {r.updated} updated
                        {r.error_count ? `, ${r.error_count} errors` : ""}
                      </td>
                      <td>
                        {r.started_on ? fmtDay(r.started_on, true) : "—"}
                        {r.run_by ? <small style={{ display: "block", color: "var(--muted)" }}>{r.run_by}</small> : null}
                      </td>
                      <td>
                        <StatusPill cls={r.error_count ? "bad" : /done|complete/i.test(r.status) ? "ok" : "leave"} label={r.status} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState title="No imports yet" detail="Runs appear here with what each one did." />
          )}
        </ResourceGate>
      </div>
    </div>
  );
}

/**
 * Load ESWASA's signed-off master data (departments, posts, holidays, skills) from the JSON file (plan 09). System
 * Manager only. Always checks first; the example file is refused and nothing is ever deleted. POST /hr/setup/master-data.
 */
export function MasterDataLoad() {
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [res, setRes] = useState<MasterResult | null>(null);

  async function send(dry: boolean) {
    setErr(null);
    if (!file) return setErr("Choose ESWASA's master-data JSON file.");
    setBusy(true);
    try {
      const r = await hrUpload<MasterResult>("/hr/setup/master-data", { file, dry_run: dry ? "true" : "false" });
      setRes(r);
    } catch (e) {
      setErr(errorText(e, "Not loaded."));
    } finally {
      setBusy(false);
    }
  }

  const counts = res ? Object.entries(res.counts) : [];
  return (
    <div className="hr-box" id="hr-master-data">
      <div className="hr-box__h">
        <div>
          <h3>Load master data</h3>
          <p>ESWASA's signed-off departments, posts, holidays and competences (H1, H2). System Manager only. Nothing is deleted.</p>
        </div>
      </div>
      <div className="hr-box__b hr-view" style={{ gap: 10 }}>
        <label className="hr-f">
          <span>Master-data file (.json)</span>
          <input className="hr-in" type="file" accept=".json,application/json" onChange={(e) => (setFile(e.target.files?.[0] ?? null), setRes(null))} disabled={busy} />
        </label>
        <div>
          <button type="button" className="btn ghost" disabled={busy} onClick={() => void send(true)}>
            {busy && !res ? "Checking…" : "Check the file"}
          </button>{" "}
          {res?.dry_run && res.ok ? (
            <button type="button" className="btn pri" disabled={busy} onClick={() => void send(false)}>
              {busy ? "Loading…" : "Load it"}
            </button>
          ) : null}
        </div>
        {res ? (
          <Banner kind={res.ok ? "ok" : "bad"} title={res.ok ? (res.dry_run ? "Checked: ready to load" : "Loaded") : "Problems in the file"}>
            {counts.map(([kind, c]) => `${kind}: ${c.created} new, ${c.updated} updated, ${c.unchanged} unchanged`).join("; ") || "Nothing to change."}
          </Banner>
        ) : null}
        {res?.errors.length ? (
          <ul className="hr-note" aria-label="Errors">
            {res.errors.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        ) : null}
        {res?.missing_departments.length ? <p className="hr-note">Departments in HRMS but not in the file (kept): {res.missing_departments.join(", ")}.</p> : null}
        {res?.kept.length ? <p className="hr-note">Also kept: {res.kept.join(", ")}.</p> : null}
        {err ? (
          <Banner kind="bad" title="Not done">
            {err}
          </Banner>
        ) : null}
      </div>
    </div>
  );
}

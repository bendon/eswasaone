/**
 * Derived CRM views: client health, renewals radar, insights. Pure functions over store rows.
 */
import { isOpen } from "./caseFlow";
import { caseSla } from "./sla";
import type { Case, Client, ClientHealth, CrmConfig, Opportunity, RenewalItem, Signal } from "./types";

const DAY = 86_400_000;
const daysUntil = (iso: string) => Math.round((new Date(iso).getTime() - Date.now()) / DAY);

/**
 * Extra health factors from other modules (e.g. certification health: NC closure, payment behaviour),
 * registered on import so CRM never imports the domain stores (avoids cycles).
 */
export type HealthFactorSource = (c: Client) => ClientHealth["factors"];
const healthSources: HealthFactorSource[] = [];
export function registerHealthFactor(fn: HealthFactorSource): void {
  healthSources.push(fn);
}

export function clientHealth(c: Client, cases: Case[]): ClientHealth {
  const factors: ClientHealth["factors"] = [];
  for (const src of healthSources) {
    try {
      factors.push(...src(c));
    } catch {
      /* a module that isn't connected never breaks the CRM view */
    }
  }
  const overdue = c.invoices.filter((i) => i.status === "overdue");
  if (overdue.length) factors.push({ label: `${overdue.length} overdue invoice(s)`, delta: -15 * overdue.length });
  const suspended = c.certificates.filter((x) => x.status === "suspended");
  if (suspended.length) factors.push({ label: "Suspended certificate", delta: -25 });
  const lapsed = c.certificates.filter((x) => x.status === "expired");
  if (lapsed.length) factors.push({ label: "Lapsed certificate", delta: -20 });
  const expiring = c.certificates.filter((x) => x.status === "valid" && daysUntil(x.expires) <= 60);
  if (expiring.length) factors.push({ label: "Certificate expiring within 60 days", delta: -8 });
  const mine = cases.filter((x) => x.client_id === c.id);
  const openComplaints = mine.filter((x) => isOpen(x) && x.type !== "enquiry" && x.type !== "feedback");
  if (openComplaints.length) factors.push({ label: `${openComplaints.length} open case(s)`, delta: -6 * openComplaints.length });
  const scores = mine.filter((x) => x.csat).map((x) => x.csat!.score);
  if (scores.length) {
    const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
    if (avg < 3.5) factors.push({ label: `Low satisfaction (${avg.toFixed(1)}/5)`, delta: -10 });
    else factors.push({ label: `Satisfaction ${avg.toFixed(1)}/5`, delta: +5 });
  }
  const lastTouch = c.activity[0]?.at;
  if (!lastTouch || daysUntil(lastTouch) < -180) factors.push({ label: "No contact in 6 months", delta: -10 });
  if (c.training.length) factors.push({ label: "Uses training", delta: +4 });
  if (c.certificates.length >= 2) factors.push({ label: "Multiple certificates", delta: +4 });
  const score = Math.max(0, Math.min(100, 80 + factors.reduce((a, f) => a + f.delta, 0)));
  return { score, band: score >= 70 ? "good" : score >= 45 ? "watch" : "risk", factors };
}

/** Certificates, surveillance and calibration due in the next `horizon` days. */
export function renewals(clients: Client[], signals: Signal[], horizon = 120): RenewalItem[] {
  const out: RenewalItem[] = [];
  const outreach = (clientId: string, kind: Signal["kind"]): RenewalItem["outreach"] => {
    const s = signals.find((x) => x.client_id === clientId && x.kind === kind);
    if (!s) return "none";
    return s.status === "converted" ? "booked" : s.status === "new" ? "none" : "contacted";
  };
  for (const c of clients) {
    for (const cert of c.certificates) {
      if (cert.status !== "valid") continue;
      const d = daysUntil(cert.expires);
      if (d >= -30 && d <= horizon)
        out.push({
          id: `${cert.id}-exp`,
          kind: "certificate",
          client_id: c.id,
          client_name: c.name,
          label: `${cert.standard} certificate ${cert.id}`,
          due: cert.expires,
          days: d,
          value_estimate: 32000,
          outreach: outreach(c.id, "cert_expiring"),
        });
      if (cert.next_surveillance) {
        const sd = daysUntil(cert.next_surveillance);
        if (sd >= -30 && sd <= horizon)
          out.push({
            id: `${cert.id}-surv`,
            kind: "surveillance",
            client_id: c.id,
            client_name: c.name,
            label: `${cert.standard} surveillance`,
            due: cert.next_surveillance,
            days: sd,
            value_estimate: 13000,
            outreach: outreach(c.id, "surveillance_due"),
          });
      }
    }
    for (const ins of c.instruments) {
      const d = daysUntil(ins.next_due);
      if (d >= -30 && d <= horizon)
        out.push({
          id: `${ins.id}-cal`,
          kind: "calibration",
          client_id: c.id,
          client_name: c.name,
          label: `${ins.name} (${ins.id})`,
          due: ins.next_due,
          days: d,
          value_estimate: 850,
          outreach: outreach(c.id, "calibration_due"),
        });
    }
  }
  return out.sort((a, b) => a.days - b.days);
}

export type CrmInsights = {
  openCases: number;
  breaching: number;
  awaitingCustomer: number;
  avgResolutionDays: number | null;
  csatAvg: number | null;
  csatCount: number;
  firstContactRate: number | null;
  byType: { type: string; open: number; total: number }[];
  byMonth: { label: string; received: number; resolved: number }[];
  heat: { sector: string; region: string; count: number }[];
  rootCauses: { cause: string; count: number }[];
  repeatBrands: { client_id: string; count: number }[];
  pipelineValue: number;
  weightedPipeline: number;
  wonQuarter: number;
  winRate: number | null;
  byService: { service: string; value: number }[];
};

export function insights(cases: Case[], opps: Opportunity[], cfg: CrmConfig): CrmInsights {
  const open = cases.filter(isOpen);
  const breaching = open.filter((c) => caseSla(c, cfg.case_types[c.type]).status === "breach");
  const resolved = cases.filter((c) => c.resolved_at);
  const avgRes = resolved.length
    ? resolved.reduce((s, c) => s + (new Date(c.resolved_at!).getTime() - new Date(c.created_at).getTime()) / DAY, 0) /
      resolved.length
    : null;
  const rated = cases.filter((c) => c.csat);
  const reopenFree = resolved.filter((c) => c.reopen_count === 0).length;

  const byTypeMap = new Map<string, { open: number; total: number }>();
  for (const c of cases) {
    const k = cfg.case_types[c.type].short;
    const e = byTypeMap.get(k) ?? { open: 0, total: 0 };
    e.total += 1;
    if (isOpen(c)) e.open += 1;
    byTypeMap.set(k, e);
  }

  const months: CrmInsights["byMonth"] = [];
  for (let i = 5; i >= 0; i -= 1) {
    const d = new Date();
    d.setDate(1);
    d.setMonth(d.getMonth() - i);
    const y = d.getFullYear();
    const m = d.getMonth();
    const inMonth = (iso?: string) => {
      if (!iso) return false;
      const x = new Date(iso);
      return x.getFullYear() === y && x.getMonth() === m;
    };
    months.push({
      label: d.toLocaleDateString(undefined, { month: "short" }),
      received: cases.filter((c) => inMonth(c.created_at)).length,
      resolved: cases.filter((c) => inMonth(c.resolved_at)).length,
    });
  }

  const heatMap = new Map<string, number>();
  for (const c of cases) {
    if (!c.sector || !c.region || c.type === "enquiry" || c.type === "feedback") continue;
    const k = `${c.sector}|${c.region}`;
    heatMap.set(k, (heatMap.get(k) ?? 0) + 1);
  }

  const causes = new Map<string, number>();
  for (const c of cases) if (c.root_cause) causes.set(c.root_cause, (causes.get(c.root_cause) ?? 0) + 1);

  const since = Date.now() - 60 * DAY;
  const brand = new Map<string, number>();
  for (const c of cases) {
    if (!c.client_id || !["product_report", "mark_misuse"].includes(c.type)) continue;
    if (new Date(c.created_at).getTime() < since) continue;
    brand.set(c.client_id, (brand.get(c.client_id) ?? 0) + 1);
  }

  const live = opps.filter((o) => o.stage !== "won" && o.stage !== "lost");
  const q0 = new Date();
  q0.setMonth(Math.floor(q0.getMonth() / 3) * 3, 1);
  const won = opps.filter((o) => o.stage === "won");
  const closed = opps.filter((o) => o.stage === "won" || o.stage === "lost");
  const svc = new Map<string, number>();
  for (const o of won) for (const s of o.services) svc.set(s, (svc.get(s) ?? 0) + o.value / Math.max(1, o.services.length));

  return {
    openCases: open.length,
    breaching: breaching.length,
    awaitingCustomer: open.filter((c) => c.state === "Awaiting Customer").length,
    avgResolutionDays: avgRes == null ? null : Math.round(avgRes * 10) / 10,
    csatAvg: rated.length ? Math.round((rated.reduce((s, c) => s + c.csat!.score, 0) / rated.length) * 10) / 10 : null,
    csatCount: rated.length,
    firstContactRate: resolved.length ? Math.round((reopenFree / resolved.length) * 100) : null,
    byType: [...byTypeMap.entries()].map(([type, v]) => ({ type, ...v })).sort((a, b) => b.total - a.total),
    byMonth: months,
    heat: [...heatMap.entries()].map(([k, count]) => {
      const [sector, region] = k.split("|");
      return { sector, region, count };
    }),
    rootCauses: [...causes.entries()].map(([cause, count]) => ({ cause, count })).sort((a, b) => b.count - a.count),
    repeatBrands: [...brand.entries()]
      .map(([client_id, count]) => ({ client_id, count }))
      .filter((b) => b.count >= 2)
      .sort((a, b) => b.count - a.count),
    pipelineValue: live.reduce((s, o) => s + o.value, 0),
    weightedPipeline: Math.round(live.reduce((s, o) => s + (o.value * o.probability) / 100, 0)),
    wonQuarter: won.filter((o) => new Date(o.expected_close) >= q0).reduce((s, o) => s + o.value, 0),
    winRate: closed.length ? Math.round((won.length / closed.length) * 100) : null,
    byService: [...svc.entries()].map(([service, value]) => ({ service, value: Math.round(value) })).sort((a, b) => b.value - a.value),
  };
}

/* ---------------- triage helpers ---------------- */

const STOP = new Set(["the", "a", "an", "and", "or", "of", "to", "in", "on", "for", "is", "it", "my", "our", "we", "i", "with", "at", "from", "this", "that"]);

function tokens(s: string): Set<string> {
  return new Set(
    s
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((t) => t.length > 2 && !STOP.has(t)),
  );
}

/** Likely duplicates: same subject company/ref, or ≥40% word overlap, within 45 days. */
export function findDuplicates(c: Case, all: Case[]): { c: Case; score: number; why: string }[] {
  const mine = tokens(`${c.subject} ${c.description}`);
  const since = new Date(c.created_at).getTime() - 45 * DAY;
  return all
    .filter((x) => x.ref !== c.ref && new Date(x.created_at).getTime() >= since && x.type !== "feedback")
    .map((x) => {
      const other = tokens(`${x.subject} ${x.description}`);
      const inter = [...mine].filter((t) => other.has(t)).length;
      const union = new Set([...mine, ...other]).size || 1;
      let score = inter / union;
      let why = `${Math.round(score * 100)}% wording overlap`;
      if (c.about?.ref && c.about.ref === x.about?.ref) {
        score += 0.5;
        why = `Same ${c.about.kind} ${c.about.ref}`;
      } else if (c.client_id && c.client_id === x.client_id && c.type === x.type) {
        score += 0.25;
        why = `Same company and type · ${why}`;
      }
      return { c: x, score, why };
    })
    .filter((d) => d.score >= 0.4)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);
}

/** Fill a reply template's placeholders. */
export function fillTemplate(body: string, c: Case, cfg: CrmConfig, due?: Date): string {
  const name = c.reporter.anonymous ? "Sir/Madam" : c.reporter.name?.split(" ")[0] ?? "Sir/Madam";
  return body
    .replace(/\{name\}/g, name)
    .replace(/\{ref\}/g, c.ref)
    .replace(/\{type\}/g, cfg.case_types[c.type].short.toLowerCase())
    .replace(/\{team\}/g, c.team)
    .replace(/\{due\}/g, due ? due.toLocaleDateString(undefined, { day: "numeric", month: "long" }) : "soon")
    .replace(/\{resolution\}/g, c.resolution ?? "")
    .replace(/\{reopen\}/g, String(cfg.reopen_days));
}

/** Rule-based reply draft (the assistant can refine it when Core's /agent/ask is live). */
export function draftReply(c: Case, cfg: CrmConfig, due?: Date): string {
  const pick = (id: string) => cfg.templates.find((t) => t.id === id);
  let t = pick("t-ack");
  if (c.state === "In Progress" && (c.type === "product_report" || c.type === "mark_misuse")) t = pick("t-surv");
  else if (c.state === "In Progress" && c.type === "enquiry" && /standard|szns|buy/i.test(c.description)) t = pick("t-std");
  else if (c.state === "In Progress" || c.state === "Reopened") t = pick("t-info");
  return t ? fillTemplate(t.body, c, cfg, due) : "";
}

/** One-line summary for the workspace header. */
export function summarise(c: Case): string {
  const first = c.description.split(/(?<=[.!?])\s/)[0] ?? c.description;
  const turns = c.thread.filter((m) => m.role !== "system").length;
  return `${first.length > 160 ? `${first.slice(0, 157)}…` : first} ${turns > 1 ? `(${turns} messages so far)` : ""}`.trim();
}

/* ---------------- health over time and churn (04 P3) ---------------- */

/**
 * Health as it stood at `at`, rebuilt from dated events: invoices past due and unpaid, certificates
 * expired by then, complaints open at that moment, contact in the 6 months before. Approximate for the
 * past (paid invoices are assumed paid on time); the last point is always today's `clientHealth`.
 */
function healthAt(c: Client, cases: Case[], at: Date): number {
  const t = at.getTime();
  let delta = 0;
  delta -= 15 * c.invoices.filter((i) => i.status !== "paid" && new Date(i.due).getTime() < t).length;
  if (c.certificates.some((x) => x.status !== "withdrawn" && new Date(x.expires).getTime() < t && new Date(x.issued).getTime() < t)) delta -= 20;
  const open = cases.filter((x) => x.client_id === c.id && x.type !== "enquiry" && x.type !== "feedback" && new Date(x.created_at).getTime() <= t && (!x.closed_at || new Date(x.closed_at).getTime() > t) && (!x.resolved_at || new Date(x.resolved_at).getTime() > t));
  delta -= 6 * open.length;
  const touched = c.activity.some((a) => new Date(a.at).getTime() <= t && new Date(a.at).getTime() > t - 180 * DAY);
  if (!touched) delta -= 10;
  if (c.training.some((x) => new Date(x.date).getTime() <= t)) delta += 4;
  if (c.certificates.filter((x) => new Date(x.issued).getTime() <= t).length >= 2) delta += 4;
  return Math.max(0, Math.min(100, 80 + delta));
}

/** Month-end health scores for the last `months` months, ending with today's score. */
export function healthTrend(c: Client, cases: Case[], months = 6): { at: string; score: number }[] {
  const out: { at: string; score: number }[] = [];
  const now = new Date();
  for (let i = months - 1; i >= 1; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i + 1, 0, 23, 59);
    out.push({ at: d.toISOString(), score: healthAt(c, cases, d) });
  }
  out.push({ at: now.toISOString(), score: clientHealth(c, cases).score });
  return out;
}

export type ChurnRisk = { level: "low" | "medium" | "high"; reasons: string[] };

/** Churn prediction from lapsed renewals, overdue calibration, silence and a falling health trend. */
export function churnRisk(c: Client, cases: Case[]): ChurnRisk {
  const reasons: string[] = [];
  let pts = 0;
  const lapsed = c.certificates.filter((x) => x.status === "expired" && !c.certificates.some((y) => y !== x && y.standard === x.standard && y.status === "valid"));
  if (lapsed.length) (pts += 3), reasons.push(`${lapsed.length} certificate(s) lapsed without renewal`);
  const calOverdue = c.instruments.filter((i) => daysUntil(i.next_due) < -30);
  if (calOverdue.length) (pts += 2), reasons.push(`${calOverdue.length} instrument(s) more than 30 days past calibration`);
  const lastTouch = c.activity[0]?.at;
  if (!lastTouch || daysUntil(lastTouch) < -180) (pts += 1), reasons.push("No contact in 6 months");
  const overdue = c.invoices.filter((i) => i.status === "overdue");
  if (overdue.length) (pts += 1), reasons.push("Overdue invoices");
  const trend = healthTrend(c, cases, 4);
  if (trend.length > 1 && trend[trend.length - 1].score <= trend[0].score - 10) (pts += 2), reasons.push(`Health fell ${trend[0].score} → ${trend[trend.length - 1].score} in ${trend.length - 1} months`);
  return { level: pts >= 4 ? "high" : pts >= 2 ? "medium" : "low", reasons };
}

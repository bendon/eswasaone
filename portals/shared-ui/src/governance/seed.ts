/**
 * Governance demo seed (gap 03 data plan): one meeting with minutes approved, one with minutes
 * submitted for approval at the next meeting, one upcoming with its pack in Draft, a committee
 * meeting just held, a CAC sitting, a written resolution in circulation and a risk above appetite.
 * All people and figures are fictional. Dates are relative to today.
 */
import { isoIn } from "../store/localStore";
import type { HistoryEvent } from "../workflow/types";
import type { AgendaItem, Declaration, GovBody, GovMember, GovSettings, Meeting, Pack, PackSection, ResAction, Resolution, Risk, Vote } from "./types";

const SEC = "Nomsa Dlamini";

export const BOARD = [
  "Dr. Khanyisile Vilakati",
  "Adv. Mbuso Tsabedze",
  "Ms. Busisiwe Hlatshwayo",
  "Mr. Jabulani Fakudze",
  "Prof. Nonhlanhla Mavuso",
  "Mr. Sandile Ginindza",
  "Sipho Mamba",
];

export const SEED_MEMBERS: GovMember[] = [
  { name: BOARD[0], initials: "KV", title: "Board Chair", email: "k.vilakati@board.eswasa.co.sz", bodies: ["BOARD", "HRRC"], role: "Chair", independent: true, term_start: isoIn(-900), term_end: isoIn(195) },
  { name: BOARD[1], initials: "MT", title: "Deputy Chair; legal practitioner", email: "m.tsabedze@board.eswasa.co.sz", bodies: ["BOARD", "ARC"], role: "Deputy Chair", independent: true, term_start: isoIn(-900), term_end: isoIn(195) },
  { name: BOARD[2], initials: "BH", title: "Chartered accountant", email: "b.hlatshwayo@board.eswasa.co.sz", bodies: ["BOARD", "ARC", "FIC"], role: "Member", independent: true, term_start: isoIn(-500), term_end: isoIn(595) },
  { name: BOARD[3], initials: "JF", title: "Industry representative (manufacturing)", email: "j.fakudze@board.eswasa.co.sz", bodies: ["BOARD", "FIC", "CAC"], role: "Member", independent: false, term_start: isoIn(-500), term_end: isoIn(595) },
  { name: BOARD[4], initials: "NM", title: "Academic; food science", email: "n.mavuso@board.eswasa.co.sz", bodies: ["BOARD", "TECH", "CAC"], role: "Member", independent: true, term_start: isoIn(-300), term_end: isoIn(795) },
  { name: BOARD[5], initials: "SG", title: "Ministry of Commerce nominee", email: "s.ginindza@board.eswasa.co.sz", bodies: ["BOARD", "HRRC"], role: "Member", independent: false, term_start: isoIn(-300), term_end: isoIn(795) },
  { name: BOARD[6], initials: "SM", title: "Executive Director (ex officio)", email: "s.mamba@eswasa.co.sz", bodies: ["BOARD", "FIC", "TECH"], role: "Ex officio", independent: false, term_start: isoIn(-1400), term_end: isoIn(400) },
  { name: "Thandeka Simelane", initials: "TS", title: "Head of Certification", email: "t.simelane@eswasa.co.sz", bodies: ["CAC"], role: "Member", independent: false, term_start: isoIn(-600), term_end: isoIn(500) },
  { name: "Mandla Nxumalo", initials: "MN", title: "Quality Manager", email: "m.nxumalo@eswasa.co.sz", bodies: ["CAC"], role: "Member", independent: false, term_start: isoIn(-600), term_end: isoIn(500) },
];

export const SEED_BODIES: GovBody[] = [
  { id: "BOARD", name: "Board of Directors", short: "Board", kind: "board", members: BOARD, chair: BOARD[0], secretary: SEC, quorum: 4, frequency: "Quarterly", term_years: 3, tor: "ESWASA Act 2003 s.7; Board Charter 2024", notice_days: 14, pack_days: 7 },
  { id: "ARC", name: "Audit & Risk Committee", short: "ARC", kind: "committee", members: [BOARD[1], BOARD[2]], chair: BOARD[2], secretary: SEC, quorum: 2, frequency: "Quarterly", term_years: 3, tor: "ARC Terms of Reference v3", notice_days: 10, pack_days: 5 },
  { id: "FIC", name: "Finance & Investment Committee", short: "FIC", kind: "committee", members: [BOARD[2], BOARD[3], BOARD[6]], chair: BOARD[2], secretary: SEC, quorum: 2, frequency: "Quarterly", term_years: 3, notice_days: 10, pack_days: 5 },
  { id: "HRRC", name: "HR & Remuneration Committee", short: "HRRC", kind: "committee", members: [BOARD[0], BOARD[5]], chair: BOARD[5], secretary: SEC, quorum: 2, frequency: "Bi-annual", term_years: 3, notice_days: 10, pack_days: 5 },
  { id: "TECH", name: "Technical Committee", short: "Technical", kind: "committee", members: [BOARD[4], BOARD[6]], chair: BOARD[4], secretary: SEC, quorum: 2, frequency: "Quarterly", term_years: 3, notice_days: 10, pack_days: 5 },
  { id: "CAC", name: "Certification Approval Committee", short: "CAC", kind: "committee", members: [BOARD[3], BOARD[4], "Thandeka Simelane", "Mandla Nxumalo"], chair: BOARD[4], secretary: "Thandeka Simelane", quorum: 3, frequency: "Monthly", term_years: 2, tor: "CER_PR_004 Certification decisions", notice_days: 5, pack_days: 3 },
];

export const SEED_SETTINGS: GovSettings = {
  appetite: { Strategic: 12, Financial: 10, Operational: 12, Compliance: 6, Reputational: 8, ICT: 8 },
  default_notice_days: 14,
  default_pack_days: 7,
  declaration_due: "31 March each year",
  statutory: [
    { id: "ST-1", title: "Audited financial statements to the Minister", due: isoIn(55), owner: "Themba Motsa" },
    { id: "ST-2", title: "Annual General Meeting", due: isoIn(85), owner: SEC },
    { id: "ST-3", title: "Strategic plan annual review", due: isoIn(140), owner: "Sipho Mamba" },
    { id: "ST-4", title: "Annual declarations of interest", due: isoIn(175), owner: SEC },
    { id: "ST-5", title: "Board evaluation", due: isoIn(70), owner: BOARD[0] },
  ],
  section_templates: [
    { title: "Chair's agenda and previous minutes", owner: SEC, source: "written" },
    { title: "Executive Director's report", owner: "Sipho Mamba", source: "upload" },
    { title: "Management accounts", owner: "Themba Motsa", source: "upload" },
    { title: "Certification performance", owner: "Thandeka Simelane", source: "live_module", module: "certification" },
    { title: "Complaints & customer service", owner: "Phindile Shongwe", source: "live_module", module: "crm" },
    { title: "Metrology & laboratory", owner: "Ayanda Ndlovu", source: "live_module", module: "metrology" },
    { title: "Standards development", owner: "Sibusiso Gama", source: "live_module", module: "standards" },
    { title: "Risk register and heat map", owner: "Lungile Mkhabela", source: "live_module", module: "risk" },
    { title: "Resolution action tracker", owner: SEC, source: "live_module", module: "actions" },
  ],
};

function ev(days: number, actor: string, action: string, from?: string, to?: string, extra: Partial<HistoryEvent> = {}): HistoryEvent {
  return { at: isoIn(days, 10), actor, action, from, to, ...extra };
}

function votes(list: string[], v: Vote, except: Record<string, Vote> = {}): Record<string, Vote> {
  return Object.fromEntries(list.map((m) => [m, except[m] ?? v]));
}

function attendance(list: string[], absent: string[] = []): Meeting["attendance"] {
  return Object.fromEntries(list.map((m) => [m, absent.includes(m) ? { rsvp: "no", apology: true, present: false } : { rsvp: "yes", present: true }]));
}

function sections(packId: string, due: string, status: (i: number) => PackSection["status"], content = true): PackSection[] {
  return SEED_SETTINGS.section_templates.map((t, i) => ({
    id: `${packId}-S${i + 1}`,
    title: t.title,
    owner: t.owner,
    source: t.source,
    module: t.module,
    status: status(i),
    included: true,
    restricted: t.title.startsWith("Management accounts"),
    due,
    content: content && t.source !== "live_module" ? `${t.title} — see attached paper.` : undefined,
  }));
}

/* ---------------- meetings ---------------- */

const q1Agenda: AgendaItem[] = [
  { id: "Q1-1", title: "Approval of minutes of the previous meeting", kind: "decision", presenter: BOARD[0], minutes: 5, section_ids: [], papers: [], decision: { outcome: "approved", text: "Minutes of the Q4 2025 meeting approved as a true record.", votes: votes(BOARD, "for"), at: isoIn(-120, 9) } },
  { id: "Q1-2", title: "Budget 2026/27", kind: "decision", presenter: "Themba Motsa", minutes: 40, section_ids: [], papers: ["Budget 2026-27.pdf"], decision: { outcome: "approved", text: "Budget approved with a 4% contingency.", votes: votes(BOARD, "for", { [BOARD[3]]: "abstain" }), resolution_id: "RES-2026-011", at: isoIn(-120, 11) } },
];

const q2Agenda: AgendaItem[] = [
  { id: "Q2-1", title: "Approval of minutes of the Q1 meeting", kind: "decision", presenter: BOARD[0], minutes: 5, section_ids: [], papers: [], approve_minutes_of: "BM-2026-Q1", decision: { outcome: "approved", text: "Q1 minutes approved.", votes: votes(BOARD, "for"), at: isoIn(-35, 9) } },
  { id: "Q2-2", title: "Fee schedule 2026/27", kind: "decision", presenter: "Themba Motsa", minutes: 30, section_ids: [], papers: ["Fee schedule 2026-27 — proposal.pdf"], decision: { outcome: "approved", text: "Fee schedule approved, effective 1 November, subject to gazetting.", votes: votes(BOARD, "for", { [BOARD[5]]: "against" }), resolution_id: "RES-2026-014", at: isoIn(-35, 10) } },
  { id: "Q2-3", title: "ICT continuity and the Core platform", kind: "discussion", presenter: "Sipho Mamba", minutes: 25, section_ids: [], papers: [], decision: { outcome: "noted", text: "Board asked management to test failover before the Q3 meeting.", votes: {}, resolution_id: "RES-2026-015", at: isoIn(-35, 11) } },
  { id: "Q2-4", title: "Regional office in Manzini", kind: "decision", presenter: "Sipho Mamba", minutes: 20, section_ids: [], papers: ["Manzini office business case.pdf"], decision: { outcome: "deferred", text: "Deferred pending a revised business case.", votes: {}, resolution_id: "RES-2026-016", at: isoIn(-35, 12) } },
];

const q3Agenda: AgendaItem[] = [
  { id: "Q3-1", title: "Opening, apologies and declarations of interest", kind: "noting", presenter: BOARD[0], minutes: 5, section_ids: [], papers: [] },
  { id: "Q3-2", title: "Approval of minutes of the Q2 meeting", kind: "decision", presenter: BOARD[0], minutes: 5, section_ids: ["BP-2026-Q3-S1"], papers: [], approve_minutes_of: "BM-2026-Q2" },
  { id: "Q3-3", title: "Executive Director's report", kind: "noting", presenter: "Sipho Mamba", minutes: 20, section_ids: ["BP-2026-Q3-S2"], papers: [] },
  { id: "Q3-4", title: "Management accounts to 30 September", kind: "noting", presenter: "Themba Motsa", minutes: 20, section_ids: ["BP-2026-Q3-S3"], papers: ["Management accounts to 30 Sep.pdf"] },
  { id: "Q3-5", title: "Strategic plan mid-term review", kind: "decision", presenter: "Sipho Mamba", minutes: 40, section_ids: [], papers: ["Strategic plan mid-term review.pdf"] },
  { id: "Q3-6", title: "Operational performance (certification, metrology, standards, complaints)", kind: "noting", presenter: "Sipho Mamba", minutes: 25, section_ids: ["BP-2026-Q3-S4", "BP-2026-Q3-S5", "BP-2026-Q3-S6", "BP-2026-Q3-S7"], papers: [] },
  { id: "Q3-7", title: "Risk register — ICT risk above appetite", kind: "discussion", presenter: "Lungile Mkhabela", minutes: 20, section_ids: ["BP-2026-Q3-S8"], papers: [] },
  { id: "Q3-8", title: "Resolution action tracker", kind: "noting", presenter: SEC, minutes: 10, section_ids: ["BP-2026-Q3-S9"], papers: [] },
];

export const SEED_MEETINGS: Meeting[] = [
  {
    id: "BM-2026-Q1", body_id: "BOARD", title: "Q1 Board meeting", scheduled_at: isoIn(-120, 9), venue: "ESWASA Boardroom, Matsapha",
    agenda: q1Agenda, agenda_final: true, notice_issued_at: isoIn(-136), attendance: attendance(BOARD), declarations: [],
    run: { started_at: isoIn(-120, 9), ended_at: isoIn(-120, 13) }, pack_id: "BP-2026-Q1",
    minutes: { general: "The meeting opened at 09:00 with a quorum present.", items: { "Q1-1": "Approved.", "Q1-2": "The Board approved the 2026/27 budget." }, submitted_at: isoIn(-110), approved_at: isoIn(-35, 9), approved_at_meeting: "BM-2026-Q2" },
    state: "Minutes approved", seq: 6,
    history: [
      ev(-150, SEC, "Scheduled", undefined, "Scheduled", { rule: "R-G1" }),
      ev(-128, SEC, "Issue pack", "Scheduled", "Pack issued", { rule: "R-G1" }),
      ev(-120, SEC, "Close meeting", "Pack issued", "Held"),
      ev(-115, SEC, "Start minutes", "Held", "Minutes draft"),
      ev(-110, SEC, "Submit minutes", "Minutes draft", "Minutes submitted"),
      ev(-35, SEC, "Approve minutes", "Minutes submitted", "Minutes approved", { note: "Approved at BM-2026-Q2" }),
    ],
  },
  {
    id: "BM-2026-Q2", body_id: "BOARD", title: "Q2 Board meeting", scheduled_at: isoIn(-35, 9), venue: "ESWASA Boardroom, Matsapha", online_link: "Teams link in the pack",
    agenda: q2Agenda, agenda_final: true, notice_issued_at: isoIn(-50), attendance: attendance(BOARD, [BOARD[5]]),
    declarations: [{ id: "D-Q2-1", member: BOARD[3], kind: "meeting", meeting_id: "BM-2026-Q2", item_id: "Q2-2", interest: "Director of a company that pays certification fees", at: isoIn(-35, 9), recorded_by: SEC }],
    run: { started_at: isoIn(-35, 9), ended_at: isoIn(-35, 13) }, pack_id: "BP-2026-Q2",
    minutes: {
      general: "The Chair opened the meeting at 09:05. Apologies were received from Mr. Sandile Ginindza. A quorum was present.",
      items: {
        "Q2-1": "The minutes of the Q1 meeting were approved as a true record.",
        "Q2-2": "Mr. Fakudze declared an interest and did not take part in the vote. The Board approved the 2026/27 fee schedule, effective 1 November subject to gazetting (RES-2026-014).",
        "Q2-3": "The Board noted the ICT continuity report and asked management to test failover of the Core platform before the next meeting (RES-2026-015).",
        "Q2-4": "Deferred pending a revised business case (RES-2026-016).",
      },
      submitted_at: isoIn(-28),
    },
    state: "Minutes submitted", seq: 5,
    history: [
      ev(-64, SEC, "Scheduled", undefined, "Scheduled", { rule: "R-G1" }),
      ev(-44, SEC, "Issue pack", "Scheduled", "Pack issued", { rule: "R-G1" }),
      ev(-35, SEC, "Close meeting", "Pack issued", "Held"),
      ev(-33, SEC, "Start minutes", "Held", "Minutes draft"),
      ev(-28, SEC, "Submit minutes", "Minutes draft", "Minutes submitted"),
    ],
  },
  {
    id: "BM-2026-Q3", body_id: "BOARD", title: "Q3 Board meeting", scheduled_at: isoIn(8, 9), venue: "ESWASA Boardroom, Matsapha", online_link: "Teams link issued with the pack",
    agenda: q3Agenda, agenda_final: false, notice_issued_at: isoIn(-7),
    attendance: { ...Object.fromEntries(BOARD.map((m) => [m, { rsvp: "yes" as const }])), [BOARD[5]]: { rsvp: "pending" }, [BOARD[3]]: { rsvp: "no", apology: true } },
    declarations: [], pack_id: "BP-2026-Q3",
    state: "Scheduled", seq: 1,
    history: [ev(-25, SEC, "Scheduled", undefined, "Scheduled", { rule: "R-G1", note: "Pack opened and section owners asked for papers" })],
  },
  {
    id: "ARC-2026-03", body_id: "ARC", title: "Audit & Risk Committee — September", scheduled_at: isoIn(-10, 14), venue: "Virtual (Teams)",
    agenda: [
      { id: "A3-1", title: "Internal audit progress", kind: "noting", presenter: "Internal Audit", minutes: 20, section_ids: [], papers: [], decision: { outcome: "noted", text: "Noted; 4 of 6 audits complete.", votes: {}, at: isoIn(-10, 14) } },
      { id: "A3-2", title: "ICT risk RSK-003 above appetite", kind: "decision", presenter: "Lungile Mkhabela", minutes: 25, section_ids: [], papers: [], decision: { outcome: "approved", text: "Recommend to the Board: fund a secondary hosting site this financial year.", votes: votes([BOARD[1], BOARD[2]], "for"), at: isoIn(-10, 15) } },
    ],
    agenda_final: true, notice_issued_at: isoIn(-22), attendance: attendance([BOARD[1], BOARD[2]]), declarations: [],
    run: { started_at: isoIn(-10, 14), ended_at: isoIn(-10, 16) }, pack_id: "BP-ARC-2026-03",
    state: "Held", seq: 3,
    history: [ev(-30, SEC, "Scheduled", undefined, "Scheduled", { rule: "R-G1" }), ev(-17, SEC, "Issue pack", "Scheduled", "Pack issued"), ev(-10, SEC, "Close meeting", "Pack issued", "Held")],
  },
  {
    id: "CAC-2026-10", body_id: "CAC", title: "CAC sitting — October", scheduled_at: isoIn(3, 10), venue: "ESWASA Boardroom, Matsapha",
    agenda: [
      { id: "C10-1", title: "Declarations of interest", kind: "noting", presenter: BOARD[4], minutes: 5, section_ids: [], papers: [] },
      { id: "C10-2", title: "Certification decisions due (from Certification → Decisions)", kind: "decision", presenter: "Thandeka Simelane", minutes: 60, section_ids: [], papers: [] },
    ],
    agenda_final: true, notice_issued_at: isoIn(-4), attendance: Object.fromEntries(SEED_BODIES[5].members.map((m) => [m, { rsvp: "yes" as const }])), declarations: [], pack_id: "BP-CAC-2026-10",
    state: "Pack issued", seq: 2,
    history: [ev(-12, "Thandeka Simelane", "Scheduled", undefined, "Scheduled"), ev(-1, "Thandeka Simelane", "Issue pack", "Scheduled", "Pack issued")],
  },
];

/* ---------------- packs ---------------- */

function snap(_packId: string, v: number, days: number, sec: PackSection[]): Pack["versions"][number] {
  return {
    v,
    assembled_at: isoIn(days, 15),
    by: SEC,
    note: v > 1 ? "Strategic plan paper replaced with the revised version" : undefined,
    sections: sec.map((s) => ({ id: s.id, title: s.title, owner: s.owner, restricted: s.restricted, content: s.content ?? `${s.title}: figures as at ${new Date(isoIn(days)).toLocaleDateString()}.` })),
  };
}

const q1Sections = sections("BP-2026-Q1", isoIn(-130), () => "ready");
const q2Sections = sections("BP-2026-Q2", isoIn(-46), () => "ready");
const q3Sections = sections("BP-2026-Q3", isoIn(2), (i) => (i === 2 ? "awaiting" : i === 1 ? "draft" : i === 7 ? "awaiting" : "ready"));
q3Sections[0].content = "Agenda as circulated with the notice. Draft minutes of the Q2 meeting attached for approval.";
q3Sections[1].content = "Highlights of the quarter: ISO/IEC 17065 surveillance passed with no major findings; 41 certificates issued; e-store revenue up 18%. Draft — finance figures to follow.";

export const SEED_PACKS: Pack[] = [
  { id: "BP-2026-Q1", meeting_id: "BM-2026-Q1", sections: q1Sections, versions: [snap("BP-2026-Q1", 1, -129, q1Sections)], issued_version: 1, state: "Issued", seq: 2, history: [ev(-129, SEC, "Assemble version", "Draft", "Assembled"), ev(-128, SEC, "Issue to members", "Assembled", "Issued")] },
  { id: "BP-2026-Q2", meeting_id: "BM-2026-Q2", sections: q2Sections, versions: [snap("BP-2026-Q2", 1, -46, q2Sections), snap("BP-2026-Q2", 2, -44, q2Sections)], issued_version: 2, state: "Issued", seq: 3, history: [ev(-46, SEC, "Assemble version", "Draft", "Assembled"), ev(-44, SEC, "Assemble version", "Assembled", "Assembled"), ev(-44, SEC, "Issue to members", "Assembled", "Issued")] },
  { id: "BP-2026-Q3", meeting_id: "BM-2026-Q3", sections: q3Sections, versions: [], state: "Draft", seq: 0, history: [ev(-25, "System", "Opened (R-G1)", undefined, "Draft", { rule: "R-G1" })] },
  { id: "BP-ARC-2026-03", meeting_id: "ARC-2026-03", sections: [], versions: [], issued_version: 1, state: "Issued", seq: 2, history: [] },
  { id: "BP-CAC-2026-10", meeting_id: "CAC-2026-10", sections: [], versions: [], issued_version: 1, state: "Issued", seq: 2, history: [] },
];

/* ---------------- resolutions & actions ---------------- */

export const SEED_RESOLUTIONS: Resolution[] = [
  { id: "RES-2026-011", title: "Approve the 2026/27 budget", text: "RESOLVED that the budget for the 2026/27 financial year, as presented, is approved with a 4% contingency.", body_id: "BOARD", kind: "meeting", meeting_id: "BM-2026-Q1", item_id: "Q1-2", proposed_by: "Themba Motsa", proposed_at: isoIn(-120), votes: votes(BOARD, "for", { [BOARD[3]]: "abstain" }), papers: ["Budget 2026-27.pdf"], decided_at: isoIn(-120), implemented_at: isoIn(-90), state: "Implemented", seq: 2, history: [ev(-120, SEC, "Record as passed", "Proposed", "Passed", { rule: "R-G2" }), ev(-90, SEC, "Mark implemented", "Passed", "Implemented", { note: "Budget loaded in ERPNext." })] },
  { id: "RES-2026-014", title: "Approve the 2026/27 fee schedule", text: "RESOLVED that the fee schedule for 2026/27 is approved, effective 1 November 2026, subject to publication in the Government Gazette.", body_id: "BOARD", kind: "meeting", meeting_id: "BM-2026-Q2", item_id: "Q2-2", proposed_by: "Themba Motsa", proposed_at: isoIn(-35), votes: votes(BOARD.filter((m) => m !== BOARD[3]), "for", { [BOARD[5]]: "against" }), papers: ["Fee schedule 2026-27 — proposal.pdf"], decided_at: isoIn(-35), state: "Passed", seq: 1, history: [ev(-35, SEC, "Record as passed", "Proposed", "Passed", { rule: "R-G2" })] },
  { id: "RES-2026-015", title: "Test failover of the Core platform", text: "RESOLVED that management tests failover of the Core and Frappe platforms and reports to the next meeting.", body_id: "BOARD", kind: "meeting", meeting_id: "BM-2026-Q2", item_id: "Q2-3", proposed_by: BOARD[0], proposed_at: isoIn(-35), votes: votes(BOARD.filter((m) => m !== BOARD[5]), "for"), papers: [], decided_at: isoIn(-35), state: "Passed", seq: 1, history: [ev(-35, SEC, "Record as passed", "Proposed", "Passed", { rule: "R-G2" })] },
  { id: "RES-2026-016", title: "Open a regional office in Manzini", text: "Proposal to open a regional customer office in Manzini.", body_id: "BOARD", kind: "meeting", meeting_id: "BM-2026-Q2", item_id: "Q2-4", proposed_by: "Sipho Mamba", proposed_at: isoIn(-35), votes: {}, papers: ["Manzini office business case.pdf"], state: "Deferred", seq: 1, history: [ev(-35, SEC, "Defer", "Proposed", "Deferred", { reason: "Revised business case with lease options requested." })] },
  {
    id: "RES-2026-W03", title: "Approve signing of the SADCAS mutual recognition MoU", text: "RESOLVED that the Executive Director is authorised to sign the memorandum of understanding with SADCAS on mutual recognition of accredited calibration certificates.", body_id: "BOARD", kind: "written", proposed_by: "Sipho Mamba", proposed_at: isoIn(-3),
    votes: { [BOARD[0]]: "for", [BOARD[2]]: "for", [BOARD[4]]: "for" }, papers: ["SADCAS MoU draft.pdf"],
    window: { opens: isoIn(-3), closes: isoIn(4, 17), threshold: "simple", eligible: BOARD, min_votes: 4 },
    state: "Circulated", seq: 1, history: [ev(-3, SEC, "Circulated for vote", undefined, "Circulated", { note: "Circulated to 7 members; closes in 7 days" })],
  },
  {
    id: "RES-2026-W02", title: "Approve the revised travel policy", text: "RESOLVED that the revised travel and subsistence policy is approved.", body_id: "BOARD", kind: "written", proposed_by: "Gugu Nkambule", proposed_at: isoIn(-60),
    votes: { [BOARD[0]]: "for", [BOARD[1]]: "for" }, papers: ["Travel policy v4.pdf"],
    window: { opens: isoIn(-60), closes: isoIn(-50), threshold: "simple", eligible: BOARD, min_votes: 4 },
    state: "Lapsed", seq: 2, history: [ev(-60, SEC, "Circulated for vote", undefined, "Circulated"), ev(-50, "System", "Window closed", "Circulated", "Lapsed", { note: "2 of 4 votes needed were cast." })],
  },
];

export const SEED_ACTIONS: ResAction[] = [
  { id: "ACT-031", resolution_id: "RES-2026-014", description: "Publish the 2026/27 fee schedule in the Government Gazette", owner: "Themba Motsa", due: isoIn(-5), progress: 60, updates: [{ at: isoIn(-20), by: "Themba Motsa", text: "Submitted to the Government Printer.", progress: 60 }], evidence: [], carry_to_pack: true, state: "Open", seq: 1, history: [ev(-35, "System", "Opened", undefined, "Open", { rule: "R-G2" })] },
  { id: "ACT-032", resolution_id: "RES-2026-014", description: "Update fee lines in ERPNext and the Service portal", owner: "Vusi Magagula", due: isoIn(20), progress: 20, updates: [], evidence: [], carry_to_pack: true, state: "Open", seq: 1, history: [ev(-35, "System", "Opened", undefined, "Open", { rule: "R-G2" })] },
  { id: "ACT-033", resolution_id: "RES-2026-015", description: "Run a failover test of Core and Frappe and report results", owner: "Sipho Mamba", due: isoIn(4), progress: 40, updates: [{ at: isoIn(-8), by: "Sipho Mamba", text: "Secondary site quote received; test booked.", progress: 40 }], evidence: [], carry_to_pack: true, state: "Open", seq: 1, history: [ev(-35, "System", "Opened", undefined, "Open", { rule: "R-G2" })] },
  { id: "ACT-011", resolution_id: "RES-2026-011", description: "Load the approved budget into ERPNext", owner: "Themba Motsa", due: isoIn(-100), progress: 100, updates: [], evidence: ["Budget upload confirmation.pdf"], carry_to_pack: false, completed_at: isoIn(-95), state: "Completed", seq: 2, history: [ev(-120, "System", "Opened", undefined, "Open"), ev(-95, "Themba Motsa", "Complete with evidence", "Open", "Completed", { note: "Loaded and locked." })] },
];

/* ---------------- risks ---------------- */

function risk(id: string, title: string, category: Risk["category"], owner: string, inh: [number, number], res: [number, number], extra: Partial<Risk> = {}): Risk {
  return {
    id, title, description: "", category, owner,
    inherent: { l: inh[0], i: inh[1] }, residual: { l: res[0], i: res[1] },
    controls: [], mitigations: [], reviews: [], review_every_days: 90, next_review: isoIn(45), links: [], in_pack: false, trend: "stable",
    state: "Open", seq: 1, history: [ev(-200, "Lungile Mkhabela", "Logged", undefined, "Open")],
    ...extra,
  };
}

export const SEED_RISKS: Risk[] = [
  risk("RSK-001", "Loss of ISO/IEC 17065 accreditation", "Compliance", "Thandeka Simelane", [3, 5], [1, 5], { controls: ["Annual internal audit", "Impartiality committee", "Management review"], description: "Accreditation lapses after a major nonconformity in SADCAS surveillance." }),
  risk("RSK-002", "Revenue shortfall from certification fees", "Financial", "Themba Motsa", [4, 4], [3, 3], { controls: ["Monthly revenue review", "Debtor follow-up"], trend: "improving" }),
  risk("RSK-003", "Prolonged outage of the Core platform", "ICT", "Lungile Mkhabela", [4, 5], [3, 4], {
    description: "A single hosting site means a failure stops online applications, payments and the certificate register.",
    controls: ["Nightly backups", "Hosting SLA 99.5%"],
    mitigations: [
      { id: "M1", action: "Contract a secondary hosting site", owner: "Sipho Mamba", due: isoIn(40) },
      { id: "M2", action: "Quarterly failover test", owner: "Lungile Mkhabela", due: isoIn(4) },
    ],
    reviews: [{ at: isoIn(-12), by: "Lungile Mkhabela", note: "Two outages in Q3 (4h and 7h). Residual raised.", residual: { l: 3, i: 4 } }],
    links: [{ kind: "incident", ref: "INC-26-019", label: "Core outage 14 Aug (7h)" }, { kind: "case", ref: "CS-26-0131", label: "Complaint: could not pay online" }],
    in_pack: true, trend: "worsening", next_review: isoIn(-2),
  }),
  risk("RSK-004", "Fraudulent ESWASA marks on imported products", "Reputational", "Bongani Hlophe", [4, 4], [3, 3], { controls: ["QR verification", "Market surveillance sampling"], links: [{ kind: "case", ref: "CS-26-0128", label: "Report: fake mark on cement bags" }] }),
  risk("RSK-005", "Shortage of qualified lead auditors", "Operational", "Gugu Nkambule", [3, 4], [2, 4], { controls: ["Auditor training plan", "Associate auditor pool"] }),
  risk("RSK-006", "Delayed gazetting of compulsory standards", "Strategic", "Sibusiso Gama", [3, 3], [2, 3]),
  risk("RSK-007", "Data protection breach of customer records", "ICT", "Lungile Mkhabela", [3, 5], [2, 4], { controls: ["Role-based access", "Annual penetration test"] }),
];

/* ---------------- declarations ---------------- */

const year = String(new Date().getFullYear());
export const SEED_DECLARATIONS: Declaration[] = [
  { id: "DEC-1", member: BOARD[0], kind: "annual", period: year, interest: "None to declare.", at: isoIn(-200), recorded_by: BOARD[0] },
  { id: "DEC-2", member: BOARD[1], kind: "annual", period: year, interest: "Partner, Tsabedze & Associates (legal services to SMEs).", at: isoIn(-198), recorded_by: BOARD[1] },
  { id: "DEC-3", member: BOARD[2], kind: "annual", period: year, interest: "Non-executive director, Lubombo Savings Bank.", at: isoIn(-190), recorded_by: BOARD[2] },
  { id: "DEC-4", member: BOARD[3], kind: "annual", period: year, interest: "Director, Fakudze Industrial (Pty) Ltd — an ESWASA certification client.", at: isoIn(-185), recorded_by: BOARD[3] },
  { id: "DEC-5", member: BOARD[6], kind: "annual", period: year, interest: "None to declare.", at: isoIn(-180), recorded_by: BOARD[6] },
  { id: "DEC-6", member: BOARD[3], kind: "meeting", meeting_id: "BM-2026-Q2", item_id: "Q2-2", interest: "Director of a company that pays certification fees.", at: isoIn(-35), recorded_by: SEC },
  { id: "DEC-7", member: BOARD[2], kind: "gift", interest: "Dinner hosted by an audit firm at the IIA conference.", value: "E 650", at: isoIn(-70), recorded_by: BOARD[2] },
];

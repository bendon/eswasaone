/**
 * Standards demo seed — 2 TCs, 6 work items across every stage, one draft in public review, 12 comments,
 * one open ballot, 20 catalogue entries (compulsory, superseded, due for review). Fictional.
 * The demo customer ("demo") is a voting member of TC 3 and has commented on SZNS 044.
 */
import { isoIn } from "../store/localStore";
import type { Ballot, CatalogueEntry, DraftComment, Proposal, StandardsSettings, Subscription, TechnicalCommittee, WorkItem } from "./types";

const ev = (at: string, actor: string, action: string, from?: string, to?: string, note?: string) => ({ at, actor, action, from, to, note });

export const SEED_TCS: TechnicalCommittee[] = [
  {
    id: "TC3",
    number: "TC 3",
    name: "Food and agriculture",
    scope: "Standards for food products, agricultural produce, food safety and hygiene.",
    chair: "Dr. Thulisile Mkhonta",
    secretary: "Nokuthula Zwane",
    sectors: ["Food", "Agriculture"],
    members: [
      { name: "Dr. Thulisile Mkhonta", org: "University of Eswatini", email: "t.mkhonta@uneswa.example.sz", category: "academia", voting: true, role: "chair", term_end: isoIn(500) },
      { name: "Sipho Nkambule", org: "Ubombo Honey Co. (Pty) Ltd", email: "demo", category: "industry", voting: true, term_end: isoIn(300) },
      { name: "Thandeka Nkambule", org: "Valley Dairy Cooperative", email: "quality@valley.example.sz", category: "industry", voting: true, term_end: isoIn(420) },
      { name: "Dr. Mandla Shongwe", org: "Ministry of Health — Food Control", email: "m.shongwe@health.example.sz", category: "government", voting: true, term_end: isoIn(600) },
      { name: "Busi Gamedze", org: "Consumer Association of Eswatini", email: "busi@consumers.example.sz", category: "consumer", voting: true, term_end: isoIn(200) },
      { name: "Lwazi Dube", org: "Nhlangano Grain Millers", email: "lwazi@nhlangano.example.sz", category: "industry", voting: true, term_end: isoIn(150) },
      { name: "Gcina Magongo", org: "Ministry of Agriculture", email: "g.magongo@agric.example.sz", category: "government", voting: false, role: "observer", term_end: isoIn(365) },
    ],
    applications: [{ id: "TCA-26-007", tc_id: "TC3", name: "Nomsa Khumalo", org: "Kwaluseni Bakery", email: "nomsa@kwaluseni.example.sz", category: "industry", motivation: "Small bakeries aren't represented; the bread standard revision affects us directly.", at: isoIn(-4), state: "pending" }],
    meetings: [
      { id: "TCM-3-21", date: isoIn(-40), title: "TC 3 meeting 21", attendance: ["Dr. Thulisile Mkhonta", "Sipho Nkambule", "Dr. Mandla Shongwe", "Busi Gamedze"], minutes: "Agreed to circulate SZNS 044 CD1 for public comment. Noted the maize meal fortification proposal." },
      { id: "TCM-3-22", date: isoIn(18), title: "TC 3 meeting 22", attendance: [] },
    ],
  },
  {
    id: "TC5",
    number: "TC 5",
    name: "Building and construction",
    scope: "Construction materials, building products and methods of test.",
    chair: "Eng. Sabelo Ndzimandze",
    secretary: "Nokuthula Zwane",
    sectors: ["Construction"],
    members: [
      { name: "Eng. Sabelo Ndzimandze", org: "Eswatini Institution of Engineers", email: "s.ndzimandze@eie.example.sz", category: "academia", voting: true, role: "chair", term_end: isoIn(400) },
      { name: "Plant QA manager", org: "Sidvokodvo Cement Products", email: "qa@sidvokodvocement.example.sz", category: "industry", voting: true, term_end: isoIn(300) },
      { name: "J. Shabalala", org: "Mankayane Roof Tiles", email: "info@mankayanetiles.example.sz", category: "industry", voting: true, term_end: isoIn(250) },
      { name: "Phumzile Hlatshwayo", org: "Ministry of Public Works", email: "p.hlatshwayo@works.example.sz", category: "government", voting: true, term_end: isoIn(700) },
      { name: "Mbali Fakudze", org: "Consumer Association of Eswatini", email: "mbali@consumers.example.sz", category: "consumer", voting: true, term_end: isoIn(380) },
    ],
    applications: [],
    meetings: [{ id: "TCM-5-14", date: isoIn(-25), title: "TC 5 meeting 14", attendance: ["Eng. Sabelo Ndzimandze", "J. Shabalala", "Phumzile Hlatshwayo"], minutes: "SZNS 210 CD approved for public comment." }],
  },
];

const draft = (label: string, stage: WorkItem["state"], at: string, summary: string, by = "Nokuthula Zwane", locked = false) => ({ id: label, label, stage, file: `${label}.pdf`, uploaded_by: by, at, summary, locked, pages: 18 });

export function seedWorkItems(): WorkItem[] {
  return [
    { id: "WI-26-001", ref: "SZNS 044:2026", title: "Bottled drinking water — Specification", scope: "Requirements for packaged drinking water, including natural mineral water, and methods of test.", type: "revision", revises: "CAT-044", state: "Comment Resolution", tc_id: "TC3", project_leader: "Dr. Mandla Shongwe", sector: "Food", targets: { "Comment Resolution": isoIn(10), Ballot: isoIn(45), Published: isoIn(120) }, drafts: [draft("WD1", "Working Draft", isoIn(-140), "First revision draft aligning microbiological limits with Codex."), draft("CD1", "Committee Draft", isoIn(-75), "TC comments incorporated; new clause 6.4 on packaging migration.", "Nokuthula Zwane", true)], comment_period: { opens: isoIn(-70), closes: isoIn(-6) }, created_at: isoIn(-160), seq: 4, history: [ev(isoIn(-70), "Nokuthula Zwane", "Open public comment", "Committee Draft", "Public Review"), ev(isoIn(-6), "System", "Comment period closed", "Public Review", "Comment Resolution")] },
    { id: "WI-26-002", ref: "SZNS 061:2026", title: "Fruit juices and nectars — Specification", scope: "Composition, quality and labelling of fruit juices and nectars.", type: "new", state: "Ballot", tc_id: "TC3", project_leader: "Busi Gamedze", sector: "Food", targets: { Ballot: isoIn(10), Published: isoIn(60) }, drafts: [draft("CD2", "Committee Draft", isoIn(-30), "Final text after comment resolution.", "Nokuthula Zwane", true)], ballot_id: "BAL-26-012", created_at: isoIn(-300), seq: 6, history: [ev(isoIn(-5), "Nokuthula Zwane", "Open ballot", "Comment Resolution", "Ballot")] },
    { id: "WI-26-003", ref: "SZNS 210:2026", title: "Concrete roof tiles — Specification", scope: "Requirements for concrete roof tiles and fittings: dimensions, transverse strength, water absorption, marking.", type: "revision", revises: "CAT-210", state: "Public Review", tc_id: "TC5", project_leader: "Eng. Sabelo Ndzimandze", sector: "Construction", targets: { "Public Review": isoIn(40), Published: isoIn(150) }, drafts: [draft("CD1", "Committee Draft", isoIn(-22), "Raises the minimum transverse strength and adds a durability test.", "Nokuthula Zwane", true)], comment_period: { opens: isoIn(-20), closes: isoIn(40) }, created_at: isoIn(-120), seq: 3, history: [ev(isoIn(-20), "Nokuthula Zwane", "Open public comment", "Committee Draft", "Public Review", "60 days")] },
    { id: "WI-26-004", ref: "SZNS ISO 22000:2026", title: "Food safety management systems — Requirements (identical adoption)", scope: "Identical adoption of ISO 22000:2018.", type: "adoption", adoption: { source: "ISO", ref: "ISO 22000:2018", degree: "IDT" }, state: "Approved", tc_id: "TC3", project_leader: "Nokuthula Zwane", sector: "Food", targets: { Published: isoIn(7) }, drafts: [draft("FDIS", "Ballot", isoIn(-20), "ISO text with national foreword.", "Nokuthula Zwane", true)], publication: { final_text: true, cover: false, ics: "67.020; 03.100.70", price: 650 }, created_at: isoIn(-200), seq: 7, history: [ev(isoIn(-3), "System", "Ballot passed 6–0", "Ballot", "Approved")] },
    { id: "WI-26-005", ref: "SZNS 112:2026", title: "Fortified maize meal — Specification", scope: "Fortification levels (iron, zinc, folic acid, vitamin A) for maize meal sold in Eswatini.", type: "new", proposal_id: "NWIP-26-001", state: "Working Draft", tc_id: "TC3", project_leader: "Lwazi Dube", sector: "Food", targets: { "Committee Draft": isoIn(45), Published: isoIn(240) }, drafts: [draft("WD1", "Working Draft", isoIn(-12), "Skeleton draft from the SADC harmonised standard.", "Lwazi Dube")], created_at: isoIn(-30), seq: 1, history: [ev(isoIn(-30), "Sibusiso Gama", "Approve — create work item", undefined, "Working Draft")] },
    { id: "WI-26-006", ref: "SZNS 227:2026", title: "Burnt clay bricks — Specification", scope: "Dimensions, compressive strength and efflorescence of burnt clay bricks.", type: "new", state: "Committee Draft", tc_id: "TC5", project_leader: "Phumzile Hlatshwayo", sector: "Construction", targets: { "Public Review": isoIn(20), Published: isoIn(200) }, drafts: [draft("WD2", "Working Draft", isoIn(-60), "Test methods aligned with SANS 227."), draft("CD1", "Committee Draft", isoIn(-8), "Ready for TC consensus.")], created_at: isoIn(-180), seq: 2, history: [ev(isoIn(-8), "Nokuthula Zwane", "Promote to committee draft", "Working Draft", "Committee Draft")] },
  ];
}

export function seedComments(): DraftComment[] {
  const c = (n: number, wi: string, by: DraftComment["by"], clause: string, type: DraftComment["type"], comment: string, proposed: string, disp?: DraftComment["disposition"], response?: string): DraftComment => ({ id: `CMT-${wi.slice(-3)}-${n}`, work_item_id: wi, draft_label: "CD1", by, clause, type, comment, proposed_change: proposed, at: isoIn(-60 + n * 4), disposition: disp, response, resolved_by: disp ? "Nokuthula Zwane" : undefined, resolved_at: disp ? isoIn(-3) : undefined });
  const demo = { name: "Sipho Nkambule", org: "Ubombo Honey Co. (Pty) Ltd", email: "demo" };
  const ewsc = { name: "Water quality lab", org: "Eswatini Water Services Corp.", email: "lab@ewsc.example.sz" };
  const ezw = { name: "QA manager", org: "Ezulwini Water Bottlers", email: "qa@ezulwini.example.sz" };
  const pub = { name: "Lindiwe Hlophe", email: "lindiwe.h@example.sz" };
  return [
    c(1, "WI-26-001", ewsc, "5.2 Table 1", "technical", "The limit for total coliforms should be 0/100 mL, not 'absent in 250 mL', to match our national drinking water regulations.", "Replace with '0 per 100 mL'.", "accepted", "Agreed — aligned with the Water Act regulations."),
    c(2, "WI-26-001", ezw, "6.4", "technical", "Migration testing for PET every batch is unrealistic for small bottlers.", "Require migration testing annually or on change of supplier.", "accepted_in_principle", "Frequency changed to 'at least every 6 months and on change of material supplier'."),
    c(3, "WI-26-001", ezw, "8.1", "editorial", "'Best before' and 'use by' are both used — pick one.", "Use 'Best before' throughout.", "accepted"),
    c(4, "WI-26-001", demo, "8.3", "general", "Labels on 500 mL bottles have little space — allow the batch code on the cap.", "Add 'or on the closure' after 'on the label'."),
    c(5, "WI-26-001", pub, "General", "general", "Please make the standard free to read — it's about drinking water.", "", "noted", "Noted. Pricing is outside the TC's remit; referred to ESWASA management."),
    c(6, "WI-26-001", ewsc, "Annex B", "technical", "Method B.3 references a withdrawn ISO edition.", "Update to ISO 9308-1:2014.", "accepted"),
    c(7, "WI-26-001", ezw, "5.4", "technical", "Sodium limit of 20 mg/L would exclude several natural mineral waters.", "Exempt natural mineral water with a label declaration.", "rejected", "The TC kept the limit for packaged water; natural mineral water is covered by clause 5.5."),
    c(8, "WI-26-001", demo, "3.7", "editorial", "Definition of 'packaged water' repeats clause 3.2.", "Delete 3.7."),
    c(9, "WI-26-001", pub, "8.2", "general", "Add siSwati on the label.", "Require bilingual labelling."),
    c(1, "WI-26-003", { name: "Plant QA manager", org: "Sidvokodvo Cement Products", email: "qa@sidvokodvocement.example.sz" }, "7.2", "technical", "Raising transverse strength to 2.2 kN needs a transition period.", "Allow 12 months transition."),
    c(2, "WI-26-003", { name: "Mbali Fakudze", org: "Consumer Association of Eswatini", email: "mbali@consumers.example.sz" }, "9", "general", "Marking should include the manufacturer's town.", "Add 'place of manufacture'."),
    c(3, "WI-26-003", { name: "J. Shabalala", org: "Mankayane Roof Tiles", email: "info@mankayanetiles.example.sz" }, "Annex A", "editorial", "Figure A.2 is unreadable.", "Redraw."),
  ];
}

export function seedBallots(): Ballot[] {
  return [
    {
      id: "BAL-26-012",
      work_item_id: "WI-26-002",
      draft_label: "CD2",
      opens: isoIn(-5),
      closes: isoIn(10),
      eligible: ["Dr. Thulisile Mkhonta", "Sipho Nkambule", "Thandeka Nkambule", "Dr. Mandla Shongwe", "Busi Gamedze", "Lwazi Dube"],
      votes: {
        "Dr. Thulisile Mkhonta": { vote: "approve", at: isoIn(-4) },
        "Thandeka Nkambule": { vote: "approve_comments", comment: "Clause 7: allow 'nectar' for products with 25% juice.", at: isoIn(-3) },
        "Dr. Mandla Shongwe": { vote: "approve", at: isoIn(-2) },
        "Lwazi Dube": { vote: "abstain", at: isoIn(-1) },
      },
      state: "Open",
      rule: { approve_pct: 66.7, max_disapprove_pct: 25, quorum_pct: 50 },
    },
    {
      id: "BAL-26-009",
      work_item_id: "WI-26-004",
      draft_label: "FDIS",
      opens: isoIn(-35),
      closes: isoIn(-3),
      eligible: ["Dr. Thulisile Mkhonta", "Sipho Nkambule", "Thandeka Nkambule", "Dr. Mandla Shongwe", "Busi Gamedze", "Lwazi Dube"],
      votes: Object.fromEntries(["Dr. Thulisile Mkhonta", "Sipho Nkambule", "Thandeka Nkambule", "Dr. Mandla Shongwe", "Busi Gamedze", "Lwazi Dube"].map((n) => [n, { vote: "approve" as const, at: isoIn(-20) }])),
      state: "Passed",
      closed_at: isoIn(-3),
      rule: { approve_pct: 66.7, max_disapprove_pct: 25, quorum_pct: 50 },
    },
  ];
}

const cat = (id: string, ref: string, title: string, sector: string, ics: string, price: number, yearsAgo: number, extra: Partial<CatalogueEntry> = {}): CatalogueEntry => ({ id, ref, title, sector, ics, keywords: title.toLowerCase().split(/\W+/).filter((w) => w.length > 4), price, pages: 12 + (price % 30), status: "current", published_at: isoIn(-Math.round(yearsAgo * 365)), preview_pages: 3, abstract: `${title}. Published by ESWASA.`, ...extra });

export const SEED_CATALOGUE: CatalogueEntry[] = [
  cat("CAT-044", "SZNS 044:2019", "Bottled drinking water — Specification", "Food", "67.160.20", 480, 7, { compulsory: { regulation: "Legal Notice 112 of 2020", since: isoIn(-2000) }, tc_id: "TC3" }),
  cat("CAT-060", "SZNS 060:2021", "Honey — Specification", "Food", "67.180.10", 280, 5.2, { tc_id: "TC3" }),
  cat("CAT-210", "SZNS 210:2016", "Concrete roof tiles — Specification", "Construction", "91.100.30", 520, 10, { compulsory: { regulation: "Building Regulations 2017", since: isoIn(-3000) }, tc_id: "TC5" }),
  cat("CAT-9001", "SZNS ISO 9001:2015", "Quality management systems — Requirements", "Management", "03.120.10", 650, 9, { adoption: { source: "ISO", ref: "ISO 9001:2015", degree: "IDT" }, licensed: true }),
  cat("CAT-14001", "SZNS ISO 14001:2015", "Environmental management systems — Requirements", "Management", "13.020.10", 650, 9, { adoption: { source: "ISO", ref: "ISO 14001:2015", degree: "IDT" }, licensed: true }),
  cat("CAT-22000-05", "SZNS ISO 22000:2005", "Food safety management systems (2005)", "Food", "67.020", 600, 16, { status: "superseded", superseded_by: "SZNS ISO 22000:2026", licensed: true }),
  cat("CAT-1043", "SZNS 1043:2018", "Maize meal — Specification", "Food", "67.060", 360, 8, { compulsory: { regulation: "Legal Notice 45 of 2019", since: isoIn(-2400) }, tc_id: "TC3" }),
  cat("CAT-050", "SZNS 050:2014", "Bread — Specification", "Food", "67.060", 300, 12, { tc_id: "TC3" }),
  cat("CAT-301", "SZNS 301:2020", "Portland cement — Composition and conformity", "Construction", "91.100.10", 540, 6, { compulsory: { regulation: "Building Regulations 2017", since: isoIn(-1800) }, tc_id: "TC5" }),
  cat("CAT-227", "SZNS 227:2012", "Burnt clay bricks (2012)", "Construction", "91.100.25", 380, 14, { tc_id: "TC5" }),
  cat("CAT-115", "SZNS 115:2019", "Edible vegetable oils — Specification", "Food", "67.200.10", 340, 7),
  cat("CAT-077", "SZNS 077:2017", "Fresh milk — Specification", "Food", "67.100.10", 300, 9, { tc_id: "TC3" }),
  cat("CAT-45001", "SZNS ISO 45001:2018", "Occupational health and safety management systems", "Management", "13.100", 650, 7, { adoption: { source: "ISO", ref: "ISO 45001:2018", degree: "IDT" }, licensed: true }),
  cat("CAT-180", "SZNS 180:2021", "Electrical wiring of premises", "Electrical", "91.140.50", 720, 5, { compulsory: { regulation: "Electricity Act regulations", since: isoIn(-1500) } }),
  cat("CAT-161", "SZNS 161:2015", "Paints — Exterior acrylic emulsion", "Chemicals", "87.040", 420, 11),
  cat("CAT-090", "SZNS 090:2016", "Toilet paper — Specification", "Manufacturing", "85.080.20", 260, 10),
  cat("CAT-123", "SZNS 123:2019", "Steel reinforcing bars", "Construction", "77.140.15", 460, 7, { tc_id: "TC5" }),
  cat("CAT-200", "SZNS 200:2022", "LPG cylinders — Safe handling", "Energy", "23.020.35", 390, 4),
  cat("CAT-017", "SZNS 017:2010", "Sugar — Specification", "Food", "67.180.10", 280, 16, { tc_id: "TC3" }),
  cat("CAT-061D", "SZNS 061 (draft)", "Fruit juices and nectars — draft", "Food", "67.160.20", 0, 0, { status: "draft", tc_id: "TC3" }),
];

export function seedProposals(): Proposal[] {
  return [
    { id: "NWIP-26-004", state: "Submitted", title: "Honey — revision for creamed and infused honey", scope: "Extend SZNS 060 to creamed honey and honey with added ingredients (labelling, moisture limits).", justification: "Export buyers ask for a national reference for creamed honey; local producers have no criteria to certify against.", intl_refs: "Codex CXS 12-1981; EU Directive 2001/110/EC", stakeholders: "Beekeepers' association, honey processors, Ministry of Agriculture, consumers", urgency: "normal", proposer: { name: "Sipho Nkambule", org: "Ubombo Honey Co. (Pty) Ltd", email: "demo" }, at: isoIn(-6), seq: 1, history: [ev(isoIn(-6), "Sipho Nkambule (stakeholder)", "Submitted proposal", undefined, "Submitted")] },
    { id: "NWIP-26-003", state: "Circulated", title: "Solar water heaters — Performance and safety", scope: "Performance, durability and safety of domestic solar water heaters.", justification: "Government rebate scheme needs a national standard to qualify products.", intl_refs: "ISO 9806; SANS 1307", stakeholders: "Energy regulator, importers, installers", urgency: "high", proposer: { name: "Energy Regulatory Authority", org: "ESERA", email: "standards@esera.example.sz" }, tc_id: "TC5", at: isoIn(-25), seq: 2, history: [ev(isoIn(-15), "Nokuthula Zwane", "Circulate to TC", "Submitted", "Circulated")] },
    { id: "NWIP-26-001", state: "Approved", title: "Fortified maize meal", scope: "Fortification levels for maize meal.", justification: "National nutrition programme.", intl_refs: "SADC HS", stakeholders: "Millers, Ministry of Health", urgency: "high", proposer: { name: "Ministry of Health", org: "Nutrition Council", email: "nutrition@health.example.sz" }, tc_id: "TC3", work_item_id: "WI-26-005", at: isoIn(-50), seq: 3, history: [ev(isoIn(-30), "Sibusiso Gama", "Approve — create work item", "Circulated", "Approved")] },
    { id: "NWIP-26-002", state: "Rejected", title: "Mobile phone chargers", scope: "Safety of chargers.", justification: "Fires reported.", intl_refs: "IEC 62368-1", stakeholders: "Retailers", urgency: "normal", proposer: { name: "Lindiwe Hlophe", org: "", email: "lindiwe.h@example.sz" }, at: isoIn(-80), seq: 2, history: [ev(isoIn(-60), "Sibusiso Gama", "Reject", "Submitted", "Rejected", "Covered by the identical adoption of IEC 62368-1 already in the catalogue.")] },
  ];
}

export const SEED_SUBSCRIPTIONS: Subscription[] = [
  { id: "SUB-1", email: "demo", kind: "sector", value: "Food", label: "Food sector", events: ["drafts", "publications", "withdrawals"], at: isoIn(-200) },
  { id: "SUB-2", email: "demo", kind: "standard", value: "CAT-060", label: "SZNS 060 Honey", events: ["publications", "withdrawals"], at: isoIn(-100) },
];

export const DEFAULT_STD_SETTINGS: StandardsSettings = { comment_days: 60, ballot_days: 30, approve_pct: 66.7, max_disapprove_pct: 25, quorum_pct: 50, review_years: 5, sla_resolution_days: 15, sla_publication_days: 10 };

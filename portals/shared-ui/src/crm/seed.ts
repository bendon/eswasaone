/**
 * Demo seed for the CRM store — loaded only when VITE_DEMO_MODE=true.
 * All organisations and people are fictional.
 */
import type {
  Case,
  CaseMessage,
  CaseState,
  CaseType,
  Client,
  ClientTier,
  CrmQuote,
  Opportunity,
  Region,
  Signal,
} from "./types";

export function iso(days: number, hour = 9): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  d.setHours(hour, 0, 0, 0);
  return d.toISOString();
}

type ClientSeed = [
  id: string,
  name: string,
  sector: string,
  region: Region,
  tier: ClientTier,
  employees: number,
  exporter: boolean,
  manager: string | undefined,
];

const CLIENTS: ClientSeed[] = [
  ["CL-001", "Ubombo Honey Co. (Pty) Ltd", "Food & beverage", "Lubombo", "growth", 38, true, "N. Dlamini"],
  ["CL-002", "Valley Dairy Cooperative", "Food & beverage", "Manzini", "key", 210, false, "N. Dlamini"],
  ["CL-003", "Mhlume Packaging (Pty) Ltd", "Manufacturing", "Lubombo", "key", 140, true, "T. Simelane"],
  ["CL-004", "Lilanga Natural Skincare", "Cosmetics", "Hhohho", "growth", 4, true, "N. Dlamini"],
  ["CL-005", "Hlathikhulu Timber Works", "Timber & construction", "Shiselweni", "standard", 64, true, undefined],
  ["CL-006", "Sidvokodvo Cement Products", "Timber & construction", "Manzini", "key", 320, false, "T. Simelane"],
  ["CL-007", "Ezulwini Water Bottlers", "Food & beverage", "Hhohho", "growth", 45, false, "N. Dlamini"],
  ["CL-008", "Matsapha Steel Fabricators", "Manufacturing", "Manzini", "standard", 88, false, undefined],
  ["CL-009", "Nhlangano Grain Millers", "Food & beverage", "Shiselweni", "key", 150, true, "T. Simelane"],
  ["CL-010", "Swazi Crafts Collective", "Handicrafts", "Hhohho", "standard", 22, true, undefined],
  ["CL-011", "Lavumisa Citrus Packhouse", "Agriculture", "Shiselweni", "growth", 260, true, "N. Dlamini"],
  ["CL-012", "Mbabane Medical Supplies", "Health", "Hhohho", "standard", 31, false, undefined],
  ["CL-013", "Royal Valley Sugar Estates", "Agriculture", "Lubombo", "key", 1400, true, "T. Simelane"],
  ["CL-014", "Siteki Feeds & Agro", "Agriculture", "Lubombo", "standard", 27, false, undefined],
  ["CL-015", "Manzini Paints Ltd", "Chemicals", "Manzini", "growth", 56, true, "N. Dlamini"],
  ["CL-016", "Pigg's Peak Fresh Produce", "Agriculture", "Hhohho", "prospect", 18, true, undefined],
  ["CL-017", "Lobamba Electrical Contractors", "Electrical", "Hhohho", "standard", 40, false, undefined],
  ["CL-018", "Big Bend Fuel Distributors", "Energy", "Lubombo", "growth", 75, false, "T. Simelane"],
  ["CL-019", "Malkerns Textile Mills", "Textiles", "Manzini", "key", 600, true, "N. Dlamini"],
  ["CL-020", "Kwaluseni Bakery", "Food & beverage", "Manzini", "prospect", 12, false, undefined],
  ["CL-021", "Mankayane Roof Tiles", "Timber & construction", "Manzini", "standard", 35, false, undefined],
  ["CL-022", "Hhohho Pharmacies Group", "Health", "Hhohho", "growth", 90, false, "T. Simelane"],
  ["CL-023", "Shewula Eco Lodge", "Tourism", "Lubombo", "prospect", 14, false, undefined],
  ["CL-024", "Mpaka Coal Logistics", "Energy", "Lubombo", "dormant" as ClientTier, 60, true, undefined],
];

const SCHEMES: Record<string, [string, string][]> = {
  "Food & beverage": [
    ["Management system", "ISO 22000:2018"],
    ["Product certification", "SZNS product mark"],
  ],
  Manufacturing: [
    ["Management system", "ISO 9001:2015"],
    ["Management system", "ISO 14001:2015"],
  ],
  Cosmetics: [["Product certification", "Ingelo Quality Mark"]],
  "Timber & construction": [["Product certification", "SZNS product mark"]],
  Agriculture: [
    ["Management system", "ISO 22000:2018"],
    ["Management system", "ISO 9001:2015"],
  ],
  Handicrafts: [["Product certification", "Ingelo Quality Mark"]],
  Health: [["Management system", "ISO 9001:2015"]],
  Chemicals: [["Management system", "ISO 14001:2015"]],
  Electrical: [["Management system", "ISO 45001:2018"]],
  Energy: [["Management system", "ISO 45001:2018"]],
  Textiles: [
    ["Management system", "ISO 9001:2015"],
    ["Management system", "ISO 45001:2018"],
  ],
  Tourism: [],
};

const FIRST = ["Sipho", "Thandeka", "Bongani", "Lindiwe", "Mandla", "Nomsa", "Sibusiso", "Zanele", "Musa", "Phindile"];
const LAST = ["Nkambule", "Magagula", "Hlophe", "Dlamini", "Motsa", "Shongwe", "Mamba", "Khumalo", "Simelane", "Maseko"];

function domain(name: string): string {
  return `${name.split(" ")[0].toLowerCase().replace(/[^a-z]/g, "")}.example.sz`;
}

function buildClient([id, name, sector, region, tier, employees, exporter, manager]: ClientSeed, i: number): Client {
  const prospect = tier === "prospect";
  const dormant = (tier as string) === "dormant";
  const d = domain(name);
  const c1 = `${FIRST[i % 10]} ${LAST[(i * 3) % 10]}`;
  const c2 = `${FIRST[(i + 4) % 10]} ${LAST[(i * 7 + 1) % 10]}`;
  const schemes = prospect ? [] : SCHEMES[sector] ?? [];
  // Spread expiries so the renewals radar has 30/60/90-day buckets.
  const expiryDays = [24, 52, 81, 140, 300, 410, 18, 66][i % 8];
  const certificates = schemes.map(([scheme, standard], k) => {
    const status: Client["certificates"][number]["status"] =
      id === "CL-021" ? "suspended" : dormant ? "expired" : "valid";
    return {
      id: `SZ-${scheme.startsWith("Product") ? "PC" : "MS"}-${2100 + i * 3 + k}`,
      scheme,
      standard,
      status,
      issued: iso(-(1095 - expiryDays - k * 40)),
      expires: iso(dormant ? -60 : expiryDays + k * 45),
      next_surveillance: dormant ? undefined : iso(((i * 17 + k * 29) % 120) + 5),
    };
  });
  const instruments =
    ["Food & beverage", "Manufacturing", "Agriculture", "Health", "Chemicals"].includes(sector) && !prospect
      ? [
          {
            id: `INS-${400 + i * 2}`,
            name: "Platform scale 300 kg",
            last_cal: iso(-330 + i * 3),
            next_due: iso(35 + i * 3),
            status: (i % 5 === 0 ? "due" : "in_tolerance") as "due" | "in_tolerance",
          },
          {
            id: `INS-${401 + i * 2}`,
            name: sector === "Food & beverage" ? "Pasteuriser probe" : "Pressure gauge",
            last_cal: iso(-200),
            next_due: iso(165 - i * 4),
            status: (i === 1 ? "out_of_tolerance" : "in_tolerance") as "out_of_tolerance" | "in_tolerance",
          },
        ]
      : [];
  const overdue = ["CL-005", "CL-008", "CL-024", "CL-021"].includes(id);
  return {
    id,
    name,
    sector,
    region,
    tier: dormant ? "standard" : tier,
    status: prospect ? "prospect" : dormant ? "dormant" : "active",
    reg_no: prospect ? undefined : `R7/${3000 + i * 41}`,
    since: iso(-(400 + i * 90)),
    employees,
    exporter,
    account_manager: manager,
    tags: [exporter ? "Exporter" : "Local", ...(tier === "key" ? ["Key account"] : [])],
    contacts: [
      { id: `${id}-c1`, name: c1, role: prospect ? "Owner" : "Quality manager", email: `quality@${d}`, phone: `+268 76${String(100000 + i * 7919).slice(0, 6)}`, primary: true },
      { id: `${id}-c2`, name: c2, role: "Finance", email: `accounts@${d}`, phone: `+268 25${String(100000 + i * 3571).slice(0, 6)}` },
    ],
    certificates,
    applications:
      id === "CL-001"
        ? [{ id: "CERT-0042", scheme: "ISO 22000 + SZNS mark", stage: "Technical review", opened: iso(-60) }]
        : id === "CL-004"
          ? [{ id: "CERT-0051", scheme: "Ingelo Quality Mark", stage: "Awaiting customer", opened: iso(-25) }]
          : id === "CL-016"
            ? [{ id: "CERT-0057", scheme: "GLOBALG.A.P. readiness", stage: "Draft", opened: iso(-12) }]
            : [],
    instruments,
    training:
      i % 3 === 0 && !prospect
        ? [{ course: "ISO 9001 internal auditor", people: 3 + (i % 4), date: iso(-120 + i), status: "completed" }]
        : i % 4 === 1
          ? [{ course: "HACCP awareness", people: 6, date: iso(21), status: "booked" }]
          : [],
    orders: prospect
      ? id === "CL-016"
        ? [{ id: "ORD-2231", item: "SZNS 201: Fresh produce handling", amount: 650, date: iso(-34) }]
        : []
      : [
          { id: `ORD-${2000 + i * 5}`, item: "SZNS ISO 9001:2015 (licensed copy)", amount: 650, date: iso(-200 + i * 4) },
        ],
    invoices: prospect
      ? []
      : [
          { id: `INV-${3900 + i * 3}`, label: "Annual certificate fee", amount: 6000 + i * 250, due: iso(-90), status: "paid" },
          {
            id: `INV-${3901 + i * 3}`,
            label: "Surveillance audit",
            amount: 12000 + i * 400,
            due: overdue ? iso(-38) : iso(20),
            status: overdue ? "overdue" : "unpaid",
          },
        ],
    activity: [
      { id: `${id}-a1`, at: iso(-(5 + i * 6)), kind: "call", by: manager ?? "Customer Service", text: "Check-in call about upcoming surveillance and renewals." },
      ...(i % 2 === 0
        ? [{ id: `${id}-a2`, at: iso(-(40 + i * 3)), kind: "visit" as const, by: manager ?? "T. Simelane", text: "Site visit — introduced calibration and training offer." }]
        : []),
    ],
  };
}

export const SEED_CLIENTS: Client[] = CLIENTS.map(buildClient);

/* ---------------- cases ---------------- */

function msg(
  id: string,
  days: number,
  author: string,
  role: CaseMessage["role"],
  body: string,
  visibility: CaseMessage["visibility"] = "public",
): CaseMessage {
  return { id, at: iso(days, 10), author, role, visibility, body };
}

type CaseSeed = {
  ref: string;
  type: CaseType;
  state: CaseState;
  subject: string;
  description: string;
  days: number;
  team: string;
  priority?: Case["priority"];
  channel?: Case["channel"];
  assignee?: string;
  client_id?: string;
  about?: Case["about"];
  reporter: Case["reporter"];
  extra?: Partial<Case>;
};

const CASES: CaseSeed[] = [
  {
    ref: "CS-26-0141",
    type: "mark_misuse",
    state: "Open",
    subject: "SZNS mark on uncertified roof tiles in Manzini market",
    description:
      "A trader at the Manzini market is selling roof tiles stamped with the SZNS mark. The QR code on the label doesn't scan, and the seller couldn't show a certificate.",
    days: -1,
    team: "Market Surveillance",
    priority: "urgent",
    channel: "verify_scan",
    about: { kind: "product", label: "Roof tiles — 'Mankayane' brand label", client_id: "CL-021" },
    reporter: { anonymous: true, preferred: "sms" },
    extra: { location: "Manzini market, stall row C", region: "Manzini", sector: "Timber & construction", tags: ["QR failed"] },
  },
  {
    ref: "CS-26-0140",
    type: "enquiry",
    state: "Open",
    subject: "How do I get my bakery's bread certified?",
    description: "We are a small bakery in Kwaluseni and want to supply supermarkets. They ask for a certificate. What do we need?",
    days: 0,
    team: "Customer Service",
    channel: "web",
    client_id: "CL-020",
    reporter: { anonymous: false, name: "Nomsa Khumalo", email: "nomsa@kwaluseni.example.sz", phone: "+268 7612 3344", organisation: "Kwaluseni Bakery", preferred: "whatsapp" },
    extra: { sector: "Food & beverage", region: "Manzini" },
  },
  {
    ref: "CS-26-0138",
    type: "service_complaint",
    state: "In Progress",
    subject: "Calibration certificate delayed three weeks",
    description:
      "We submitted two platform scales for calibration and were promised them back in 5 days. It has been three weeks and nobody answers the phone at the lab.",
    days: -9,
    team: "Quality Manager",
    priority: "high",
    channel: "account",
    assignee: "Z. Maseko",
    client_id: "CL-008",
    about: { kind: "service", label: "Calibration job CAL-2611", ref: "CAL-2611" },
    reporter: { anonymous: false, name: "Mandla Motsa", email: "quality@matsapha.example.sz", organisation: "Matsapha Steel Fabricators", preferred: "email" },
    extra: { sector: "Manufacturing", region: "Manzini" },
  },
  {
    ref: "CS-26-0136",
    type: "product_report",
    state: "Awaiting Customer",
    subject: "Bottled water with sediment — certified brand",
    description: "Bought a 5L bottle of certified water at a Mbabane shop, there is visible sediment. Batch code on the cap.",
    days: -12,
    team: "Market Surveillance",
    priority: "high",
    channel: "web",
    assignee: "P. Shongwe",
    client_id: "CL-007",
    about: { kind: "client", label: "Ezulwini Water Bottlers — 5L still water", client_id: "CL-007" },
    reporter: { anonymous: false, name: "Lindiwe Hlophe", email: "lindiwe.h@example.sz", preferred: "email" },
    extra: { sector: "Food & beverage", region: "Hhohho", paused_since: iso(-3), tags: ["Batch EW-0926"] },
  },
  {
    ref: "CS-26-0133",
    type: "billing_dispute",
    state: "Triaged",
    subject: "Invoiced twice for surveillance audit",
    description: "We received INV-3916 and INV-3917 for the same surveillance audit. Please cancel one.",
    days: -4,
    team: "Finance",
    channel: "email",
    client_id: "CL-005",
    about: { kind: "invoice", label: "INV-3916 / INV-3917", ref: "INV-3916" },
    reporter: { anonymous: false, name: "Zanele Mamba", email: "accounts@hlathikhulu.example.sz", organisation: "Hlathikhulu Timber Works", preferred: "email" },
    extra: { sector: "Timber & construction", region: "Shiselweni" },
  },
  {
    ref: "CS-26-0129",
    type: "appeal",
    state: "In Progress",
    subject: "Appeal: reduced scope for woven baskets line",
    description: "We contest the decision to remove the woven baskets line from our Ingelo certificate. The nonconformity was closed before the decision.",
    days: -14,
    team: "Appeals Panel",
    channel: "account",
    assignee: "Panel chair",
    client_id: "CL-010",
    about: { kind: "application", label: "CERT-0007 decision", ref: "CERT-0007" },
    reporter: { anonymous: false, name: "Musa Dlamini", email: "musa@swazicrafts.example.sz", organisation: "Swazi Crafts Collective", preferred: "email" },
    extra: { decision_maker: "Head of Certification", panel: ["Panel chair", "Independent technical expert"], sector: "Handicrafts", region: "Hhohho" },
  },
  {
    ref: "CS-26-0127",
    type: "service_complaint",
    state: "Escalated",
    subject: "Auditor arrived without notice and left early",
    description: "The surveillance auditor arrived a day early without confirmation and left before the closing meeting. We have no report.",
    days: -26,
    team: "Quality Manager",
    priority: "high",
    channel: "phone",
    assignee: "Z. Maseko",
    client_id: "CL-015",
    reporter: { anonymous: false, name: "Sibusiso Shongwe", email: "quality@manzini.example.sz", organisation: "Manzini Paints Ltd", preferred: "phone" },
    extra: { sector: "Chemicals", region: "Manzini" },
  },
  {
    ref: "CS-26-0124",
    type: "enquiry",
    state: "Resolved",
    subject: "Where can I buy SZNS 1043?",
    description: "Need the latest SZNS 1043 for a tender submission.",
    days: -8,
    team: "Standards Sales",
    channel: "whatsapp",
    assignee: "B. Hlophe",
    reporter: { anonymous: false, name: "Bongani Mamba", phone: "+268 7899 0011", preferred: "whatsapp" },
    extra: { resolution: "Sent the e-store link for SZNS 1043:2024. Customer bought it the same day.", resolved_at: iso(-6) },
  },
  {
    ref: "CS-26-0120",
    type: "product_report",
    state: "In Progress",
    subject: "Maize meal bags under-weight",
    description: "Three 10 kg bags from the same batch weighed 9.4 kg on our shop scale.",
    days: -18,
    team: "Market Surveillance",
    priority: "normal",
    channel: "walk_in",
    assignee: "P. Shongwe",
    client_id: "CL-009",
    about: { kind: "client", label: "Nhlangano Grain Millers — 10 kg maize meal", client_id: "CL-009" },
    reporter: { anonymous: false, name: "Phindile Simelane", phone: "+268 7655 1122", organisation: "Corner store, Hlathikhulu", preferred: "sms" },
    extra: { sector: "Food & beverage", region: "Shiselweni", links: [{ kind: "investigation", ref: "SURV-0019", label: "Surveillance investigation SURV-0019" }] },
  },
  {
    ref: "CS-26-0118",
    type: "product_report",
    state: "Closed",
    subject: "Maize meal bag short weight",
    description: "10 kg bag only 9.5 kg. Bought in Nhlangano.",
    days: -40,
    team: "Market Surveillance",
    channel: "web",
    client_id: "CL-009",
    about: { kind: "client", label: "Nhlangano Grain Millers — 10 kg maize meal", client_id: "CL-009" },
    reporter: { anonymous: true, preferred: "email" },
    extra: { resolution: "Investigated with surveillance visit; filling line recalibrated.", resolved_at: iso(-22), closed_at: iso(-8), sector: "Food & beverage", region: "Shiselweni" },
  },
  {
    ref: "CS-26-0115",
    type: "feedback",
    state: "Closed",
    subject: "Great HACCP course",
    description: "Our team found the HACCP awareness course practical and well run. Thank you!",
    days: -30,
    team: "Training",
    channel: "web",
    client_id: "CL-002",
    reporter: { anonymous: false, name: "Thandeka Nkambule", email: "quality@valley.example.sz", organisation: "Valley Dairy Cooperative", preferred: "email" },
    extra: { resolution: "Thanked the customer and shared with the training team.", resolved_at: iso(-28), closed_at: iso(-14), csat: { score: 5, comment: "Quick and friendly.", at: iso(-14) } },
  },
  {
    ref: "CS-26-0112",
    type: "service_complaint",
    state: "Closed",
    subject: "Quote took too long",
    description: "Waited 3 weeks for a certification quote.",
    days: -55,
    team: "Quality Manager",
    channel: "email",
    client_id: "CL-011",
    reporter: { anonymous: false, name: "Sipho Magagula", email: "quality@lavumisa.example.sz", organisation: "Lavumisa Citrus Packhouse", preferred: "email" },
    extra: {
      resolution: "Apologised; quote issued. Root cause: RFQs not visible to the scheme manager. Fixed by routing RFQs to the CRM quotes queue.",
      root_cause: "Process — RFQ routing",
      resolved_at: iso(-35),
      closed_at: iso(-20),
      csat: { score: 3, comment: "Resolved but slow.", at: iso(-20) },
      links: [{ kind: "capa", ref: "CAPA-0007", label: "Corrective action CAPA-0007" }],
    },
  },
  {
    ref: "CS-26-0109",
    type: "enquiry",
    state: "Closed",
    subject: "Calibration of a weighbridge",
    description: "Do you calibrate 60 t weighbridges on site?",
    days: -48,
    team: "Metrology",
    channel: "phone",
    client_id: "CL-013",
    reporter: { anonymous: false, name: "Nomsa Dlamini", email: "eng@royalvalley.example.sz", organisation: "Royal Valley Sugar Estates", preferred: "phone" },
    extra: { resolution: "Yes — on-site calibration booked for the harvest season.", resolved_at: iso(-45), closed_at: iso(-30), csat: { score: 4, at: iso(-30) } },
  },
  {
    ref: "CS-26-0104",
    type: "product_report",
    state: "Reopened",
    subject: "Paint peeling within weeks — certified product",
    description: "Exterior paint with ESWASA mark peeled within 6 weeks of application.",
    days: -32,
    team: "Market Surveillance",
    channel: "web",
    assignee: "P. Shongwe",
    client_id: "CL-015",
    about: { kind: "client", label: "Manzini Paints — exterior acrylic", client_id: "CL-015" },
    reporter: { anonymous: false, name: "Mandla Hlophe", email: "mandla.h@example.sz", preferred: "email" },
    extra: { resolution: "Sample tested within specification.", resolved_at: iso(-9), reopen_count: 1, sector: "Chemicals", region: "Manzini" },
  },
  {
    ref: "CS-26-0101",
    type: "service_complaint",
    state: "Closed",
    subject: "Training certificate had a misspelt name",
    description: "My training certificate shows the wrong spelling of my surname.",
    days: -60,
    team: "Training",
    channel: "account",
    reporter: { anonymous: false, name: "Zanele Maseko", email: "zanele.m@example.sz", preferred: "email" },
    extra: { resolution: "Certificate reissued.", root_cause: "Data entry", resolved_at: iso(-57), closed_at: iso(-43), csat: { score: 4, at: iso(-43) } },
  },
  {
    ref: "CS-26-0098",
    type: "mark_misuse",
    state: "Closed",
    subject: "Expired certificate displayed on website",
    description: "A fuel distributor's website still shows an ISO 45001 certificate that expired.",
    days: -70,
    team: "Market Surveillance",
    channel: "email",
    client_id: "CL-024",
    reporter: { anonymous: true, preferred: "email" },
    extra: { resolution: "Client removed the certificate image after a formal notice.", resolved_at: iso(-60), closed_at: iso(-46), sector: "Energy", region: "Lubombo" },
  },
];

function buildCase(s: CaseSeed, i: number): Case {
  const created = iso(s.days, 8 + (i % 6));
  const reporterName = s.reporter.anonymous ? "Anonymous" : s.reporter.name ?? "Customer";
  const thread: CaseMessage[] = [msg(`${s.ref}-m1`, s.days, reporterName, "customer", s.description)];
  const events: Case["events"] = [{ at: created, actor: reporterName, action: "Submitted", to: "Open" }];
  const progressed = s.state !== "Open";
  if (progressed) {
    thread.push(
      msg(
        `${s.ref}-m2`,
        s.days + 1,
        "ESWASA",
        "system",
        `We have received your case ${s.ref}. It is with our ${s.team} team.`,
      ),
    );
    events.push({ at: iso(s.days + 1), actor: s.assignee ?? "Triage", action: "Triage", from: "Open", to: "Triaged" });
  }
  if (["In Progress", "Awaiting Customer", "Escalated", "Resolved", "Reopened", "Closed"].includes(s.state)) {
    events.push({ at: iso(s.days + 1, 14), actor: s.assignee ?? "Agent", action: "Start work", from: "Triaged", to: "In Progress" });
    thread.push(
      msg(
        `${s.ref}-n1`,
        s.days + 1,
        s.assignee ?? "Agent",
        "staff",
        s.type === "product_report"
          ? "Checked the register: client certificate is valid. Requesting batch details before opening a surveillance visit."
          : "Pulled the job history. Looks like the lab queue was blocked by a failed reference weight.",
        "internal",
      ),
    );
  }
  if (s.state === "Awaiting Customer") {
    thread.push(
      msg(
        `${s.ref}-m3`,
        -3,
        s.assignee ?? "ESWASA",
        "staff",
        "Thank you. Could you send a photo of the cap showing the batch code and where you bought the bottle?",
      ),
    );
    events.push({ at: iso(-3), actor: s.assignee ?? "Agent", action: "Request info", from: "In Progress", to: "Awaiting Customer", note: "Batch code and photo needed" });
  }
  if (s.state === "Escalated") {
    events.push({ at: iso(-2), actor: "SLA monitor", action: "Escalate", from: "In Progress", to: "Escalated", note: "Resolution target breached" });
  }
  if (["Resolved", "Closed", "Reopened"].includes(s.state) && s.extra?.resolution) {
    thread.push(msg(`${s.ref}-m4`, s.days + 3, s.assignee ?? "ESWASA", "staff", s.extra.resolution));
    events.push({ at: s.extra.resolved_at ?? iso(s.days + 3), actor: s.assignee ?? "Agent", action: "Resolve", to: "Resolved" });
  }
  if (s.state === "Reopened") {
    thread.push(msg(`${s.ref}-m5`, -6, reporterName, "customer", "The paint on my wall is still peeling. Your test doesn't match what I see."));
    events.push({ at: iso(-6), actor: reporterName, action: "Not resolved — reopen", from: "Resolved", to: "Reopened" });
  }
  if (s.state === "Closed") {
    events.push({ at: s.extra?.closed_at ?? iso(s.days + 10), actor: s.extra?.csat ? reporterName : "System", action: s.extra?.csat ? "Confirm resolution" : "Auto-close", from: "Resolved", to: "Closed" });
  }
  return {
    ref: s.ref,
    type: s.type,
    subject: s.subject,
    description: s.description,
    state: s.state,
    priority: s.priority ?? "normal",
    channel: s.channel ?? "web",
    team: s.team,
    assignee: s.assignee,
    created_at: created,
    updated_at: events[events.length - 1].at,
    acknowledged_at: progressed ? iso(s.days + 1) : undefined,
    about: s.about,
    client_id: s.client_id ?? s.about?.client_id,
    reporter: s.reporter,
    access_code: `TRK${(48211 + i * 977).toString(36).toUpperCase()}`,
    thread,
    events,
    links: [],
    tags: [],
    reopen_count: 0,
    paused_wd: 0,
    ...s.extra,
  };
}

export const SEED_CASES: Case[] = CASES.map(buildCase);

/* ---------------- signals ---------------- */

export const SEED_SIGNALS: Signal[] = [
  {
    id: "SIG-301",
    kind: "cert_expiring",
    title: "ISO 22000 certificate expires in 24 days",
    detail: "Ubombo Honey Co. — recertification audit not yet planned.",
    client_id: "CL-001",
    services: ["certification"],
    value_estimate: 38000,
    created_at: iso(-2),
    due_at: iso(24),
    status: "new",
    source_ref: "SZ-MS-2100",
  },
  {
    id: "SIG-302",
    kind: "compulsory_standard",
    title: "New compulsory standard: SZNS 312 Bottled water",
    detail: "Gazetted last week. 3 unlicensed bottlers and 1 licensed bottler in the register need to act within 12 months.",
    services: ["certification", "testing"],
    value_estimate: 145000,
    created_at: iso(-5),
    due_at: iso(360),
    status: "new",
    sector: "Food & beverage",
  },
  {
    id: "SIG-303",
    kind: "tbt_notification",
    title: "EU notification G/TBT/N/EU/891 affects textile exporters",
    detail: "New labelling and chemical limits for textiles into the EU. Malkerns Textile Mills exports to the EU.",
    client_id: "CL-019",
    services: ["testing", "training"],
    value_estimate: 54000,
    created_at: iso(-4),
    status: "new",
    sector: "Textiles",
    source_ref: "G/TBT/N/EU/891",
  },
  {
    id: "SIG-304",
    kind: "abandoned_applicability",
    title: "Applicability check completed, no application",
    detail: "Pig's Peak Fresh Produce checked 'export avocados to the EU' 12 days ago and started a draft application, but never submitted it.",
    client_id: "CL-016",
    services: ["certification", "inspection"],
    value_estimate: 31000,
    created_at: iso(-12),
    status: "new",
  },
  {
    id: "SIG-305",
    kind: "nc_training",
    title: "Repeated CCP-monitoring nonconformities → HACCP training",
    detail: "Valley Dairy had a major NC on ISO 22000 §8.5.4 (night-shift records). Offer HACCP awareness for shift staff.",
    client_id: "CL-002",
    services: ["training"],
    value_estimate: 15600,
    created_at: iso(-6),
    status: "new",
    source_ref: "NC-0018-1",
  },
  {
    id: "SIG-306",
    kind: "calibration_due",
    title: "6 instruments due for calibration in 45 days",
    detail: "Nhlangano Grain Millers — platform scales and moisture meters. Bundle with on-site visit.",
    client_id: "CL-009",
    services: ["calibration"],
    value_estimate: 9600,
    created_at: iso(-1),
    due_at: iso(45),
    status: "new",
  },
  {
    id: "SIG-307",
    kind: "standard_purchase",
    title: "Bought ISO 9001 three times, not certified",
    detail: "Lobamba Electrical Contractors bought ISO 9001 and ISO 45001 standards this year but holds no management-system certificate.",
    client_id: "CL-017",
    services: ["certification", "training"],
    value_estimate: 42000,
    created_at: iso(-9),
    status: "new",
  },
  {
    id: "SIG-308",
    kind: "inbound_enquiry",
    title: "Request for quote: lodge wants a quality grading",
    detail: "Shewula Eco Lodge asked about tourism quality grading and food-safety training for kitchen staff.",
    client_id: "CL-023",
    prospect: { name: "Shewula Eco Lodge", contact: "Lindiwe Mamba", email: "manager@shewula.example.sz", sector: "Tourism" },
    services: ["training", "certification"],
    value_estimate: 18000,
    created_at: iso(-1),
    status: "new",
  },
  {
    id: "SIG-309",
    kind: "repeat_complaints",
    title: "3 complaints in 60 days about the same certified brand",
    detail: "Nhlangano Grain Millers — short-weight maize meal. Compliance signal: route to Certification for a special surveillance visit.",
    client_id: "CL-009",
    services: [],
    value_estimate: 0,
    created_at: iso(-3),
    status: "new",
    compliance: true,
  },
  {
    id: "SIG-310",
    kind: "lapsed_client",
    title: "Certificate expired 60 days ago — no renewal",
    detail: "Mpaka Coal Logistics let ISO 45001 lapse. Overdue invoice open.",
    client_id: "CL-024",
    services: ["certification"],
    value_estimate: 26000,
    created_at: iso(-8),
    status: "snoozed",
  },
  {
    id: "SIG-311",
    kind: "surveillance_due",
    title: "Surveillance audit due in 30 days",
    detail: "Mhlume Packaging — ISO 9001 and ISO 14001 combined surveillance.",
    client_id: "CL-003",
    services: ["certification"],
    value_estimate: 24000,
    created_at: iso(-3),
    due_at: iso(30),
    status: "converted",
    opportunity_id: "OPP-208",
  },
];

/* ---------------- opportunities ---------------- */

export const SEED_OPPORTUNITIES: Opportunity[] = [
  { id: "OPP-201", title: "Recertification ISO 22000 + SZNS mark", client_id: "CL-002", stage: "proposal", services: ["certification"], value: 46000, probability: 70, owner: "N. Dlamini", created_at: iso(-20), expected_close: iso(25), source: "cert_expiring", quote_id: "QT-26-014", next_step: "Follow up on quote", notes: [] },
  { id: "OPP-202", title: "Calibration contract — harvest season", client_id: "CL-013", stage: "negotiation", services: ["calibration"], value: 64000, probability: 80, owner: "T. Simelane", created_at: iso(-35), expected_close: iso(10), source: "manual", next_step: "Agree on-site dates", notes: [{ at: iso(-5), by: "T. Simelane", text: "Wants 3 visits instead of 2; price per visit to drop." }] },
  { id: "OPP-203", title: "ISO 45001 + internal auditor training", client_id: "CL-019", stage: "qualify", services: ["certification", "training"], value: 72000, probability: 30, owner: "N. Dlamini", created_at: iso(-6), expected_close: iso(60), source: "tbt_notification", signal_id: "SIG-303", notes: [] },
  { id: "OPP-204", title: "EU export inspection package", client_id: "CL-011", stage: "won", services: ["inspection", "testing"], value: 39000, probability: 100, owner: "N. Dlamini", created_at: iso(-50), expected_close: iso(-8), source: "manual", notes: [] },
  { id: "OPP-205", title: "Bottled water product certification", client_id: "CL-007", stage: "proposal", services: ["certification", "testing"], value: 33000, probability: 50, owner: "N. Dlamini", created_at: iso(-14), expected_close: iso(30), source: "compulsory_standard", quote_id: "QT-26-016", notes: [] },
  { id: "OPP-206", title: "Standards subscription", client_id: "CL-006", stage: "won", services: ["standards"], value: 9500, probability: 100, owner: "T. Simelane", created_at: iso(-70), expected_close: iso(-40), source: "manual", notes: [] },
  { id: "OPP-207", title: "HACCP in-house training", client_id: "CL-022", stage: "lost", services: ["training"], value: 14000, probability: 0, owner: "T. Simelane", created_at: iso(-60), expected_close: iso(-20), source: "manual", lost_reason: "Chose a private provider on price", notes: [] },
  { id: "OPP-208", title: "Combined surveillance ISO 9001 / 14001", client_id: "CL-003", stage: "negotiation", services: ["certification"], value: 24000, probability: 85, owner: "T. Simelane", created_at: iso(-3), expected_close: iso(20), source: "surveillance_due", signal_id: "SIG-311", next_step: "Confirm audit dates", notes: [] },
  { id: "OPP-209", title: "Ingelo mark — 2 new product lines", client_id: "CL-004", stage: "qualify", services: ["certification"], value: 12000, probability: 40, owner: "N. Dlamini", created_at: iso(-9), expected_close: iso(45), source: "manual", notes: [] },
  { id: "OPP-210", title: "Fuel quality testing programme", client_id: "CL-018", stage: "proposal", services: ["testing"], value: 58000, probability: 45, owner: "T. Simelane", created_at: iso(-18), expected_close: iso(35), source: "manual", notes: [] },
];

/* ---------------- quotes ---------------- */

export const SEED_QUOTES: CrmQuote[] = [
  {
    id: "QT-26-014",
    opportunity_id: "OPP-201",
    client_id: "CL-002",
    client_name: "Valley Dairy Cooperative",
    status: "sent",
    lines: [
      { code: "CERT-APP", label: "Certification application fee", qty: 1, unit_price: 2500 },
      { code: "CERT-AUD", label: "Audit (auditor-day)", qty: 5, unit_price: 6500 },
      { code: "CERT-FEE", label: "Certificate / permit fee", qty: 1, unit_price: 6000 },
      { code: "TEST-MICRO", label: "Microbiology test panel", qty: 3, unit_price: 1450 },
    ],
    discount_pct: 0,
    valid_until: iso(20),
    created_at: iso(-10),
    created_by: "N. Dlamini",
    sent_at: iso(-9),
    converted: [],
  },
  {
    id: "QT-26-015",
    opportunity_id: "OPP-202",
    client_id: "CL-013",
    client_name: "Royal Valley Sugar Estates",
    status: "pending_approval",
    lines: [
      { code: "CAL-MASS", label: "Mass / balance calibration", qty: 40, unit_price: 850 },
      { code: "CAL-ONSITE", label: "On-site call-out", qty: 3, unit_price: 1500 },
    ],
    discount_pct: 15,
    valid_until: iso(30),
    created_at: iso(-2),
    created_by: "T. Simelane",
    notes: "Volume discount requested for 40 instruments.",
    converted: [],
  },
  {
    id: "QT-26-016",
    opportunity_id: "OPP-205",
    client_id: "CL-007",
    client_name: "Ezulwini Water Bottlers",
    status: "draft",
    lines: [
      { code: "CERT-APP", label: "Certification application fee", qty: 1, unit_price: 2500 },
      { code: "TEST-CHEM", label: "Chemical analysis", qty: 4, unit_price: 1900 },
      { code: "TEST-MICRO", label: "Microbiology test panel", qty: 4, unit_price: 1450 },
    ],
    discount_pct: 0,
    valid_until: iso(30),
    created_at: iso(-1),
    created_by: "N. Dlamini",
    converted: [],
  },
  {
    id: "QT-26-011",
    opportunity_id: "OPP-204",
    client_id: "CL-011",
    client_name: "Lavumisa Citrus Packhouse",
    status: "accepted",
    lines: [
      { code: "INSP-EXP", label: "Export inspection", qty: 15, unit_price: 1800 },
      { code: "TEST-CHEM", label: "Chemical analysis", qty: 6, unit_price: 1900 },
    ],
    discount_pct: 5,
    valid_until: iso(-5),
    created_at: iso(-40),
    created_by: "N. Dlamini",
    sent_at: iso(-38),
    accepted_at: iso(-8),
    approval: { by: "Sales Manager", at: iso(-39) },
    converted: [{ kind: "invoice", ref: "INV-4021" }],
  },
  {
    id: "QT-26-009",
    client_id: "CL-022",
    opportunity_id: "OPP-207",
    client_name: "Hhohho Pharmacies Group",
    status: "declined",
    lines: [{ code: "TRN-INHOUSE", label: "In-house training day", qty: 1, unit_price: 14000 }],
    discount_pct: 0,
    valid_until: iso(-20),
    created_at: iso(-55),
    created_by: "T. Simelane",
    sent_at: iso(-54),
    converted: [],
  },
];

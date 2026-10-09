/**
 * Metrology & LIMS demo seed — jobs in every state, lab equipment (one overdue reference standard),
 * methods / scope, customer instruments and LIMS test requests. Fictional.
 */
import { isoIn } from "../store/localStore";
import type { CalJob, CustomerInstrument, LabEquipment, Method, MetrologySettings, TestRequest } from "./types";

const ev = (at: string, actor: string, action: string, from?: string, to?: string, note?: string) => ({ at, actor, action, from, to, note });

function job(p: Partial<CalJob> & Pick<CalJob, "id" | "state" | "customer" | "items" | "discipline">): CalJob {
  return {
    seq: 1,
    history: [],
    customer_email: "",
    contact: "",
    location: "lab",
    accreditation: true,
    preferred_date: isoIn(3),
    delivery: "collect",
    created_at: isoIn(-10),
    worksheet: { refs: [], env: {}, points: [], attachments: [] },
    ...p,
  } as CalJob;
}

export const SEED_METHODS: Method[] = [
  { id: "MP-01", code: "ESW-MP-01", title: "Non-automatic weighing instruments", discipline: "Mass", range: "0.1 mg – 60 t", cmc: "0.05 mg (≤ 200 g); 0.1 % of load (> 1 t)", accredited: true },
  { id: "MP-02", code: "ESW-MP-02", title: "Weights, classes E2 to M3", discipline: "Mass", range: "1 mg – 20 kg", cmc: "E2: 0.003 mg at 1 g", accredited: true },
  { id: "TP-01", code: "ESW-TP-01", title: "Liquid-in-glass and digital thermometers", discipline: "Temperature", range: "−30 °C – 250 °C", cmc: "0.05 °C", accredited: true },
  { id: "PP-01", code: "ESW-PP-01", title: "Pressure gauges and transmitters", discipline: "Pressure", range: "0 – 700 bar", cmc: "0.025 % of reading", accredited: true },
  { id: "VP-01", code: "ESW-VP-01", title: "Volumetric glassware and fuel measures", discipline: "Volume", range: "1 mL – 20 L", cmc: "0.02 %", accredited: false },
  { id: "LP-01", code: "ESW-LP-01", title: "Gauge blocks and calipers", discipline: "Length", range: "0 – 300 mm", cmc: "0.5 µm", accredited: false },
];

export const SEED_EQUIPMENT: LabEquipment[] = [
  { id: "REF-MASS-01", name: "E2 weight set 1 mg – 1 kg", kind: "reference", discipline: "Mass", serial: "MT-E2-77812", range: "1 mg – 1 kg", traceability: "NMISA certificate M-2025-1184", last_cal: isoIn(-356), cal_due: isoIn(9), status: "in_service", checks: [{ at: isoIn(-90), by: "Ayanda Ndlovu", ok: true, note: "Check against REF-MASS-03" }] },
  { id: "REF-MASS-02", name: "F1 weights 20 kg ×5", kind: "reference", discipline: "Mass", serial: "F1-20-0442", range: "20 kg – 100 kg", traceability: "NMISA certificate M-2024-0931", last_cal: isoIn(-377), cal_due: isoIn(-12), status: "in_service", checks: [] },
  { id: "REF-TEMP-01", name: "SPRT reference thermometer", kind: "reference", discipline: "Temperature", serial: "FL-5615-1182", range: "−50 °C – 420 °C", traceability: "NMISA certificate T-2026-0219", last_cal: isoIn(-165), cal_due: isoIn(200), status: "in_service", checks: [{ at: isoIn(-30), by: "Sakhile Mdluli", ok: true, note: "Triple point of water check" }] },
  { id: "REF-PRES-01", name: "Deadweight tester 0–700 bar", kind: "reference", discipline: "Pressure", serial: "DH-PG7302", range: "0 – 700 bar", traceability: "NMISA certificate P-2025-0412", last_cal: isoIn(-275), cal_due: isoIn(90), status: "in_service", checks: [] },
  { id: "WRK-BATH-01", name: "Stirred liquid bath", kind: "working", discipline: "Temperature", serial: "HT-7380-221", range: "−30 °C – 200 °C", traceability: "Characterised in-house against REF-TEMP-01", last_cal: isoIn(-325), cal_due: isoIn(40), status: "in_service", checks: [{ at: isoIn(-14), by: "Sakhile Mdluli", ok: true, note: "Uniformity within 0.02 °C" }] },
  { id: "WRK-MASS-04", name: "Test loads 500 kg ×12 (weighbridge)", kind: "working", discipline: "Mass", serial: "TL-500-12", range: "500 kg – 6 t", traceability: "Calibrated against REF-MASS-02", last_cal: isoIn(-200), cal_due: isoIn(165), status: "in_service", checks: [] },
  { id: "REF-LEN-01", name: "Gauge block set grade 0", kind: "reference", discipline: "Length", serial: "MI-GB-112", range: "0.5 – 100 mm", traceability: "SANAS lab certificate L-2023-881", last_cal: isoIn(-800), cal_due: isoIn(-70), status: "out_of_service", out_reason: "Two blocks damaged — awaiting replacement", checks: [] },
];

export const SEED_INSTRUMENTS: CustomerInstrument[] = [
  { id: "INS-1001", owner_email: "demo", client: "Ubombo Honey Co. (Pty) Ltd", description: "Analytical balance 0–220 g", make: "Ohaus", model: "PX224", serial: "B4471", range: "0–220 g", discipline: "Mass", interval_months: 12, last_cal: isoIn(-360), next_due: isoIn(5), last_job: "CJ-25-0190", last_cert: "CAL-25-0190", last_result: "in_tolerance", drift: [{ at: isoIn(-1090), ratio: 0.12 }, { at: isoIn(-725), ratio: 0.15 }, { at: isoIn(-360), ratio: 0.14, cert: "CAL-25-0190" }] },
  { id: "INS-1002", owner_email: "demo", client: "Ubombo Honey Co. (Pty) Ltd", description: "Digital probe thermometers ×3", make: "Testo", model: "104", serial: "T-77/78/79", range: "−50 – 250 °C", discipline: "Temperature", interval_months: 12, last_cal: isoIn(-6), next_due: isoIn(359), last_job: "CJ-26-0231", last_cert: "CAL-26-0231", last_result: "in_tolerance" },
  { id: "INS-1003", owner_email: "demo", client: "Ubombo Honey Co. (Pty) Ltd", description: "Platform scale 300 kg", make: "Avery", model: "PS300", serial: "PS-0921", range: "0–300 kg", discipline: "Mass", interval_months: 12, last_cal: isoIn(-380), next_due: isoIn(-15), last_result: "in_tolerance", drift: [{ at: isoIn(-745), ratio: 0.4 }, { at: isoIn(-380), ratio: 0.55 }] },
  { id: "INS-1004", owner_email: "demo", client: "Ubombo Honey Co. (Pty) Ltd", description: "Steam line pressure gauge", make: "WIKA", model: "232.50", serial: "PG-5521", range: "0–10 bar", discipline: "Pressure", interval_months: 12, last_cal: isoIn(-245), next_due: isoIn(120), last_result: "out_of_tolerance", drift: [{ at: isoIn(-975), ratio: 0.35 }, { at: isoIn(-610), ratio: 0.62 }, { at: isoIn(-245), ratio: 1.18 }] },
];

export function seedJobs(): CalJob[] {
  return [
    job({ id: "CJ-26-0245", state: "Requested", customer: "Ubombo Honey Co. (Pty) Ltd", customer_email: "demo", contact: "Sipho Nkambule", phone: "+268 7602 1188", client_id: "CL-001", discipline: "Temperature", items: [{ id: "I1", description: "Data logger probe", make: "Testo", model: "174T", serial: "DL-1182", range: "−30 – 70 °C", discipline: "Temperature" }, { id: "I2", description: "Data logger probe", make: "Testo", model: "174T", serial: "DL-1183", range: "−30 – 70 °C", discipline: "Temperature" }], created_at: isoIn(-1), notes: "Cold-room loggers for export audit.", history: [ev(isoIn(-1), "Sipho Nkambule (customer)", "Requested calibration", undefined, "Requested")] }),
    job({ id: "CJ-26-0243", state: "Quoted", customer: "Valley Dairy Cooperative", customer_email: "demo", contact: "Thandeka Nkambule", client_id: "CL-002", discipline: "Pressure", items: [{ id: "I1", description: "Pasteuriser pressure gauge", make: "WIKA", serial: "PG-3301", range: "0–16 bar", discipline: "Pressure" }], created_at: isoIn(-6), quote: { lines: [{ label: "Pressure gauge calibration (5 points)", qty: 1, unit_price: 850 }, { label: "Accredited certificate", qty: 1, unit_price: 150 }], valid_until: isoIn(24), issued_at: isoIn(-4), issued_by: "Ayanda Ndlovu" }, seq: 2, history: [ev(isoIn(-6), "Thandeka Nkambule (customer)", "Requested calibration", undefined, "Requested"), ev(isoIn(-4), "Ayanda Ndlovu", "Send quote", "Requested", "Quoted")] }),
    job({ id: "CJ-26-0242", state: "Accepted", customer: "Lavumisa Citrus Packhouse", customer_email: "quality@lavumisa.example.sz", contact: "Sipho Magagula", client_id: "CL-011", discipline: "Mass", items: [{ id: "I1", description: "Bench scale 30 kg", make: "Adam", serial: "BS-7781", range: "0–30 kg", discipline: "Mass" }, { id: "I2", description: "Bench scale 30 kg", make: "Adam", serial: "BS-7782", range: "0–30 kg", discipline: "Mass" }], preferred_date: isoIn(1), created_at: isoIn(-8), seq: 3, history: [ev(isoIn(-3), "Sipho Magagula (customer)", "Accept quote", "Quoted", "Accepted")] }),
    job({ id: "CJ-26-0241", state: "Received", customer: "Malkerns Textile Mills", customer_email: "lab@malkernstex.example.sz", contact: "QA lab", client_id: "CL-019", discipline: "Temperature", items: [{ id: "I1", description: "Oven thermometer", make: "Fluke", model: "51-II", serial: "FK-5512", range: "−200 – 1370 °C", discipline: "Temperature" }], created_at: isoIn(-9), receipt: { at: isoIn(-1, 10), by: "Sakhile Mdluli", condition: "good", accessories: "K-type probe, carry case", photos: [], tag: "JT-0241" }, seq: 4, history: [ev(isoIn(-1, 10), "Sakhile Mdluli", "Log receipt", "Accepted", "Received")] }),
    job({ id: "CJ-26-0240", state: "Accepted", location: "onsite", site: "Mhlume Sugar Mill weighbridge", customer: "Royal Valley Sugar Estates", customer_email: "eng@royalvalley.example.sz", contact: "Nomsa Dlamini", client_id: "CL-013", discipline: "Mass", items: [{ id: "I1", description: "Weighbridge 60 t", make: "Avery", serial: "WB-0060-1", range: "0–60 t", resolution: "20 kg", discipline: "Mass" }], created_at: isoIn(-12), visit_id: "FV-26-0158", seq: 3, history: [ev(isoIn(-5), "Nomsa Dlamini (customer)", "Accept quote", "Quoted", "Accepted")] }),
    job({
      id: "CJ-26-0238",
      state: "In Progress",
      customer: "Ubombo Honey Co. (Pty) Ltd",
      customer_email: "demo",
      contact: "Sipho Nkambule",
      client_id: "CL-001",
      discipline: "Mass",
      items: [{ id: "I1", description: "Analytical balance 0–220 g", make: "Ohaus", model: "PX224", serial: "B4471", range: "0–220 g", resolution: "0.1 mg", discipline: "Mass", instrument_id: "INS-1001" }],
      created_at: isoIn(-14),
      metrologist: "Musa Khumalo",
      receipt: { at: isoIn(-4), by: "Musa Khumalo", condition: "good", accessories: "Draft shield, power adapter", photos: [], tag: "JT-0238" },
      worksheet: {
        method_id: "MP-01",
        refs: ["REF-MASS-01"],
        env: { temp_c: 20.4, rh_pct: 48 },
        points: [
          { id: "P1", item_id: "I1", nominal: 10, unit: "g", as_found: 10.0002, as_left: 10.0002, tolerance: 0.0005, uncertainty: 0.00012 },
          { id: "P2", item_id: "I1", nominal: 100, unit: "g", as_found: 100.0011, as_left: 100.0003, tolerance: 0.0008, uncertainty: 0.00018 },
        ],
        attachments: [],
        saved_at: isoIn(-1),
        saved_by: "Musa Khumalo",
      },
      seq: 5,
      history: [ev(isoIn(-4), "Musa Khumalo", "Log receipt", "Accepted", "Received"), ev(isoIn(-3), "Ayanda Ndlovu", "Assign metrologist", "Received", "In Progress", "Musa Khumalo")],
    }),
    job({
      id: "CJ-26-0236",
      state: "Pending Review",
      customer: "Nhlangano Grain Millers",
      customer_email: "quality@nhlangano.example.sz",
      contact: "Mill QA",
      client_id: "CL-009",
      discipline: "Mass",
      items: [{ id: "I1", description: "Platform scale 300 kg", make: "Avery", serial: "PS-1120", range: "0–300 kg", resolution: "50 g", discipline: "Mass" }],
      created_at: isoIn(-15),
      metrologist: "Musa Khumalo",
      receipt: { at: isoIn(-7), by: "Musa Khumalo", condition: "good", accessories: "None", photos: [], tag: "JT-0236" },
      worksheet: { method_id: "MP-01", refs: ["REF-MASS-01", "WRK-MASS-04"], env: { temp_c: 21.1, rh_pct: 52 }, points: [
        { id: "P1", item_id: "I1", nominal: 50, unit: "kg", as_found: 50.05, as_left: 50.0, tolerance: 0.1, uncertainty: 0.02 },
        { id: "P2", item_id: "I1", nominal: 150, unit: "kg", as_found: 150.1, as_left: 150.05, tolerance: 0.15, uncertainty: 0.03 },
        { id: "P3", item_id: "I1", nominal: 300, unit: "kg", as_found: 300.15, as_left: 300.05, tolerance: 0.2, uncertainty: 0.05 },
      ], attachments: ["raw-PS-1120.csv"], saved_at: isoIn(-2), saved_by: "Musa Khumalo" },
      duties: { Metrologist: ["Musa Khumalo"] },
      seq: 6,
      history: [ev(isoIn(-2), "Musa Khumalo", "Submit for review", "In Progress", "Pending Review")],
    }),
    job({
      id: "CJ-26-0233",
      state: "Reviewed",
      customer: "Royal Valley Sugar Estates",
      customer_email: "eng@royalvalley.example.sz",
      contact: "Lab",
      client_id: "CL-013",
      discipline: "Mass",
      items: [{ id: "I1", description: "Balance 0–220 g", make: "Sartorius", serial: "SB-0220", range: "0–220 g", discipline: "Mass" }],
      metrologist: "Musa Khumalo",
      worksheet: { method_id: "MP-01", refs: ["REF-MASS-01"], env: { temp_c: 20.2, rh_pct: 45 }, points: [{ id: "P1", item_id: "I1", nominal: 200, unit: "g", as_found: 200.0004, as_left: 200.0004, tolerance: 0.001, uncertainty: 0.0002 }], attachments: [] },
      duties: { Metrologist: ["Musa Khumalo"], Reviewer: ["Ayanda Ndlovu"] },
      seq: 7,
      history: [ev(isoIn(-1), "Ayanda Ndlovu", "Approve results", "Pending Review", "Reviewed")],
    }),
    job({
      id: "CJ-26-0231",
      state: "Certified",
      customer: "Ubombo Honey Co. (Pty) Ltd",
      customer_email: "demo",
      contact: "Sipho Nkambule",
      client_id: "CL-001",
      discipline: "Temperature",
      items: [{ id: "I1", description: "Digital probe thermometers ×3", make: "Testo", model: "104", serial: "T-77/78/79", range: "−50 – 250 °C", discipline: "Temperature", instrument_id: "INS-1002" }],
      metrologist: "Sakhile Mdluli",
      worksheet: { method_id: "TP-01", refs: ["REF-TEMP-01", "WRK-BATH-01"], env: { temp_c: 21, rh_pct: 50 }, points: [
        { id: "P1", item_id: "I1", nominal: 0, unit: "°C", as_found: 0.2, as_left: 0.2, tolerance: 0.5, uncertainty: 0.06 },
        { id: "P2", item_id: "I1", nominal: 75, unit: "°C", as_found: 75.3, as_left: 75.3, tolerance: 0.5, uncertainty: 0.07 },
      ], attachments: [] },
      certificate: { id: "CAL-26-0231", issued_at: isoIn(-6), by: "Ayanda Ndlovu", token: "c26-0231-7f2a", version: 1 },
      duties: { Metrologist: ["Sakhile Mdluli"], Reviewer: ["Ayanda Ndlovu"] },
      seq: 8,
      history: [ev(isoIn(-6), "Ayanda Ndlovu", "Issue certificate", "Reviewed", "Certified")],
    }),
    job({
      id: "CJ-26-0225",
      state: "Dispatched",
      customer: "Valley Dairy Cooperative",
      customer_email: "demo",
      contact: "Thandeka Nkambule",
      client_id: "CL-002",
      discipline: "Temperature",
      items: [{ id: "I1", description: "Pasteuriser chart recorder probe", serial: "CR-0071", range: "0–100 °C", discipline: "Temperature" }],
      metrologist: "Sakhile Mdluli",
      worksheet: { method_id: "TP-01", refs: ["REF-TEMP-01"], env: {}, points: [{ id: "P1", item_id: "I1", nominal: 72, unit: "°C", as_found: 72.1, as_left: 72.1, tolerance: 0.5, uncertainty: 0.06 }], attachments: [] },
      certificate: { id: "CAL-26-0225", issued_at: isoIn(-25), by: "Ayanda Ndlovu", token: "c26-0225-11bd", version: 1 },
      dispatch: { at: isoIn(-23), method: "collection", name: "T. Nkambule", signature: "T. Nkambule" },
      seq: 9,
      history: [ev(isoIn(-23), "Musa Khumalo", "Record collection / dispatch", "Certified", "Dispatched")],
    }),
  ];
}

export function seedTests(): TestRequest[] {
  return [
    {
      id: "LT-26-0088",
      state: "In Test",
      sample_id: "SMP-26-0412",
      seal: "ES-SEAL-104412",
      product: "Concrete roof tile (Mankayane)",
      parent: { doctype: "Certification Application", name: "CERT-APP-26-0047", label: "CERT-APP-26-0047" },
      tests: "Transverse strength; water absorption",
      clauses: "SZNS 210 §6.2, §6.4",
      analyst: "Precious Tfwala",
      requested_at: isoIn(-9),
      due: isoIn(2),
      results: [{ param: "Transverse strength", spec: "≥ 2.0 kN", value: "2.3", unit: "kN", pass: true }],
      seq: 2,
      history: [ev(isoIn(-9), "Precious Tfwala", "Requested from sample receipt", undefined, "Requested"), ev(isoIn(-8), "Ayanda Ndlovu", "Assign analyst", "Requested", "In Test", "Precious Tfwala")],
    },
    {
      id: "LT-26-0081",
      state: "Approved",
      sample_id: "SMP-26-0398",
      seal: "ES-SEAL-103980",
      product: "Portland cement 42.5N",
      parent: { doctype: "Certification Application", name: "CERT-APP-26-0049", label: "CERT-APP-26-0049" },
      tests: "Compressive strength 28 d; initial setting time",
      clauses: "SZNS 044 §5.1, §5.3",
      analyst: "Precious Tfwala",
      requested_at: isoIn(-23),
      due: isoIn(-13),
      results: [
        { param: "Compressive strength 28 d", spec: "≥ 42.5 MPa", value: "47.1", unit: "MPa", pass: true },
        { param: "Initial setting time", spec: "≥ 60 min", value: "145", unit: "min", pass: true },
      ],
      conclusion: "pass",
      duties: { Analyst: ["Precious Tfwala"], Approver: ["Ayanda Ndlovu"] },
      seq: 4,
      history: [ev(isoIn(-15), "Ayanda Ndlovu", "Approve results", "Pending Approval", "Approved")],
    },
  ];
}

export const DEFAULT_MET_SETTINGS: MetrologySettings = {
  lab_turnaround_days: 10,
  quote_days: 2,
  reminder_days: 30,
  oot_notify: "immediate",
  certificate_statement: "The reported expanded uncertainty is stated as the standard uncertainty multiplied by k = 2, giving a coverage probability of approximately 95 %. Results relate only to the items calibrated.",
  default_interval_months: 12,
};

/**
 * Metrology & LIMS types (workflow map §3.4, §3.12 Sample; gap 07). Calibration jobs gain the
 * Requested and Quoted states missing from calibration_job.yaml (flag to the registry owner).
 */
import type { VisitParentRef } from "../field/types";
import type { WfRecord } from "../workflow/types";

export type Discipline = "Mass" | "Temperature" | "Pressure" | "Volume" | "Length" | "Electrical";

export type JobState =
  | "Requested"
  | "Quoted"
  | "Accepted"
  | "Received"
  | "In Progress"
  | "Pending Review"
  | "Reviewed"
  | "Certified"
  | "Dispatched"
  | "Cancelled";

export type CalItem = {
  id: string;
  description: string;
  make?: string;
  model?: string;
  serial: string;
  range: string;
  resolution?: string;
  discipline: Discipline;
  /** Customer instrument register id, when known. */
  instrument_id?: string;
};

export type CalPointRow = {
  id: string;
  item_id: string;
  nominal: number;
  unit: string;
  as_found: number;
  as_left: number;
  tolerance: number;
  /** Expanded uncertainty (k=2). */
  uncertainty: number;
};

export type Worksheet = {
  method_id?: string;
  refs: string[];
  env: { temp_c?: number; rh_pct?: number };
  points: CalPointRow[];
  attachments: string[];
  saved_at?: string;
  saved_by?: string;
};

export type CalQuote = { lines: { label: string; qty: number; unit_price: number }[]; valid_until: string; issued_at: string; issued_by: string; invoice_id?: string };

export type CalJob = WfRecord & {
  id: string;
  state: JobState;
  customer: string;
  customer_email: string;
  contact: string;
  phone?: string;
  client_id?: string;
  location: "lab" | "onsite";
  site?: string;
  items: CalItem[];
  discipline: Discipline;
  accreditation: boolean;
  preferred_date: string;
  delivery: "collect" | "courier";
  notes?: string;
  created_at: string;
  due?: string;
  metrologist?: string;
  quote?: CalQuote;
  receipt?: { at: string; by: string; condition: "good" | "damaged" | "mismatch"; accessories: string; photos: string[]; tag: string; mismatch?: string };
  worksheet: Worksheet;
  oot_notified_at?: string;
  certificate?: { id: string; issued_at: string; by: string; token: string; version: number; reason?: string };
  dispatch?: { at: string; method: "collection" | "courier"; name: string; reference?: string; signature?: string };
  visit_id?: string;
  /** Booked lab-counter drop-off slot (07 P3). */
  dropoff?: { date: string; time: string };
};

export type CustomerInstrument = {
  id: string;
  owner_email: string;
  client: string;
  description: string;
  make?: string;
  model?: string;
  serial: string;
  range: string;
  discipline: Discipline;
  interval_months: number;
  last_cal?: string;
  next_due?: string;
  last_job?: string;
  last_cert?: string;
  last_result?: "in_tolerance" | "out_of_tolerance";
  /** As-found error per calibration as a fraction of tolerance (1 = at the limit), oldest first (07 P3). */
  drift?: { at: string; ratio: number; cert?: string }[];
};

export type IntermediateCheck = { at: string; by: string; ok: boolean; note?: string };

export type LabEquipment = {
  id: string;
  name: string;
  kind: "reference" | "working";
  discipline: Discipline;
  serial: string;
  range: string;
  traceability: string;
  last_cal: string;
  cal_due: string;
  status: "in_service" | "out_of_service";
  out_reason?: string;
  checks: IntermediateCheck[];
  /** Checked out with a metrologist for an on-site visit. */
  checked_out_to?: string;
};

export type Method = {
  id: string;
  code: string;
  title: string;
  discipline: Discipline;
  range: string;
  cmc: string;
  accredited: boolean;
};

export type TestState = "Requested" | "In Test" | "Pending Approval" | "Approved" | "Cancelled";

export type TestResult = { param: string; spec: string; value: string; unit?: string; pass: boolean };

export type TestRequest = WfRecord & {
  id: string;
  state: TestState;
  sample_id: string;
  seal: string;
  product: string;
  parent?: VisitParentRef;
  tests: string;
  clauses: string;
  analyst?: string;
  requested_at: string;
  due: string;
  results: TestResult[];
  conclusion?: "pass" | "fail";
  remarks?: string;
};

export type MetrologySettings = {
  lab_turnaround_days: number;
  quote_days: number;
  reminder_days: number;
  oot_notify: "immediate" | "with_certificate";
  certificate_statement: string;
  default_interval_months: number;
  /** Lab counter drop-off booking (07 P3): slot start times on working days and bookings per slot. */
  counter?: { times: string[]; per_slot: number };
};

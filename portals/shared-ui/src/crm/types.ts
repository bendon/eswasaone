/**
 * CRM & Commercial + Service desk types — shared by Service (public) and Institution (staff).
 * TODO: wire real — move to contracts/openapi.yaml once Core exposes /crm/* and /cases/*.
 */

/* ---------------- service desk ---------------- */

export type CaseType =
  | "enquiry"
  | "service_complaint"
  | "product_report"
  | "mark_misuse"
  | "billing_dispute"
  | "appeal"
  | "feedback";

/** Canonical staff states — workflow map §3.7 + complaint.yaml. */
export type CaseState =
  | "Open"
  | "Triaged"
  | "In Progress"
  | "Awaiting Customer"
  | "Escalated"
  | "Resolved"
  | "Reopened"
  | "Closed";

export type CaseChannel = "web" | "account" | "email" | "phone" | "walk_in" | "whatsapp" | "verify_scan";
export type CasePriority = "low" | "normal" | "high" | "urgent";
export type ContactPreference = "email" | "sms" | "whatsapp" | "phone";

export type CaseMessage = {
  id: string;
  at: string;
  author: string;
  role: "customer" | "staff" | "system";
  /** Internal notes never reach the customer view. */
  visibility: "public" | "internal";
  body: string;
  attachments?: string[];
};

export type CaseLinkKind =
  | "client"
  | "certificate"
  | "application"
  | "order"
  | "invoice"
  | "investigation"
  | "capa"
  | "case";

export type CaseLink = { kind: CaseLinkKind; ref: string; label: string };

export type CaseEvent = {
  at: string;
  actor: string;
  action: string;
  from?: CaseState;
  to?: CaseState;
  note?: string;
};

/** What the case is about (company, certificate, product, invoice…). */
export type CaseSubject = {
  kind: "client" | "certificate" | "product" | "application" | "invoice" | "service" | "other";
  label: string;
  ref?: string;
  client_id?: string;
};

export type CaseReporter = {
  anonymous: boolean;
  name?: string;
  email?: string;
  phone?: string;
  organisation?: string;
  preferred: ContactPreference;
};

export type Case = {
  ref: string;
  type: CaseType;
  subject: string;
  description: string;
  state: CaseState;
  priority: CasePriority;
  channel: CaseChannel;
  team: string;
  assignee?: string;
  created_at: string;
  updated_at: string;
  acknowledged_at?: string;
  resolved_at?: string;
  closed_at?: string;
  about?: CaseSubject;
  /** The client this case belongs to (complainant's organisation or the subject company). */
  client_id?: string;
  reporter: CaseReporter;
  /** Lets an anonymous reporter track the case without contact details. */
  access_code: string;
  incident_date?: string;
  location?: string;
  sector?: string;
  region?: string;
  thread: CaseMessage[];
  events: CaseEvent[];
  links: CaseLink[];
  tags: string[];
  resolution?: string;
  root_cause?: string;
  duplicate_of?: string;
  reopen_count: number;
  /** Working days the SLA clock was paused (Awaiting Customer). */
  paused_wd: number;
  paused_since?: string;
  csat?: { score: number; comment?: string; at: string };
  /** Appeals only: the person who made the contested decision — never assignable. */
  decision_maker?: string;
  panel?: string[];
  /** Field visit requested from this case (product report / mark misuse → market sampling, R6). */
  field_visit?: { id: string; type: string; state: string; result?: string };
  /** Appeals: the panel's decision and what it triggered downstream (R11). */
  appeal_outcome?: { outcome: "uphold" | "overturn" | "partial"; at: string; by: string; note: string; downstream?: string };
};

export type CaseTypeConfig = {
  label: string;
  short: string;
  description: string;
  ack_days: number;
  resolve_days: number;
  team: string;
  /** Provisional value awaiting ESWASA sign-off (confirmation pack F8–F11). */
  to_confirm: boolean;
  /** Restricted from commercial roles (impartiality). */
  restricted: boolean;
};

export type RoutingRule = {
  id: string;
  label: string;
  when: { type?: CaseType; keyword?: string; sector?: string };
  team: string;
  priority?: CasePriority;
  enabled: boolean;
};

export type ReplyTemplate = { id: string; name: string; types: CaseType[]; body: string };

/* ---------------- clients ---------------- */

export type ServiceLine = "certification" | "testing" | "calibration" | "training" | "standards" | "inspection";
export type ClientTier = "key" | "growth" | "standard" | "prospect";
export type Region = "Hhohho" | "Manzini" | "Lubombo" | "Shiselweni";

export type Contact = {
  id: string;
  name: string;
  role: string;
  email?: string;
  phone?: string;
  primary?: boolean;
  /** Deactivated contacts stay on record (history) but aren't offered for new work. */
  active?: boolean;
  /** Service portal user linked to this contact (R5). */
  portal?: { invited_at: string; status: "invited" | "active" };
};

export type ClientCert = {
  id: string;
  scheme: string;
  standard: string;
  status: "valid" | "suspended" | "expired" | "withdrawn";
  issued: string;
  expires: string;
  next_surveillance?: string;
};

export type ClientApplication = { id: string; scheme: string; stage: string; opened: string };
export type ClientInstrument = {
  id: string;
  name: string;
  last_cal: string;
  next_due: string;
  status: "in_tolerance" | "out_of_tolerance" | "due";
};
export type ClientTraining = { course: string; people: number; date: string; status: "completed" | "booked" };
export type ClientOrder = { id: string; item: string; amount: number; date: string };
export type ClientInvoice = { id: string; label: string; amount: number; due: string; status: "paid" | "unpaid" | "overdue" };
export type ClientActivity = {
  id: string;
  at: string;
  kind: "call" | "email" | "meeting" | "note" | "visit";
  by: string;
  text: string;
};

export type Client = {
  id: string;
  name: string;
  sector: string;
  region: Region;
  tier: ClientTier;
  status: "active" | "prospect" | "dormant";
  reg_no?: string;
  since: string;
  employees?: number;
  exporter: boolean;
  account_manager?: string;
  tags: string[];
  contacts: Contact[];
  certificates: ClientCert[];
  applications: ClientApplication[];
  instruments: ClientInstrument[];
  training: ClientTraining[];
  orders: ClientOrder[];
  invoices: ClientInvoice[];
  activity: ClientActivity[];
  address?: string;
  website?: string;
  merged_into?: string;
};

export type ClientHealth = {
  score: number;
  band: "good" | "watch" | "risk";
  factors: { label: string; delta: number }[];
};

/* ---------------- commercial ---------------- */

export type SignalKind =
  | "cert_expiring"
  | "surveillance_due"
  | "calibration_due"
  | "compulsory_standard"
  | "tbt_notification"
  | "abandoned_applicability"
  | "standard_purchase"
  | "nc_training"
  | "inbound_enquiry"
  | "repeat_complaints"
  | "lapsed_client";

export type Signal = {
  id: string;
  kind: SignalKind;
  title: string;
  detail: string;
  client_id?: string;
  prospect?: { name: string; contact?: string; email?: string; phone?: string; sector?: string };
  services: ServiceLine[];
  value_estimate: number;
  created_at: string;
  due_at?: string;
  status: "new" | "snoozed" | "dismissed" | "converted";
  opportunity_id?: string;
  source_ref?: string;
  sector?: string;
  /** Compliance-only signals (e.g. repeat complaints) never become sales opportunities. */
  compliance?: boolean;
};

export type OpportunityStage = "qualify" | "proposal" | "negotiation" | "won" | "lost";

export type Opportunity = {
  id: string;
  title: string;
  client_id?: string;
  prospect_name?: string;
  stage: OpportunityStage;
  services: ServiceLine[];
  value: number;
  probability: number;
  owner: string;
  created_at: string;
  expected_close: string;
  source: SignalKind | "manual";
  signal_id?: string;
  quote_id?: string;
  next_step?: string;
  lost_reason?: string;
  notes: { at: string; by: string; text: string }[];
};

export type PriceItem = {
  code: string;
  service: ServiceLine;
  label: string;
  unit: string;
  amount: number;
};

export type QuoteLine = { code: string; label: string; qty: number; unit_price: number };

export type CrmQuoteStatus = "draft" | "pending_approval" | "sent" | "accepted" | "declined" | "expired";

export type CrmQuote = {
  id: string;
  opportunity_id?: string;
  client_id?: string;
  client_name: string;
  status: CrmQuoteStatus;
  lines: QuoteLine[];
  discount_pct: number;
  valid_until: string;
  created_at: string;
  created_by: string;
  sent_at?: string;
  accepted_at?: string;
  approval?: { by: string; at: string; note?: string };
  converted: { kind: "application" | "invoice" | "enrolment" | "calibration_job"; ref: string }[];
  notes?: string;
  /** Who the quote goes to; "demo" shows in every demo customer account. */
  customer_email?: string;
  /** Code for the public link /quotes/:id?code= (no account needed). */
  public_code?: string;
  customer_acceptance?: { name: string; title: string; at: string; reason?: string };
  invoice_id?: string;
};

/* ---------------- knowledge base, contracts, outbound messages (04 P2, R7, R10) ---------------- */

export type KbArticle = {
  id: string;
  title: string;
  body: string;
  tags: string[];
  types: CaseType[];
  status: "draft" | "published";
  updated_at: string;
  by: string;
  from_case?: string;
  views: number;
  helpful: number;
};

export type ServiceContract = {
  id: string;
  client_id: string;
  client_name: string;
  kind: "certification_agreement" | "calibration_contract" | "training_agreement" | "standards_subscription";
  title: string;
  quote_id?: string;
  start: string;
  end: string;
  value: number;
  renewal_reminder_days: number;
  status: "active" | "ended" | "terminated";
};

export type MessageDelivery = {
  id: string;
  case_ref?: string;
  quote_id?: string;
  to: string;
  channel: "email" | "sms" | "whatsapp" | "portal";
  subject: string;
  body: string;
  status: "queued" | "sent" | "failed";
  at: string;
  attempts: number;
  error?: string;
};

export type SignalRules = {
  expiry_horizon_days: number;
  calibration_horizon_days: number;
  tbt_levels: ("high" | "medium" | "low")[];
  abandoned_age_days: number;
  generators: { certificates: boolean; instruments: boolean; estore: boolean; applicability: boolean; nonconformities: boolean };
};

export type CampaignDraft = {
  id: string;
  name: string;
  client_ids: string[];
  signal_kind?: SignalKind;
  message: string;
  created_at: string;
  by: string;
  status: "draft" | "sent";
};

export type RenewalItem = {
  id: string;
  kind: "certificate" | "surveillance" | "calibration";
  client_id: string;
  client_name: string;
  label: string;
  due: string;
  days: number;
  value_estimate: number;
  outreach: "none" | "contacted" | "booked";
  signal_id?: string;
};

export type ClientTierRule = { id: ClientTier; label: string; rule: string };

export type CrmConfig = {
  case_types: Record<CaseType, CaseTypeConfig>;
  reopen_days: number;
  teams: string[];
  routing: RoutingRule[];
  templates: ReplyTemplate[];
  price_list: PriceItem[];
  /** Discounts above this need a Sales Manager approval. */
  discount_approval_pct: number;
  tiers: ClientTierRule[];
  survey: string[];
};

/** Who is acting — derived from the session in each portal. */
export type CrmActor = {
  name: string;
  roles: string[];
};

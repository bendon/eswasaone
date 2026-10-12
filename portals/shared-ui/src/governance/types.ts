/**
 * Board & Governance domain (workflow map §3.10, §5.5; gap 03). Local demo shapes — the Core
 * contract types (GovernanceMeeting, GovernancePack…) map onto these when the backend lands.
 */
import type { WfRecord } from "../workflow/types";

export type Vote = "for" | "against" | "abstain" | "recused";

export type GovBody = {
  id: string;
  name: string;
  short: string;
  kind: "board" | "committee";
  members: string[];
  chair: string;
  secretary: string;
  /** Members present needed for quorum. */
  quorum: number;
  frequency: "Monthly" | "Quarterly" | "Bi-annual" | "Annual" | "As needed";
  term_years: number;
  tor?: string;
  notice_days: number;
  pack_days: number;
};

export type GovMember = {
  name: string;
  initials: string;
  title: string;
  email: string;
  bodies: string[];
  role: "Chair" | "Deputy Chair" | "Member" | "Ex officio";
  independent: boolean;
  term_start: string;
  term_end: string;
  phone?: string;
  prefs?: { email: boolean; sms: boolean };
};

export type AgendaKind = "decision" | "noting" | "discussion";

export type AgendaItem = {
  id: string;
  title: string;
  kind: AgendaKind;
  presenter: string;
  minutes: number;
  section_ids: string[];
  papers: string[];
  /** Standing item: approve the previous meeting's minutes. */
  approve_minutes_of?: string;
  decision?: {
    outcome: "approved" | "rejected" | "deferred" | "noted";
    text: string;
    votes: Record<string, Vote>;
    resolution_id?: string;
    at: string;
  };
};

export type Attendance = { rsvp: "yes" | "no" | "pending"; present?: boolean; apology?: boolean; arrived_at?: string };

export type Declaration = {
  id: string;
  member: string;
  kind: "annual" | "meeting" | "gift";
  /** Annual: the year; meeting: the meeting id. */
  period?: string;
  meeting_id?: string;
  item_id?: string;
  interest: string;
  value?: string;
  at: string;
  recorded_by: string;
};

export type Minutes = {
  general: string;
  items: Record<string, string>;
  submitted_at?: string;
  approved_at?: string;
  /** Meeting at which these minutes were approved (map: the *next* meeting of the same body). */
  approved_at_meeting?: string;
};

export type Meeting = WfRecord & {
  id: string;
  body_id: string;
  title: string;
  scheduled_at: string;
  venue: string;
  online_link?: string;
  agenda: AgendaItem[];
  agenda_final: boolean;
  notice_issued_at?: string;
  attendance: Record<string, Attendance>;
  declarations: Declaration[];
  run?: { started_at?: string; ended_at?: string; current_item?: string };
  minutes?: Minutes;
  pack_id: string;
};

export type SectionSource = "upload" | "written" | "live_module";

export type PackSection = {
  id: string;
  title: string;
  owner: string;
  source: SectionSource;
  /** live_module sections fill themselves from domain stores at assembly. */
  module?: "crm" | "certification" | "metrology" | "standards" | "finance" | "risk" | "actions";
  status: "awaiting" | "draft" | "ready";
  included: boolean;
  restricted: boolean;
  due: string;
  content?: string;
  file?: string;
  updated_at?: string;
  updated_by?: string;
};

export type PackSnapshot = {
  v: number;
  assembled_at: string;
  by: string;
  note?: string;
  sections: { id: string; title: string; owner: string; content: string; figures?: Record<string, string>; restricted: boolean }[];
};

export type Pack = WfRecord & {
  id: string;
  meeting_id: string;
  sections: PackSection[];
  versions: PackSnapshot[];
  issued_version?: number;
};

export type Resolution = WfRecord & {
  id: string;
  title: string;
  text: string;
  body_id: string;
  kind: "meeting" | "written";
  meeting_id?: string;
  item_id?: string;
  proposed_by: string;
  proposed_at: string;
  votes: Record<string, Vote>;
  /** Written resolutions only. */
  window?: { opens: string; closes: string; threshold: "simple" | "two_thirds" | "unanimous"; eligible: string[]; min_votes: number };
  papers: string[];
  decided_at?: string;
  implemented_at?: string;
};

export type ResAction = WfRecord & {
  id: string;
  resolution_id: string;
  description: string;
  owner: string;
  due: string;
  progress: number;
  updates: { at: string; by: string; text: string; progress: number }[];
  evidence: string[];
  carry_to_pack: boolean;
  completed_at?: string;
};

export type RiskCategory = "Strategic" | "Financial" | "Operational" | "Compliance" | "Reputational" | "ICT";

export type Risk = WfRecord & {
  id: string;
  title: string;
  description: string;
  category: RiskCategory;
  owner: string;
  inherent: { l: number; i: number };
  residual: { l: number; i: number };
  controls: string[];
  mitigations: { id: string; action: string; owner: string; due: string; done_at?: string }[];
  reviews: { at: string; by: string; note: string; residual: { l: number; i: number } }[];
  review_every_days: number;
  next_review: string;
  links: { kind: "case" | "tbt" | "sample" | "audit" | "incident"; ref: string; label: string }[];
  in_pack: boolean;
  trend: "worsening" | "stable" | "improving";
};

export type GovSettings = {
  appetite: Record<RiskCategory, number>;
  default_notice_days: number;
  default_pack_days: number;
  declaration_due: string;
  statutory: { id: string; title: string; due: string; owner: string }[];
  section_templates: { title: string; owner: string; source: SectionSource; module?: PackSection["module"] }[];
};

export type OnboardingSignoff = { member: string; doc_id: string; at: string };

export type Evaluation = { id: string; member: string; year: string; scores: Record<string, number>; comment?: string; at: string };

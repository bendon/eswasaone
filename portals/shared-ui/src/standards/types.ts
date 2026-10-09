/**
 * Standards development types — workflow map §3.2 (Work Item → Public Review → Ballot → Published;
 * R-S1..R-S4), registry work_item.yaml (Working Draft → Committee Draft → Public Review → Ballot → Published).
 */
import type { WfRecord } from "../workflow/types";

export type MemberCategory = "industry" | "government" | "academia" | "consumer" | "other";

export type TcMember = { name: string; org: string; email: string; category: MemberCategory; voting: boolean; role?: "chair" | "member" | "observer"; term_end: string };

export type TcApplication = { id: string; tc_id: string; name: string; org: string; email: string; category: MemberCategory; motivation: string; at: string; state: "pending" | "approved" | "declined"; decided_by?: string; reason?: string };

export type TcMeeting = { id: string; date: string; title: string; attendance: string[]; minutes?: string };

export type TechnicalCommittee = {
  id: string;
  number: string;
  name: string;
  scope: string;
  chair: string;
  secretary: string;
  sectors: string[];
  members: TcMember[];
  applications: TcApplication[];
  meetings: TcMeeting[];
};

export type ProposalState = "Submitted" | "Circulated" | "Approved" | "Rejected";

export type Proposal = WfRecord & {
  id: string;
  state: ProposalState;
  title: string;
  scope: string;
  justification: string;
  intl_refs: string;
  stakeholders: string;
  urgency: "normal" | "high";
  proposer: { name: string; org: string; email: string };
  tc_id?: string;
  work_item_id?: string;
  at: string;
};

export type WiState = "Working Draft" | "Committee Draft" | "Public Review" | "Comment Resolution" | "Ballot" | "Approved" | "Published" | "Cancelled";

export type DraftVersion = { id: string; label: string; stage: WiState; file: string; uploaded_by: string; at: string; summary: string; pages?: number; locked?: boolean; text?: string };

export type PublicationChecklist = { final_text: boolean; cover: boolean; ics: string; price: number; gazette_ref: string; gazette_date: string; compulsory: boolean; regulation?: string };

export type WorkItem = WfRecord & {
  id: string;
  ref: string;
  title: string;
  scope: string;
  type: "new" | "revision" | "amendment" | "adoption";
  adoption?: { source: "ISO" | "IEC" | "SADC" | "ARSO" | "Codex"; ref: string; degree: "IDT" | "MOD" };
  state: WiState;
  tc_id: string;
  project_leader: string;
  sector: string;
  targets: Partial<Record<WiState, string>>;
  drafts: DraftVersion[];
  comment_period?: { opens: string; closes: string };
  ballot_id?: string;
  publication?: Partial<PublicationChecklist>;
  catalogue_id?: string;
  proposal_id?: string;
  revises?: string;
  /** WTO TBT notification of a draft technical regulation (06 P3). */
  tbt?: TbtOutgoing;
  created_at: string;
};

export type TbtOutgoing = { symbol: string; notified_at: string; by: string; objective: string; products: string; comment_until: string; imported: number };

export type CommentDisposition = "accepted" | "accepted_in_principle" | "rejected" | "noted";

export type DraftComment = {
  id: string;
  work_item_id: string;
  draft_label: string;
  by: { name: string; org?: string; email: string };
  clause: string;
  paragraph?: string;
  type: "general" | "technical" | "editorial";
  comment: string;
  proposed_change?: string;
  at: string;
  disposition?: CommentDisposition;
  response?: string;
  resolved_by?: string;
  resolved_at?: string;
  replied_at?: string;
};

export type Vote = "approve" | "approve_comments" | "disapprove" | "abstain";

export type Ballot = {
  id: string;
  work_item_id: string;
  draft_label: string;
  opens: string;
  closes: string;
  eligible: string[];
  votes: Record<string, { vote: Vote; comment?: string; at: string }>;
  state: "Open" | "Passed" | "Failed";
  closed_at?: string;
  rule: { approve_pct: number; max_disapprove_pct: number; quorum_pct: number };
};

export type CatalogueEntry = {
  id: string;
  ref: string;
  title: string;
  sector: string;
  ics: string;
  keywords: string[];
  price: number;
  pages: number;
  status: "current" | "withdrawn" | "superseded" | "draft";
  published_at: string;
  tc_id?: string;
  supersedes?: string;
  superseded_by?: string;
  adoption?: WorkItem["adoption"];
  compulsory?: { regulation: string; since: string };
  preview_pages: number;
  abstract: string;
  licensed?: boolean;
  review?: { decision: "confirm" | "revise" | "withdraw"; at: string; by: string; reason: string; work_item_id?: string };
};

export type Subscription = { id: string; email: string; kind: "sector" | "tc" | "standard"; value: string; label: string; events: ("drafts" | "publications" | "withdrawals")[]; at: string };

export type StandardsSettings = {
  comment_days: number;
  ballot_days: number;
  approve_pct: number;
  max_disapprove_pct: number;
  quorum_pct: number;
  review_years: number;
  sla_resolution_days: number;
  sla_publication_days: number;
};

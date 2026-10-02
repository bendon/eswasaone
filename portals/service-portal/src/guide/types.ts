/** Guide API types — mirrors OpenAPI GuideResponse (contracts). */

export type GuideRights = "open" | "public" | "licensed";
export type GuideActionType = "buy" | "apply" | "book" | "open";

export type GuideCitation = {
  label: string;
  url: string;
  rights: GuideRights;
};

export type GuideAction = {
  type: GuideActionType;
  label: string;
  target: string;
  auth_required: boolean;
  reason?: string;
};

export type GuideStep = {
  title: string;
  detail: string;
  citations: GuideCitation[];
  action?: GuideAction | null;
};

export type GuideMeta = {
  standards: number;
  est_fee: string;
  est_timeline: string;
  steps: number;
};

export type GuideResponse = {
  title: string;
  summary: string;
  meta: GuideMeta;
  steps: GuideStep[];
};

export type GuideRequest = {
  goal: string;
  locale?: string;
};

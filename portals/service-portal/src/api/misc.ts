import { apiFetch } from "@eswasaone/shared-ui";

export type ApplicabilityResult = {
  summary: string;
  steps?: { order: number; title: string; detail: string; href?: string | null }[];
  citations?: { source_id: string; title: string; rights?: string; url?: string }[];
};

export type TbtAlert = {
  id: string;
  title: string;
  market: string;
  published: string;
};

export type VerificationResult = {
  valid: boolean;
  token: string;
  subject?: string | null;
  issued_at?: string | null;
  expires_at?: string | null;
};

export async function checkApplicability(query: string): Promise<ApplicabilityResult> {
  try {
    return await apiFetch<ApplicabilityResult>("/ingest/applicability", {
      method: "POST",
      body: JSON.stringify({ query, jurisdiction: "Eswatini" }),
    });
  } catch {
    return {
      summary: `Preview applicability for “${query}”. Connect ingest for live TBT matches.`,
      steps: [
        { order: 1, title: "Confirm product scope", detail: "HS code and intended market." },
        { order: 2, title: "Review matching rules", detail: "Open sources paraphrased; buy licensed text." },
      ],
    };
  }
}

export async function listTbtAlerts(): Promise<TbtAlert[]> {
  try {
    const res = await apiFetch<{ items: TbtAlert[] }>("/tbt/alerts");
    if (res.items?.length) return res.items;
  } catch {
    /* TODO: wire real */
  }
  return [
    {
      id: "tbt-1",
      title: "EU honey residue monitoring update",
      market: "EU",
      published: "2026-08-12",
    },
    {
      id: "tbt-2",
      title: "SACU packaged water labelling notification",
      market: "SACU",
      published: "2026-07-03",
    },
  ];
}

export async function verifyToken(token: string): Promise<VerificationResult> {
  try {
    return await apiFetch<VerificationResult>(`/verify/${encodeURIComponent(token)}`);
  } catch {
    const valid = /^ESW-|^CERT-/i.test(token);
    return {
      valid,
      token,
      subject: valid ? "Demo organisation — Product Mark" : null,
    };
  }
}

export async function lodgeComplaint(body: {
  subject: string;
  detail: string;
  contact?: string;
}): Promise<{ id: string }> {
  try {
    return await apiFetch<{ id: string }>("/complaints", {
      method: "POST",
      body: JSON.stringify(body),
    });
  } catch {
    return { id: `CMP-${Date.now().toString(36).toUpperCase()}` };
  }
}

export type ActivityItem = {
  id: string;
  title: string;
  subtitle: string;
  status: string;
};

export async function accountActivity(): Promise<ActivityItem[]> {
  try {
    const res = await apiFetch<{ items: ActivityItem[] }>("/account/activity");
    return res.items ?? [];
  } catch {
    return [];
  }
}

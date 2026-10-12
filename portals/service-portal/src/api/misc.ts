import { apiFetch } from "@eswasaone/shared-ui";
import { demoMode } from "../certification/demoStore";
import { lodgeCase, type CaseSubject, type CaseType } from "@eswasaone/shared-ui/crm";

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
  } catch (err) {
    // Never report a certificate as valid unless the register answered.
    if (!demoMode()) throw err;
    const valid = /^ESW-|^CERT-/i.test(token);
    return {
      valid,
      token,
      subject: valid ? "DEMO DATA: not a real certificate" : null,
    };
  }
}

/** Quick complaint from other pages (e.g. certification tracker). The full journey lives at /complaints. */
export async function lodgeComplaint(body: {
  subject: string;
  detail: string;
  contact?: string;
  type?: CaseType;
  about?: CaseSubject;
}): Promise<{ id: string }> {
  // Demo: goes to the shared CRM case store so staff see it in /institution/crm/cases.
  if (demoMode()) {
    const contact = body.contact?.trim();
    const c = await lodgeCase({
      type: body.type ?? "service_complaint",
      subject: body.subject,
      description: body.detail,
      channel: "account",
      about: body.about,
      reporter: contact
        ? { anonymous: false, email: contact.includes("@") ? contact : undefined, phone: contact.includes("@") ? undefined : contact, preferred: contact.includes("@") ? "email" : "sms" }
        : { anonymous: true, preferred: "email" },
    });
    return { id: c.ref };
  }
  // TODO: wire real — POST /cases. No complaints endpoint in Core yet: don't invent a reference number.
  return apiFetch<{ id: string }>("/complaints", {
    method: "POST",
    body: JSON.stringify(body),
  });
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

// ---------------------------------------------------------------------------
// Notification feed — pulls from Core /account/notifications/feed
// ---------------------------------------------------------------------------

export type NotificationFeedEntry = {
  id: string;
  subject: string;
  body: string | null;
  document_type: string | null;
  document_name: string | null;
  read: boolean;
  created_at: string | null;
  link: string | null;
};

export async function fetchNotificationFeed(limit = 50): Promise<{ items: NotificationFeedEntry[]; unread_count: number }> {
  try {
    return await apiFetch<{ items: NotificationFeedEntry[]; unread_count: number }>(
      `/account/notifications/feed?limit=${limit}`,
    );
  } catch {
    return { items: [], unread_count: 0 };
  }
}

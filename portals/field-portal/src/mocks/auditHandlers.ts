import { http, HttpResponse } from "msw";
import type { FieldAuditRow } from "../screens/audits/types";

const API = "/api";

function todayOffset(days: number): string {
  const d = new Date();
  d.setHours(12, 0, 0, 0);
  d.setDate(d.getDate() + days);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * Stub audits for field MSW. Extra company/location/time_label are display
 * enrichments until the contract carries them on AuditSummary.
 */
export const MOCK_FIELD_AUDITS: FieldAuditRow[] = [
  {
    id: "AUD-2026-0012",
    application_id: "CERT-2026-00012",
    auditor: "Demo Field Officer",
    scheme: "ISO 9001:2015",
    due_date: todayOffset(0),
    status: "scheduled",
    company: "Ezulwini Hospitality Group",
    location: "Mbabane",
    time_label: "10:00",
    stage: "Stage 2",
  },
  {
    id: "AUD-2026-0009",
    application_id: "CERT-2026-00009",
    auditor: "Demo Field Officer",
    scheme: "ISO 9001:2015",
    due_date: todayOffset(0),
    status: "scheduled",
    company: "Swazi Beverages",
    location: "Matsapha",
    time_label: "14:00",
    stage: "Surveillance",
  },
  {
    id: "AUD-2026-0013",
    application_id: "CERT-2026-00013",
    auditor: "Demo Field Officer",
    scheme: "ISO 22000",
    due_date: todayOffset(2),
    status: "in_progress",
    company: "Manzini Agro Processors",
    location: "Manzini",
    time_label: "In progress",
    stage: "Draft (offline)",
  },
  {
    id: "AUD-2026-0007",
    application_id: "CERT-2026-00007",
    auditor: "Demo Field Officer",
    scheme: "ISO 14001",
    due_date: todayOffset(5),
    status: "scheduled",
    company: "Hhohho Timber Products",
    location: "Piggs Peak",
    time_label: "09:00",
    stage: "Stage 1",
  },
  {
    id: "AUD-2026-0003",
    application_id: "CERT-2026-00003",
    auditor: "Demo Field Officer",
    scheme: "ISO 9001:2015",
    due_date: todayOffset(-12),
    status: "completed",
    company: "Simunye Sugar Refinery",
    location: "Simunye",
    time_label: "Submitted",
    stage: "Stage 2",
  },
  {
    id: "AUD-2026-0001",
    application_id: "CERT-2026-00001",
    auditor: "Other Auditor",
    scheme: "HACCP",
    due_date: todayOffset(1),
    status: "scheduled",
    company: "Other Co (filtered)",
    location: "Nhlangano",
    time_label: "11:00",
  },
  {
    id: "AUD-2026-0021",
    application_id: "CERT-2026-00021",
    auditor: "Demo Field Officer",
    scheme: "Product — ESWASA Mark (SZNS SANS 542)",
    due_date: todayOffset(1),
    status: "scheduled",
    company: "Swazi Tiles",
    location: "Matsapha",
    time_label: "08:30",
    stage: "Initial factory assessment",
  },
];

/** MSW handlers for GET/POST /certification/audits (+ overdue). Merge into handlers.ts. */
export const auditHandlers = [
  http.get(`${API}/certification/audits/overdue`, ({ request }) => {
    const url = new URL(request.url);
    const auditor = url.searchParams.get("auditor");
    let items = MOCK_FIELD_AUDITS.filter((a) => {
      const due = a.due_date;
      const today = todayOffset(0);
      const overdue =
        due < today &&
        !/complete|done|closed|submit/i.test(a.status);
      return overdue;
    });
    if (auditor) {
      const key = auditor.toLowerCase();
      items = items.filter(
        (a) => a.auditor && a.auditor.toLowerCase().includes(key),
      );
    }
    return HttpResponse.json({ items });
  }),

  http.get(`${API}/certification/audits`, ({ request }) => {
    const url = new URL(request.url);
    const limit = Number(url.searchParams.get("limit") || 20);
    return HttpResponse.json({
      items: MOCK_FIELD_AUDITS.slice(0, Math.max(1, limit)),
    });
  }),

  http.post(`${API}/certification/audits`, async ({ request }) => {
    const body = (await request.json()) as {
      application?: string;
      confirm?: boolean;
    };
    if (!body?.confirm) {
      return HttpResponse.json(
        { detail: "confirm required" },
        { status: 400 },
      );
    }
    const created: FieldAuditRow = {
      id: `AUD-${Date.now()}`,
      application_id: body.application || "CERT-NEW",
      auditor: "Demo Field Officer",
      scheme: "ISO 9001:2015",
      due_date: todayOffset(7),
      status: "scheduled",
      company: "New application",
    };
    return HttpResponse.json(created, { status: 201 });
  }),
];

import { http, HttpResponse } from "msw";
import type { ServiceHome, AgentAskResponse } from "@eswasaone/shared-ui";

const API = "http://127.0.0.1:8015/api";

const home: ServiceHome = {
  stats: [
    { key: "standards", label: "Standards Published", value: 312 },
    { key: "certified", label: "Companies Certified", value: 148 },
    { key: "learners", label: "Learners Enrolled", value: "2,840" },
    { key: "exporters", label: "Exporters Assisted", value: 430 },
  ],
  services: [
    {
      id: "standards",
      title: "Standards & E-Store",
      description:
        "Search the SZNS catalogue, buy standards and get applicability guidance for your sector.",
      href: "/standards",
    },
    {
      id: "certification",
      title: "Certification Services",
      description:
        "Apply for management system or product certification. Track your application in real time.",
      href: "/certification",
    },
    {
      id: "export",
      title: "Export Guidance",
      description:
        "Market access requirements by product and destination. Live WTO/TBT alert feed.",
      href: "/export",
    },
    {
      id: "complaints",
      title: "Complaints & Enquiries",
      description:
        "Report substandard products, lodge complaints or submit a quality enquiry anonymously.",
      href: "/complaints",
    },
    {
      id: "applicability",
      title: "Standards Applicability",
      description:
        "Not sure which standard applies? Use our free applicability checker for your product.",
      href: "/applicability",
    },
    {
      id: "training",
      title: "Training & Courses",
      description:
        "Enrol in standards-based training programmes. Earn verifiable digital certificates.",
      href: "/training",
    },
  ],
  recent_activity: [
    {
      id: "a1",
      type: "certification",
      title: "ISO 9001:2015 Certification — Swazi Fresh Produce Ltd",
      body: "CERT-2025-0041 · 2 Sep 2025",
      severity: "warn",
      created_at: "2025-09-02T10:00:00Z",
    },
    {
      id: "a2",
      type: "training",
      title: "ISO 45001 Lead Auditor Course",
      body: "TRAIN-2025-0118 · 28 Aug 2025",
      severity: "success",
      created_at: "2025-08-28T10:00:00Z",
    },
    {
      id: "a3",
      type: "purchase",
      title: "SZNS 987:2023 — Purchase",
      body: "STD-2025-0009 · 20 Aug 2025",
      severity: "info",
      created_at: "2025-08-20T10:00:00Z",
    },
  ],
  alerts: [
    {
      id: "al1",
      type: "tbt",
      title: "New TBT notification: EU packaging requirements for textile exports",
      severity: "warn",
      created_at: "2025-09-12T08:00:00Z",
    },
    {
      id: "al2",
      type: "standard",
      title: "SZNS 1043:2024 Food Safety — now available in the e-store",
      severity: "success",
      created_at: "2025-09-10T08:00:00Z",
    },
    {
      id: "al3",
      type: "consultation",
      title: "ISO 9001:2015 revision consultation open until 30 Sep 2025",
      severity: "info",
      created_at: "2025-09-05T08:00:00Z",
    },
  ],
};

export const handlers = [
  http.get(`${API}/home/service`, () => HttpResponse.json(home)),
  http.post(`${API}/agent/ask`, async ({ request }) => {
    const body = (await request.json()) as { message?: string };
    const msg = body.message ?? "";
    const res: AgentAskResponse = {
      answer: `Thanks for asking about “${msg}”. Here’s a guided next step — open the matching service tile below, or refine your question.`,
      tools_used: ["mock_router"],
      citations: [
        {
          source_id: "mock-open",
          title: "EswasaOne Service Guide",
          rights: "public",
        },
      ],
    };
    return HttpResponse.json(res);
  }),
];

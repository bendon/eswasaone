import { apiFetch } from "@eswasaone/shared-ui";
import type { OrderSummary } from "@eswasaone/shared-ui";

const FALLBACK_PERSONAL: OrderSummary[] = [
  {
    id: "#8851",
    title: "SZNS 060 — Honey specification",
    subtitle: "Licensed PDF · ICS 67.180",
    date: "2026-04-04",
    amount: "SZL 280",
    status: "done",
    status_label: "Completed",
    entity: "personal",
  },
  {
    id: "#8842",
    title: "SZNS ISO 9001 — Quality management systems",
    subtitle: "Licensed PDF · ICS 03.120",
    date: "2025-03-02",
    amount: "SZL 420",
    status: "done",
    status_label: "Completed",
    entity: "personal",
  },
];

const FALLBACK_BUSINESS: OrderSummary[] = [
  {
    id: "#8858",
    title: "SZNS 045 — Honey — Specification",
    subtitle: "Licensed PDF · ICS 67.180",
    date: "2026-09-12",
    amount: "SZL 280",
    status: "done",
    status_label: "Completed",
    entity: "business",
  },
  {
    id: "#8852",
    title: "Bulk order — 5 standards (food safety)",
    subtitle: "PDF bundle · SZNS 001, 042, 060, 187, ISO 22000",
    date: "2026-09-02",
    amount: "SZL 1,840",
    status: "done",
    status_label: "Completed",
    entity: "business",
  },
  {
    id: "#8846",
    title: "SZNS ISO 22000 — Food safety management systems",
    subtitle: "Licensed PDF · ICS 03.120",
    date: "2026-08-18",
    amount: "SZL 460",
    status: "done",
    status_label: "Completed",
    entity: "business",
  },
  {
    id: "#8839",
    title: "SZNS 187 — Bottled drinking water",
    subtitle: "Licensed PDF · ICS 13.060",
    date: "2026-07-02",
    amount: "SZL 240",
    status: "done",
    status_label: "Completed",
    entity: "business",
  },
  {
    id: "#8821",
    title: "Training · HACCP — 3 delegates",
    subtitle: "Group enrolment · 3 staff",
    date: "2026-06-14",
    amount: "SZL 7,200",
    status: "done",
    status_label: "Completed",
    entity: "business",
  },
  {
    id: "#8798",
    title: "SZNS ISO 45001 — Occupational health & safety",
    subtitle: "Licensed PDF · ICS 13.100",
    date: "2026-04-22",
    amount: "SZL 500",
    status: "done",
    status_label: "Completed",
    entity: "business",
  },
  {
    id: "#8782",
    title: "Lab testing · Honey residue panel",
    subtitle: "Testing service · 1 sample",
    date: "2026-03-18",
    amount: "SZL 1,200",
    status: "done",
    status_label: "Completed",
    entity: "business",
  },
  {
    id: "#8761",
    title: "SZNS 060 — Honey specification",
    subtitle: "Licensed PDF · superseded by #8858",
    date: "2025-02-02",
    amount: "SZL 280",
    status: "done",
    status_label: "Completed",
    entity: "business",
  },
];

export async function listOrders(entity: string): Promise<OrderSummary[]> {
  try {
    const res = await apiFetch<{ items: OrderSummary[] }>(
      `/estore/orders?entity=${entity}`,
    );
    return res.items ?? [];
  } catch {
    return entity === "business" ? FALLBACK_BUSINESS : FALLBACK_PERSONAL;
  }
}
/**
 * Seed for the CRM additions (gap 04): knowledge base articles, service contracts, signal rules. Fictional.
 */
import { iso } from "./seed";
import type { KbArticle, ServiceContract, SignalRules } from "./types";

export const SEED_KB: KbArticle[] = [
  { id: "KB-001", title: "How long does ISO 9001 certification take?", body: "Most organisations are certified 3–6 months after applying. The steps are: document review (about a week), quote and agreement, Stage 1 audit, Stage 2 audit, closing any findings (you have 30 days), an independent technical review and the certification decision. You can follow every step from your account.", tags: ["certification", "timeline"], types: ["enquiry"], status: "published", updated_at: iso(-40), by: "Zanele Maseko", views: 412, helpful: 87 },
  { id: "KB-002", title: "Where can I buy a standard (SZNS / ISO)?", body: "Search the catalogue at Standards, open the standard and choose Buy. You can pay by MoMo or card and download the PDF from your account. Draft standards open for public comment are free to read under 'Have your say'.", tags: ["standards", "e-store"], types: ["enquiry"], status: "published", updated_at: iso(-60), by: "Zanele Maseko", views: 655, helpful: 140 },
  { id: "KB-003", title: "How do I check whether a certificate is real?", body: "Scan the QR code on the certificate or enter the certificate number on the Verify page. You'll see the holder, scope and whether the certificate is valid, suspended or withdrawn today.", tags: ["verify", "mark"], types: ["mark_misuse", "enquiry"], status: "published", updated_at: iso(-20), by: "Phindile Shongwe", views: 231, helpful: 58 },
  { id: "KB-004", title: "My calibration certificate is late — what can I do?", body: "Track the job from your account → Calibration. The page shows where your items are (received, being calibrated, under review, ready). If the promised date has passed, use 'Report a problem' on the job and the lab manager will reply within one working day.", tags: ["calibration"], types: ["service_complaint"], status: "published", updated_at: iso(-10), by: "Zanele Maseko", views: 64, helpful: 11, from_case: "CS-26-0138" },
  { id: "KB-005", title: "Reporting a product that looks unsafe or fake", body: "Lodge a product report with a photo of the product and label, where you bought it and when. You can stay anonymous. Our inspectors may buy samples from the market for testing; you can track progress with your reference and code.", tags: ["product", "surveillance"], types: ["product_report", "mark_misuse"], status: "draft", updated_at: iso(-2), by: "Phindile Shongwe", views: 0, helpful: 0 },
];

export const SEED_CONTRACTS: ServiceContract[] = [
  { id: "CON-26-011", client_id: "CL-011", client_name: "Lavumisa Citrus Packhouse", kind: "certification_agreement", title: "EU export inspection package 2026", quote_id: "QT-26-011", start: iso(-8), end: iso(357), value: 39000, renewal_reminder_days: 60, status: "active" },
  { id: "CON-25-044", client_id: "CL-013", client_name: "Royal Valley Sugar Estates", kind: "calibration_contract", title: "Harvest-season calibration (3 on-site visits)", start: iso(-330), end: iso(35), value: 64000, renewal_reminder_days: 60, status: "active" },
  { id: "CON-25-020", client_id: "CL-006", client_name: "Sidvokodvo Cement Products", kind: "standards_subscription", title: "Construction standards subscription", start: iso(-400), end: iso(-35), value: 9500, renewal_reminder_days: 30, status: "ended" },
];

export const DEFAULT_SIGNAL_RULES: SignalRules = {
  expiry_horizon_days: 120,
  calibration_horizon_days: 45,
  tbt_levels: ["high", "medium"],
  abandoned_age_days: 14,
  generators: { certificates: true, instruments: true, estore: true, applicability: true, nonconformities: true },
};

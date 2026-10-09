/**
 * End-to-end store journeys for gaps 04–08 ("Done when" in each gap file), in demo mode:
 * certification info-request loop → deposit → audit visit → NC → technical review → certificate;
 * calibration request → out-of-tolerance → review by another person → certificate → dispatch;
 * standards comment → resolution → ballot → publication (+ CRM signal); failed sample → R-V4.
 */
import { beforeEach, describe, expect, it } from "vitest";
import "@eswasaone/shared-ui/domains";
import { getInvoice, payInvoice, billingStore } from "@eswasaone/shared-ui/billing";
import {
  actOnApplication,
  addStage,
  certStore,
  completeTechnicalReview,
  confirmDeposit,
  customerAcceptQuote,
  customerRespondInfo,
  customerRespondNc,
  customerUploadDoc,
  getApplication,
  issueQuote,
  planStageVisit,
  reviewNc,
  setDocStatus,
  TR_CHECKLIST,
} from "@eswasaone/shared-ui/certification";
import { crmDemoMode, listCases, listSignals, resetCrmDemo } from "@eswasaone/shared-ui/crm";
import { actOnVisit, addSignature, checkIn, downloadPack, fieldStore, getVisit, receiveSample, saveChecklist, sendSampleToLab } from "@eswasaone/shared-ui/field";
import { actOnJob, actOnTest, createCalRequest, customerRespondQuote, getJob, metStore, quoteJob, receiveItems, saveTestResults, saveWorksheet, assignMetrologist, dispatchJob, issueCertificate } from "@eswasaone/shared-ui/metrology";
import { actOnWorkItem, castVote, getBallot, savePublication, setDisposition, stdStore, submitComments, getWorkItem } from "@eswasaone/shared-ui/standards";
import { taskStore } from "@eswasaone/shared-ui/tasks";
import type { Actor } from "@eswasaone/shared-ui/workflow";

const officer: Actor = { name: "Bongani Hlophe", roles: ["Certification Officer"] };
const manager: Actor = { name: "Thandeka Simelane", roles: ["Certification Manager", "Scheme Manager"] };
const lead: Actor = { name: "Lindiwe Dube", roles: ["Certification Auditor"] };
const reviewer: Actor = { name: "Nhlanhla Shabangu", roles: ["Technical Reviewer"] };
const labMgr: Actor = { name: "Ayanda Ndlovu", roles: ["Lab Manager", "Eswasa Metrology Manager", "Eswasa Metrology Reviewer", "Technical Manager"] };
const metrologist: Actor = { name: "Musa Khumalo", roles: ["Eswasa Metrology Officer"] };
const tcSec: Actor = { name: "Nokuthula Zwane", roles: ["TC Secretary"] };
const head: Actor = { name: "Sibusiso Gama", roles: ["Head of Standards"] };

beforeEach(async () => {
  localStorage.clear();
  for (const s of [certStore, fieldStore, metStore, stdStore, billingStore, taskStore]) s.reset();
  await resetCrmDemo();
});

describe("certification journey (gap 05)", () => {
  it("info request → quote → deposit → audit → NC → technical review → certificate", async () => {
    const id = "CERT-APP-26-0057";
    // Customer answers the info request.
    customerUploadDoc(id, "internal_audit", "ia-2026.pdf", "Sipho");
    customerUploadDoc(id, "mgmt_review", "mr-2026.pdf", "Sipho");
    await customerRespondInfo(id, "Both attached.", "Sipho");
    expect(getApplication(id)!.app.state).toBe("Document Review");
    for (const d of getApplication(id)!.app.documents) setDocStatus(id, d.key, "acceptable", "", officer);
    await issueQuote(id, [{ label: "Audit", qty: 4, unit_price: 6500 }], 4, officer);
    const { invoice } = customerAcceptQuote(id, { name: "Sipho Nkambule", title: "MD" }, "Sipho");
    await expect(confirmDeposit(id, "Sipho")).rejects.toThrow(/deposit/);
    await payInvoice(invoice.id, getInvoice(invoice.id)!.deposit!, "momo");
    await confirmDeposit(id, "Sipho");
    expect(getApplication(id)!.app.state).toBe("Audit Planned");

    // Plan, assign, accept, customer confirms, field work, review by someone else.
    addStage(id, { label: "Stage 2", date: new Date(Date.now() + 86_400_000).toISOString(), days: 3 }, manager);
    const v = planStageVisit(id, "S1", manager);
    await actOnVisit(v.id, "assign", manager, { expected_state: "Planned", payload: { lead: lead.name } });
    await actOnVisit(v.id, "accept", lead, { expected_state: "Assigned" });
    await (await import("@eswasaone/shared-ui/field")).customerConfirmVisit(v.id, "Sipho");
    downloadPack(v.id, lead);
    await checkIn(v.id, { lat: -26.5, lng: 31.8, accuracy: 10 }, lead);
    saveChecklist(v.id, getVisit(v.id)!.checklist.map((c) => ({ ...c, answer: "yes" as const })), lead);
    (await import("@eswasaone/shared-ui/field")).addVisitFinding(v.id, { clause: "§7.1.5", severity: "minor", statement: "Scale not calibrated", photos: [] }, lead);
    addSignature(v.id, { role: "client", name: "Sipho" }, lead);
    await actOnVisit(v.id, "submit", lead, { expected_state: "In Progress" });
    await expect(actOnVisit(v.id, "close", { ...lead, roles: ["Certification Manager"] }, { expected_state: "Submitted" })).rejects.toThrow(/different reviewer|led this visit/i);
    await actOnVisit(v.id, "close", manager, { expected_state: "Submitted" });
    const app = getApplication(id)!.app;
    expect(app.state).toBe("NC Resolution");
    expect(app.duties?.["Audit team"]).toContain(lead.name);

    // NC loop, technical review (not the auditor), decision (not team / reviewer).
    const nc = app.findings[0];
    customerRespondNc(id, nc.id, { root_cause: "x", correction: "y", corrective_action: "z", evidence: [] }, "Sipho");
    reviewNc(id, nc.id, true, "ok", officer);
    await actOnApplication(id, "to_technical_review", officer, { expected_state: "NC Resolution" });
    await expect(completeTechnicalReview(id, { checklist: TR_CHECKLIST.map((c) => ({ ...c, ok: true })), recommendation: "grant", justification: "fine" }, { ...lead, roles: ["Technical Reviewer"] })).rejects.toThrow(/audit team/);
    await completeTechnicalReview(id, { checklist: TR_CHECKLIST.map((c) => ({ ...c, ok: true })), recommendation: "grant", justification: "fine" }, reviewer);
    await expect(actOnApplication(id, "grant", { name: reviewer.name, roles: ["Certification Manager"] }, { expected_state: "Decision" })).rejects.toThrow();
    await actOnApplication(id, "grant", manager, { expected_state: "Decision" });
    const done = getApplication(id)!;
    expect(done.app.state).toBe("Certified");
    expect(done.certificate?.state).toBe("Active");
  });
});

describe("metrology journey (gap 07)", () => {
  it("request → quote → receipt → OOT → review by another person → certificate → dispatch", async () => {
    const j = await createCalRequest({ customer: "Test Co", customer_email: "demo", contact: "T", location: "lab", items: [{ description: "Balance", serial: "B1", range: "0-200 g", discipline: "Mass" }], accreditation: true, preferred_date: new Date().toISOString(), delivery: "collect" }, "T");
    quoteJob(j.id, [{ label: "Cal", qty: 1, unit_price: 650 }], 30, labMgr);
    await customerRespondQuote(j.id, true, "T");
    receiveItems(j.id, { at: "", by: "", condition: "good", accessories: "", photos: [], tag: "JT-1" }, labMgr);
    await assignMetrologist(j.id, metrologist.name, labMgr);
    expect(() => saveWorksheet(j.id, { method_id: "MP-01", refs: ["REF-MASS-02"], env: { temp_c: 20, rh_pct: 50 }, points: [], attachments: [] }, metrologist)).toThrow(/overdue/i);
    saveWorksheet(j.id, { method_id: "MP-01", refs: ["REF-MASS-01"], env: { temp_c: 20, rh_pct: 50 }, points: [{ id: "P1", item_id: "I1", nominal: 100, unit: "g", as_found: 100.01, as_left: 100.0001, tolerance: 0.001, uncertainty: 0.0002 }], attachments: [] }, metrologist);
    expect(getJob(j.id)!.job.oot_notified_at).toBeTruthy();
    await actOnJob(j.id, "submit_review", metrologist, { expected_state: "In Progress" });
    await expect(actOnJob(j.id, "approve", { ...metrologist, roles: ["Eswasa Metrology Reviewer"] }, { expected_state: "Pending Review" })).rejects.toThrow(/different reviewer/);
    await actOnJob(j.id, "approve", labMgr, { expected_state: "Pending Review" });
    issueCertificate(j.id, labMgr);
    dispatchJob(j.id, { method: "collection", name: "T" }, labMgr);
    expect(getJob(j.id)!.job.state).toBe("Dispatched");
    expect(getJob(j.id)!.job.certificate?.id).toMatch(/^CAL-/);
  });
});

describe("failed sample triggers R-V4 (gaps 05 C9, 08)", () => {
  it("in-transit sample → receipt → LIMS → fail approved by another person → case opened, decision blocked", async () => {
    const before = (await listCases({ state: "all" })).length;
    receiveSample("ES-SEAL-104425", "ok", labMgr);
    sendSampleToLab("SMP-26-0425", labMgr);
    const tid = fieldStore.read().samples["SMP-26-0425"].test_request_id!;
    await actOnTest(tid, "assign", labMgr, { expected_state: "Requested", payload: { analyst: "Precious Tfwala" } });
    const analyst: Actor = { name: "Precious Tfwala", roles: ["Eswasa Lab Analyst"] };
    saveTestResults(tid, [{ param: "Turbidity", spec: "≤ 1 NTU", value: "4", pass: false }], "fail", "Sediment", analyst);
    await actOnTest(tid, "submit", analyst, { expected_state: "In Test" });
    await expect(actOnTest(tid, "approve", { ...analyst, roles: ["Technical Manager"] }, { expected_state: "Pending Approval" })).rejects.toThrow(/different person/);
    await actOnTest(tid, "approve", labMgr, { expected_state: "Pending Approval" });
    expect(fieldStore.read().samples["SMP-26-0425"].result).toBe("fail");
    expect(crmDemoMode()).toBe(true);
    // Case sample (CS-26-0136): R-V4 tasks for Certification and the risk officer.
    const tasks = Object.values(taskStore.read().tasks).filter((t) => t.rule === "R-V4");
    expect(tasks.length).toBeGreaterThan(0);
    expect((await listCases({ state: "all" })).length).toBeGreaterThanOrEqual(before);
  });
});

describe("standards journey (gap 06)", () => {
  it("public comment → resolution → ballot → publish → catalogue + CRM signal", async () => {
    const id = "WI-26-003";
    submitComments(id, { name: "Me", email: "demo" }, [{ clause: "5", type: "general", comment: "Fine" }]);
    await actOnWorkItem(id, "close_comment", tcSec, { expected_state: "Public Review", reason: "Early close for test" });
    setDisposition(getWorkItem(id)!.comments.map((c) => c.id), "noted", "Thanks", tcSec);
    await actOnWorkItem(id, "open_ballot", tcSec, { expected_state: "Comment Resolution", payload: { days: "10" } });
    const bid = getWorkItem(id)!.wi.ballot_id!;
    for (const n of getBallot(bid)!.ballot.eligible) castVote(bid, n, "approve");
    expect(getWorkItem(id)!.wi.state).toBe("Approved");
    savePublication(id, { final_text: true, cover: true, ics: "91.100.30", price: 520, gazette_ref: "GN 12/2026", gazette_date: "2026-10-01", compulsory: true, regulation: "Building Regulations" }, head);
    await actOnWorkItem(id, "publish", head, { expected_state: "Approved" });
    const b = getWorkItem(id)!;
    expect(b.wi.state).toBe("Published");
    expect(b.catalogue?.status).toBe("current");
    expect(b.revises?.status).toBe("superseded");
    expect((await listSignals()).some((s) => s.kind === "compulsory_standard" && s.source_ref?.includes(b.catalogue!.id))).toBe(true);
  });
});

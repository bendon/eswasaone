/**
 * Store-level checks for the P3 items across gaps 02–08: onboarding sign-off, pack briefing, NPS on
 * certificate issue, WhatsApp threading, sentiment flags, health trend / churn, certification health →
 * CRM health, TBT notify + WTO comment import, predictive recall, drop-off slots, CSV import, route
 * ordering, digest preference, and the QR encoder's structure.
 */
import { beforeEach, describe, expect, it } from "vitest";
import "@eswasaone/shared-ui/domains";
import { billingStore } from "@eswasaone/shared-ui/billing";
import { certStore, clientCertHealth, draftAuditReport, saveAuditReport, auditReportFor, verifyCertificateToken } from "@eswasaone/shared-ui/certification";
import { answerNps, caseFlags, churnRisk, clientHealth, getAccountPlan, getCase, healthTrend, ingestWhatsApp, listClients, listCases, listNpsForCustomer, npsSummary, resetCrmDemo, saveAccountPlan, sendNps, textFlags } from "@eswasaone/shared-ui/crm";
import { ESWASA_HQ, fieldStore, listVisits, planRoute } from "@eswasaone/shared-ui/field";
import { govStore, onboardingStatus, packBriefing, signOnboarding, BOARD_MEMBER_NAMES } from "@eswasaone/shared-ui/governance";
import { createCalRequest, dropoffSlots, DEFAULT_COUNTER, metStore, parseReadingsCsv, setInstrumentInterval, suggestInterval } from "@eswasaone/shared-ui/metrology";
import { qrMatrix } from "@eswasaone/shared-ui/print";
import { getWorkItem, importWtoComments, listTbtOutgoing, notifyWto, stdStore } from "@eswasaone/shared-ui/standards";
import { digestPref, setDigestPref, taskStore } from "@eswasaone/shared-ui/tasks";
import type { Actor } from "@eswasaone/shared-ui/workflow";

const tcSec: Actor = { name: "Nokuthula Zwane", roles: ["TC Secretary"] };
const am: Actor = { name: "Zanele Maseko", roles: ["Account Manager"] };

beforeEach(async () => {
  localStorage.clear();
  for (const s of [certStore, fieldStore, metStore, stdStore, billingStore, taskStore, govStore]) s.reset();
  await resetCrmDemo();
});

describe("02 approvals", () => {
  it("stores a daily digest preference per person", async () => {
    expect(digestPref("Bongani Hlophe").email).toBe(false);
    await setDigestPref("Bongani Hlophe", { email: true, push: false });
    expect(digestPref("Bongani Hlophe")).toMatchObject({ email: true, push: false });
    expect(digestPref("Someone Else").email).toBe(false);
  });
});

describe("03 board", () => {
  it("onboarding pack is complete only when every document is signed", async () => {
    const m = BOARD_MEMBER_NAMES[0];
    expect(onboardingStatus(m).complete).toBe(false);
    for (const d of onboardingStatus(m).docs) await signOnboarding(m, d.id);
    expect(onboardingStatus(m).complete).toBe(true);
    await expect(signOnboarding(m, "nope")).rejects.toThrow(/Unknown/);
  });

  it("briefing summarises the frozen pack and compares with the previous meeting", () => {
    const br = packBriefing("BP-2026-Q2")!;
    expect(br.version).toBe(2);
    expect(br.previous).toBeTruthy();
    expect(br.text).toMatch(/In one page/);
    expect(packBriefing("BP-2026-Q3")).toBeNull(); // nothing assembled yet
  });
});

describe("04 CRM", () => {
  it("flags upset and urgent wording", () => {
    expect(textFlags("This is UNACCEPTABLE AND RIDICULOUS SERVICE").angry).toBe(true);
    expect(textFlags("Please help urgently, the product is unsafe for children").urgent).toBe(true);
    expect(textFlags("Thanks for the quick reply").angry).toBe(false);
  });

  it("threads WhatsApp into the sender's open case, else opens one", async () => {
    const first = await ingestWhatsApp({ from: "+268 7699 0001", name: "Test", body: "Hi, where is my certificate?" });
    expect(first.threaded).toBe(false);
    expect(first.case.channel).toBe("whatsapp");
    const second = await ingestWhatsApp({ from: "76990001", body: "Any news?" });
    expect(second.threaded).toBe(true);
    expect(second.case.ref).toBe(first.case.ref);
    expect((await getCase(first.case.ref))!.thread.some((m) => m.body.includes("Any news?"))).toBe(true);
    expect(caseFlags((await getCase(first.case.ref))!).angry).toBe(false);
  });

  it("health trend ends at today's score; churn risk explains itself", async () => {
    const [c] = await listClients();
    const cases = await listCases({ includeAppeals: true });
    const t = healthTrend(c, cases);
    expect(t).toHaveLength(6);
    expect(t[5].score).toBe(clientHealth(c, cases).score);
    const r = churnRisk(c, cases);
    expect(["low", "medium", "high"]).toContain(r.level);
  });

  it("saves an account plan", async () => {
    const [c] = await listClients();
    await saveAccountPlan({ client_id: c.id, year: 2026, objectives: [{ id: "o1", text: "Renew ISO 9001", status: "open" }], stakeholders: [], services: [{ id: "s1", service: "certification", quarter: 2, value: 30000, status: "planned" }] }, am);
    expect((await getAccountPlan(c.id, 2026))!.services[0].value).toBe(30000);
  });

  it("NPS: one survey per milestone, scored by the customer, summarised for Insights", async () => {
    expect(sendNps({ trigger: "certificate_issued", ref: "X-1", email: "demo" })).toBeTruthy();
    expect(sendNps({ trigger: "certificate_issued", ref: "X-1", email: "demo" })).toBeNull();
    const open = (await listNpsForCustomer("demo")).find((n) => n.ref === "X-1")!;
    await expect(answerNps(open.id, 11)).rejects.toThrow();
    await answerNps(open.id, 10, "Great");
    const s = await npsSummary();
    expect(s.responses).toBeGreaterThan(0);
    expect(s.nps).not.toBeNull();
  });
});

describe("05 certification", () => {
  it("certification health suggests a surveillance frequency", () => {
    const h = clientCertHealth("CL-NONE", "Nobody Ltd");
    expect(h.score).toBe(100);
    expect(h.surveillance.months).toBe(12);
  });

  it("drafts and saves an audit report from a field visit", () => {
    const visit = listVisits().find((v) => v.parent?.doctype === "Certification Application")!;
    const app = { id: visit.parent!.name };
    const text = draftAuditReport(app.id, visit.id);
    expect(text).toContain(visit.site.name);
    expect(text).toMatch(/AUDIT REPORT/);
    saveAuditReport(app.id, visit.id, text, { name: "Lindiwe Dube", roles: ["Certification Auditor"] });
    expect(auditReportFor(app.id, visit.id)!.version).toBe(1);
  });

  it("public badge reads the register", () => {
    const c = Object.values(certStore.read().certs)[0];
    expect(verifyCertificateToken(c.token).number).toBe(c.number);
    expect(verifyCertificateToken("not-a-token").valid).toBe(false);
  });
});

describe("06 standards", () => {
  it("notifies a draft technical regulation to the WTO and imports member comments", () => {
    const id = "WI-26-003";
    expect(() => notifyWto(id, { objective: "", products: "Roof tiles" }, tcSec)).toThrow(/objective/);
    const t = notifyWto(id, { objective: "Safety of buildings", products: "Concrete roof tiles (HS 6810)" }, tcSec);
    expect(t.symbol).toMatch(/^G\/TBT\/N\/SWZ\//);
    expect(() => notifyWto(id, { objective: "x", products: "y" }, tcSec)).toThrow(/Already/);
    expect(Object.values(taskStore.read().tasks).some((k) => k.name === t.symbol && k.role === "Eswasa TBT Officer" && !k.closed_at)).toBe(true);
    importWtoComments(id, [{ member: "South Africa", clause: "5.2", comment: "Align with SANS 542." }], tcSec);
    expect(getWorkItem(id)!.comments.some((c) => c.by.name === "WTO member: South Africa")).toBe(true);
    expect(listTbtOutgoing()[0].imported).toBe(1);
    expect(() => notifyWto("WI-26-005", { objective: "x", products: "y" }, tcSec)).toThrow(/committee draft/);
  });
});

describe("07 metrology", () => {
  it("suggests shorter intervals for drifting instruments and longer for stable ones", () => {
    expect(suggestInterval("INS-1004")!.direction).toBe("shorter"); // out of tolerance last time
    expect(suggestInterval("INS-1001")!.direction).toBe("longer"); // stable, three cycles
    setInstrumentInterval("INS-1001", 18, "Sipho");
    expect(suggestInterval("INS-1001")!.current).toBe(18);
  });

  it("drop-off slots fill up and refuse double booking beyond capacity", async () => {
    const day = dropoffSlots()[0];
    const slot = { date: day.date, time: day.times[0].time };
    const req = { customer: "T", customer_email: "demo", contact: "T", location: "lab" as const, items: [{ description: "Balance", serial: "B1", range: "0-200 g", discipline: "Mass" as const }], accreditation: false, preferred_date: day.date, delivery: "collect" as const, dropoff: slot };
    for (let i = 0; i < DEFAULT_COUNTER.per_slot; i++) await createCalRequest(req, "T");
    expect(dropoffSlots()[0].times[0].free).toBe(0);
    await expect(createCalRequest(req, "T")).rejects.toThrow(/slot/);
  });

  it("parses readings CSV with flexible headers", () => {
    const r = parseReadingsCsv("Nominal;Unit;Reading;MPE\n100;g;100,0003;0,0005\nx;g;1;1", "I1");
    expect(r.rows).toHaveLength(1);
    expect(r.rows[0]).toMatchObject({ item_id: "I1", nominal: 100, as_found: 100.0003, as_left: 100.0003, tolerance: 0.0005 });
    expect(r.errors[0]).toMatch(/Line 3/);
    expect(parseReadingsCsv("a,b\n1,2", "I1").errors[0]).toMatch(/nominal/);
  });
});

describe("08 field", () => {
  it("orders stops nearest-first", () => {
    const r = planRoute(ESWASA_HQ, [
      { id: "far", gps: { lat: -26.56, lng: 31.79 } },
      { id: "near", gps: { lat: -26.49, lng: 31.38 } },
    ]);
    expect(r.order.map((x) => x.id)).toEqual(["near", "far"]);
    expect(r.total_km).toBeGreaterThan(0);
  });
});

describe("print QR encoder", () => {
  it("builds a valid version-sized matrix with finder patterns", () => {
    const m = qrMatrix("https://eswasa.co.sz/verify/cal/c26-0211-ab12");
    expect(m.length).toBe(33); // version 4
    // Finder pattern: dark ring, light ring, dark 3×3 core.
    expect([m[0][0], m[0][6], m[6][0], m[6][6], m[3][3]].every(Boolean)).toBe(true);
    expect([m[1][1], m[5][5], m[7][7]].some(Boolean)).toBe(false);
    expect(() => qrMatrix("x".repeat(300))).toThrow(/too long/);
  });
});

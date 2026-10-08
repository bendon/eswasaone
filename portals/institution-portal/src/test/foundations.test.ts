/**
 * Gap 01–03 logic smoke tests: workflow engine, task inbox, CRM → Approvals, governance rules.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { allowedActions, applyTransition, ReasonRequiredError, StaleStateError, type WorkflowDef, type WfRecord } from "@eswasaone/shared-ui/workflow";
import {
  claimTask,
  completeTask,
  createDelegation,
  listTasks,
  reassignTask,
  resetTasksDemo,
  taskHandler,
  tasksForRecord,
} from "@eswasaone/shared-ui/tasks";
import { actOnCase, getCase, lodgeCase, resetCrmDemo } from "@eswasaone/shared-ui/crm";
import {
  actOnPack,
  addAction,
  castVote,
  circulateWritten,
  getMeeting,
  getPack,
  govStore,
  listResolutions,
  meetingActions,
  packActions,
  recordItemDecision,
  resetGovernanceDemo,
  saveRisk,
  scheduleMeeting,
  setAttendance,
  startRun,
  updateSection,
} from "@eswasaone/shared-ui/governance";
import { listNotifications } from "@eswasaone/shared-ui/notify";

const SEC = { name: "Nomsa Dlamini", roles: ["Company Secretary", "Eswasa Board Secretary"] };
const CS = { name: "Zanele Maseko", roles: ["Customer Service", "Support Team"] };
const ADMIN = { name: "Demo Administrator", roles: ["System Manager"] };

type Rec = WfRecord & { id: string };
const DEF: WorkflowDef<Rec> = {
  doctype: "Thing",
  label: "Thing",
  module: "Test",
  states: [
    { id: "Draft", label: "Draft", tone: "amber" },
    { id: "Review", label: "Review", tone: "navy" },
    { id: "Done", label: "Done", tone: "green" },
  ],
  transitions: [
    { action: "submit", label: "Submit", from: ["Draft"], to: "Review", roles: "any_staff", consequence: "", records: "author" },
    { action: "approve", label: "Approve", from: ["Review"], to: "Done", roles: "any_staff", consequence: "", guards: [{ kind: "not_actor_of", steps: ["author"], message: "You wrote this, so someone else must approve it." }] },
    { action: "return", label: "Return", from: ["Review"], to: "Draft", roles: "any_staff", consequence: "" },
  ],
};

beforeEach(async () => {
  localStorage.clear();
  sessionStorage.clear();
  await resetTasksDemo();
  await resetCrmDemo();
  await resetGovernanceDemo();
});

describe("workflow engine (C3, C8)", () => {
  it("enforces reason, expected state and separation of duties", () => {
    const r: Rec = { id: "1", state: "Draft", seq: 0, history: [] };
    applyTransition(DEF, r, "submit", ADMIN, { expected_state: "Draft" });
    expect(r.state).toBe("Review");
    expect(r.seq).toBe(1);

    // Same person can't approve their own work.
    const acts = allowedActions(DEF, r, ADMIN);
    expect(acts.find((a) => a.action === "approve")?.disabledReason).toMatch(/someone else/);
    expect(() => applyTransition(DEF, r, "approve", ADMIN, { expected_state: "Review" })).toThrow(/someone else/);

    // Return always needs a reason (invariant 4), even though the def doesn't say so.
    expect(acts.find((a) => a.action === "return")?.requires).toBe("reason");
    expect(() => applyTransition(DEF, r, "return", SEC, { expected_state: "Review" })).toThrow(ReasonRequiredError);

    // Stale state.
    expect(() => applyTransition(DEF, r, "approve", SEC, { expected_state: "Draft" })).toThrow(StaleStateError);

    applyTransition(DEF, r, "approve", SEC, { expected_state: "Review" });
    expect(r.state).toBe("Done");
  });
});

describe("Approvals inbox (gap 02)", () => {
  it("a lodged CRM case creates a task; claim → act closes it and opens the next", async () => {
    const c = await lodgeCase({ type: "enquiry", subject: "Fee for ISO 22000", description: "How much does ISO 22000 cost?", channel: "web", reporter: { name: "T. Test", email: "t@test.sz", anonymous: false, preferred: "email" } });
    const pool = listTasks(CS, { queue: "unclaimed" }).filter((t) => t.name === c.ref);
    expect(pool).toHaveLength(1);
    const task = pool[0];
    await claimTask(task.id, CS);
    expect(listTasks(CS, { queue: "mine" }).some((t) => t.id === task.id)).toBe(true);

    const h = taskHandler("Case");
    const triage = h.actions(task, CS).find((a) => a.action === "triage");
    expect(triage).toBeTruthy();
    await h.act(task, "triage", CS, { expected_state: "Open" });
    expect((await getCase(c.ref))?.state).toBe("Triaged");

    const all = tasksForRecord("Case", c.ref);
    expect(all.find((t) => t.id === task.id)?.closed_at).toBeTruthy();
    expect(all.some((t) => !t.closed_at && t.state === "Triaged")).toBe(true);

    // Customer gets a notification for the acknowledgement.
    expect(listNotifications("customer", { email: "t@test.sz" }).some((n) => n.ref === c.ref)).toBe(true);
  });

  it("acting on a case that moved on reports who handled it", async () => {
    const c = await lodgeCase({ type: "enquiry", subject: "Stale", description: "x", channel: "web", reporter: { name: "A", email: "a@a.sz", anonymous: false, preferred: "email" } });
    const task = listTasks(ADMIN, { queue: "unclaimed" }).find((t) => t.name === c.ref)!;
    await actOnCase(c.ref, "triage", CS);
    await expect(taskHandler("Case").act(task, "triage", ADMIN, { expected_state: "Open" })).rejects.toThrow(/Already moved/);
  });

  it("reject and reassign without a reason are blocked", async () => {
    const t = listTasks(ADMIN, { queue: "all" }).find((x) => x.family === "approve")!;
    await expect(completeTask(t.id, ADMIN, "Rejected")).rejects.toThrow(/reason/);
    await expect(reassignTask(t.id, "Themba Motsa", "  ", ADMIN)).rejects.toThrow(/reason/);
    await reassignTask(t.id, "Themba Motsa", "Finance owns this", ADMIN);
    expect(listTasks({ name: "Themba Motsa", roles: ["Accounts Manager"] }, { queue: "mine" }).some((x) => x.id === t.id)).toBe(true);
  });

  it("delegation routes an absent person's tasks to the delegate", async () => {
    const t = listTasks(ADMIN, { queue: "all" }).find((x) => x.role === "Accounts Manager")!;
    await reassignTask(t.id, "Themba Motsa", "Owner", ADMIN);
    await createDelegation({ from: "Themba Motsa", to: "Vusi Magagula", roles: [], start: new Date(Date.now() - 3600_000).toISOString(), end: new Date(Date.now() + 5 * 86_400_000).toISOString() }, ADMIN);
    const mine = listTasks({ name: "Vusi Magagula", roles: ["Purchase Manager"] }, { queue: "mine" });
    const moved = mine.find((x) => x.id === t.id);
    expect(moved?.on_behalf_of).toBe("Themba Motsa");
  });
});

describe("Board & governance (gap 03)", () => {
  it("R-G1: scheduling opens a pack with section-owner tasks; issue is blocked until Ready", async () => {
    const m = await scheduleMeeting({ body_id: "BOARD", title: "Special Board meeting", scheduled_at: new Date(Date.now() + 30 * 86_400_000).toISOString(), venue: "Boardroom" }, SEC);
    const bundle = await getMeeting(m.id);
    expect(bundle?.pack?.state).toBe("Draft");
    const sectionTasks = listTasks(ADMIN, { queue: "team" }).filter((t) => t.doctype === "Board Pack Section" && t.name.startsWith(bundle!.pack!.id));
    expect(sectionTasks.length).toBe(bundle!.pack!.sections.length);
    expect(listTasks(ADMIN, { queue: "team" }).some((t) => t.doctype === "Board Meeting" && t.name === m.id)).toBe(true);
    // Agenda pre-filled with approval of the previous meeting's minutes.
    expect(bundle!.meeting.agenda.some((a) => a.approve_minutes_of)).toBe(true);

    await actOnPack(bundle!.pack!.id, "assemble", SEC, { expected_state: "Draft" });
    const issue = packActions(bundle!.pack!.id, SEC).find((a) => a.action === "issue");
    expect(issue?.disabledReason).toMatch(/not Ready/);
  });

  it("Q3 cycle: ready sections → assemble v1 → issue → run → approve Q2 minutes → resolution with action tasks", async () => {
    const pk = (await getPack("BM-2026-Q3"))!;
    for (const s of pk.pack.sections.filter((x) => x.status !== "ready")) {
      await updateSection(pk.pack.id, s.id, { content: s.content ?? `${s.title} paper`, status: "ready" }, SEC);
    }
    await actOnPack(pk.pack.id, "assemble", SEC, { expected_state: "Draft" });
    // Agenda not final yet → still blocked.
    expect(packActions(pk.pack.id, SEC).find((a) => a.action === "issue")?.disabledReason).toMatch(/agenda/i);
    govStore.mutate((s) => {
      s.meetings["BM-2026-Q3"].agenda_final = true;
    });
    await actOnPack(pk.pack.id, "issue", SEC, { expected_state: "Assembled" });
    const after = (await getMeeting("BM-2026-Q3"))!;
    expect(after.meeting.state).toBe("Pack issued");
    expect(after.pack?.issued_version).toBe(1);
    expect(listNotifications("member", { name: "Dr. Khanyisile Vilakati" }).some((n) => /pack/i.test(n.title))).toBe(true);

    // Close blocked until the run starts and quorum is met.
    expect(meetingActions("BM-2026-Q3", SEC).find((a) => a.action === "close_meeting")?.disabledReason).toMatch(/Run meeting/);
    await startRun("BM-2026-Q3", SEC);
    for (const name of ["Dr. Khanyisile Vilakati", "Adv. Mbuso Tsabedze", "Ms. Busisiwe Hlatshwayo", "Sipho Mamba"]) await setAttendance("BM-2026-Q3", name, { present: true }, SEC);

    // Previous minutes (Q2) can only be approved now, at the next meeting.
    await recordItemDecision("BM-2026-Q3", "Q3-2", { outcome: "approved", text: "Q2 minutes approved.", votes: {} }, SEC);
    expect((await getMeeting("BM-2026-Q2"))?.meeting.state).toBe("Minutes approved");

    await recordItemDecision(
      "BM-2026-Q3",
      "Q3-5",
      { outcome: "approved", text: "Mid-term review approved.", votes: { "Dr. Khanyisile Vilakati": "for", "Adv. Mbuso Tsabedze": "for" }, actions: [{ description: "Publish revised plan", owner: "Sipho Mamba", due: new Date(Date.now() + 20 * 86_400_000).toISOString() }] },
      SEC,
    );
    const res = (await listResolutions()).find((r) => r.item_id === "Q3-5")!;
    expect(res.state).toBe("Passed");
    expect(listTasks(ADMIN, { queue: "team" }).some((t) => t.doctype === "Resolution Action" && t.assignee === "Sipho Mamba" && /revised plan/.test(t.title))).toBe(true);

    expect(meetingActions("BM-2026-Q3", SEC).find((a) => a.action === "close_meeting")?.disabledReason).toBeUndefined();
  });

  it("written resolution lapses when its window closes without enough votes", async () => {
    const r = await circulateWritten({ title: "Test", text: "Resolved…", body_id: "BOARD", closes: new Date(Date.now() + 60_000).toISOString(), threshold: "simple", eligible: ["Dr. Khanyisile Vilakati", "Sipho Mamba", "Adv. Mbuso Tsabedze"], min_votes: 2, papers: [] }, SEC);
    await castVote(r.id, "Sipho Mamba", "for");
    govStore.mutate((s) => {
      s.resolutions[r.id].window!.closes = new Date(Date.now() - 1000).toISOString();
    });
    // Force a fresh read (auto-close runs on read).
    localStorage.setItem(govStore.key, JSON.stringify(govStore.read()));
    window.dispatchEvent(new StorageEvent("storage", { key: govStore.key }));
    const after = (await listResolutions()).find((x) => x.id === r.id)!;
    expect(after.state).toBe("Lapsed");
  });

  it("R-G3: residual above appetite raises an alert task", async () => {
    await saveRisk({ title: "Key-person dependency in the lab", category: "Operational", owner: "Ayanda Ndlovu", inherent: { l: 4, i: 4 }, residual: { l: 4, i: 4 } }, SEC);
    expect(listTasks(ADMIN, { queue: "team" }).some((t) => t.doctype === "Risk Appetite Breach" && /Key-person/.test(t.title))).toBe(true);
  });

  it("R-G2: actions only after a resolution passes", async () => {
    await expect(addAction("RES-2026-016", { description: "x", owner: "Sipho Mamba", due: new Date().toISOString() }, SEC)).rejects.toThrow(/passed/);
  });
});

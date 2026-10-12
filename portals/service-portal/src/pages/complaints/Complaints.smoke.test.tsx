import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import {
  actOnCase,
  addWorkingDays,
  caseSla,
  customerActions,
  DEFAULT_CASE_TYPES,
  getCase,
  lodgeCase,
  resetCrmDemo,
  staffActions,
  workingDaysBetween,
  type Case,
} from "@eswasaone/shared-ui/crm";
import { LodgeCasePage } from "./LodgeCasePage";
import { TrackCasePage } from "./TrackCasePage";
import { AccountCasesPage } from "../account/AccountCasesPage";
import { ComplaintsHubPage } from "./ComplaintsHubPage";

vi.stubEnv("VITE_DEMO_MODE", "true");
afterAll(() => vi.unstubAllEnvs());

const manager = { name: "Q. Manager", roles: ["System Manager"] };

beforeEach(async () => {
  localStorage.clear();
  sessionStorage.clear();
  await resetCrmDemo();
});

describe("Complaints journey (demo store)", () => {
  it("hub lists every public case type and the appeal route", () => {
    render(
      <MemoryRouter initialEntries={["/complaints"]}>
        <Routes>
          <Route path="/complaints" element={<ComplaintsHubPage />} />
        </Routes>
      </MemoryRouter>,
    );
    expect(screen.getByText("Report about a certified product or company")).toBeInTheDocument();
    expect(screen.getByText("Mark misuse or fake certificate")).toBeInTheDocument();
    expect(screen.getByText("Appeal a certification decision")).toBeInTheDocument();
  });

  it("lodge wizard reaches a reference number", async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={["/complaints/new/enquiry"]}>
        <Routes>
          <Route path="/complaints/new/:type" element={<LodgeCasePage />} />
        </Routes>
      </MemoryRouter>,
    );
    await user.type(screen.getByLabelText(/what's it about/i), "Calibration of weighing scales");
    await user.type(screen.getByLabelText(/tell us more/i), "Do you calibrate 300 kg platform scales on site in Lubombo?");
    await user.click(screen.getByRole("button", { name: "Continue" })); // → about
    await user.click(screen.getByRole("button", { name: "Continue" })); // → evidence
    await user.click(screen.getByRole("button", { name: "Continue" })); // → details
    await user.click(screen.getByLabelText(/report anonymously/i));
    await user.click(screen.getByRole("button", { name: "Continue" })); // → review
    await user.click(screen.getByRole("button", { name: "Submit" }));
    expect(await screen.findByText("We've got it")).toBeInTheDocument();
    expect(screen.getByText(/^CS-\d{2}-\d{4}$/)).toBeInTheDocument();
    // Routing rule sent it to Metrology.
    expect(screen.getByText(/Metrology team/)).toBeInTheDocument();
  });

  it("tracking finds a case by reference + tracking code", async () => {
    const user = userEvent.setup();
    const c = await lodgeCase({
      type: "product_report",
      subject: "Short-weight sugar bags",
      description: "Two 2 kg bags weighed 1.9 kg.",
      channel: "web",
      reporter: { anonymous: true, preferred: "email" },
    });
    render(
      <MemoryRouter initialEntries={["/complaints/track"]}>
        <Routes>
          <Route path="/complaints/track" element={<TrackCasePage />} />
          <Route path="/complaints/track/:ref" element={<TrackCasePage />} />
        </Routes>
      </MemoryRouter>,
    );
    await user.type(screen.getByLabelText("Case reference"), c.ref);
    await user.type(screen.getByLabelText(/tracking code, email or phone/i), c.access_code);
    await user.click(screen.getByRole("button", { name: "Find my case" }));
    expect(await screen.findByRole("heading", { name: "Short-weight sugar bags" })).toBeInTheDocument();
  });

  it("account cases lists cases lodged from this browser", async () => {
    await lodgeCase({
      type: "billing_dispute",
      subject: "Double invoice",
      description: "Invoiced twice for the same audit.",
      channel: "account",
      reporter: { anonymous: false, name: "Test User", email: "test@example.sz", preferred: "email" },
      about: { kind: "invoice", label: "Invoice INV-1", ref: "INV-1" },
    });
    render(
      <MemoryRouter>
        <AccountCasesPage />
      </MemoryRouter>,
    );
    await waitFor(() => expect(screen.getByText("Double invoice")).toBeInTheDocument());
  });
});

describe("Case workflow + SLA", () => {
  it("counts working days and skips weekends", () => {
    // Fri 2 Oct 2026 → Mon 5 Oct 2026 is one working day.
    expect(workingDaysBetween("2026-10-02T09:00:00Z", new Date("2026-10-05T09:00:00Z"))).toBe(1);
    expect(addWorkingDays("2026-10-02T09:00:00Z", 1).getDay()).toBe(1);
  });

  it("pauses the clock while awaiting the customer and enforces reasons", async () => {
    const c = await lodgeCase({
      type: "service_complaint",
      subject: "Late report",
      description: "Audit report not received after 3 weeks.",
      channel: "web",
      reporter: { anonymous: false, name: "A", email: "a@example.sz", preferred: "email" },
    });
    await actOnCase(c.ref, "triage", manager);
    await actOnCase(c.ref, "start", manager);
    await expect(actOnCase(c.ref, "request_info", manager)).rejects.toThrow(/reason/i);
    await actOnCase(c.ref, "request_info", manager, { note: "Which audit?" });
    const waiting = (await getCase(c.ref)) as Case;
    expect(waiting.state).toBe("Awaiting Customer");
    expect(caseSla(waiting, DEFAULT_CASE_TYPES.service_complaint).paused).toBe(true);
    expect(customerActions(waiting, 14).map((a) => a.action)).toContain("customer_reply");
  });

  it("keeps appeals away from non-panel staff", async () => {
    const c = await lodgeCase({
      type: "appeal",
      subject: "Appeal",
      description: "We contest the decision.",
      channel: "account",
      reporter: { anonymous: false, name: "B", email: "b@example.sz", preferred: "email" },
    });
    const full = (await getCase(c.ref)) as Case;
    expect(staffActions(full, { name: "Sales", roles: ["Sales User"] })).toHaveLength(0);
    expect(staffActions(full, manager).length).toBeGreaterThan(0);
  });
});

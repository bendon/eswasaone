import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { IconSprite } from "@eswasaone/shared-ui";
import { ToastProvider } from "../ui/Toast";
import { CertificationApplyPage } from "../pages/CertificationApplyPage";
import { CertificationTrackPage } from "../pages/CertificationTrackPage";
import { CertificationQuotePage } from "../pages/CertificationQuotePage";
import { CertificationStatusPage } from "../pages/CertificationStatusPage";
import { AccountApplicationsPage } from "../pages/account/AccountApplicationsPage";
import { checkIngeloEligibility } from "../api/certification";
import { stageFromStatus } from "./flows";
import { emptyWizard, stepsFor, validateStep } from "./wizard";

// Core is offline in tests: every call falls back to the local store.
vi.mock("@eswasaone/shared-ui", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@eswasaone/shared-ui")>()),
  apiFetch: vi.fn().mockRejectedValue(new Error("offline")),
}));

const requireAuth = vi.fn((): boolean => false);
vi.mock("../auth/AuthProvider", () => ({
  useAuth: () => ({ user: null, requireAuth, openAuth: vi.fn() }),
}));

function renderAt(path: string, routePath: string, el: JSX.Element) {
  return render(
    <ToastProvider>
      <IconSprite />
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path={routePath} element={el} />
        </Routes>
      </MemoryRouter>
    </ToastProvider>,
  );
}

beforeEach(() => {
  localStorage.clear();
  requireAuth.mockClear();
});

describe("certification flow logic", () => {
  it("plans different steps per flow", () => {
    expect(stepsFor("ms")).toContain("system");
    expect(stepsFor("product")).toEqual(expect.arrayContaining(["products", "factory"]));
    expect(stepsFor("ingelo").slice(0, 2)).toEqual(["eligibility", "consult"]);
    expect(stepsFor("combined")).toEqual(expect.arrayContaining(["system", "products", "factory"]));
  });

  it("gates Ingelo on eligibility", () => {
    expect(checkIngeloEligibility({ citizen: true, local_msme: true, made_here: true, willing_to_scale: true }).eligible).toBe(true);
    const no = checkIngeloEligibility({ citizen: false, local_msme: true, made_here: true, willing_to_scale: true });
    expect(no.eligible).toBe(false);
    expect(no.reasons[0]).toMatch(/Emaswati/);
  });

  it("validates required organisation fields", () => {
    const s = emptyWizard("iso9001");
    expect(Object.keys(validateStep("organisation", s))).toEqual(
      expect.arrayContaining(["org_name", "org_address", "org_reg", "org_employees"]),
    );
  });

  it("maps backend workflow states onto each flow", () => {
    expect(stageFromStatus("product", "Audit In Progress")).toBe("testing");
    expect(stageFromStatus("ms", "Audit Scheduled")).toBe("stage1");
    expect(stageFromStatus("ingelo", "Certified")).toBe("mark");
    expect(stageFromStatus("ms", "Withdrawn")).toBe("withdrawn");
  });
});

describe("certification screens", () => {
  it("blocks ineligible Ingelo applicants", async () => {
    renderAt("/certification/apply?scheme=ingelo", "/certification/apply", <CertificationApplyPage />);
    expect(screen.getByRole("heading", { name: /apply for ingelo certification/i })).toBeInTheDocument();
    const q = screen.getByRole("radiogroup", { name: /owned by emaswati/i });
    await userEvent.click(within(q).getByLabelText("No"));
    expect(await screen.findByText(/isn’t the right fit yet/i)).toBeInTheDocument();
  });

  it("shows management-system steps in the rail", () => {
    renderAt("/certification/apply?scheme=iso9001", "/certification/apply", <CertificationApplyPage />);
    const rail = screen.getByRole("navigation", { name: /application steps/i });
    expect(within(rail).getByText("Management system")).toBeInTheDocument();
    expect(within(rail).getByText("Review & submit")).toBeInTheDocument();
  });

  it("asks for sign-in only at quote submission", async () => {
    renderAt("/certification/quote?flow=ingelo", "/certification/quote", <CertificationQuotePage />);
    expect(screen.getByText(/for ingelo: is the product manufactured in eswatini/i)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /submit request for quotation/i }));
    expect(requireAuth).not.toHaveBeenCalled(); // validation runs first
    expect(screen.getByText(/organisation name is required/i)).toBeInTheDocument();
  });

  describe("demo mode (VITE_DEMO_MODE=true)", () => {
    beforeEach(() => vi.stubEnv("VITE_DEMO_MODE", "true"));
    afterEach(() => vi.unstubAllEnvs());

    it("tracks a sample case with open non-conformities", async () => {
      renderAt("/certification/CERT-0051", "/certification/:id", <CertificationTrackPage />);
      expect(await screen.findByRole("heading", { name: /non-conformities/i })).toBeInTheDocument();
      expect(screen.getAllByRole("button", { name: /submit corrective action/i }).length).toBe(2);
      expect(screen.getByText("Demo data")).toBeInTheDocument();
    });

    it("lists sample applications and quotes", async () => {
      renderAt("/account/applications", "/account/applications", <AccountApplicationsPage />);
      expect(await screen.findByText("CERT-0051", { exact: false })).toBeInTheDocument();
      expect(screen.getByText(/QTE-00342/)).toBeInTheDocument();
    });
  });

  describe("offline outside demo mode: never fake data or success", () => {
    it("does not invent a case", async () => {
      renderAt("/certification/CERT-0051", "/certification/:id", <CertificationTrackPage />);
      expect(await screen.findByRole("heading", { name: /can’t reach eswasa/i })).toBeInTheDocument();
      expect(screen.queryByText(/non-conformities/i)).not.toBeInTheDocument();
    });

    it("does not show sample applications", async () => {
      renderAt("/account/applications", "/account/applications", <AccountApplicationsPage />);
      expect(await screen.findByText(/can’t reach eswasa right now/i)).toBeInTheDocument();
      expect(screen.queryByText(/CERT-0051/)).not.toBeInTheDocument();
    });

    it("does not claim the register is empty", async () => {
      renderAt("/certification/status?flow=product", "/certification/status", <CertificationStatusPage />);
      expect(await screen.findByText(/the register couldn’t be loaded/i)).toBeInTheDocument();
    });

    it("says a quote request was not sent and offers email", async () => {
      requireAuth.mockReturnValue(true);
      renderAt("/certification/quote?flow=ms", "/certification/quote", <CertificationQuotePage />);
      const type = (name: RegExp, v: string) => userEvent.type(screen.getByRole("textbox", { name }), v);
      await type(/organisation name/i, "Test Co");
      await type(/contact person/i, "T. Test");
      await type(/email address/i, "t@test.sz");
      await type(/phone number/i, "+26876000000");
      await type(/scope of certification/i, "Packing");
      await userEvent.click(within(screen.getByRole("radiogroup", { name: /based in eswatini/i })).getByLabelText("Yes"));
      await userEvent.click(screen.getByRole("button", { name: /submit request for quotation/i }));
      expect(await screen.findByText(/your request was not sent/i)).toBeInTheDocument();
      expect(screen.getByRole("link", { name: /send by email instead/i })).toHaveAttribute(
        "href",
        expect.stringContaining("mailto:certification@eswasa.co.sz"),
      );
      expect(screen.queryByText(/quote request received/i)).not.toBeInTheDocument();
      requireAuth.mockReturnValue(false);
    });
  });
});

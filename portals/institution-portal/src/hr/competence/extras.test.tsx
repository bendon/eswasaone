/** Screen ↔ backend sweep, phase 4: evidence files, training evidence, external personnel (H5d), evidence pack (H5e). */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router-dom";

vi.mock("../../layout/InstitutionLayout", () => ({
  useInstitution: () => ({
    user: { username: "hrm@eswasa.co.sz", full_name: "Nokuthula Shongwe", email: "hrm@eswasa.co.sz", roles: ["HR Manager"] },
    openAuth: () => undefined,
    refreshUser: () => undefined,
    sessionKey: "hr",
  }),
}));

import { AuthorisationDetail } from "./AuthorisationDetail";
import { ExternalPeople } from "./ExternalPeople";
import { EvidencePack } from "./EvidencePack";
import { settingsResponse } from "../../test/hrSettings";

type Call = { url: string; method: string; body: unknown };
let calls: Call[] = [];
let routes: Array<[string, unknown, number?]> = [];
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { "Content-Type": "application/json" } });

beforeEach(() => {
  calls = [];
  routes = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const settings = settingsResponse(url);
      if (settings) return settings;
      const method = (init?.method ?? "GET").toUpperCase();
      const body = init?.body instanceof FormData ? Object.fromEntries(init.body.entries()) : init?.body ? JSON.parse(String(init.body)) : undefined;
      calls.push({ url, method, body });
      const hit = routes
        .filter(([k]) => (/^(GET|POST|PATCH) /.test(k) ? k.startsWith(method + " ") && url.includes(k.split(" ")[1]) : url.includes(k)))
        .sort((a, b) => b[0].length - a[0].length)[0];
      return hit ? json(hit[1], hit[2] ?? 200) : json({ detail: "offline" }, 503);
    }),
  );
});
afterEach(() => vi.unstubAllGlobals());

function at(path: string, pattern: string, el: JSX.Element) {
  const router = createMemoryRouter([{ path: pattern, element: el }], { initialEntries: [path] });
  return render(<RouterProvider router={router} />);
}

const AUTH = {
  id: "SA-7", employee: "HR-EMP-0044", employee_name: "Thandi Mamba", skill: "ISO 9001 lead auditor", valid_from: "2026-11-01", valid_to: "2028-11-01",
  status: "In training", kind: "Audit", scheme: "ISO 9001", approver: null, decides: "Sipho Magagula", person_type: "Employee",
  evidence: [{ evidence_type: "Witnessed audit", reference: "FV-0091", notes: null, id: "EV-1", file: "hr/evidence/x.pdf", link: null }],
};
const TRAINING = { employee: "HR-EMP-0044", skill: "ISO 9001 lead auditor", lms_installed: false, items: [{ source: "Training Result", evidence_type: "Training Result", reference: "TR-0003", title: "ISO 9001 lead auditor course", date: "2026-06-12", result: "Pass", tagged: true }] };

describe("Authorisation evidence", () => {
  it("links evidence files, lists training on record and attaches a file while waiting for approval", async () => {
    routes = [
      ["GET /hr/competence/authorisations/SA-7", AUTH],
      ["/hr/competence/training", TRAINING],
      ["POST /hr/competence/authorisations/SA-7/evidence", AUTH],
    ];
    at("/hr/competence/authorisations/SA-7", "/hr/competence/authorisations/:id", <AuthorisationDetail />);
    expect((await screen.findByRole("link", { name: "Open file" })).getAttribute("href")).toContain("/hr/competence/evidence/EV-1/file");
    expect(await screen.findByText("ISO 9001 lead auditor course")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Add evidence" }));
    expect(await screen.findByText("Choose the kind of evidence.")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Kind"), { target: { value: "Proficiency test" } });
    fireEvent.change(screen.getByLabelText("File"), { target: { files: [new File(["%PDF"], "pt.pdf", { type: "application/pdf" })] } });
    fireEvent.click(screen.getByRole("button", { name: "Add evidence" }));
    expect(await screen.findByRole("status")).toHaveTextContent("Evidence added");
    expect(calls.find((c) => c.method === "POST")!.body).toMatchObject({ evidence_type: "Proficiency test", confirm: "true" });
  });

  it("a decided authorisation can't take new evidence", async () => {
    routes = [["GET /hr/competence/authorisations/SA-7", { ...AUTH, status: "Current", approver: "Sipho Magagula" }], ["/hr/competence/training", TRAINING]];
    at("/hr/competence/authorisations/SA-7", "/hr/competence/authorisations/:id", <AuthorisationDetail />);
    await screen.findByText("Open file");
    expect(screen.queryByRole("button", { name: "Add evidence" })).toBeNull();
  });
});

describe("External personnel (H5d)", () => {
  it("is off until ESWASA decides, with no add form", async () => {
    routes = [["GET /hr/external-people", { enabled: false, items: [] }]];
    at("/x", "/x", <ExternalPeople />);
    expect(await screen.findByText(/The external personnel register is off/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Add external person" })).toBeNull();
  });

  it("lists and adds people when the register is on", async () => {
    routes = [
      ["GET /hr/external-people", { enabled: true, items: [{ id: "EXT-1", full_name: "Lindiwe Khumalo", role: "Contract auditor", status: "Active", organisation: "QA Partners" }] }],
      ["POST /hr/external-people", { id: "EXT-2", full_name: "Bheki Nkosi", role: "TC expert", status: "Active" }, 201],
    ];
    at("/x", "/x", <ExternalPeople />);
    expect(await screen.findByText("Lindiwe Khumalo")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Add external person" }));
    fireEvent.change(screen.getByLabelText("Full name"), { target: { value: "Bheki Nkosi" } });
    fireEvent.change(screen.getByLabelText("Role"), { target: { value: "TC expert" } });
    fireEvent.click(screen.getByRole("button", { name: "Add" }));
    expect(await screen.findByRole("status")).toHaveTextContent("Bheki Nkosi added");
    expect(calls.find((c) => c.method === "POST")!.body).toEqual({ full_name: "Bheki Nkosi", role: "TC expert", confirm: true });
  });
});

describe("Evidence pack (H5e)", () => {
  it("starts a pack, polls it and links the download when ready", async () => {
    routes = [
      ["/hr/employees?limit=500", { items: [{ id: "HR-EMP-0044", employee_name: "Thandi Mamba" }] }],
      ["POST /hr/evidence-pack", { id: "PACK-1", status: "Queued", scope: { kind: "employee", value: "HR-EMP-0044" }, people: 1, ready: false }, 202],
      ["GET /hr/evidence-pack/PACK-1", { id: "PACK-1", status: "Ready", scope: { kind: "employee", value: "HR-EMP-0044" }, people: 1, ready: true, finished_on: "2026-10-12" }],
    ];
    at("/hr/competence/pack", "/hr/competence/pack", <EvidencePack />);
    await screen.findByRole("option", { name: "Thandi Mamba" });
    fireEvent.change(screen.getByLabelText("Which"), { target: { value: "HR-EMP-0044" } });
    fireEvent.click(screen.getByRole("button", { name: "Build the pack" }));
    const link = await screen.findByRole("link", { name: "Download ZIP" });
    expect(link.getAttribute("href")).toContain("/hr/evidence-pack/PACK-1/download");
    expect(calls.find((c) => c.method === "POST")!.body).toEqual({ employee: "HR-EMP-0044", sections: ["authorisations", "monitoring", "declarations", "training"], confirm: true });
  });

  it("shows a failed build and the server's refusal to start", async () => {
    routes = [
      ["/hr/employees?limit=500", { items: [{ id: "HR-EMP-0044", employee_name: "Thandi Mamba" }] }],
      ["POST /hr/evidence-pack", { detail: "Only an HR Manager or the Quality Manager can build the evidence pack." }, 403],
    ];
    at("/hr/competence/pack", "/hr/competence/pack", <EvidencePack />);
    await screen.findByRole("option", { name: "Thandi Mamba" });
    fireEvent.change(screen.getByLabelText("Which"), { target: { value: "HR-EMP-0044" } });
    fireEvent.click(screen.getByRole("button", { name: "Build the pack" }));
    expect(await screen.findByText(/Only an HR Manager or the Quality Manager/)).toBeInTheDocument();
  });

  it("a failed job says so", async () => {
    routes = [["GET /hr/evidence-pack/PACK-2", { id: "PACK-2", status: "Failed", scope: {}, people: 0, ready: false, error: "No people in that scheme." }]];
    at("/hr/competence/pack?job=PACK-2", "/hr/competence/pack", <EvidencePack />);
    await waitFor(() => expect(screen.getByText("No people in that scheme.")).toBeInTheDocument());
    expect(screen.queryByRole("link", { name: "Download ZIP" })).toBeNull();
  });
});

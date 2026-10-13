/**
 * Staff authorisations journey (J4): H5 matrix, H5a record, H5b detail, E8 my authorisations.
 * Core is stubbed at fetch; who decides and four-eyes are server rules, so their text is shown as-is.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { createMemoryRouter, Outlet, RouterProvider } from "react-router-dom";

vi.mock("../../layout/InstitutionLayout", () => ({
  useInstitution: () => ({
    user: { username: "hr@eswasa.co.sz", full_name: "Nokuthula Shongwe", email: "hr@eswasa.co.sz", roles: ["HR Manager"] },
    openAuth: () => undefined,
    refreshUser: () => undefined,
    sessionKey: "hr",
  }),
}));

import { CompetenceView } from "../CompetenceView";
import { RecordAuthorisation } from "./RecordAuthorisation";
import { AuthorisationDetail } from "./AuthorisationDetail";
import { MyCompetence } from "../../me/MyCompetence";
import { settingsResponse } from "../../test/hrSettings";

const MATRIX = {
  skills: [
    { name: "FSMS lead auditor", kind: "Audit", scheme: "ISO 22000", validity_months: 36, holders: 2, expiring: 1 },
    { name: "OH&S auditor", kind: "Audit", scheme: "ISO 45001", validity_months: 36, holders: 1, expiring: 0 },
  ],
  people: [
    { employee: "EMP-44", employee_name: "Thandi Mamba", cells: { "FSMS lead auditor": { id: "SA-0001", status: "Expiring", valid_to: "2026-11-30" } } },
    { employee: "EMP-61", employee_name: "Lindiwe Simelane", cells: { "OH&S auditor": { id: "SA-0002", status: "Current", valid_to: "2028-03-01" } } },
  ],
};
const EXPIRING = { items: [{ id: "SA-0001", employee: "EMP-44", employee_name: "Thandi Mamba", skill: "FSMS lead auditor", valid_from: "2023-12-01", valid_to: "2026-11-30", status: "Expiring" }] };
const DETAIL = { ...EXPIRING.items[0], kind: "Audit", scheme: "ISO 22000", approver: "Nomvula Tsabedze", decides: "Nomvula Tsabedze", evidence: [{ evidence_type: "Witnessed audit", reference: "FV-0091", notes: "Witnessed by Zanele Nkosi" }] };

type Call = { url: string; method: string; body?: Record<string, unknown> };
function stub(over: Record<string, { status?: number; body: unknown }> = {}) {
  const calls: Call[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const settings = settingsResponse(url);
      if (settings) return settings;
      const method = (init?.method ?? "GET").toUpperCase();
      calls.push({ url, method, body: init?.body ? JSON.parse(String(init.body)) : undefined });
      const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { "Content-Type": "application/json" } });
      for (const [key, v] of Object.entries(over)) {
        const [m, path] = key.includes(" ") ? key.split(" ") : ["GET", key];
        if (m === method && url.includes(path)) return json(v.body, v.status ?? 200);
      }
      if (url.includes("/hr/competence/matrix")) return json(MATRIX);
      if (url.includes("/hr/competence/expiring")) return json(EXPIRING);
      if (url.includes("/hr/competence/authorisations/")) return json(DETAIL);
      if (url.includes("/hr/employees")) return json({ items: [{ id: "EMP-44", employee_name: "Thandi Mamba", designation: "Lead Auditor" }] });
      if (url.includes("/hr/me/competence")) return json(EXPIRING);
      return json({ detail: "offline" }, 503);
    }),
  );
  return calls;
}

function mount(path: string) {
  const router = createMemoryRouter(
    [
      {
        path: "/",
        element: <Outlet />,
        children: [
          { path: "hr/competence", element: <CompetenceView /> },
          { path: "hr/competence/new", element: <RecordAuthorisation /> },
          { path: "hr/competence/authorisations/:id", element: <AuthorisationDetail /> },
          { path: "me/competence", element: <MyCompetence /> },
        ],
      },
    ],
    { initialEntries: [path] },
  );
  return render(<RouterProvider router={router} />);
}

afterEach(() => vi.unstubAllGlobals());

describe("Competence matrix (H5)", () => {
  it("shows people × competences, thin cover and what is ending", async () => {
    stub();
    mount("/hr/competence");
    expect(await screen.findByText("Thandi Mamba")).toBeInTheDocument();
    expect(screen.getByText("1 competence has one holder or none")).toBeInTheDocument();
    expect(screen.getByText("1 person only")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Thandi Mamba, FSMS lead auditor: Expiring" })).toHaveAttribute("href", "/hr/competence/authorisations/SA-0001");
    const renew = await screen.findByRole("link", { name: "Renew" });
    expect(renew).toHaveAttribute("href", "/hr/competence/new?employee=EMP-44&skill=FSMS%20lead%20auditor");
  });
});

describe("Record an authorisation (H5a)", () => {
  it("needs evidence, then sends it to the head of department", async () => {
    const calls = stub({ "POST /hr/competence/authorisations": { status: 201, body: { ...DETAIL, id: "SA-0003", status: "In training", valid_from: "2026-12-01", valid_to: "2029-11-30" } } });
    mount("/hr/competence/new?employee=EMP-44&skill=FSMS%20lead%20auditor");
    expect(await screen.findByRole("heading", { name: "Renew an authorisation" })).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Valid from"), { target: { value: "2026-12-01" } });
    const send = screen.getByRole("button", { name: "Send for approval" });
    expect(send).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Kind"), { target: { value: "Training Result" } });
    fireEvent.change(screen.getByLabelText("Reference"), { target: { value: "ISO 22000 refresher, 4 Nov" } });
    await waitFor(() => expect(send).toBeEnabled());
    fireEvent.click(send);
    expect(await screen.findByRole("heading", { name: "Sent for approval" })).toBeInTheDocument();
    expect(screen.getAllByText("Nomvula Tsabedze approves").length).toBeGreaterThan(0);
    const post = calls.find((c) => c.method === "POST");
    expect(post?.body).toMatchObject({
      employee: "EMP-44", skill: "FSMS lead auditor", valid_from: "2026-12-01", valid_to: null, confirm: true,
      evidence: [{ evidence_type: "Training Result", reference: "ISO 22000 refresher, 4 Nov", notes: null }],
    });
  });

  it("shows the server's reason when there is nobody to approve", async () => {
    stub({ "POST /hr/competence/authorisations": { status: 422, body: { detail: "This department has no head set. Set one in Structure before sending authorisations." } } });
    mount("/hr/competence/new?employee=EMP-44&skill=FSMS%20lead%20auditor");
    await screen.findByRole("heading", { name: "Renew an authorisation" });
    fireEvent.change(screen.getByLabelText("Valid from"), { target: { value: "2026-12-01" } });
    fireEvent.change(screen.getByLabelText("Kind"), { target: { value: "File" } });
    fireEvent.change(screen.getByLabelText("Reference"), { target: { value: "Certificate" } });
    fireEvent.click(screen.getByRole("button", { name: "Send for approval" }));
    expect(await screen.findByText(/no head set/)).toBeInTheDocument();
  });
});

describe("Authorisation detail (H5b)", () => {
  it("warns before it ends and offers renewal", async () => {
    stub();
    mount("/hr/competence/authorisations/SA-0001");
    expect(await screen.findByRole("heading", { name: "Thandi Mamba: FSMS lead auditor" })).toBeInTheDocument();
    expect(screen.getByText("Ends 30 Nov 2026")).toBeInTheDocument();
    expect(screen.getByText("FV-0091")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Renew" })).toHaveAttribute("href", "/hr/competence/new?employee=EMP-44&skill=FSMS%20lead%20auditor");
  });
});

describe("My authorisations (E8)", () => {
  it("asks HR to renew with what has been done", async () => {
    const calls = stub({ "POST /hr/me/competence/renewal": { body: { sent_to: 2 } } });
    mount("/me/competence");
    const box = (await screen.findByRole("heading", { name: "Renew FSMS lead auditor" })).closest(".hr-box") as HTMLElement;
    const ask = within(box).getByRole("button", { name: "Ask HR to renew" });
    expect(ask).toBeDisabled();
    fireEvent.change(within(box).getByLabelText(/^What have you done towards it/), { target: { value: "Refresher course on 4 Nov" } });
    fireEvent.click(ask);
    expect(await screen.findByText("HR prepares the renewal of FSMS lead auditor")).toBeInTheDocument();
    expect(calls.find((c) => c.method === "POST")?.body).toEqual({ skill: "FSMS lead auditor", note: "Refresher course on 4 Nov", confirm: true });
  });
});

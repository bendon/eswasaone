/** Recruitment part 1 (J2, HR side): requisitions list, raise for a vacant post, publish. Core stubbed. */
import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router-dom";

vi.mock("../../layout/InstitutionLayout", () => ({
  useInstitution: () => ({
    user: { username: "hr@eswasa.co.sz", full_name: "Nokuthula Shongwe", email: "hr@eswasa.co.sz", roles: ["HR Manager"] },
    openAuth: () => undefined,
    refreshUser: () => undefined,
    sessionKey: "hr",
  }),
}));

import { RequisitionsView } from "./RequisitionsView";
import { RaiseRequisition } from "./RaiseRequisition";
import { PublishOpening } from "./PublishOpening";
import { settingsResponse } from "../../test/hrSettings";

const APPROVED = { id: "HR-HIREQ-0001", designation: "Certification Officer", department: "Certification", status: "Open & Approved",
  requested_by: "Nomvula Tsabedze", posting_date: "2026-10-12", opening: null, applicants: {} };
const PUBLISHED = { ...APPROVED, id: "HR-HIREQ-0002", designation: "Metrologist, volume", department: "Metrology & Laboratories",
  opening: { id: "HR-OPN-0001", status: "Open", published: true, closes_on: "2026-10-30" }, applicants: { Open: 9, Shortlisted: 3 } };
const VACANT = [{ department: "Certification", designation: "Certification Officer", approved: 5, filled: 4, in_recruitment: 0, vacant: 1 }];

type Call = { url: string; method: string; body?: Record<string, unknown> };
function stub(opts: { reqs?: unknown[]; vac?: unknown[]; post?: { status?: number; body: unknown } } = {}) {
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
      if (method === "POST") return json(opts.post?.body ?? {}, opts.post?.status ?? 200);
      if (url.includes("/hr/recruitment/vacancies")) return json({ items: opts.vac ?? VACANT });
      if (url.includes("/hr/recruitment")) return json({ items: opts.reqs ?? [APPROVED, PUBLISHED] });
      return json({ detail: "offline" }, 503);
    }),
  );
  return calls;
}

function mount(path: string) {
  const router = createMemoryRouter(
    [
      { path: "/hr/recruitment", element: <RequisitionsView /> },
      { path: "/hr/recruitment/new", element: <RaiseRequisition /> },
      { path: "/hr/recruitment/:id/publish", element: <PublishOpening /> },
    ],
    { initialEntries: [path] },
  );
  return render(<RouterProvider router={router} />);
}

afterEach(() => vi.unstubAllGlobals());

describe("Requisitions (H6)", () => {
  it("shows status, advert and candidates, and points to the next step", async () => {
    stub();
    mount("/hr/recruitment");
    expect(await screen.findByText("Certification Officer")).toBeInTheDocument();
    expect(screen.getByText("On the careers page")).toBeInTheDocument();
    expect(screen.getByText("9").closest("span")).toHaveTextContent("9Applied");
    expect(screen.getByText("Advertise Certification Officer")).toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: "Publish" })[0]).toHaveAttribute("href", "/hr/recruitment/HR-HIREQ-0001/publish");
    expect(screen.getByText(/1 vacant post not started/)).toBeInTheDocument();
  });
});

describe("Raise a requisition (H6a)", () => {
  it("offers vacant posts only and sends a complete request", async () => {
    const calls = stub({ post: { status: 201, body: { ...APPROVED, status: "Pending", id: "HR-HIREQ-0003" } } });
    mount("/hr/recruitment/new");
    fireEvent.click(await screen.findByLabelText(/Certification Officer/));
    const send = screen.getByRole("button", { name: "Send for approval" });
    expect(send).toBeDisabled();
    fireEvent.change(screen.getByLabelText(/^Job description/), { target: { value: "Review certification applications and plan audits." } });
    fireEvent.change(screen.getByLabelText(/^Budgeted monthly pay/), { target: { value: "24000" } });
    await waitFor(() => expect(send).toBeEnabled());
    fireEvent.click(send);
    expect(await screen.findByRole("heading", { name: "Requisition sent" })).toBeInTheDocument();
    expect(calls.find((c) => c.method === "POST")?.body).toMatchObject({
      designation: "Certification Officer", department: "Certification", expected_compensation: 24000, confirm: true,
    });
  });

  it("explains what to do when no post is vacant", async () => {
    stub({ vac: [] });
    mount("/hr/recruitment/new");
    expect(await screen.findByText("No approved post has a vacancy")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Open Structure/ })).toHaveAttribute("href", "/hr/structure");
  });
});

describe("Publish (J2)", () => {
  it("publishes an approved requisition with a closing date", async () => {
    const calls = stub({ post: { body: { ...APPROVED, opening: { id: "HR-OPN-0003", status: "Open", published: true, closes_on: "2026-10-30" } } } });
    mount("/hr/recruitment/HR-HIREQ-0001/publish");
    const btn = await screen.findByRole("button", { name: "Publish to careers page" });
    expect(btn).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Closing date"), { target: { value: "2026-10-30" } });
    fireEvent.click(btn);
    expect(await screen.findByRole("heading", { name: "On the careers page" })).toBeInTheDocument();
    expect(calls.find((c) => c.method === "POST")?.url).toMatch(/requisitions\/HR-HIREQ-0001\/publish$/);
  });

  it("won't publish one that is already advertised", async () => {
    stub();
    mount("/hr/recruitment/HR-HIREQ-0002/publish");
    expect(await screen.findByText("Already advertised")).toBeInTheDocument();
  });
});

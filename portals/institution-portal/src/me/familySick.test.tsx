/**
 * HR additions plans 04 and 08 on My HR: the medical certificate (upload only when required, link in the body,
 * late "Add certificate"), and family and medical (own view logged, dependant request with shares).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router-dom";

vi.mock("../layout/InstitutionLayout", () => ({
  useInstitution: () => ({
    user: { username: "thandi@eswasa.co.sz", full_name: "Thandi Mamba", email: "thandi@eswasa.co.sz", roles: ["Employee"] },
    openAuth: () => undefined,
    refreshUser: () => undefined,
    sessionKey: "thandi",
  }),
}));

const uploads: File[] = [];
vi.mock("@eswasaone/shared-ui", async (orig) => ({
  ...(await orig<typeof import("@eswasaone/shared-ui")>()),
  uploadMedia: vi.fn(async (file: File) => {
    uploads.push(file);
    return { url: `/api/media/hr/evidence/${file.name}` };
  }),
}));

import { ApplyLeave } from "./ApplyLeave";
import { MyLeave } from "./MyLeave";
import { DependantRequest, MyFamilyBox } from "./MyFamily";
import { settingsResponse } from "../test/hrSettings";

type Call = { url: string; method: string; body: unknown };
let calls: Call[] = [];
let routes: Array<[string, unknown, number?]> = [];

function json(b: unknown, status = 200) {
  return new Response(JSON.stringify(b), { status, headers: { "Content-Type": "application/json" } });
}

beforeEach(() => {
  calls = [];
  routes = [];
  uploads.length = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const settings = settingsResponse(url);
      if (settings) return settings;
      const method = (init?.method ?? "GET").toUpperCase();
      calls.push({ url, method, body: init?.body ? JSON.parse(String(init.body)) : undefined });
      const hit = routes
        .filter(([k]) => (/^(GET|POST) /.test(k) ? k.startsWith(method + " ") && url.includes(k.split(" ")[1]) : url.includes(k)))
        .sort((a, b) => b[0].length - a[0].length)[0];
      return hit ? json(hit[1], hit[2] ?? 200) : json({ detail: "offline" }, 503);
    }),
  );
});
afterEach(() => vi.unstubAllGlobals());

function mount(el: JSX.Element) {
  const router = createMemoryRouter([{ path: "*", element: el }], { initialEntries: ["/"] });
  return render(<RouterProvider router={router} />);
}

const ME = {
  linked: true,
  employee: { id: "HR-EMP-0044", employee_name: "Thandi Mamba" },
  leave_approver: { user: "sipho@x", name: "Sipho Magagula" },
  balances: [{ leave_type: "Sick Leave", allocated: 14, used: 2, balance: 12 }],
  leave: [{ id: "LV-7", employee: "Thandi", leave_type: "Sick Leave", from_date: "2026-10-12", to_date: "2026-10-15", status: "Open" }],
};
const PREVIEW = { days: 3, balance: 12, balance_after: 9, approver: { user: "sipho@x", name: "Sipho Magagula" }, conflicts: [], warnings: [] };
const file = new File(["%PDF"], "cert.pdf", { type: "application/pdf" });

async function fillDates() {
  await screen.findByText("Sick Leave");
  fireEvent.change(screen.getByLabelText("From"), { target: { value: "2099-11-02" } });
  fireEvent.change(screen.getByLabelText("To"), { target: { value: "2099-11-04" } });
}

describe("Medical certificate on Apply for leave (plan 08)", () => {
  it("asks for no file when the leave type has no threshold", async () => {
    routes = [["/hr/me", ME], ["/hr/leave/preview", PREVIEW]];
    mount(<ApplyLeave />);
    await fillDates();
    await waitFor(() => expect(screen.getByRole("button", { name: "Send to Sipho Magagula" })).toBeEnabled());
    expect(screen.queryByLabelText(/Medical certificate/)).not.toBeInTheDocument();
  });

  it("needs the file over the threshold, uploads it first and sends the link", async () => {
    routes = [
      ["/hr/me", ME],
      ["/hr/leave/preview", { ...PREVIEW, certificate_required: true, certificate_after_days: 2 }],
      ["POST /hr/leave", { id: "LV-8", employee: "Thandi", leave_type: "Sick Leave", from_date: "2099-11-02", to_date: "2099-11-04", status: "Open" }],
    ];
    mount(<ApplyLeave />);
    await fillDates();
    const input = await screen.findByLabelText(/Medical certificate \(needed\)/);
    expect(screen.getByText(/more than 2 days needs one/)).toBeInTheDocument();
    const send = screen.getByRole("button", { name: "Send to Sipho Magagula" });
    expect(send).toBeDisabled();
    fireEvent.change(input, { target: { files: [file] } });
    await waitFor(() => expect(send).toBeEnabled());
    fireEvent.click(send);
    expect(await screen.findByRole("heading", { name: "Leave request sent" })).toBeInTheDocument();
    expect(uploads).toEqual([file]);
    const post = calls.find((c) => c.method === "POST" && c.url.endsWith("/hr/leave"));
    expect(post?.body).toMatchObject({ leave_type: "Sick Leave", certificate: "/api/media/hr/evidence/cert.pdf", confirm: true });
  });
});

describe("Add certificate on My leave (plan 08)", () => {
  it("offers it on an open request that needs one and posts the link with confirm", async () => {
    routes = [
      ["/hr/me", ME],
      ["/hr/leave/requests", { items: [{ id: "LV-7", status: "Open", overdue: false, escalated: false, certificate_required: true, has_certificate: false }] }],
      ["POST /hr/me/leave/LV-7/certificate", { ok: true, name: "LV-7", has_certificate: true }],
    ];
    mount(<MyLeave />);
    fireEvent.click(await screen.findByRole("button", { name: "Add certificate" }));
    fireEvent.change(screen.getByLabelText("Medical certificate"), { target: { files: [file] } });
    fireEvent.click(screen.getByRole("button", { name: "Send certificate" }));
    expect(await screen.findByRole("status")).toHaveTextContent("HR will check it");
    const post = calls.find((c) => c.method === "POST");
    expect(post?.url).toMatch(/\/hr\/me\/leave\/LV-7\/certificate$/);
    expect(post?.body).toEqual({ certificate: "/api/media/hr/evidence/cert.pdf", confirm: true });
  });
});

const FAMILY = {
  employee: "HR-EMP-0044", employee_name: "Thandi Mamba", level: 3, level_label: "Family and medical", log: "LOG-3",
  fields: [{ field: "custom_medical_aid_scheme", label: "Medical aid scheme", value: "Swazi Med" }],
  tables: [{ label: "Dependants", columns: ["Name", "Relationship", "Beneficiary share (%)"],
             rows: [{ id: "D1", Name: "Sipho Mamba", Relationship: "Spouse", "Beneficiary share (%)": "100" }] }],
};

describe("Family and medical on My profile (plan 04)", () => {
  it("stays hidden until shown, then reads the logged own view", async () => {
    routes = [["/hr/me/sensitive", FAMILY]];
    mount(<MyFamilyBox />);
    expect(calls.filter((c) => c.url.includes("/hr/me/sensitive"))).toHaveLength(0);
    fireEvent.click(screen.getByRole("button", { name: "Show (this is logged)" }));
    expect(await screen.findByText("Swazi Med")).toBeInTheDocument();
    expect(screen.getByRole("table", { name: "Dependants" })).toHaveTextContent("Sipho Mamba");
    expect(calls.find((c) => c.url.includes("/hr/me/sensitive"))?.url).toMatch(/level=3$/);
  });

  it("needs evidence to add a dependant, then sends the row and rebalanced shares", async () => {
    routes = [["/hr/me/sensitive", FAMILY], ["POST /hr/me/profile-changes", { id: "PCR-2", kind: "dependant_add", field: "custom_dependants", status: "Pending" }]];
    mount(<DependantRequest />);
    fireEvent.click(screen.getByRole("button", { name: /Load my dependants/ }));
    const other = await screen.findByLabelText("Sipho Mamba");
    fireEvent.change(screen.getByLabelText("Full name"), { target: { value: "Lwazi Mamba" } });
    fireEvent.change(screen.getByLabelText("Relationship"), { target: { value: "Child" } });
    fireEvent.change(screen.getByLabelText(/^Beneficiary share \(%\)/), { target: { value: "40" } });
    fireEvent.change(other, { target: { value: "60" } });
    fireEvent.change(screen.getByLabelText("Why it changes"), { target: { value: "New baby" } });
    fireEvent.click(screen.getByRole("button", { name: "Send dependant change" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("birth or marriage certificate");
    expect(calls.some((c) => c.method === "POST")).toBe(false);

    fireEvent.change(screen.getByLabelText(/Dependant evidence/), { target: { files: [file] } });
    fireEvent.click(screen.getByRole("button", { name: "Send dependant change" }));
    expect(await screen.findByRole("status")).toHaveTextContent("An HR Manager decides it");
    expect(calls.find((c) => c.method === "POST")!.body).toEqual({
      kind: "dependant_add",
      reason: "New baby",
      evidence: "/api/media/hr/evidence/cert.pdf",
      row: { full_name: "Lwazi Mamba", relationship: "Child", on_medical_aid: 0, beneficiary_share: 40 },
      shares: { D1: 60 },
      confirm: true,
    });
  });
});

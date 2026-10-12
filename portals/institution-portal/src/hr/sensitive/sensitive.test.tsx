/** Sensitive data (J12): reason before showing, POST with the reason in the body, access log, My HR view. */
import { afterEach, describe, expect, it, vi } from "vitest";
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

import { AccessLogSection, MyAccessLog, SensitivePanel } from "./Sensitive";

const VIEW = { employee: "EMP-9", employee_name: "Thandi Nxumalo", level: 2, level_label: "Pay and bank",
  fields: [{ field: "bank_name", label: "Bank", value: "Standard Bank" }, { field: "bank_ac_no", label: "Account number", value: null }], log: "LOG-1" };
const LOG = { employee: "EMP-9", employee_name: "Thandi Nxumalo", can_open: [1, 2],
  items: [{ id: "LOG-1", viewer: "hrm@x", viewer_name: "Nokuthula Shongwe", level: "Pay and bank", reason: "Bank change form received", viewed_on: "2026-10-12 09:30:00" }] };

type Call = { url: string; method: string; body?: Record<string, unknown> };
function stub(opts: { denyLog?: boolean; emptyLog?: boolean } = {}) {
  const calls: Call[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = (init?.method ?? "GET").toUpperCase();
      calls.push({ url, method, body: init?.body ? JSON.parse(String(init.body)) : undefined });
      const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { "Content-Type": "application/json" } });
      if (method === "POST") return json(VIEW);
      if (url.includes("access-log")) {
        if (opts.denyLog) return json({ detail: "You don't have permission" }, 403);
        return json(opts.emptyLog ? { ...LOG, items: [] } : LOG);
      }
      return json({ detail: "offline" }, 503);
    }),
  );
  return calls;
}

function mount(el: JSX.Element, path = "/") {
  const router = createMemoryRouter([{ path: "*", element: el }], { initialEntries: [path] });
  return render(<RouterProvider router={router} />);
}

afterEach(() => vi.unstubAllGlobals());

describe("Show details", () => {
  it("needs a reason, then posts it in the body and shows the fields", async () => {
    const calls = stub();
    mount(<SensitivePanel employee="EMP-9" />);
    fireEvent.click(screen.getByRole("button", { name: "Show details" }));
    fireEvent.click(screen.getByRole("radio", { name: /Pay and bank/ }));
    const go = screen.getByRole("button", { name: "Show and record" });
    fireEvent.change(screen.getByLabelText(/Why do you need them/), { target: { value: "check" } });
    expect(go).toBeDisabled();
    fireEvent.change(screen.getByLabelText(/Why do you need them/), { target: { value: "Bank change form received" } });
    fireEvent.click(go);
    expect(await screen.findByText("Standard Bank")).toBeInTheDocument();
    expect(screen.getByText(/recorded against your name/)).toBeInTheDocument();
    const post = calls.find((c) => c.method === "POST");
    expect(post?.url).toMatch(/\/hr\/employees\/EMP-9\/sensitive$/);
    expect(post?.body).toEqual({ level: 2, reason: "Bank change form received", confirm: true });
    fireEvent.click(screen.getByRole("button", { name: "Hide details" }));
    expect(screen.queryByText("Standard Bank")).not.toBeInTheDocument();
  });
});

describe("Access log", () => {
  it("lists who looked and why", async () => {
    stub();
    mount(<AccessLogSection employee="EMP-9" />);
    expect(await screen.findByText("Bank change form received")).toBeInTheDocument();
    expect(screen.getByText("Nokuthula Shongwe")).toBeInTheDocument();
  });

  it("says so when the viewer may not see it", async () => {
    stub({ denyLog: true });
    mount(<AccessLogSection employee="EMP-9" />);
    expect(await screen.findByText(/Only HR Managers and the person/)).toBeInTheDocument();
  });

  it("shows the person who looked at their record", async () => {
    stub({ emptyLog: true });
    mount(<MyAccessLog />, "/me/access-log");
    expect(await screen.findByText("No one has opened your personal or pay details")).toBeInTheDocument();
  });
});

describe("Directory drawer", () => {
  it("no longer shows a disabled Coming soon button", async () => {
    stub();
    mount(<SensitivePanel employee="EMP-9" />);
    await waitFor(() => expect(screen.getByRole("button", { name: "Show details" })).toBeEnabled());
    expect(screen.queryByTitle("Coming soon")).not.toBeInTheDocument();
  });
});

/** HR additions plan 03: the record Letters tab, the warning letter on a case, and E12 My letters. */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";

const who = vi.hoisted(() => ({ roles: ["HR Manager"] }));
vi.mock("../../layout/InstitutionLayout", () => ({
  useInstitution: () => ({
    user: { username: "hrm@eswasa.co.sz", full_name: "Nokuthula Shongwe", email: "hrm@eswasa.co.sz", roles: who.roles },
    openAuth: () => undefined,
    refreshUser: () => undefined,
    sessionKey: "hr",
  }),
}));

import { LetterLink, LettersPanel, WarningLetterLink } from "./Letters";
import { MyLetters } from "../../me/MyLetters";
import { settingsResponse } from "../../test/hrSettings";

type Call = { url: string; method: string; body?: Record<string, unknown> };
let calls: Call[] = [];
let routes: Array<[string, unknown, number?]> = [];
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { "Content-Type": "application/json" } });

beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn();
  calls = [];
  routes = [];
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
afterEach(() => {
  vi.unstubAllGlobals();
  who.roles = ["HR Manager"];
});

const TYPES = [
  { letter_type: "Promotion", ready: true, source_doctype: "Employee Promotion" },
  { letter_type: "Transfer", ready: false, reason: "Awaiting ESWASA (A3): no wording for Transfer.", source_doctype: "Employee Transfer" },
  { letter_type: "Employment confirmation", ready: true, requested: true },
  { letter_type: "Certificate of service", ready: true, generated_here: false },
];
const ISSUED = { name: "HRL-2026-00001", employee: "HR-EMP-0044", letter_type: "Promotion", source_name: "PROM-1", status: "Issued", issued_on: "2026-10-16", has_file: true };
const REQUESTED = { name: "HRL-2026-00002", employee: "HR-EMP-0044", letter_type: "Employment confirmation", purpose: "Bank", addressed_to: "Standard Bank",
  status: "Requested", requested_on: "2026-10-15", has_file: false };
const LIST = {
  employee: "HR-EMP-0044",
  employee_name: "Thandi Mamba",
  types: TYPES,
  can_cancel: true,
  letters: [REQUESTED],
  eligible: [
    { letter_type: "Promotion", source_doctype: "Employee Promotion", source_name: "PROM-1", label: "Promotion on 2026-10-01", date: "2026-10-01" },
    { letter_type: "Transfer", source_doctype: "Employee Transfer", source_name: "TRF-1", label: "Transfer on 2026-08-01", date: "2026-08-01" },
  ],
};
const MADE = { ...LIST, letters: [ISSUED, REQUESTED], eligible: [{ ...LIST.eligible[0], letter: "HRL-2026-00001" }, LIST.eligible[1]] };

describe("Record Letters tab", () => {
  it("disables a type without wording and generates from the approved record with confirm", async () => {
    routes = [
      ["GET /hr/employees/HR-EMP-0044/letters", LIST],
      ["POST /hr/employees/HR-EMP-0044/letters", MADE],
    ];
    render(<LettersPanel employee="HR-EMP-0044" />);
    expect(await screen.findByText("Transfer on 2026-08-01")).toBeInTheDocument();
    expect(screen.getAllByText("Awaiting ESWASA (A3): no wording for Transfer.").length).toBeGreaterThan(0);
    const buttons = screen.getAllByRole("button", { name: "Generate letter" });
    expect(buttons).toHaveLength(2);
    expect(buttons[1]).toBeDisabled(); // Transfer: no wording yet
    fireEvent.click(buttons[0]);
    const drawer = await screen.findByRole("dialog", { name: "Promotion letter" });
    fireEvent.change(within(drawer).getByRole("textbox"), { target: { value: "To whom it may concern" } });
    fireEvent.click(within(drawer).getByRole("button", { name: "Generate letter" }));
    await waitFor(() => expect(calls.some((c) => c.method === "POST")).toBe(true));
    const post = calls.find((c) => c.method === "POST")!;
    expect(post.body).toEqual({ letter_type: "Promotion", source_name: "PROM-1", addressed_to: "To whom it may concern", confirm: true });
    const link = await screen.findByRole("link", { name: "Letter (PDF)" });
    expect(link.getAttribute("href")).toContain("/hr/letters/HRL-2026-00001/file");
    expect(link.getAttribute("target")).toBe("_blank");
    expect(screen.getByRole("link", { name: "Open PDF" }).getAttribute("href")).toContain("/hr/letters/HRL-2026-00001/file");
  });

  it("prepares a staff request", async () => {
    routes = [
      ["GET /hr/employees/HR-EMP-0044/letters", LIST],
      ["POST /hr/letters/HRL-2026-00002/generate", { ...LIST, letters: [{ ...REQUESTED, status: "Issued", has_file: true, issued_on: "2026-10-16" }] }],
    ];
    render(<LettersPanel employee="HR-EMP-0044" />);
    fireEvent.click(await screen.findByRole("button", { name: "Prepare" }));
    const drawer = await screen.findByRole("dialog", { name: "Prepare employment confirmation letter" });
    expect(within(drawer).getByRole("textbox")).toHaveValue("Standard Bank");
    fireEvent.click(within(drawer).getByRole("button", { name: "Generate letter" }));
    await waitFor(() => expect(calls.find((c) => c.method === "POST")?.body).toEqual({ addressed_to: "Standard Bank", confirm: true }));
    expect(await screen.findByText("Issued")).toBeInTheDocument();
  });

  it("shows the server's sentence when a letter is refused", async () => {
    routes = [
      ["GET /hr/employees/HR-EMP-0044/letters", LIST],
      ["POST /hr/employees/HR-EMP-0044/letters", { detail: "The letter can only be made once the change is approved or done." }, 422],
    ];
    render(<LettersPanel employee="HR-EMP-0044" />);
    fireEvent.click((await screen.findAllByRole("button", { name: "Generate letter" }))[0]);
    const drawer = await screen.findByRole("dialog", { name: "Promotion letter" });
    fireEvent.click(within(drawer).getByRole("button", { name: "Generate letter" }));
    expect(await within(drawer).findByText(/approved or done/)).toBeInTheDocument();
  });
});

describe("Letter links where the event happens", () => {
  it("shows Letter (PDF) once made, and nothing for someone outside HR", async () => {
    routes = [["GET /hr/employees/HR-EMP-0044/letters", MADE]];
    const { unmount } = render(<LetterLink employee="HR-EMP-0044" sourceName="PROM-1" />);
    expect(await screen.findByRole("link", { name: "Letter (PDF)" })).toBeInTheDocument();
    unmount();
    who.roles = ["Employee"];
    calls = [];
    const { container } = render(<LetterLink employee="HR-EMP-0044" sourceName="PROM-1" />);
    expect(container).toBeEmptyDOMElement();
    expect(calls.filter((c) => c.url.includes("/letters"))).toHaveLength(0);
  });

  it("makes the warning letter from the case", async () => {
    routes = [["POST /hr/employees/HR-EMP-0044/letters", { ...LIST, letters: [] }]];
    const onMade = vi.fn();
    render(<WarningLetterLink employee="HR-EMP-0044" caseId="HRC-2026-00001" onMade={onMade} />);
    fireEvent.click(screen.getByRole("button", { name: "Generate warning letter" }));
    await waitFor(() => expect(onMade).toHaveBeenCalled());
    expect(calls[0].body).toEqual({ letter_type: "Warning", source_name: "HRC-2026-00001", confirm: true });
  });
});

describe("My letters (E12)", () => {
  it("asks for an employment confirmation letter, then shows it as requested", async () => {
    who.roles = ["Employee"];
    routes = [
      ["GET /hr/me/letters", { employee: "HR-EMP-0044", letters: [], can_request: true, ready: true }],
      ["POST /hr/me/letters", { employee: "HR-EMP-0044", letters: [REQUESTED], can_request: false, ready: true }],
    ];
    render(<MyLetters />);
    expect(await screen.findByText("No letters yet")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Ask for a confirmation letter" }));
    const drawer = await screen.findByRole("dialog", { name: "Ask for an employment confirmation letter" });
    const [purpose, addressee] = within(drawer).getAllByRole("textbox");
    fireEvent.change(purpose, { target: { value: "Bank" } });
    fireEvent.change(addressee, { target: { value: "Standard Bank" } });
    fireEvent.click(within(drawer).getByRole("button", { name: "Send to HR" }));
    await waitFor(() => expect(calls.find((c) => c.method === "POST")?.body).toEqual({ purpose: "Bank", addressed_to: "Standard Bank", confirm: true }));
    expect(await screen.findByText(/HR is preparing it/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Ask for a confirmation letter" })).not.toBeInTheDocument();
  });

  it("downloads an issued letter and says when the wording is awaited", async () => {
    who.roles = ["Employee"];
    routes = [["GET /hr/me/letters", { employee: "HR-EMP-0044", letters: [{ ...REQUESTED, status: "Issued", has_file: true, issued_on: "2026-10-16" }], can_request: true,
      ready: false, reason: "Awaiting ESWASA (A3): no wording for Employment confirmation." }]];
    render(<MyLetters />);
    const dl = await screen.findByRole("link", { name: "Download" });
    expect(dl.getAttribute("href")).toContain("/hr/letters/HRL-2026-00002/file");
    expect(screen.getByText(/Awaiting ESWASA \(A3\)/)).toBeInTheDocument();
  });
});

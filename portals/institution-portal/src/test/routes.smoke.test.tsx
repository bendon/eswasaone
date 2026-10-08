/**
 * Route render test (gap 01 C1): every module's child path renders inside its shell with sub-tabs,
 * so a parent that forgets its <Outlet> can't come back unnoticed. Demo store data, demo staff session.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { createMemoryRouter, Outlet, RouterProvider } from "react-router-dom";
import type { ReactNode } from "react";
import { resetCrmDemo } from "@eswasaone/shared-ui/crm";
import { resetGovernanceDemo } from "@eswasaone/shared-ui/governance";
import { resetTasksDemo } from "@eswasaone/shared-ui/tasks";

vi.mock("../layout/InstitutionLayout", () => ({
  useInstitution: () => ({
    user: { username: "demo.admin", full_name: "Demo Administrator", email: "demo@eswasa.co.sz", roles: ["System Manager"] },
    openAuth: () => undefined,
    refreshUser: () => undefined,
    sessionKey: "demo",
  }),
}));

// Live Core is not reachable in tests — every module falls back to its demo store or empty state.
vi.stubGlobal(
  "fetch",
  vi.fn(async () => new Response(JSON.stringify({ detail: "offline" }), { status: 503, headers: { "Content-Type": "application/json" } })),
);

import { StandardsPage } from "../pages/StandardsPage";
import { MetrologyPage } from "../pages/MetrologyPage";
import { ApprovalsPage } from "../pages/ApprovalsPage";
import { BoardPage } from "../pages/BoardPage";
import * as board from "../board/sub-views";
import * as approvals from "../approvals/sub-views";
import { MemberLayout, MemberHome, MemberVotes } from "../board/MemberArea";
import { PrintPage } from "../print/PrintPage";

function mount(path: string, routes: { path: string; element: ReactNode; children?: { index?: true; path?: string; element: ReactNode }[] }[]) {
  const router = createMemoryRouter([{ path: "/", element: <Outlet />, children: routes }], { initialEntries: [path] });
  return render(<RouterProvider router={router} />);
}

beforeEach(async () => {
  localStorage.clear();
  sessionStorage.clear();
  await resetTasksDemo();
  await resetCrmDemo();
  await resetGovernanceDemo();
});

describe("module shells render their sub-tabs (C1)", () => {
  it.each([
    ["/standards", StandardsPage, ["Programme", "Proposals", "Work items", "Public review", "Ballots", "Catalogue", "Committees", "Periodic review", "Settings"]],
    ["/metrology", MetrologyPage, ["Overview", "Requests", "Receipt", "Jobs", "Review", "Customer items", "Lab equipment", "LIMS tests", "Capacity", "Settings"]],
  ] as const)("%s", async (path, Page, tabs) => {
    mount(path, [{ path: path.slice(1), element: <Page />, children: [{ index: true, element: <p>index child</p> }] }]);
    for (const t of tabs) expect(await screen.findByRole("link", { name: new RegExp(`^${t}`) })).toBeInTheDocument();
    expect(screen.getByText("index child")).toBeInTheDocument();
  });
});

const BOARD_ROUTES: [string, string, keyof typeof board, RegExp][] = [
  ["", "", "BoardOverview", /Run meeting/],
  ["meetings", "meetings", "MeetingsList", /Q3 Board meeting/],
  ["meetings/:id", "meetings/BM-2026-Q3", "MeetingRecordPage", /Agenda builder/],
  ["meetings/:id/agenda", "meetings/BM-2026-Q3/agenda", "AgendaBuilderPage", /issue notice/i],
  ["meetings/:id/run", "meetings/BM-2026-Q3/run", "RunMeetingPage", /Attendance & quorum/],
  ["meetings/:id/minutes", "meetings/BM-2026-Q2/minutes", "MinutesEditorPage", /Submitted and frozen/],
  ["pack/:meetingId", "pack/BM-2026-Q3", "PackBuilderPage", /Board pack — Q3 Board meeting/],
  ["resolutions", "resolutions", "ResolutionsView", /Approve the 2026\/27 fee schedule/],
  ["resolutions/:id", "resolutions/RES-2026-014", "ResolutionRecordPage", /Votes/],
  ["resolutions/written/new", "resolutions/written/new", "WrittenResolutionNewPage", /Circulate a written resolution/],
  ["risks", "risks", "RiskRegisterView", /Prolonged outage of the Core platform/],
  ["risks/:id", "risks/RSK-003", "RiskRecordPage", /above the ICT appetite/],
  ["declarations", "declarations", "DeclarationsView", /Annual declarations due from/],
  ["members", "members", "MembersView", /Members and terms/],
  ["calendar", "calendar", "CalendarView", /Export \.ics/],
  ["settings", "settings", "GovSettingsView", /Bodies and committees/],
];

describe("Board & Governance routes (gap 03)", () => {
  it.each(BOARD_ROUTES)("/board/%s renders", async (pattern, url, name, text) => {
    const El = board[name] as () => JSX.Element;
    mount(`/board/${url}`, [{ path: "board", element: <BoardPage />, children: [pattern ? { path: pattern, element: <El /> } : { index: true, element: <El /> }] }]);
    expect((await screen.findAllByText(text)).length).toBeGreaterThan(0);
    expect(screen.getAllByRole("link", { name: /Risk register/ }).length).toBeGreaterThan(0);
  });
});

describe("Approvals routes (gap 02)", () => {
  it.each([
    ["", "InboxView", /SLA breached/],
    ["team", "TeamView", /Load per officer/],
    ["delegations", "DelegationsView", /New delegation/],
    ["done", "DoneView", /Handled last 30 days/],
  ] as const)("/approvals/%s", async (sub, name, text) => {
    const El = approvals[name];
    mount(`/approvals/${sub}`, [{ path: "approvals", element: <ApprovalsPage />, children: [sub ? { path: sub, element: <El /> } : { index: true, element: <El /> }] }]);
    expect((await screen.findAllByText(text)).length).toBeGreaterThan(0);
  });
});

describe("member area and print (G4, C10)", () => {
  it("member home and votes render for a chosen member", async () => {
    sessionStorage.setItem("eswasaone.demo.member", "Dr. Khanyisile Vilakati");
    mount("/member/votes", [{ path: "member", element: <MemberLayout />, children: [{ index: true, element: <MemberHome /> }, { path: "votes", element: <MemberVotes /> }] }]);
    expect(await screen.findByText(/SADCAS mutual recognition/)).toBeInTheDocument();
  });

  it("prints approved minutes with letterhead", async () => {
    mount("/print/minutes/BM-2026-Q1", [{ path: "print/:kind/:id", element: <PrintPage /> }]);
    expect(await screen.findByText(/Eswatini Standards Authority/)).toBeInTheDocument();
    expect(await screen.findByText(/Approved at BM-2026-Q2/)).toBeInTheDocument();
  });
});

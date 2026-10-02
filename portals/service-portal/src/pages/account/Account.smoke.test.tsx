import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { IconSprite } from "@eswasaone/shared-ui";
import { ToastProvider } from "../../ui/Toast";
import {
  AccountLayout,
  AccountOverviewPage,
  AccountOrdersPage,
  AccountCertificatesPage,
  AccountTrainingPage,
  AccountTeamPage,
  AccountSettingsPage,
} from "./index";

vi.mock("../../api/account", () => ({
  listEntities: vi.fn().mockResolvedValue({
    active: "personal",
    items: [
      {
        id: "personal",
        name: "James Chelogoi",
        short_name: "James",
        kind: "personal",
        role: "Citizen",
        initials: "JC",
        member_since: "March 2024",
        verified: true,
      },
      {
        id: "business",
        name: "Ubombo Honey Co. (Pty) Ltd",
        short_name: "Ubombo Honey",
        kind: "business",
        role: "Owner",
        initials: "UH",
        member_since: "January 2025",
        verified: true,
      },
    ],
  }),
  getOverview: vi.fn().mockImplementation((entity: string) =>
    Promise.resolve(
      entity === "business"
        ? {
            stats: {
              items: [
                { label: "Orders placed", value: 8 },
                { label: "Certificates held", value: 4 },
                { label: "Team members", value: 6 },
                { label: "Open applications", value: 2, accent: true },
              ],
            },
            alerts: [],
            feed: [
              {
                id: "bf1",
                tint: "#ECEEFC",
                tone: "#313391",
                icon: "i-clipboard",
                title: "ISO 9001 surveillance application opened",
                subtitle: "REF · ESWASA-2026-01142",
                time: "2 days ago",
                href: "/account/certificates",
              },
            ],
            summary: [
              {
                id: "bs1",
                tint: "#ECEEFC",
                tone: "#313391",
                icon: "i-clipboard",
                title: "Open applications",
                subtitle: "ISO 9001 (Stage 2)",
              },
            ],
          }
        : {
            stats: {
              items: [
                { label: "Orders placed", value: 2 },
                { label: "Certificates held", value: 3 },
                { label: "Course in progress", value: 1 },
                { label: "Open applications", value: 0 },
              ],
            },
            alerts: [
              {
                id: "al-1",
                tone: "pending",
                tint: "#FEF6DC",
                border_tint: "#F1E2A5",
                icon: "i-clock",
                title: "Course in progress",
                body: "HACCP food safety — Module 3 of 8.",
                cta: "Resume course",
                href: "/account/training",
              },
            ],
            feed: [
              {
                id: "f1",
                tint: "#E3F4E9",
                tone: "#15803D",
                icon: "i-check-c",
                title: "HACCP internal auditor course completed",
                subtitle: "Certificate issued · Cert no. TRN-2024-00841",
                time: "12 Nov 2024 · 09:14",
                href: "/account/certificates",
              },
            ],
            summary: [
              {
                id: "s1",
                tint: "#ECEEFC",
                tone: "#313391",
                icon: "i-book",
                title: "Standards library",
                subtitle: "2 licensed PDFs",
              },
            ],
          },
    ),
  ),
  listTeam: vi.fn().mockImplementation((entity: string) =>
    Promise.resolve(
      entity === "business"
        ? [
            {
              id: "t1",
              initials: "JC",
              name: "James Chelogoi",
              email: "james@ubombohoney.co.sz",
              role: "owner",
              role_label: "Owner",
              when: "Active 2 days ago",
              avatar_variant: "alt",
            },
          ]
        : [],
    ),
  ),
  inviteMember: vi.fn(),
  updateProfile: vi.fn().mockResolvedValue(null),
  getNotificationPrefs: vi.fn().mockResolvedValue({
    application_updates: true,
    order_confirmations: true,
    certificate_expiry: true,
    training_announcements: false,
    two_factor: false,
  }),
  updateNotificationPrefs: vi.fn().mockImplementation((p: unknown) => Promise.resolve(p)),
}));

vi.mock("../../api/orders", () => ({
  listOrders: vi.fn().mockResolvedValue([
    {
      id: "#8851",
      title: "SZNS 060 — Honey specification",
      subtitle: "Licensed PDF · ICS 67.180",
      date: "2026-04-04",
      amount: "SZL 280",
      status: "done",
      status_label: "Completed",
      entity: "personal",
    },
  ]),
}));

vi.mock("../../api/certification", () => ({
  listCertificates: vi.fn().mockResolvedValue([
    {
      id: "c1",
      chip: "Training",
      tint: "#F0E9FB",
      tone: "#7C3AED",
      accent: "#7C3AED",
      num: "TRN-2024-00841",
      title: "HACCP internal auditor",
      holder: "James Chelogoi",
      issued: "12 Nov 2024",
      expires: "12 Nov 2027",
    },
  ]),
}));

vi.mock("../../api/training", () => ({
  listEnrolments: vi.fn().mockResolvedValue([
    {
      id: "e1",
      course: "haccp-implementation",
      chip: "In progress",
      tint: "#FEF6DC",
      tone: "#B8860B",
      accent: "#B8860B",
      code: "TRN-FS-101",
      title: "HACCP food safety fundamentals",
      desc: "Module 3 of 8",
      progress: 37,
      progressLabel: "Module 3 of 8",
      meta: ["Last opened 2 days ago"],
    },
  ]),
}));

function renderAccount(path = "/account") {
  return render(
    <ToastProvider>
      <IconSprite />
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/account" element={<AccountLayout />}>
            <Route index element={<AccountOverviewPage />} />
            <Route path="orders" element={<AccountOrdersPage />} />
            <Route path="certificates" element={<AccountCertificatesPage />} />
            <Route path="training" element={<AccountTrainingPage />} />
            <Route path="team" element={<AccountTeamPage />} />
            <Route path="settings" element={<AccountSettingsPage />} />
          </Route>
        </Routes>
      </MemoryRouter>
    </ToastProvider>,
  );
}

describe("Account workspace", () => {
  beforeEach(() => {
    document.body.dataset.context = "personal";
  });

  it("renders workspace header, KPIs and overview feed", async () => {
    renderAccount("/account");

    await waitFor(() => {
      expect(screen.getByText("James Chelogoi")).toBeInTheDocument();
    });

    expect(screen.getByRole("tablist", { name: /account sections/i })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /overview/i })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /orders/i })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /certificates/i })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /training/i })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /settings/i })).toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: /^team$/i })).not.toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText("Recent activity")).toBeInTheDocument();
    });
    expect(screen.getByText(/HACCP internal auditor course completed/i)).toBeInTheDocument();
    expect(screen.getByText("Quick actions")).toBeInTheDocument();
    expect(screen.getByLabelText("Account summary")).toBeInTheDocument();
    expect(screen.getByText("Orders placed")).toBeInTheDocument();
  });

  it("lists orders with download action", async () => {
    renderAccount("/account/orders");

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "Orders" })).toBeInTheDocument();
    });

    await waitFor(() => {
      expect(screen.getByText(/SZNS 060 — Honey specification/i)).toBeInTheDocument();
    });
    expect(screen.getByText("#8851")).toBeInTheDocument();
    expect(screen.getByText("Completed")).toBeInTheDocument();
  });

  it("lists certificates as cards", async () => {
    renderAccount("/account/certificates");

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "Certificates" })).toBeInTheDocument();
    });

    await waitFor(() => {
      expect(screen.getByText("TRN-2024-00841")).toBeInTheDocument();
    });
    expect(screen.getByText("HACCP internal auditor")).toBeInTheDocument();
  });

  it("shows training progress for in-progress courses", async () => {
    renderAccount("/account/training");

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "Training" })).toBeInTheDocument();
    });

    await waitFor(() => {
      expect(screen.getByText(/HACCP food safety fundamentals/i)).toBeInTheDocument();
    });
    expect(screen.getByText(/37%/)).toBeInTheDocument();
  });

  it("switches to business workspace and reveals Team tab", async () => {
    const user = userEvent.setup();
    renderAccount("/account");

    await waitFor(() => {
      expect(screen.getByText("James Chelogoi")).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { expanded: false }));
    const menu = screen.getByRole("menu");
    await user.click(within(menu).getByRole("menuitem", { name: /ubombo honey/i }));

    await waitFor(() => {
      expect(screen.getByRole("tab", { name: /^team$/i })).toBeInTheDocument();
    });
    expect(document.body.dataset.context).toBe("business");
  });

  it("renders settings with notification toggles", async () => {
    renderAccount("/account/settings");

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "Settings" })).toBeInTheDocument();
    });
    expect(screen.getByRole("switch", { name: /application updates/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /save changes/i })).toBeInTheDocument();
  });
});

import { apiFetch } from "@eswasaone/shared-ui";
import type {
  AccountEntity,
  AccountOverview,
  TeamMember,
  NotificationPrefs,
  SessionUser,
} from "@eswasaone/shared-ui";

/* ---------------- Entities ---------------- */

const FALLBACK_ENTITIES: { items: AccountEntity[]; active: string } = {
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
};

export async function listEntities(): Promise<{ items: AccountEntity[]; active: string }> {
  try {
    return await apiFetch<{ items: AccountEntity[]; active: string }>("/account/entities");
  } catch {
    return FALLBACK_ENTITIES;
  }
}

/* ---------------- Overview ---------------- */

const FALLBACK_OVERVIEW_PERSONAL: AccountOverview = {
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
      body: "HACCP food safety — Module 3 of 8. Pick up where you left off.",
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
    {
      id: "f2",
      tint: "#ECEEFC",
      tone: "#313391",
      icon: "i-book",
      title: "Order #8842 · SZNS ISO 9001",
      subtitle: "Delivered as secured PDF · SZL 420",
      time: "2 Mar 2025 · 15:02",
      href: "/account/orders",
    },
    {
      id: "f3",
      tint: "#F0E9FB",
      tone: "#7C3AED",
      icon: "i-cap",
      title: "Enrolled in HACCP food safety fundamentals",
      subtitle: "Module 3 of 8 · 37% complete",
      time: "28 Mar 2026 · 10:41",
      href: "/account/training",
    },
    {
      id: "f4",
      tint: "#FEF6DC",
      tone: "#B8860B",
      icon: "i-book",
      title: "Order #8851 · SZNS 060 Honey specification",
      subtitle: "Delivered as secured PDF · SZL 280",
      time: "4 Apr 2026 · 08:12",
      href: "/account/orders",
    },
    {
      id: "f5",
      tint: "#E4F4F1",
      tone: "#0E7C7B",
      icon: "i-star",
      title: "Food labelling workshop completed",
      subtitle: "Certificate issued · Cert no. TRN-2025-01188",
      time: "22 Sep 2025 · 16:48",
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
    {
      id: "s2",
      tint: "#E3F4E9",
      tone: "#15803D",
      icon: "i-badge",
      title: "Certificate portfolio",
      subtitle: "3 training certificates",
    },
    {
      id: "s3",
      tint: "#F0E9FB",
      tone: "#7C3AED",
      icon: "i-trend",
      title: "Learning",
      subtitle: "1 in progress · 2 completed",
    },
  ],
};

const FALLBACK_OVERVIEW_BUSINESS: AccountOverview = {
  stats: {
    items: [
      { label: "Orders placed", value: 8 },
      { label: "Certificates held", value: 4 },
      { label: "Team members", value: 6 },
      { label: "Open applications", value: 2, accent: true },
    ],
  },
  alerts: [
    {
      id: "al-b1",
      tone: "alert",
      tint: "#FDECEC",
      border_tint: "#F9C4C4",
      icon: "i-warn",
      title: "ISO 22000 certificate expires in 47 days",
      body: "Book your recertification audit before 8 November 2026 to avoid a gap.",
      cta: "Start recertification",
      href: "/account/certificates",
    },
    {
      id: "al-b2",
      tone: "pending",
      tint: "#FEF6DC",
      border_tint: "#F1E2A5",
      icon: "i-clock",
      title: "Stage 2 audit scheduled for 12 Oct",
      body: "ISO 9001 surveillance audit — 3 auditors attending, 2 days on site.",
      cta: "View details",
      href: "/account/certificates",
    },
  ],
  feed: [
    {
      id: "bf1",
      tint: "#ECEEFC",
      tone: "#313391",
      icon: "i-clipboard",
      title: "ISO 9001 surveillance application opened",
      subtitle: "REF · ESWASA-2026-01142 · Stage 2 scheduled",
      time: "2 days ago",
      href: "/account/certificates",
    },
    {
      id: "bf2",
      tint: "#E3F4E9",
      tone: "#15803D",
      icon: "i-badge",
      title: "SZNS Product Mark certificate issued",
      subtitle: "Holder · Ubombo Honey Co. (Pty) Ltd · Expires 2029",
      time: "4 weeks ago",
      href: "/account/certificates",
    },
    {
      id: "bf3",
      tint: "#F0E9FB",
      tone: "#7C3AED",
      icon: "i-users",
      title: "Nomsa Mabuza joined as Admin",
      subtitle: "Invited by James Chelogoi",
      time: "5 weeks ago",
      href: "/account/team",
    },
    {
      id: "bf4",
      tint: "#FEF6DC",
      tone: "#B8860B",
      icon: "i-book",
      title: "Bulk order placed · 5 standards",
      subtitle: "REF · ORDER-2026-0043 · SZL 1,840",
      time: "6 weeks ago",
      href: "/account/orders",
    },
  ],
  summary: [
    {
      id: "bs1",
      tint: "#ECEEFC",
      tone: "#313391",
      icon: "i-clipboard",
      title: "Open applications",
      subtitle: "ISO 9001 (Stage 2) · Recertification ISO 22000",
    },
    {
      id: "bs2",
      tint: "#E3F4E9",
      tone: "#15803D",
      icon: "i-badge",
      title: "Certificate portfolio",
      subtitle: "ISO 22000 · HACCP · SZNS Product Mark · ISO 9001",
    },
    {
      id: "bs3",
      tint: "#F0E9FB",
      tone: "#7C3AED",
      icon: "i-users",
      title: "Team",
      subtitle: "6 members · 1 Owner · 1 Admin · 3 Members · 1 Viewer",
    },
  ],
};

export async function getOverview(entity: string): Promise<AccountOverview> {
  try {
    return await apiFetch<AccountOverview>(`/account/overview?entity=${entity}`);
  } catch {
    return entity === "business" ? FALLBACK_OVERVIEW_BUSINESS : FALLBACK_OVERVIEW_PERSONAL;
  }
}

/* ---------------- Team ---------------- */

const FALLBACK_TEAM: TeamMember[] = [
  {
    id: "t1",
    initials: "JC",
    name: "James Chelogoi",
    email: "james.chelogoi@ubombohoney.co.sz",
    role: "owner",
    role_label: "Owner",
    when: "Active 2 days ago",
    avatar_variant: "alt",
  },
  {
    id: "t2",
    initials: "NM",
    name: "Nomsa Mabuza",
    email: "nomsa.mabuza@ubombohoney.co.sz",
    role: "admin",
    role_label: "Admin",
    when: "Active today",
    avatar_variant: "default",
  },
  {
    id: "t3",
    initials: "SD",
    name: "Sipho Dlamini",
    email: "sipho.dlamini@ubombohoney.co.sz",
    role: "member",
    role_label: "Member",
    when: "Active 4 days ago",
    avatar_variant: "teal",
  },
  {
    id: "t4",
    initials: "TN",
    name: "Thuli Nkambule",
    email: "thuli.nkambule@ubombohoney.co.sz",
    role: "member",
    role_label: "Member",
    when: "Active 1 week ago",
    avatar_variant: "default",
  },
  {
    id: "t5",
    initials: "BM",
    name: "Bheki Mamba",
    email: "bheki.mamba@ubombohoney.co.sz",
    role: "member",
    role_label: "Member",
    when: "Active 2 weeks ago",
    avatar_variant: "alt",
  },
  {
    id: "t6",
    initials: "PM",
    name: "Priya Moodley",
    email: "priya.moodley@auditpartners.co.sz",
    role: "viewer",
    role_label: "Viewer",
    when: "External · Auditor",
    avatar_variant: "default",
  },
];

export async function listTeam(entity: string): Promise<TeamMember[]> {
  try {
    const res = await apiFetch<{ items: TeamMember[] }>(`/account/team?entity=${entity}`);
    return res.items ?? [];
  } catch {
    return entity === "business" ? FALLBACK_TEAM : [];
  }
}

export async function inviteMember(
  email: string,
  role: string,
): Promise<TeamMember> {
  try {
    return await apiFetch<TeamMember>("/account/team/invite", {
      method: "POST",
      body: JSON.stringify({ email, role, confirm: true }),
    });
  } catch {
    // TODO: wire real
    return {
      id: `t-${Date.now().toString(36)}`,
      initials: email.slice(0, 2).toUpperCase(),
      name: email.split("@")[0],
      email,
      role: role as TeamMember["role"],
      role_label: role.charAt(0).toUpperCase() + role.slice(1),
      when: "Just invited",
      avatar_variant: "default",
    };
  }
}

/* ---------------- Profile ---------------- */

export async function updateProfile(
  patch: { full_name?: string; phone?: string; email?: string },
): Promise<SessionUser | null> {
  try {
    return await apiFetch<SessionUser>("/account/me", {
      method: "PUT",
      body: JSON.stringify({ ...patch, confirm: true }),
    });
  } catch {
    // TODO: wire real
    return null;
  }
}

/* ---------------- Notifications ---------------- */

const FALLBACK_PREFS: NotificationPrefs = {
  application_updates: true,
  order_confirmations: true,
  certificate_expiry: true,
  training_announcements: false,
  two_factor: false,
};

export async function getNotificationPrefs(): Promise<NotificationPrefs> {
  try {
    return await apiFetch<NotificationPrefs>("/account/notifications");
  } catch {
    return FALLBACK_PREFS;
  }
}

export async function updateNotificationPrefs(
  prefs: NotificationPrefs,
): Promise<NotificationPrefs> {
  try {
    return await apiFetch<NotificationPrefs>("/account/notifications", {
      method: "PUT",
      body: JSON.stringify(prefs),
    });
  } catch {
    return prefs;
  }
}
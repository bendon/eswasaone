/**
 * Notifications — customer inbox (/account/notifications), staff bell and board member inbox
 * (gap 01 C5). Domain stores write customer-audience events here; same origin means a staff action in
 * the Institution portal shows up in the customer's Service account in demo mode.
 * TODO: wire real — GET /notifications?audience=…, POST /notifications/{id}/read, outbox → email/SMS.
 */
import { createLocalStore, isoIn, nowIso, uid } from "../store/localStore";

export type NotificationAudience = "customer" | "staff" | "member";

export type AppNotification = {
  id: string;
  audience: NotificationAudience;
  /** Email for customers, staff/member name otherwise; "demo" reaches every demo viewer. */
  to: string;
  title: string;
  body: string;
  /** Route in the target portal (Service: "/account/…", Institution: "/…"). */
  link?: string;
  kind: "application" | "case" | "quote" | "audit" | "certificate" | "calibration" | "comment" | "board" | "task" | "info";
  ref?: string;
  at: string;
  read?: boolean;
  channel?: ("email" | "sms" | "portal")[];
};

type NotifyState = { v: 1; items: Record<string, AppNotification> };

function seed(): NotifyState {
  const rows: AppNotification[] = [
    { id: "N-1", audience: "customer", to: "demo", kind: "application", ref: "CERT-APP-26-0058", title: "Application received", body: "We've received your ISO 9001 certification application. A certification officer will review your documents within 5 working days.", link: "/account/applications", at: isoIn(-9, 10), read: true, channel: ["email", "portal"] },
    { id: "N-2", audience: "customer", to: "demo", kind: "quote", ref: "Q-26-0031", title: "Your quote is ready", body: "Quote Q-26-0031 for ISO 9001 initial certification (E 38,500) is ready. Accept it online to book your Stage 1 audit.", link: "/account/applications", at: isoIn(-6, 14), read: true, channel: ["email", "portal"] },
    { id: "N-3", audience: "customer", to: "demo", kind: "audit", ref: "FV-26-0140", title: "Audit date proposed", body: "Your Stage 2 audit is proposed for next Tuesday at 08:30 with lead auditor Lindiwe Dube. Please confirm or suggest another date.", link: "/account/applications", at: isoIn(-2, 9), channel: ["email", "sms", "portal"] },
    { id: "N-4", audience: "customer", to: "demo", kind: "calibration", ref: "CAL-26-0233", title: "Calibration certificate ready", body: "The calibration certificate for your 0–220 g balance is ready to download. Next calibration is recommended in 12 months.", link: "/account", at: isoIn(-1, 15), channel: ["email", "portal"] },
    { id: "N-5", audience: "member", to: "demo", kind: "board", title: "Board pack issued", body: "The pack for the Q3 Board meeting is ready to read in your member area.", link: "/member", at: isoIn(-1, 11), channel: ["email", "portal"] },
  ];
  return { v: 1, items: Object.fromEntries(rows.map((r) => [r.id, r])) };
}

export const notifyStore = createLocalStore<NotifyState>({ key: "eswasaone.notify.v1", v: 1, seed });

export function notify(n: Omit<AppNotification, "id" | "at">): AppNotification {
  return notifyStore.mutate((s) => {
    const row: AppNotification = { ...n, id: uid("N"), at: nowIso() };
    s.items[row.id] = row;
    return row;
  });
}

/** Silent variant for writes from other stores — never let a notification failure block a transition. */
export function notifySafe(n: Omit<AppNotification, "id" | "at">): void {
  try {
    notify(n);
  } catch {
    /* ignore */
  }
}

export function listNotifications(audience: NotificationAudience, who?: { email?: string; name?: string; refs?: string[] }): AppNotification[] {
  notifyStore.guard("Notifications");
  const email = who?.email?.toLowerCase();
  const refs = new Set(who?.refs ?? []);
  return notifyStore.view((s) =>
    Object.values(s.items)
      .filter((n) => n.audience === audience)
      .filter((n) => n.to === "demo" || (email && n.to.toLowerCase() === email) || n.to === who?.name || (n.ref && refs.has(n.ref)))
      .sort((a, b) => b.at.localeCompare(a.at)),
  );
}

export function unreadCount(audience: NotificationAudience, who?: { email?: string; name?: string; refs?: string[] }): number {
  try {
    return listNotifications(audience, who).filter((n) => !n.read).length;
  } catch {
    return 0;
  }
}

export function markNotificationRead(id: string, read = true): void {
  notifyStore.mutate((s) => {
    if (s.items[id]) s.items[id].read = read;
  });
}

export function markAllNotificationsRead(ids: string[]): void {
  notifyStore.mutate((s) => {
    for (const id of ids) if (s.items[id]) s.items[id].read = true;
  });
}

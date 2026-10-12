/**
 * Outbound message templates (gap 01 C5 MessagePreview). The confirm dialog renders the exact text the
 * customer / member / owner will receive. Editable per module in Settings later (C11).
 * TODO: wire real — Frappe Notification templates per state entry.
 */
export type MessageTemplate = {
  key: string;
  channel: ("email" | "sms" | "portal")[];
  subject: string;
  body: string;
};

export const TEMPLATES: Record<string, MessageTemplate> = {
  "case.request_info": { key: "case.request_info", channel: ["email", "portal"], subject: "We need a little more information — {ref}", body: "Dear {name},\n\nTo continue with your case {ref} ({subject}) we need the following from you:\n\n{reason}\n\nReply from your ESWASA account or to this email. The case clock is paused until we hear from you.\n\nESWASA Customer Service" },
  "case.resolve": { key: "case.resolve", channel: ["email", "portal"], subject: "Your case {ref} has been resolved", body: "Dear {name},\n\n{reason}\n\nIf you're not satisfied, you can reopen the case from your account within 10 working days.\n\nESWASA Customer Service" },
  "case.mark_duplicate": { key: "case.mark_duplicate", channel: ["email", "portal"], subject: "Your report {ref} has been linked", body: "Dear {name},\n\nThis is being handled under case {dup}. We have linked your report to it and will keep you updated there.\n\nESWASA Customer Service" },
  "generic.return": { key: "generic.return", channel: ["email", "portal"], subject: "Action needed on {ref}", body: "Hello,\n\n{title} was returned for more information:\n\n{reason}\n\nPlease update it and resubmit.\n\nESWASA" },
  "generic.reject": { key: "generic.reject", channel: ["email", "portal"], subject: "Decision on {ref}", body: "Hello,\n\nWe're unable to approve {title}.\n\nReason: {reason}\n\nYou may appeal this decision within 30 days from your ESWASA account.\n\nESWASA" },
  "board.pack_issued": { key: "board.pack_issued", channel: ["email", "portal"], subject: "Board pack issued — {meeting}", body: "Dear {name},\n\nThe pack (v{version}) for the {meeting} on {date} is now available in your member area. Please read it before the meeting and record any conflicts of interest on the agenda items.\n\n{secretary}\nCompany Secretary" },
  "board.section_reminder": { key: "board.section_reminder", channel: ["email", "portal"], subject: "Reminder: board pack section due — {section}", body: "Dear {name},\n\nYour section \"{section}\" for the {meeting} pack is due on {due}. Please write or upload it from your Approvals task and mark it Ready.\n\n{secretary}\nCompany Secretary" },
  "board.written_resolution": { key: "board.written_resolution", channel: ["email", "portal"], subject: "Written resolution for your vote — {title}", body: "Dear {name},\n\nA written resolution has been circulated: \"{title}\".\n\nVoting closes on {closes}. Please read the papers and vote in your member area.\n\n{secretary}\nCompany Secretary" },
  "board.meeting_notice": { key: "board.meeting_notice", channel: ["email", "portal"], subject: "Notice of meeting — {meeting}", body: "Dear {name},\n\nNotice is given of the {meeting} on {date} at {venue}. The agenda is attached; the pack will follow at least {pack_days} days before the meeting.\n\n{secretary}\nCompany Secretary" },
  "task.escalate": { key: "task.escalate", channel: ["email", "portal"], subject: "Escalated: {title}", body: "{name},\n\n{actor} escalated \"{title}\" to you.\n\nReason: {reason}\n\nOpen it in Approvals." },
};

export function renderTemplate(key: string, vars: Record<string, string | number | undefined>): { subject: string; body: string; channel: MessageTemplate["channel"] } | null {
  const t = TEMPLATES[key];
  if (!t) return null;
  const fill = (s: string) => s.replace(/\{(\w+)\}/g, (_, k: string) => String(vars[k] ?? `{${k}}`));
  return { subject: fill(t.subject), body: fill(t.body), channel: t.channel };
}

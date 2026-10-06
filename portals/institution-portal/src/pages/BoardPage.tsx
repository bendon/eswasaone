import { useMemo, useState } from "react";
import {
  FormDrawer,
  Icon,
  Toast,
  useConfirmAction,
  type FormDrawerField,
} from "@eswasaone/shared-ui";
import { ModulePageShell } from "./ModulePageShell";
import { useBodies } from "../governance/useBodies";

function meetingFields(bodies: { value: string; label: string }[]): FormDrawerField[] {
  return [
    { name: "title", label: "Title", required: true, placeholder: "Q4 Board meeting" },
    { name: "body", label: "Body", type: "select", required: true, options: bodies },
    { name: "date", label: "Date", type: "date", required: true },
    { name: "venue", label: "Venue", placeholder: "ESWASA Boardroom, Matsapha" },
  ];
}

const RESOLUTION_FIELDS: FormDrawerField[] = [
  { name: "title", label: "Resolution", required: true, type: "textarea" },
  { name: "meeting", label: "Meeting ref", required: true, placeholder: "BM-2026-Q3" },
];

/** Board & Governance — Overview · Meetings · Pack · Resolutions · CAC · Risks · Members */
export function BoardPage() {
  const { confirmAction, host } = useConfirmAction();
  const { options: bodyOptions } = useBodies();
  const MEETING_FIELDS = useMemo(() => meetingFields(bodyOptions), [bodyOptions]);
  const [flash, setFlash] = useState<string | null>(null);
  const [meetingOpen, setMeetingOpen] = useState(false);
  const [resolutionOpen, setResolutionOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submitMeeting(values: Record<string, string>) {
    const ok = await confirmAction({
      title: "Schedule meeting",
      message: `Schedule “${values.title}” for ${values.date || "the selected date"}?`,
      consequence: "Creates a Board Meeting and notifies the secretariat.",
      ruleId: "R-G2",
      confirmLabel: "Schedule",
    });
    if (!ok) return;
    setBusy(true);
    try {
      // TODO: wire real — POST /governance/meetings
      setFlash(`Meeting scheduled: TODO (${values.title})`);
      setMeetingOpen(false);
    } finally {
      setBusy(false);
    }
  }

  async function submitResolution(values: Record<string, string>) {
    const ok = await confirmAction({
      title: "Record resolution",
      message: `Record this resolution against ${values.meeting || "the meeting"}?`,
      consequence: "Creates a Board Resolution and opens the action tracker.",
      ruleId: "R-G3",
      confirmLabel: "Record",
    });
    if (!ok) return;
    setBusy(true);
    try {
      // TODO: wire real — POST /governance/resolutions
      setFlash(`Resolution recorded: TODO`);
      setResolutionOpen(false);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="gov">
      {host}
      <Toast message={flash} />
      <ModulePageShell
        reason="Staff sign-in required for board"
        tabs={[
          { to: "", label: "Overview", icon: "i-home" },
          { to: "meetings", label: "Meetings", icon: "i-cal" },
          { to: "pack", label: "Board pack", icon: "i-layers" },
          { to: "resolutions", label: "Resolutions", icon: "i-file" },
          { to: "cac", label: "CAC", icon: "i-award" },
          { to: "risks", label: "Risk register", icon: "i-shield" },
          { to: "members", label: "Members", icon: "i-users" },
        ]}
      >
        <div className="gov-head">
          <div>
            <h2>Board &amp; Governance</h2>
            <p>
              Meetings, packs, resolutions, risk, and membership for the Board and its committees.
            </p>
          </div>
          <div className="gov-head__r">
            <button type="button" className="btn ghost" onClick={() => setResolutionOpen(true)}>
              <Icon name="i-file" />
              Record resolution
            </button>
            <button type="button" className="btn gold" onClick={() => setMeetingOpen(true)}>
              <Icon name="i-plus" />
              Schedule meeting
            </button>
          </div>
        </div>
      </ModulePageShell>

      <FormDrawer
        open={meetingOpen}
        title="Schedule meeting"
        mode="create"
        fields={MEETING_FIELDS}
        busy={busy}
        submitLabel="Continue"
        onClose={() => setMeetingOpen(false)}
        onSubmit={submitMeeting}
      />
      <FormDrawer
        open={resolutionOpen}
        title="Record resolution"
        mode="create"
        fields={RESOLUTION_FIELDS}
        busy={busy}
        submitLabel="Continue"
        onClose={() => setResolutionOpen(false)}
        onSubmit={submitResolution}
      />
    </div>
  );
}

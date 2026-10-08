import { useState } from "react";
import { Link } from "react-router-dom";
import { Icon } from "@eswasaone/shared-ui";
import { listBodies } from "@eswasaone/shared-ui/governance";
import { useGov } from "../board/ui";
import { ScheduleDrawer } from "../board/OverviewMeetings";
import { ModulePageShell } from "./ModulePageShell";

/** Board & Governance (gap 03) — every tab reads the governance store; writes go through the workflow engine. */
export function BoardPage() {
  const [open, setOpen] = useState(false);
  const bodies = useGov(() => listBodies());
  return (
    <div className="gov">
      <ModulePageShell
        reason="Staff sign-in required for board"
        tabs={[
          { to: "", label: "Overview", icon: "i-home" },
          { to: "meetings", label: "Meetings", icon: "i-cal" },
          { to: "pack", label: "Board pack", icon: "i-layers" },
          { to: "resolutions", label: "Resolutions", icon: "i-file" },
          { to: "cac", label: "CAC", icon: "i-award" },
          { to: "risks", label: "Risk register", icon: "i-shield" },
          { to: "declarations", label: "Declarations" },
          { to: "members", label: "Members", icon: "i-users" },
          { to: "calendar", label: "Calendar" },
          { to: "settings", label: "Settings", icon: "i-sliders" },
        ]}
      >
        <div className="gov-head">
          <div>
            <h2>Board &amp; Governance</h2>
            <p>Meetings, packs, resolutions, risk and declarations for the Board and its committees.</p>
          </div>
          <div className="gov-head__r">
            <Link className="btn ghost" to="/member">
              <Icon name="i-eye" /> Member view
            </Link>
            <Link className="btn ghost" to="/board/resolutions/written/new">
              <Icon name="i-send" /> Written resolution
            </Link>
            <button type="button" className="btn gold" onClick={() => setOpen(true)}>
              <Icon name="i-plus" /> Schedule meeting
            </button>
          </div>
        </div>
      </ModulePageShell>
      <ScheduleDrawer open={open} onClose={() => setOpen(false)} bodies={bodies.data ?? []} />
    </div>
  );
}

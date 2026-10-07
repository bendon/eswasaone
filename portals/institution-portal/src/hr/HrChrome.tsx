import { FormEvent, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { Icon, inviteStaff, type InviteStaffRequest } from "@eswasaone/shared-ui";

const INVITE_ROLES = [
  "ESWASA Staff",
  "HR User",
  "Certification Officer",
  "Accounts User",
  "Desk User",
];

const LIFE: { to: string; label: string; icon: "i-users" | "i-briefcase" | "i-gauge" | "i-dollar" | "i-badge" }[] = [
  { to: "/hr", label: "Plan", icon: "i-badge" },
  { to: "/hr/recruitment", label: "Hire", icon: "i-briefcase" },
  { to: "/hr/directory", label: "Onboard & manage", icon: "i-users" },
  { to: "/hr/performance", label: "Develop", icon: "i-gauge" },
  { to: "/hr/payroll", label: "Pay", icon: "i-dollar" },
];

function lifeActive(pathname: string, to: string): boolean {
  if (to === "/hr") return pathname === "/hr" || pathname.endsWith("/hr/");
  return pathname.includes(to);
}

/** Module header, lifecycle ribbon, Invite staff CTA — SoT: eswasaone-hr.html */
export function HrChrome() {
  const loc = useLocation();
  const [showInvite, setShowInvite] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState(INVITE_ROLES[0]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  async function onInvite(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    setMsg(null);
    try {
      const body: InviteStaffRequest = {
        email: email.trim(),
        full_name: name.trim(),
        roles: [role],
      };
      const res = await inviteStaff(body);
      setMsg(res.message ?? `Invited ${res.email}`);
      setName("");
      setEmail("");
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : "Invite failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="hr">
      <div className="hr-head">
        <div>
          <h2>HR &amp; People</h2>
          <p>Plan → hire → onboard → manage → develop → pay · FY2026</p>
        </div>
        <div className="hr-head__r">
          <button type="button" className="btn gold" onClick={() => setShowInvite((v) => !v)}>
            <Icon name="i-plus" />
            Invite staff
          </button>
          <Link to="/hr/recruitment" className="btn ghost">
            <Icon name="i-briefcase" />
            Post a job
          </Link>
          <Link to="/hr/performance" className="btn ghost">
            <Icon name="i-badge" />
            Start appraisal
          </Link>
        </div>
      </div>

      {showInvite ? (
        <div className="hr-box hr-invite">
          <div className="hr-box__h">
            <div>
              <h3>Invite staff</h3>
              <p>Creates a Desk user via POST /auth/invite-staff. Link an Employee record in Directory to finish onboarding.</p>
            </div>
          </div>
          <div className="hr-box__b">
            <form onSubmit={onInvite}>
              <label>
                Full name
                <input required value={name} onChange={(e) => setName(e.target.value)} />
              </label>
              <label>
                Work email
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </label>
              <label>
                Role
                <select value={role} onChange={(e) => setRole(e.target.value)}>
                  {INVITE_ROLES.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
              </label>
              {err ? <p style={{ color: "var(--red)", margin: 0 }}>{err}</p> : null}
              {msg ? <p style={{ color: "var(--navy)", margin: 0 }}>{msg}</p> : null}
              <button type="submit" className="btn pri" disabled={busy}>
                {busy ? "Sending…" : "Send invite"}
              </button>
            </form>
          </div>
        </div>
      ) : null}

      <nav className="hr-life" aria-label="HR lifecycle">
        {LIFE.map((step) => (
          <Link
            key={step.to}
            to={step.to}
            className={lifeActive(loc.pathname, step.to) ? "on" : undefined}
          >
            <Icon name={step.icon} />
            {step.label}
          </Link>
        ))}
      </nav>

      <Link to="/hr/access" className="hr-access-link">
        <Icon name="i-lock" />
        Access requests
      </Link>
    </div>
  );
}

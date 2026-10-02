import { useEffect, useState } from "react";
import { Icon, type TeamMember } from "@eswasaone/shared-ui";
import { useAccount } from "./AccountContext";
import { inviteMember, listTeam } from "../../api/account";
import { useToast } from "../../ui/Toast";
import { Skeleton } from "./Skeleton";

type InviteRole = "admin" | "member" | "viewer";

export function AccountTeamPage() {
  const { entity } = useAccount();
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [showInvite, setShowInvite] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<InviteRole>("member");
  const [submitting, setSubmitting] = useState(false);
  const { showToast } = useToast();

  const refresh = () => {
    setLoading(true);
    void listTeam(entity)
      .then((m) => setMembers(m))
      .catch(() => setMembers([]))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reload when workspace changes
  }, [entity]);

  const onInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    const email = inviteEmail.trim().toLowerCase();
    if (!email || !email.includes("@")) {
      showToast("Enter a valid email address");
      return;
    }
    setSubmitting(true);
    try {
      const member = await inviteMember(email, inviteRole);
      setMembers((prev) => {
        if (prev.some((m) => m.email.toLowerCase() === member.email.toLowerCase())) {
          return prev;
        }
        return [...prev, member];
      });
      setInviteEmail("");
      setInviteRole("member");
      setShowInvite(false);
      showToast(`Invited ${member.email} as ${member.role_label}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Invite failed";
      showToast(msg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section className="panel is-on" role="tabpanel" data-context-only="business">
      <div className="panel__head">
        <div>
          <h2>Team</h2>
          <p>Colleagues with access to this business account</p>
        </div>
      </div>

      <div className="teambar">
        <div className="teambar__copy">
          <b>Invite a colleague</b>
          <span>
            They join this business as a Citizen — not Institution staff. Access covers
            applications, orders and certificates for this organisation.
          </span>
        </div>
        <button
          type="button"
          className="abtn primary"
          onClick={() => setShowInvite((v) => !v)}
          aria-expanded={showInvite}
        >
          <Icon name="i-plus" /> {showInvite ? "Cancel" : "Invite colleague"}
        </button>
      </div>

      {showInvite ? (
        <form className="teaminvite" onSubmit={(e) => void onInvite(e)}>
          <div className="field__row">
            <div className="field">
              <label htmlFor="team-invite-email">Work email</label>
              <input
                id="team-invite-email"
                type="email"
                autoComplete="email"
                placeholder="colleague@company.co.sz"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                required
                disabled={submitting}
              />
            </div>
            <div className="field">
              <label htmlFor="team-invite-role">Role</label>
              <select
                id="team-invite-role"
                value={inviteRole}
                onChange={(e) => setInviteRole(e.target.value as InviteRole)}
                disabled={submitting}
              >
                <option value="admin">Admin</option>
                <option value="member">Member</option>
                <option value="viewer">Viewer</option>
              </select>
            </div>
          </div>
          <div className="teaminvite__actions">
            <button type="submit" className="abtn primary" disabled={submitting}>
              {submitting ? "Sending…" : "Send invite"}
            </button>
          </div>
        </form>
      ) : null}

      <div className="tablewrap">
        {loading ? (
          <Skeleton lines={6} />
        ) : members.length === 0 ? (
          <p className="teaminvite__empty">
            No colleagues yet. Invite someone to collaborate on this business.
          </p>
        ) : (
          <div>
            {members.map((m) => (
              <div key={m.id} className="member">
                <span
                  className={`member__av${m.avatar_variant === "alt" ? " member__av--alt" : ""}${m.avatar_variant === "teal" ? " member__av--teal" : ""}`}
                >
                  {m.initials}
                </span>
                <div className="member__body">
                  <b>{m.name}</b>
                  <span>{m.email}</span>
                </div>
                <span className={`member__role member__role--${m.role}`}>{m.role_label}</span>
                <span className="member__when">{m.when}</span>
                <div className="member__act">
                  {m.role !== "owner" ? (
                    <>
                      <button
                        type="button"
                        className="rowbtn"
                        aria-label="Edit role"
                        onClick={() => showToast("Role changes will be available soon")}
                      >
                        <Icon name="i-settings" width={13} height={13} />
                      </button>
                      <button
                        type="button"
                        className="rowbtn"
                        aria-label="Remove member"
                        onClick={() => showToast("Removal will be available soon")}
                      >
                        <Icon name="i-x" width={13} height={13} />
                      </button>
                    </>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <h3 style={{ fontSize: 15, fontWeight: 800, margin: "26px 0 10px", letterSpacing: "-.01em" }}>
        Roles &amp; permissions
      </h3>
      <div className="roles">
        <div className="role">
          <span className="role__name role__name--owner">Owner</span>
          <p>Full control of the account, including billing, ownership transfer and deletion.</p>
          <ul>
            <li>Manage team and roles</li>
            <li>Billing and payment methods</li>
            <li>Delete or transfer the account</li>
          </ul>
        </div>
        <div className="role">
          <span className="role__name role__name--admin">Admin</span>
          <p>Day-to-day operator. Can do everything except billing and account ownership.</p>
          <ul>
            <li>Submit applications</li>
            <li>Buy standards and manage orders</li>
            <li>Invite and remove members</li>
          </ul>
        </div>
        <div className="role">
          <span className="role__name role__name--member">Member</span>
          <p>Contributor. Can create and submit but cannot manage the team or billing.</p>
          <ul>
            <li>Create applications</li>
            <li>Upload documents</li>
            <li>View orders and certificates</li>
          </ul>
        </div>
        <div className="role">
          <span className="role__name role__name--viewer">Viewer</span>
          <p>Read-only. Useful for external accountants, auditors or consultants.</p>
          <ul>
            <li>View applications</li>
            <li>View orders and certificates</li>
            <li>Download PDFs</li>
          </ul>
        </div>
      </div>
    </section>
  );
}

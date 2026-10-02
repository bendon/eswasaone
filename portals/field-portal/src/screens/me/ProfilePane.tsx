import type { SessionUser } from "@eswasaone/shared-ui";

type Props = {
  user: SessionUser;
  enabled?: boolean;
  refreshKey?: string;
  onAuthRequired: (reason?: string) => void;
};

/** Profile — session identity; expense claims live under Claims tab. */
export function ProfilePane({ user }: Props) {
  return (
    <div className="me-pane">
      <h2 className="me-pane__title">Profile</h2>
      <dl className="me-kv">
        <div>
          <dt>Name</dt>
          <dd>{user.full_name || user.username}</dd>
        </div>
        <div>
          <dt>Username</dt>
          <dd>{user.username}</dd>
        </div>
        <div>
          <dt>Email</dt>
          <dd>{user.email || "—"}</dd>
        </div>
        <div>
          <dt>Roles</dt>
          <dd>{(user.roles ?? []).join(", ") || "—"}</dd>
        </div>
      </dl>
    </div>
  );
}

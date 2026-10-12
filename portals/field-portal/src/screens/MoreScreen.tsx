import { Link } from "react-router-dom";
import { Icon } from "@eswasaone/shared-ui";
import { useStoreResource } from "@eswasaone/shared-ui/store";
import { outbox, outboxSummary } from "../lib/outbox";
import { useAuth } from "../auth/AuthProvider";

/**
 * Field More — notifications, sync, settings, help, sign out + PWA version footer.
 */
export function MoreScreen() {
  const { signOut } = useAuth();

  // TODO: wire real — unread count from GET /notifications?audience=staff
  const unread = 2;
  const sync = useStoreResource([outbox], () => outboxSummary(), []);
  const syncLabel = sync.data?.label ?? "Checking…";

  const onSignOut = () => {
    void signOut();
  };

  return (
    <section className="field-screen" aria-label="More">
      <div className="hm-card hm-stack">
        <button type="button" className="hm-row">
          <span className="hm-row__ic">
            <Icon name="i-bell" />
          </span>
          <div className="hm-row__body">
            <b>Notifications</b>
            <span>{unread} unread</span>
          </div>
          <Icon name="i-cright" className="hm-row__chev" />
        </button>
        <Link to="/outbox" className="hm-row">
          <span className={`hm-row__ic${sync.data?.conflict || sync.data?.failed ? " hm-row__ic--danger" : " hm-row__ic--ok"}`}>
            <Icon name="i-refresh" />
          </span>
          <div className="hm-row__body">
            <b>Sync status · Outbox</b>
            <span>{syncLabel}</span>
          </div>
          <Icon name="i-cright" className="hm-row__chev" />
        </Link>
      </div>

      <div className="hm-card">
        <button type="button" className="hm-row">
          <span className="hm-row__ic">
            <Icon name="i-settings" />
          </span>
          <div className="hm-row__body">
            <b>Settings</b>
          </div>
          <Icon name="i-cright" className="hm-row__chev" />
        </button>
        <button type="button" className="hm-row">
          <span className="hm-row__ic">
            <Icon name="i-book" />
          </span>
          <div className="hm-row__body">
            <b>Help &amp; support</b>
          </div>
          <Icon name="i-cright" className="hm-row__chev" />
        </button>
        <button type="button" className="hm-row hm-row--danger" onClick={onSignOut}>
          <span className="hm-row__ic hm-row__ic--danger">
            <Icon name="i-out" />
          </span>
          <div className="hm-row__body">
            <b>Sign out</b>
          </div>
        </button>
      </div>

      <p className="hm-more__foot">EswasaOne Field · v1.0 · installable PWA</p>
    </section>
  );
}

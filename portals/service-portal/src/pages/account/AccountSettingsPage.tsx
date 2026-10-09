import { useEffect, useState } from "react";
import { Icon, type NotificationPrefs } from "@eswasaone/shared-ui";
import { useAccount } from "./AccountContext";
import { getNotificationPrefs, updateNotificationPrefs, updateProfile } from "../../api/account";
import { useToast } from "../../ui/Toast";
import { Skeleton } from "./Skeleton";

const PREF_FIELDS: { key: keyof NotificationPrefs; label: string; desc: string }[] = [
  { key: "application_updates", label: "Application updates", desc: "Status changes, document requests, audit scheduling" },
  { key: "order_confirmations", label: "Order confirmations", desc: "Receipts and licence delivery for standards purchases" },
  { key: "certificate_expiry", label: "Certificate expiry reminders", desc: "90, 60 and 30 days before a certificate expires" },
  { key: "training_announcements", label: "Training announcements", desc: "New sessions and course updates" },
];

export function AccountSettingsPage() {
  const { entity, activeEntity } = useAccount();
  const [prefs, setPrefs] = useState<NotificationPrefs | null>(null);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [twoFactor, setTwoFactor] = useState(false);
  const { showToast } = useToast();

  useEffect(() => {
    setLoading(true);
    void getNotificationPrefs().then((p) => {
      setPrefs(p);
      setTwoFactor(p.two_factor);
      setLoading(false);
    });
  }, []);

  useEffect(() => {
    if (activeEntity) {
      setName(activeEntity.name);
    }
  }, [activeEntity]);

  const isBiz = entity === "business";

  const togglePref = (key: keyof NotificationPrefs) => {
    if (!prefs) return;
    const updated = { ...prefs, [key]: !prefs[key] };
    setPrefs(updated);
    void updateNotificationPrefs(updated);
  };

  const toggle2FA = () => {
    const next = !twoFactor;
    setTwoFactor(next);
    if (prefs) {
      const updated = { ...prefs, two_factor: next };
      setPrefs(updated);
      void updateNotificationPrefs(updated);
    }
  };

  const handleSave = () => {
    void updateProfile({ full_name: name, email, phone }).then(() => {
      showToast("Changes saved");
    });
  };

  if (loading) {
    return (
      <section className="panel is-on" role="tabpanel">
        <div className="setgrid">
          <Skeleton lines={4} />
          <Skeleton lines={5} />
        </div>
      </section>
    );
  }

  return (
    <section className="panel is-on" role="tabpanel">
      <div className="panel__head">
        <div>
          <h2>Settings</h2>
          <p>{isBiz ? "Manage company details, notifications and access" : "Manage your details, notifications and security"}</p>
        </div>
      </div>

      <div className="setgrid">
        {/* Account details */}
        <div className="setsec">
          <div className="setsec__head">
            <h3>Account details</h3>
            <p>{isBiz ? "Information about your business account" : "Your personal information"}</p>
          </div>
          <div className="setsec__body">
            <div className="field__row">
              <div className="field">
                <label htmlFor="f-name">{isBiz ? "Primary contact name" : "Full name"}</label>
                <input
                  id="f-name"
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </div>
              <div className="field">
                <label htmlFor="f-phone">Phone</label>
                <input
                  id="f-phone"
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+268 7600 0000"
                />
              </div>
            </div>
            <div className="field">
              <label htmlFor="f-email">Email</label>
              <input
                id="f-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
              />
            </div>
            {isBiz ? (
              <div className="field" data-context-only="business">
                <label htmlFor="f-reg">Company registration number</label>
                <input id="f-reg" type="text" value="R-2024-00417" readOnly />
              </div>
            ) : null}
            <div>
              <button type="button" className="abtn primary" onClick={handleSave}>
                Save changes
              </button>
            </div>
          </div>
        </div>

        {/* Notifications */}
        <div className="setsec">
          <div className="setsec__head">
            <h3>Notifications</h3>
            <p>Choose what we send you and how</p>
          </div>
          <div className="setsec__body">
            {PREF_FIELDS.map((f) => (
              <div key={f.key} className="toggle">
                <div className="toggle__copy">
                  <b>{f.label}</b>
                  <span>{f.desc}</span>
                </div>
                <button
                  type="button"
                  className="switch"
                  role="switch"
                  aria-checked={prefs?.[f.key] ?? false}
                  aria-label={f.label}
                  onClick={() => togglePref(f.key)}
                />
              </div>
            ))}
          </div>
        </div>

        {/* Security */}
        <div className="setsec">
          <div className="setsec__head">
            <h3>Security</h3>
            <p>Password, sessions and two-factor</p>
          </div>
          <div className="setsec__body">
            <div className="toggle">
              <div className="toggle__copy">
                <b>Two-factor authentication</b>
                <span>Recommended. Adds a one-time code at sign-in</span>
              </div>
              <button
                type="button"
                className="switch"
                role="switch"
                aria-checked={twoFactor}
                aria-label="Two-factor authentication"
                onClick={toggle2FA}
              />
            </div>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <button type="button" className="abtn ghost" onClick={() => showToast("Opening password change…")}>
                <Icon name="i-file" /> Change password
              </button>
              <button type="button" className="abtn ghost" onClick={() => showToast("Signing out all devices…")}>
                <Icon name="i-out" /> Sign out all devices
              </button>
            </div>
          </div>
        </div>

        {/* Danger zone */}
        <div className="setsec danger">
          <div className="setsec__head">
            <h3>Danger zone</h3>
            <p>{isBiz ? "Permanently remove this business account from EswasaOne" : "Permanently remove your personal account from EswasaOne"}</p>
          </div>
          <div className="setsec__body">
            <button type="button" className="danger__btn" onClick={() => showToast("This action requires re-authentication")}>
              <Icon name="i-warn" width={16} height={16} />
              {isBiz ? "Delete business account" : "Delete personal account"}
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
import { useEffect, useState } from "react";
import { getPreferences, updatePreferences, type UserPreferences } from "@eswasaone/shared-ui";
import { useInstitution } from "../layout/InstitutionLayout";
import { Crumbs } from "./parts";

/**
 * Security settings — OTP (two-factor) toggle.
 * Uses Core API GET/PUT /auth/preferences which writes through to
 * Frappe User.custom_otp_enabled. Works across all portals.
 */
export function SecuritySettings() {
  const { user: _user } = useInstitution();
  const [otpEnabled, setOtpEnabled] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [pendingValue, setPendingValue] = useState<boolean | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    void getPreferences()
      .then((p: UserPreferences) => {
        if (active) setOtpEnabled(p.otp_enabled);
      })
      .catch((e: Error) => {
        if (active) setError(String(e.message || e));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  function requestToggle(next: boolean) {
    setPendingValue(next);
    setConfirming(true);
  }

  async function confirmToggle() {
    if (pendingValue === null) return;
    setSaving(true);
    setError(null);
    try {
      const result = await updatePreferences({ otp_enabled: pendingValue });
      setOtpEnabled(result.otp_enabled);
      setConfirming(false);
      setPendingValue(null);
    } catch (e: any) {
      setError(String(e.message || e));
    } finally {
      setSaving(false);
    }
  }

  function cancelToggle() {
    setConfirming(false);
    setPendingValue(null);
  }

  if (loading) {
    return (
      <div className="hr-view">
        <Crumbs items={[["My HR", "/me"], ["Security"]]} />
        <div className="hr-box">
          <div className="hr-box__b">
            <p className="page-note">Loading security settings…</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="hr-view">
      <Crumbs items={[["My HR", "/me"], ["Security"]]} />
      <div className="hr-head">
        <div>
          <h2>Security settings</h2>
          <p>Manage how you sign in to EswasaOne.</p>
        </div>
      </div>

      <div className="hr-box">
        <div className="hr-box__h">
          <div>
            <h3>Two-factor authentication (OTP)</h3>
            <p>
              When enabled, you'll receive a one-time code by email each time you
              sign in. Disable it for password-only login — less secure but
              faster on trusted devices.
            </p>
          </div>
        </div>
        <div className="hr-box__b" style={{ gap: 14 }}>
          {error ? (
            <p className="page-note" style={{ color: "var(--danger, #c0392b)" }}>
              {error}
            </p>
          ) : null}

          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 16,
              padding: "12px 0",
              borderBottom: "1px solid var(--border, #e0e0e0)",
            }}
          >
            <div>
              <strong>One-time code at login</strong>
              <p style={{ margin: "4px 0 0", color: "var(--muted)", fontSize: 13 }}>
                {otpEnabled
                  ? "Enabled — a code is emailed after your password."
                  : "Disabled — password-only sign-in."}
              </p>
            </div>
            <button
              type="button"
              className={otpEnabled ? "btn pri" : "btn ghost"}
              disabled={saving || confirming}
              onClick={() => requestToggle(!otpEnabled)}
              style={{ minWidth: 120 }}
            >
              {otpEnabled ? "Disable" : "Enable"}
            </button>
          </div>

          {confirming ? (
            <div
              style={{
                background: "var(--surface-2, #f8f8f8)",
                borderRadius: 8,
                padding: 16,
                border: "1px solid var(--border, #e0e0e0)",
              }}
            >
              <p style={{ margin: "0 0 12px" }}>
                {pendingValue
                  ? "Enable two-factor authentication? You'll need a one-time code from your email every time you sign in."
                  : "Disable two-factor authentication? Your account will be protected by password only. This is less secure."}
              </p>
              <div style={{ display: "flex", gap: 8 }}>
                <button
                  type="button"
                  className="btn pri"
                  disabled={saving}
                  onClick={() => void confirmToggle()}
                >
                  {saving ? "Saving…" : "Confirm"}
                </button>
                <button
                  type="button"
                  className="btn ghost"
                  disabled={saving}
                  onClick={cancelToggle}
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : null}

          <p style={{ fontSize: 12, color: "var(--muted)", margin: "8px 0 0" }}>
            Changes take effect at your next sign-in and apply across all
            EswasaOne portals (Institution, Service, and Field).
          </p>
        </div>
      </div>
    </div>
  );
}
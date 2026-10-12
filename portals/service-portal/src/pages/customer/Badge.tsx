/**
 * Public register widget (05 P3): a live status badge certified clients embed on their own website.
 * /badge/:token renders standalone (no site header) so it fits an iframe; it always reflects the register,
 * so a suspended or withdrawn certificate stops showing as certified straight away.
 * TODO: wire real — GET /verify/{token} (public, cached ≤ 5 min).
 */
import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { verifyCertificateToken } from "@eswasaone/shared-ui/certification";

export function BadgePage() {
  const { token = "" } = useParams();
  const [r, setR] = useState<ReturnType<typeof verifyCertificateToken> | null>(null);
  useEffect(() => {
    try {
      setR(verifyCertificateToken(token));
    } catch {
      setR({ valid: false });
    }
  }, [token]);
  const href = `${window.location.origin}/verify/${encodeURIComponent(token)}`;
  const ok = r?.valid;
  const tone = !r ? "#64748b" : ok ? "#15803d" : "#b91c1c";
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener"
      style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", border: `2px solid ${tone}`, borderRadius: 12, background: "#fff", color: "#0f172a", textDecoration: "none", font: "13px/1.35 system-ui, sans-serif", maxWidth: 300, boxSizing: "border-box" }}
      aria-label={ok ? `${r?.org} is ESWASA certified to ${r?.standard}. Verify.` : "Certificate status. Verify."}
    >
      <span aria-hidden style={{ width: 34, height: 34, borderRadius: "50%", background: tone, color: "#fff", display: "grid", placeItems: "center", fontWeight: 800, flex: "0 0 auto" }}>
        {ok ? "✓" : "!"}
      </span>
      <span>
        <b style={{ display: "block" }}>{!r ? "Checking…" : ok ? "ESWASA certified" : r.state ? `Certificate ${r.state.toLowerCase()}` : "Certificate not found"}</b>
        {r?.standard ? <span style={{ display: "block" }}>{r.standard}</span> : null}
        <span style={{ color: "#64748b", fontSize: 11.5 }}>
          {r?.number ? `${r.number} · ` : ""}Live from the ESWASA register — click to verify
        </span>
      </span>
    </a>
  );
}

/** Snippet panel on the customer's certificate page. */
export function EmbedBadgePanel({ token }: { token: string }) {
  const [copied, setCopied] = useState(false);
  const src = `${window.location.origin}/badge/${token}`;
  const code = `<iframe src="${src}" title="ESWASA certification status" width="300" height="72" style="border:0" loading="lazy"></iframe>`;
  return (
    <div className="crm-card">
      <div className="crm-card__h">
        <h3>Embed a live badge on your website</h3>
      </div>
      <p className="crm-small" style={{ marginTop: 0 }}>
        The badge reads the public register every time it loads. If the certificate is suspended or expires, the badge says so — never copy a static image instead.
      </p>
      <iframe src={src} title="Badge preview" width={300} height={72} style={{ border: 0 }} />
      <textarea className="crm-textarea" readOnly rows={3} value={code} style={{ fontFamily: "ui-monospace, monospace", fontSize: 12, marginTop: 8 }} onFocus={(e) => e.currentTarget.select()} />
      <button
        type="button"
        className="crm-btn crm-btn--sm"
        style={{ marginTop: 6 }}
        onClick={() => void navigator.clipboard?.writeText(code).then(() => setCopied(true))}
      >
        {copied ? "Copied" : "Copy code"}
      </button>
    </div>
  );
}

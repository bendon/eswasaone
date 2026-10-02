import { useState } from "react";
import { apiBase } from "../api/client";

export type FileDownloadProps = {
  /** Core path that returns a signed URL or binary, e.g. /estore/licences/:id/download */
  href: string;
  label?: string;
  filename?: string;
  className?: string;
  /** When true, href is already a signed absolute URL — open/download directly */
  signed?: boolean;
};

/**
 * Download helper for Core signed URLs / file endpoints.
 * Never embeds licensed full text — only triggers download of entitlement artefacts.
 */
export function FileDownload({
  href,
  label = "Download",
  filename,
  className = "btn",
  signed = false,
}: FileDownloadProps) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function run() {
    setErr(null);
    setBusy(true);
    try {
      if (signed) {
        const a = document.createElement("a");
        a.href = href;
        if (filename) a.download = filename;
        a.rel = "noopener";
        a.target = "_blank";
        a.click();
        return;
      }
      const url = `${apiBase()}${href.startsWith("/") ? href : `/${href}`}`;
      const res = await fetch(url, {
        credentials: "include",
        headers: { Accept: "application/json, application/octet-stream, */*" },
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(text.slice(0, 240) || `Download failed (${res.status})`);
      }
      const ct = res.headers.get("content-type") ?? "";
      if (ct.includes("application/json")) {
        const body = (await res.json()) as { url?: string; download_url?: string };
        const downloadUrl = body.url ?? body.download_url;
        if (!downloadUrl) throw new Error("No download URL in response");
        window.open(downloadUrl, "_blank", "noopener,noreferrer");
        return;
      }
      const blob = await res.blob();
      const obj = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = obj;
      a.download = filename ?? "download";
      a.click();
      URL.revokeObjectURL(obj);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Download failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <span className="file-download">
      <button type="button" className={className} disabled={busy} onClick={() => void run()}>
        {busy ? "…" : label}
      </button>
      {err ? (
        <span className="file-download__err" role="alert">
          {err}
        </span>
      ) : null}
    </span>
  );
}

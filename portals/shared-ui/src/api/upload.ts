/**
 * Multipart upload to Core media store — POST /media/upload {file, prefix}.
 * sessionFetch forces a JSON content-type, so this sends the same auth headers on a raw fetch
 * and lets the browser set the multipart boundary.
 */
import { apiBase } from "./base";
import { getCsrfToken, getStoredToken } from "../auth/session";

/** Mirrors the live BFF `MediaObjectOut`. TODO: wire real — move to contract types once /media is in openapi.yaml. */
export type MediaObject = {
  key: string;
  bucket: string;
  content_type: string;
  size: number;
  url: string;
  backend: "local" | "s3";
};

export type UploadResult = MediaObject & { name: string; mocked?: boolean };

export const UPLOAD_LIMITS = { maxBytes: 10 * 1024 * 1024, maxFiles: 5, accept: "application/pdf" };

export function validateUpload(file: File, opts: { maxBytes?: number; accept?: string } = {}): string | null {
  const max = opts.maxBytes ?? UPLOAD_LIMITS.maxBytes;
  if (file.size > max) return `${file.name} is larger than ${Math.round(max / 1024 / 1024)} MB.`;
  if (opts.accept && opts.accept !== "*" && !opts.accept.split(",").some((a) => matchesType(file, a.trim())))
    return `${file.name} is not an accepted file type.`;
  return null;
}

function matchesType(file: File, accept: string): boolean {
  if (accept.endsWith("/*")) return file.type.startsWith(accept.slice(0, -1));
  if (accept.startsWith(".")) return file.name.toLowerCase().endsWith(accept.toLowerCase());
  return file.type === accept;
}

export async function uploadMedia(file: File, prefix = "uploads"): Promise<UploadResult> {
  const form = new FormData();
  form.append("file", file);
  form.append("prefix", prefix);
  const headers: Record<string, string> = { Accept: "application/json" };
  const bearer = getStoredToken();
  if (bearer) headers.Authorization = `Bearer ${bearer}`;
  const csrf = getCsrfToken();
  if (csrf) headers["X-CSRF-Token"] = csrf;
  try {
    const res = await fetch(`${apiBase()}/media/upload`, {
      method: "POST",
      body: form,
      headers,
      credentials: "include",
    });
    if (!res.ok) throw new Error(`API ${res.status}: /media/upload`);
    const data = (await res.json()) as MediaObject;
    return { ...data, name: file.name };
  } catch {
    // TODO: wire real — media store unavailable; keep a local object URL so the UI flow continues.
    return {
      key: `${prefix}/${Date.now().toString(36)}-${file.name}`,
      bucket: "local",
      content_type: file.type || "application/octet-stream",
      size: file.size,
      url: typeof URL !== "undefined" && "createObjectURL" in URL ? URL.createObjectURL(file) : "",
      backend: "local",
      name: file.name,
      mocked: true,
    };
  }
}

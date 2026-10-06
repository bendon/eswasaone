/** API error helpers — parse Core/FastAPI bodies and surface a global modal. */

import { globalAlert } from "../components/dialogBus";

export class ApiError extends Error {
  status: number;
  detail: string;
  path: string;
  /** True when a global message modal was already shown for this error. */
  notified: boolean;

  constructor(status: number, detail: string, path: string, notified = false) {
    super(detail);
    this.name = "ApiError";
    this.status = status;
    this.detail = detail;
    this.path = path;
    this.notified = notified;
  }
}

/** Flatten FastAPI `detail` (string | validation array | object). */
export function extractDetail(body: unknown, fallback: string): string {
  if (body == null) return fallback;
  if (typeof body === "string") return body;
  if (typeof body !== "object") return fallback;
  const d = (body as { detail?: unknown }).detail;
  if (typeof d === "string") return d;
  if (Array.isArray(d)) {
    return d
      .map((item) => {
        if (typeof item === "string") return item;
        if (item && typeof item === "object" && "msg" in item) {
          return String((item as { msg: unknown }).msg);
        }
        return JSON.stringify(item);
      })
      .filter(Boolean)
      .join("\n");
  }
  if (d && typeof d === "object" && "message" in d) {
    return String((d as { message: unknown }).message);
  }
  const msg = (body as { message?: unknown }).message;
  if (typeof msg === "string") return msg;
  return fallback;
}

const INFRA_HINTS: Array<{ re: RegExp; message: string }> = [
  {
    re: /Failed to get method for command|has no attrib|is not whitelisted|AttributeError|ModuleNotFoundError/i,
    message: "This action isn't available right now. Please try again in a moment.",
  },
  {
    re: /Frappe unreachable|ConnectError|Connection refused|timed out|ECONNREFUSED/i,
    message: "Records service is temporarily unavailable. Please try again shortly.",
  },
  {
    re: /Traceback \(most recent call last\)/i,
    message: "Something went wrong completing that action. Your work wasn't lost — try again.",
  },
];

/** Strip Frappe/Core transport noise for the modal body. Never show method paths or JSON dumps. */
export function humanizeApiDetail(raw: string): string {
  let text = raw.replace(/\s+/g, " ").trim();

  for (const { re, message } of INFRA_HINTS) {
    if (re.test(text)) return message;
  }

  // Frappe POST /api/method/foo failed: {"exception":"..."}
  const transport = text.match(/^Frappe\s+\w+\s+\/api\/\S+\s+failed:\s*(.*)$/i);
  if (transport) {
    text = transport[1].trim();
  }

  // JSON blob with exception field
  if (text.startsWith("{") && text.includes("exception")) {
    try {
      const parsed = JSON.parse(text) as { exception?: string; exc_type?: string };
      if (typeof parsed.exception === "string" && parsed.exception.trim()) {
        text = parsed.exception.trim();
      }
    } catch {
      const m = text.match(/"exception"\s*:\s*"((?:\\.|[^"\\])+)"/);
      if (m) {
        try {
          text = JSON.parse(`"${m[1]}"`) as string;
        } catch {
          text = m[1];
        }
      }
    }
  }

  for (const { re, message } of INFRA_HINTS) {
    if (re.test(text)) return message;
  }

  text = text.replace(
    /^(?:frappe\.[\w.]+\.)?(?:WorkflowTransitionError|ValidationError|MandatoryError|PermissionError|DoesNotExistError|LinkValidationError|DuplicateEntryError):\s*/gi,
    "",
  );
  text = text.replace(/^frappe\.model\.workflow\.\w+:\s*/i, "");

  // Still looks like plumbing
  if (/\/api\/method\/|eswasa_\w+\.api\.|"exception"|module '.+' has no/i.test(text)) {
    return "Something went wrong completing that action. Please try again.";
  }

  return text.trim() || "Something went wrong. Please try again.";
}

function titleForStatus(status: number): string {
  if (status === 400 || status === 422) return "Can't complete that action";
  if (status === 403) return "Permission needed";
  if (status === 404) return "Not found";
  if (status === 409) return "Conflict";
  if (status === 503) return "Temporarily unavailable";
  if (status >= 500) return "Couldn't complete that";
  return "Something went wrong";
}

/**
 * Show the global MessageAlert modal (requires DialogHost / DialogProvider mounted).
 * Safe no-op if dialogs are not mounted yet — still returns a resolved promise.
 */
export function showApiError(err: ApiError | { status: number; detail: string }): Promise<void> {
  const status = err.status;
  const detail = humanizeApiDetail(err.detail);
  return globalAlert({
    title: titleForStatus(status),
    message: detail,
    kind: status >= 500 ? "error" : "info",
    okLabel: "OK",
  });
}

/** Build ApiError from a failed response body; optionally notify globally. */
export function apiErrorFromResponse(
  status: number,
  body: unknown,
  path: string,
  opts: { notify?: boolean } = {},
): ApiError {
  const raw = extractDetail(body, `API ${status}: ${path}`);
  const detail = humanizeApiDetail(raw);
  const err = new ApiError(status, detail, path, false);
  if (opts.notify) {
    void showApiError(err);
    err.notified = true;
  }
  return err;
}

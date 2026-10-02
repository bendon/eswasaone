import { http, HttpResponse } from "msw";
import { auditHandlers } from "./auditHandlers";
import { hrHandlers } from "./hrHandlers";

const API = "/api";

/** Minimal MSW stubs for offline smoke demo. */
export const handlers = [
  http.get(`${API}/auth/me`, () =>
    HttpResponse.json({
      username: "field.demo",
      full_name: "Demo Field Officer",
      email: "field.demo@eswasa.local",
      roles: ["ESWASA Staff", "Certification Auditor"],
    }),
  ),
  http.get(`${API}/field/ping`, () =>
    HttpResponse.json({ ok: true, portal: "field", stub: true }),
  ),
  ...hrHandlers,
  ...auditHandlers,
];

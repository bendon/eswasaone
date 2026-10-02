import { http, HttpResponse } from "msw";
import type { InstitutionHome, AgentAskResponse } from "@eswasaone/shared-ui";

const API = "http://127.0.0.1:8015/api";

/** Empty shell — MSW stubs auth only; no transactional demo payloads. */
const home: InstitutionHome = {
  kpis: [],
  modules: [],
  feed: [],
};

export const handlers = [
  http.post(`${API}/auth/login`, async ({ request }) => {
    const body = (await request.json()) as {
      email?: string;
      username?: string;
      password?: string;
      otp?: string;
    };
    const id = body.email || body.username || "demo";
    return HttpResponse.json(
      {
        access_token: "mock-token",
        token_type: "bearer",
        user: {
          username: id,
          full_name: id.split("@")[0],
          email: id.includes("@") ? id : undefined,
          roles: ["Citizen", "ESWASA Staff", "HR Manager"],
        },
      },
      {
        headers: {
          "Set-Cookie":
            "eswasaone_session=mock-token; Path=/; SameSite=Lax, eswasaone_csrf=mock-csrf; Path=/; SameSite=Lax",
        },
      },
    );
  }),
  http.post(`${API}/auth/register`, async ({ request }) => {
    const body = (await request.json()) as { email: string; name: string };
    return HttpResponse.json(
      {
        access_token: "mock-token",
        token_type: "bearer",
        user: { username: body.email, full_name: body.name, email: body.email, roles: ["Citizen"] },
      },
      { status: 201 },
    );
  }),
  http.post(`${API}/auth/otp`, () => HttpResponse.json({ ok: true, message: "OTP stubbed" })),
  http.post(`${API}/auth/logout`, () => new HttpResponse(null, { status: 204 })),
  http.get(`${API}/auth/me`, ({ request }) => {
    const auth = request.headers.get("Authorization");
    const cookie = request.headers.get("Cookie") || "";
    if (auth?.startsWith("Bearer ") || cookie.includes("eswasaone_session=")) {
      return HttpResponse.json({
        username: "demo",
        full_name: "Demo User",
        email: "demo@eswasaone.local",
        roles: ["Citizen", "ESWASA Staff", "HR Manager"],
      });
    }
    return HttpResponse.json({ auth_required: true }, { status: 401 });
  }),
  http.post(`${API}/auth/invite-staff`, async ({ request }) => {
    const body = (await request.json()) as { email: string; full_name: string; roles?: string[] };
    return HttpResponse.json(
      {
        ok: true,
        email: body.email,
        message: `Invite sent to ${body.full_name} <${body.email}>`,
      },
      { status: 201 },
    );
  }),
  http.get(`${API}/home/institution`, () => HttpResponse.json(home)),
  http.post(`${API}/agent/ask`, async ({ request }) => {
    const body = (await request.json()) as { message?: string };
    const msg = body.message ?? "";
    const res: AgentAskResponse = {
      answer: `Routing “${msg}” to the matching institution module. Open Approvals or Reports from the sidebar for the full record set.`,
      tools_used: ["mock_router"],
    };
    return HttpResponse.json(res);
  }),
];

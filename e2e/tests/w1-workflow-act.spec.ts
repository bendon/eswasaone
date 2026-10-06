import { test, expect } from "@playwright/test";

/**
 * Wave 1 — workflow fabric skeletons (map §5 / §6).
 * Fill assertions once staging has personas + seeded docs.
 *
 * Env:
 *   ESWASAONE_BASE_URL (default staging)
 *   ESWASA_DEMO_EMAIL / ESWASA_DEMO_PASSWORD (optional login)
 */

const api = (path: string) => `/api${path}`;

test.describe("W1 workflow act skeletons", () => {
  test.skip(
    !process.env.ESWASA_E2E_LIVE,
    "Set ESWASA_E2E_LIVE=1 to run against a live Core+Frappe stack",
  );

  test("POST /certification/applications/{id}/act requires auth", async ({
    request,
  }) => {
    const res = await request.post(api("/certification/applications/APP-E2E/act"), {
      data: { action: "submit", confirm: true },
    });
    expect([401, 403]).toContain(res.status());
  });

  test("POST /standards/work-items/{id}/act is registered", async ({
    request,
  }) => {
    const res = await request.post(api("/standards/work-items/WI-E2E/act"), {
      data: { action: "start", confirm: true },
    });
    // Unauth or unavailable — must not 404
    expect(res.status()).not.toBe(404);
  });

  test("POST /metrology/jobs/{id}/act is registered", async ({ request }) => {
    const res = await request.post(api("/metrology/jobs/JOB-E2E/act"), {
      data: { action: "start", confirm: true },
    });
    expect(res.status()).not.toBe(404);
  });

  test("POST /tbt/notifications/{id}/act is registered", async ({ request }) => {
    const res = await request.post(api("/tbt/notifications/TBT-E2E/act"), {
      data: { action: "tag", confirm: true },
    });
    expect(res.status()).not.toBe(404);
  });

  test("POST /governance/resolutions/{id}/act is registered", async ({
    request,
  }) => {
    const res = await request.post(api("/governance/resolutions/BR-E2E/act"), {
      data: { action: "submit", confirm: true },
    });
    expect(res.status()).not.toBe(404);
  });

  test("POST /field/visits/{id}/act is registered", async ({ request }) => {
    const res = await request.post(api("/field/visits/FV-E2E/act"), {
      data: { action: "Assign team", confirm: true },
    });
    expect(res.status()).not.toBe(404);
  });

  test("GET /approvals queue shape (auth required)", async ({ request }) => {
    const res = await request.get(api("/approvals?limit=5"));
    expect([200, 401, 403]).toContain(res.status());
    if (res.status() === 200) {
      const body = await res.json();
      expect(body).toHaveProperty("items");
    }
  });
});

test.describe("W1 Institution Approvals shell", () => {
  test("Institution approvals route loads or auth-gates", async ({ page }) => {
    const res = await page.goto("/institution/approvals");
    // 200 shell or redirect to login — not 404
    expect(res?.status()).not.toBe(404);
    await expect(page.locator("body")).not.toContainText("Cannot GET");
  });
});

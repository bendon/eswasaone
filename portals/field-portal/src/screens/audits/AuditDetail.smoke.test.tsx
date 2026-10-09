import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DialogProvider, IconSprite } from "@eswasaone/shared-ui";
import { AuditDetail } from "./AuditDetail";
import type { FieldAuditRow } from "./types";
import * as api from "./api";

vi.mock("../../auth/AuthProvider", () => ({
  useAuth: () => ({ user: { username: "field.demo", full_name: "Demo Field Officer", roles: [] }, openAuth: vi.fn() }),
}));

vi.mock("./api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./api")>();
  return { ...actual, submitAudit: vi.fn().mockResolvedValue(true) };
});

const productAudit: FieldAuditRow = {
  id: "AUD-TEST-1",
  application_id: "CERT-TEST-1",
  auditor: "Demo Field Officer",
  scheme: "Product — ESWASA Mark",
  due_date: "2026-10-07",
  status: "scheduled",
  company: "Swazi Tiles",
  stage: "Initial factory assessment",
};

function renderDetail(audit: FieldAuditRow, onSubmitted = vi.fn()) {
  return render(
    <DialogProvider>
      <IconSprite />
      <AuditDetail audit={audit} auditorDisplayName="Demo Field Officer" onBack={vi.fn()} onLocallySubmitted={onSubmitted} />
    </DialogProvider>,
  );
}

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
});

describe("AuditDetail", () => {
  it("uses the product checklist, opens an NC from a checklist verdict and records samples", async () => {
    const user = userEvent.setup();
    renderDetail(productAudit);
    expect(screen.getByText("Factory assessment & sampling")).toBeInTheDocument();
    expect(screen.getByText("Factory production control")).toBeInTheDocument();

    const group = screen.getByRole("group", { name: "Test & measuring equipment" });
    await user.click(group.querySelector("button.n") as HTMLElement);
    expect(screen.getByLabelText("Clause / requirement")).toHaveValue("Test & measuring equipment (Calibration certificates)");

    await user.type(screen.getByLabelText("Product"), "Roof tile");
    await user.type(screen.getByLabelText("Batch / lot"), "B1");
    await user.type(screen.getByLabelText("Seal number"), "S-9");
    await user.click(screen.getByRole("button", { name: /Record sealed sample/ }));
    expect(screen.getByText(/Roof tile · batch B1/)).toBeInTheDocument();
  });

  it("requires complete findings and auditee name, then submits via PATCH", async () => {
    const user = userEvent.setup();
    const onSubmitted = vi.fn();
    renderDetail({ ...productAudit, scheme: "ISO 9001:2015", stage: "Stage 2" }, onSubmitted);
    expect(screen.getByText("Stage 2 — implementation")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /Raise a non-conformity/ }));
    await user.type(screen.getByLabelText("Clause / requirement"), "9.2 Internal audit");
    await user.type(screen.getByLabelText("Statement of non-conformity"), "Dispatch not audited");
    await user.click(screen.getByRole("button", { name: "Done" }));

    const auditee = screen.getByRole("button", { name: /capture auditee/ });
    expect(auditee).toBeDisabled();
    await user.type(screen.getByLabelText("Auditee representative"), "Z. Mamba, QA");
    await user.click(auditee);

    await user.click(screen.getByRole("button", { name: /Submit audit/ }));
    const confirm = await waitFor(() => {
      const all = screen.getAllByRole("button", { name: "Submit audit" });
      expect(all.length).toBeGreaterThan(1);
      return all[all.length - 1];
    });
    await user.click(confirm);
    await waitFor(() => expect(api.submitAudit).toHaveBeenCalled());
    const sent = vi.mocked(api.submitAudit).mock.calls[0][0];
    expect(sent.findings[0]).toMatchObject({ clause: "9.2 Internal audit", note: "Dispatch not audited" });
    expect(sent.submitKey).toBeTruthy();
    await waitFor(() => expect(onSubmitted).toHaveBeenCalledWith(productAudit.id));
  });
});

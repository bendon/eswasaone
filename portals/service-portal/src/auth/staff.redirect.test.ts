import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  FIELD_PORTAL_PATH,
  INSTITUTION_PORTAL_PATH,
  hasFieldEssRole,
  redirectStaffAfterLogin,
} from "@eswasaone/shared-ui";

describe("redirectStaffAfterLogin", () => {
  const assign = vi.fn();

  beforeEach(() => {
    assign.mockReset();
    vi.stubGlobal("window", {
      location: {
        pathname: "/",
        assign,
      },
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("does not redirect citizens", () => {
    expect(redirectStaffAfterLogin(["Citizen"])).toBe(false);
    expect(assign).not.toHaveBeenCalled();
  });

  it("sends Employee / ESS to Field", () => {
    expect(redirectStaffAfterLogin(["Employee", "Employee Self Service"])).toBe(
      true,
    );
    expect(assign).toHaveBeenCalledWith(FIELD_PORTAL_PATH);
  });

  it("sends Certification Auditor to Field", () => {
    expect(redirectStaffAfterLogin(["Certification Auditor", "ESWASA Staff"])).toBe(
      true,
    );
    expect(assign).toHaveBeenCalledWith(FIELD_PORTAL_PATH);
  });

  it("sends desk managers to Institution even with field roles", () => {
    expect(
      redirectStaffAfterLogin([
        "Certification Manager",
        "Certification Auditor",
      ]),
    ).toBe(true);
    expect(assign).toHaveBeenCalledWith(INSTITUTION_PORTAL_PATH);
    expect(hasFieldEssRole(["Certification Manager", "Certification Auditor"])).toBe(
      false,
    );
  });

  it("defaults other staff to Institution", () => {
    expect(redirectStaffAfterLogin(["HR User", "ESWASA Staff"])).toBe(true);
    expect(assign).toHaveBeenCalledWith(INSTITUTION_PORTAL_PATH);
  });

  it("does not loop when already on /field or /institution", () => {
    (window.location as { pathname: string }).pathname = "/field/";
    expect(redirectStaffAfterLogin(["Employee"])).toBe(false);
    (window.location as { pathname: string }).pathname = "/institution/";
    expect(redirectStaffAfterLogin(["HR Manager"])).toBe(false);
    expect(assign).not.toHaveBeenCalled();
  });
});

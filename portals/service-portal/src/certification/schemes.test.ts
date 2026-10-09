import { mergeSchemes, schemeById, type BackendScheme } from "../api/certification";

const row = (code: string, extra: Partial<BackendScheme> = {}): BackendScheme => ({
  code,
  name: `${code} name`,
  scheme_type: "Management System",
  ...extra,
});

describe("mergeSchemes", () => {
  it("shows only backend schemes, styled by their portal template", () => {
    const out = mergeSchemes([row("ISO9001-QMS", { standard_ref: "SZNS ISO 9001:2015", fee: 1500 })]);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({
      id: "iso9001",
      backendCode: "ISO9001-QMS",
      flow: "ms",
      code: "SZNS ISO 9001:2015",
      title: "ISO9001-QMS name",
    });
    expect(out[0].facts.find((f) => f.label === "Fee")?.value).toMatch(/^E 1,500/);
  });

  it("keeps template order and appends schemes added in Desk", () => {
    const out = mergeSchemes([
      row("NEW-SCHEME", { scheme_type: "Product" }),
      row("PRODUCT-MARK", { scheme_type: "Product" }),
      row("ISO14001-EMS"),
    ]);
    expect(out.map((s) => s.id)).toEqual(["iso14001", "product", "NEW-SCHEME"]);
    expect(out[2]).toMatchObject({ flow: "product", listed: true, backendCode: "NEW-SCHEME" });
  });

  it("resolves portal ids and backend codes to the same scheme", () => {
    expect(schemeById("ISO9001-QMS")?.id).toBe("iso9001");
    expect(schemeById("iso9001")?.backendCode).toBe("ISO9001-QMS");
  });
});

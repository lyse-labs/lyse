import { describe, it, expect } from "vitest";
import { migrateTokenJsonToDtcg } from "../../src/codemods/migrate-tokens-dtcg.js";

describe("migrateTokenJsonToDtcg", () => {
  it("converts a Style-Dictionary { value, type } color leaf to DTCG { $value, $type }", () => {
    const r = migrateTokenJsonToDtcg({ color: { primary: { value: "#2563eb", type: "color" } } });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.document).toEqual({ color: { primary: { $value: "#2563eb", $type: "color" } } });
    }
  });

  it("maps Style-Dictionary `spacing` type to DTCG `dimension` (unit-bearing value)", () => {
    const r = migrateTokenJsonToDtcg({ space: { sm: { value: "8px", type: "spacing" } } });
    expect(r.ok).toBe(true);
    if (r.ok) expect((r.document.space as any).sm).toEqual({ $value: "8px", $type: "dimension" });
  });

  it("preserves a leaf description as $description", () => {
    const r = migrateTokenJsonToDtcg({
      color: { brand: { value: "#000000", type: "color", description: "Brand ink" } },
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect((r.document.color as any).brand).toEqual({
        $value: "#000000",
        $type: "color",
        $description: "Brand ink",
      });
    }
  });

  it("preserves nested groups", () => {
    const r = migrateTokenJsonToDtcg({
      color: { base: { fg: { value: "#111", type: "color" }, bg: { value: "#fff", type: "color" } } },
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect((r.document.color as any).base.fg).toEqual({ $value: "#111", $type: "color" });
      expect((r.document.color as any).base.bg).toEqual({ $value: "#fff", $type: "color" });
    }
  });

  it("keeps alias references intact ({color.brand})", () => {
    const r = migrateTokenJsonToDtcg({
      color: { brand: { value: "#000000", type: "color" }, fg: { value: "{color.brand}", type: "color" } },
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect((r.document.color as any).fg).toEqual({ $value: "{color.brand}", $type: "color" });
  });

  it("refuses (ok:false) a file that is already DTCG (idempotent)", () => {
    const r = migrateTokenJsonToDtcg({ color: { primary: { $value: "#2563eb", $type: "color" } } });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/already DTCG/i);
  });

  it("refuses a file with no { value, type } leaves", () => {
    const r = migrateTokenJsonToDtcg({ some: { random: "json" } });
    expect(r.ok).toBe(false);
  });

  it("refuses (skip) when the transformed output would be non-conformant DTCG (unitless dimension)", () => {
    // `8` (number, no unit) is invalid for DTCG dimension — the self-validation
    // gate must catch it and refuse rather than emit broken DTCG.
    const r = migrateTokenJsonToDtcg({ space: { sm: { value: 8, type: "spacing" } } });
    expect(r.ok).toBe(false);
  });

  it("refuses when a leaf has an unmappable type (would produce invalid $type)", () => {
    const r = migrateTokenJsonToDtcg({ weird: { x: { value: "nope", type: "totally-made-up" } } });
    expect(r.ok).toBe(false);
  });
});

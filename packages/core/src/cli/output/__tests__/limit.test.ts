import { describe, expect, it } from "vitest";
import { parseLimit, resolveLimit } from "../limit.js";

describe("parseLimit", () => {
  it("returns undefined when the flag is not set", () => {
    expect(parseLimit(undefined)).toBeUndefined();
    expect(parseLimit(null)).toBeUndefined();
    expect(parseLimit("")).toBeUndefined();
    expect(parseLimit("   ")).toBeUndefined();
  });

  it("returns null for `all` (any casing)", () => {
    expect(parseLimit("all")).toBeNull();
    expect(parseLimit("ALL")).toBeNull();
    expect(parseLimit(" All ")).toBeNull();
  });

  it("treats 0 as `show everything`", () => {
    expect(parseLimit("0")).toBeNull();
    expect(parseLimit(0)).toBeNull();
  });

  it("returns positive integers as-is", () => {
    expect(parseLimit("5")).toBe(5);
    expect(parseLimit("50")).toBe(50);
    expect(parseLimit(50)).toBe(50);
  });

  it("throws on non-numeric strings", () => {
    expect(() => parseLimit("twelve")).toThrow(/Invalid --limit/);
    expect(() => parseLimit("1.5")).toThrow(/Invalid --limit/);
    expect(() => parseLimit("-3")).toThrow(/Invalid --limit/);
  });

  it("throws on negative or non-integer numbers", () => {
    expect(() => parseLimit(-1)).toThrow(/Invalid --limit/);
    expect(() => parseLimit(1.5)).toThrow(/Invalid --limit/);
    expect(() => parseLimit(NaN)).toThrow(/Invalid --limit/);
    expect(() => parseLimit(Infinity)).toThrow(/Invalid --limit/);
  });
});

describe("resolveLimit", () => {
  it("returns undefined when neither --limit nor a caller default is set (legacy format relies on this to keep its historical top-5 fallback)", () => {
    expect(resolveLimit({})).toBeUndefined();
  });

  it("returns the caller-supplied default when --limit is not set (text/eslint pass `null` to mean unlimited)", () => {
    expect(resolveLimit({}, null)).toBeNull();
  });

  it("honours --limit=N (specific integer)", () => {
    expect(resolveLimit({ limit: "5" })).toBe(5);
    expect(resolveLimit({ limit: "50" })).toBe(50);
  });

  it("returns null (no limit) for --limit=all", () => {
    expect(resolveLimit({ limit: "all" })).toBeNull();
  });

  it("returns null (no limit) for --limit=0", () => {
    expect(resolveLimit({ limit: "0" })).toBeNull();
  });

  it("explicit --limit beats --verbose", () => {
    expect(resolveLimit({ limit: "3", verbose: true })).toBe(3);
  });

  it("--verbose without --limit means no limit (overrides any caller default)", () => {
    expect(resolveLimit({ verbose: true })).toBeNull();
    expect(resolveLimit({ verbose: true }, undefined)).toBeNull();
    expect(resolveLimit({ verbose: true }, 5)).toBeNull();
  });

  it("accepts a custom default", () => {
    expect(resolveLimit({}, 25)).toBe(25);
  });
});

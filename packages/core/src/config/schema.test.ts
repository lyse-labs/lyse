import { describe, it, expect } from "vitest";
import { safeParseLyseConfig } from "./schema.js";

describe("designSystem.tokenPackages", () => {
  it("accepts a string entry", () => {
    const r = safeParseLyseConfig({ designSystem: { tokenPackages: ["@primer/primitives"] } });
    expect(r.ok && r.value.designSystem?.tokenPackages).toEqual(["@primer/primitives"]);
  });

  it("accepts an object entry with files", () => {
    const r = safeParseLyseConfig({
      designSystem: { tokenPackages: [{ name: "@primer/primitives", files: ["dist/css/**/*.css"] }] },
    });
    expect(r.ok && r.value.designSystem?.tokenPackages).toEqual([
      { name: "@primer/primitives", files: ["dist/css/**/*.css"] },
    ]);
  });

  it("still parses a designSystem without tokenPackages", () => {
    const r = safeParseLyseConfig({ designSystem: { componentsModule: "@acme/ui" } });
    expect(r.ok && r.value.designSystem?.tokenPackages).toBeUndefined();
  });

  it("rejects a malformed entry (object missing name)", () => {
    const r = safeParseLyseConfig({ designSystem: { tokenPackages: [{ files: ["x"] }] } });
    expect(r.ok).toBe(false);
  });
});

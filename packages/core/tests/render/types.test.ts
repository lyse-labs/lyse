import { describe, it, expect } from "vitest";
import { RenderUnavailableError } from "../../src/render/types.js";
import type { ComputedTokenReading, RenderMeta } from "../../src/render/types.js";

describe("render types", () => {
  it("RenderUnavailableError is an Error with a name", () => {
    const e = new RenderUnavailableError("no chromium");
    expect(e).toBeInstanceOf(Error);
    expect(e.name).toBe("RenderUnavailableError");
  });
  it("reading + meta shapes compile", () => {
    const r: ComputedTokenReading = { token: "--color-bg", mode: "root", computed: "rgb(255, 255, 255)" };
    const m: RenderMeta = { chromiumVersion: "1.0", skippedNonCanonicalizable: 0 };
    expect(r.token).toBe("--color-bg");
    expect(m.skippedNonCanonicalizable).toBe(0);
  });
});

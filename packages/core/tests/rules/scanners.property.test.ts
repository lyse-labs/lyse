import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { scanDeprecationMarkers } from "../../src/rules/versioning-deprecation-markers.js";
import { scanSvgElements } from "../../src/rules/components-svg-viewbox.js";

/**
 * Fuzz/property hardening (#104) for the regex-based source scanners shipped
 * this cycle. Regex scanners are the classic place for crashes / catastrophic
 * backtracking / out-of-range line numbers on adversarial input. These assert
 * the scanners are total (never throw), deterministic, and self-consistent.
 */

// A nasty-string arbitrary: random unicode + a heavy dose of the structural
// characters these scanners care about (comment borders, JSX, tags, braces).
const STRUCT_CHARS = "/* */\n\t<svg viewBox >{}@deprecated()see link*/{...}#\\\"'`abc0 ".split("");
const structural = fc.array(fc.constantFrom(...STRUCT_CHARS), { maxLength: 400 }).map((a) => a.join(""));
const nasty = fc.oneof(structural, fc.string());

function lineCount(s: string): number {
  return s.split("\n").length;
}

describe("scanDeprecationMarkers — property/fuzz (#104)", () => {
  it("never throws on arbitrary input", () => {
    fc.assert(fc.property(nasty, (s) => {
      scanDeprecationMarkers(s);
      return true;
    }));
  });

  it("is deterministic", () => {
    fc.assert(fc.property(nasty, (s) => {
      return JSON.stringify(scanDeprecationMarkers(s)) === JSON.stringify(scanDeprecationMarkers(s));
    }));
  });

  it("every marker has an in-range 1-based line and a positive column", () => {
    fc.assert(fc.property(nasty, (s) => {
      const lines = lineCount(s);
      return scanDeprecationMarkers(s).every((m) => m.line >= 1 && m.line <= lines && m.column >= 1);
    }));
  });
});

describe("scanSvgElements — property/fuzz (#104)", () => {
  it("never throws on arbitrary input", () => {
    fc.assert(fc.property(nasty, (s) => {
      scanSvgElements(s);
      return true;
    }));
  });

  it("is deterministic", () => {
    fc.assert(fc.property(nasty, (s) => {
      return JSON.stringify(scanSvgElements(s)) === JSON.stringify(scanSvgElements(s));
    }));
  });

  it("every element has an in-range 1-based line, positive column, and boolean hasViewBox", () => {
    fc.assert(fc.property(nasty, (s) => {
      const lines = lineCount(s);
      return scanSvgElements(s).every(
        (e) => e.line >= 1 && e.line <= lines && e.column >= 1 && typeof e.hasViewBox === "boolean",
      );
    }));
  });

  it("terminates quickly even on pathological repeated structure (no catastrophic backtracking)", () => {
    const evil = "<svg " + "viewBox ".repeat(2000) + "\n".repeat(2000) + "@deprecated ".repeat(2000);
    const start = Date.now();
    scanSvgElements(evil);
    scanDeprecationMarkers(evil);
    expect(Date.now() - start).toBeLessThan(1000);
  });
});

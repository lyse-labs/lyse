import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { isReservedTokenName, _internal as aiInternal } from "../../src/parsers/ai-tokens.js";
import { computeGrade } from "../../src/reliability/grade.js";
import { score } from "../../src/scorer.js";
import { _internal as zIndexInternal } from "../../src/rules/tokens-no-hardcoded-z-index.js";
import { _internal as opacityInternal } from "../../src/rules/tokens-no-hardcoded-opacity.js";
import { _internal as typoInternal } from "../../src/rules/tokens-no-hardcoded-typography.js";
import { detectInText } from "../../src/rules/tokens-no-hardcoded-color.js";
import type { AxisName } from "../../src/types.js";

// Property-based hardening (#104): detectors must be total (never throw on
// arbitrary input) and honor their core invariants for ALL inputs, not just
// the hand-picked example cases.

describe("property: detectors are total (never throw on arbitrary text)", () => {
  it("isReservedTokenName", () => {
    fc.assert(fc.property(fc.string(), (s) => { expect(typeof isReservedTokenName(s)).toBe("boolean"); }));
  });
  it("the value extractors return arrays and never throw", () => {
    fc.assert(fc.property(fc.string(), (s) => {
      expect(Array.isArray(detectInText(s))).toBe(true);
      expect(Array.isArray(zIndexInternal.extractZIndexValues(s))).toBe(true);
      expect(Array.isArray(opacityInternal.extractOpacity(s))).toBe(true);
      expect(Array.isArray(typoInternal.extractTypography(s))).toBe(true);
      expect(Array.isArray(aiInternal.extractScssVariableNames(s))).toBe(true);
    }));
  });
  it("isReservedTokenName is deterministic (same input → same output)", () => {
    fc.assert(fc.property(fc.string(), (s) => { expect(isReservedTokenName(s)).toBe(isReservedTokenName(s)); }));
  });
});

describe("property: isReservedTokenName precision invariants", () => {
  it("any name carrying an unambiguous vendor signature is detected", () => {
    fc.assert(fc.property(
      fc.constantFrom("dragon-fruit", "color-gen-ai", "ai-aura-start", "ai-gradient-1", "color-magic-bg"),
      fc.string({ maxLength: 6 }).map((s) => s.replace(/[^a-z]/gi, "")),
      (sig, suffix) => { expect(isReservedTokenName(`${sig}-${suffix}`)).toBe(true); },
    ));
  });
  it("a bare `ai` segment without an AI-distinctive descriptor is NOT detected (Mantine FP guard)", () => {
    fc.assert(fc.property(
      fc.constantFrom("bg", "size", "color", "hover", "border", "width", "primary"),
      (suffix) => { expect(isReservedTokenName(`ai-${suffix}`)).toBe(false); },
    ));
  });
});

describe("property: z-index extractor never returns trivial stacking values", () => {
  it("never yields -1, 0, or 1", () => {
    fc.assert(fc.property(fc.string(), (s) => {
      for (const hit of zIndexInternal.extractZIndexValues(s)) {
        expect([-1, 0, 1]).not.toContain(hit.value);
      }
    }));
  });
});

const AXES: AxisName[] = ["tokens", "a11y", "components", "stories", "ai-surface", "ai-governance"];

describe("property: computeGrade invariants", () => {
  it("the grade is always one of A/B/C/Fail/N/A", () => {
    fc.assert(fc.property(
      fc.oneof(fc.integer({ min: 0, max: 100 }), fc.constant("N/A" as const)),
      fc.option(fc.record({ reasons: fc.array(fc.string()) })),
      (finalScore, autoFail) => {
        const r = computeGrade(finalScore, autoFail ?? undefined);
        expect(["A", "B", "C", "Fail", "N/A"]).toContain(r.grade);
      },
    ));
  });

  it("passing an autoFail object always sets autoFailed=true (numeric scores only)", () => {
    fc.assert(fc.property(
      fc.integer({ min: 0, max: 100 }),
      fc.array(fc.string(), { minLength: 1, maxLength: 4 }),
      (finalScore, reasons) => {
        const r = computeGrade(finalScore, { reasons });
        expect(r.autoFailed).toBe(true);
      },
    ));
  });

  it("scorer: two or more axes scored 0 cap finalScore into Fail band and set autoFail", () => {
    fc.assert(fc.property(
      fc.uniqueArray(fc.constantFrom(...AXES), { minLength: 2, maxLength: 4 }),
      (zeroAxes) => {
        const findings = Object.fromEntries(
          AXES.map((a) => [a, zeroAxes.includes(a)
            ? { errorCount: 1, warningCount: 0, infoCount: 0 }
            : { errorCount: 0, warningCount: 0, infoCount: 0 }]),
        ) as Record<AxisName, { errorCount: number; warningCount: number; infoCount: number }>;
        const opps = Object.fromEntries(AXES.map((a) => [a, 1])) as Record<AxisName, number>;
        const r = score(findings, opps);
        expect(r.autoFail).toBeDefined();
        expect(r.finalScore).toBeLessThanOrEqual(39);
      },
    ));
  });
});

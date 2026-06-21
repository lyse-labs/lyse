import { describe, it, expect } from "vitest";
import { renderHtml } from "../../src/reporters/html.js";
import type { AuditResult, Finding } from "../../src/types.js";

function finding(over: Partial<Finding> = {}): Finding {
  return {
    ruleId: "tokens/no-hardcoded-color",
    axis: "tokens",
    severity: "warning",
    location: { file: "src/Button.tsx", line: 12, column: 3 },
    message: "Hardcoded color value: #fff",
    ...over,
  };
}

function makeResult(over: Partial<AuditResult> = {}): AuditResult {
  return {
    schemaVersion: 2,
    rulesVersion: "r1",
    toolVersion: "0.0.0",
    scoringVersion: "scoring-v1.1",
    repoRoot: "/r",
    timestamp: "2026-06-21T00:00:00.000Z",
    stack: ["react"],
    finalScore: 78,
    tier: "Managed",
    grade: { grade: "B", autoFailed: false, reasons: [] },
    axes: [
      { axis: "tokens", score: 70, findings: 3, opportunities: 10 },
      { axis: "a11y", score: "N/A", findings: 0, opportunities: 0 },
    ],
    findings: [finding()],
    ...over,
  } as AuditResult;
}

describe("renderHtml", () => {
  it("renders a self-contained HTML doc with score, grade, axes, and a finding", () => {
    const html = renderHtml(makeResult());
    expect(html.toLowerCase()).toContain("<!doctype html");
    expect(html).toContain("78");
    expect(html).toContain("B");
    expect(html).toContain("tokens");
    expect(html).toContain("a11y");
    expect(html).toContain("N/A"); // a11y axis
    expect(html).toContain("tokens/no-hardcoded-color");
    expect(html).toContain("src/Button.tsx:12");
  });

  it("HTML-escapes user-derived strings (no injection)", () => {
    const html = renderHtml(
      makeResult({ findings: [finding({ message: '<script>alert(1)</script>"x' })] }),
    );
    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
  });

  it("handles N/A finalScore without NaN/undefined", () => {
    const html = renderHtml(
      makeResult({ finalScore: "N/A", tier: "N/A", grade: { grade: "N/A", autoFailed: false, reasons: [] }, findings: [] }),
    );
    expect(html).toContain("N/A");
    expect(html).not.toContain("NaN");
    expect(html).not.toContain("undefined");
  });

  it("is deterministic (byte-identical without timestamp)", () => {
    expect(renderHtml(makeResult())).toBe(renderHtml(makeResult()));
  });

  it("is self-contained (no external CDN/script/href resources)", () => {
    const html = renderHtml(makeResult());
    expect(/src\s*=\s*["']https?:/i.test(html)).toBe(false);
    expect(/<link\b/i.test(html)).toBe(false);
    expect(/<script\b[^>]*\bsrc=/i.test(html)).toBe(false);
  });
});

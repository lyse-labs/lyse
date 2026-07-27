import { describe, it, expect } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { auditDirectory } from "../../src/commands/audit-pipeline.js";

function repo(withConfig: boolean): string {
  const root = mkdtempSync(join(tmpdir(), "lyse-extscore-"));
  writeFileSync(join(root, "package.json"), JSON.stringify({ name: "consumer", version: "1.0.0" }));
  const css = join(root, "node_modules/@acme/tokens/dist/css/tokens.css");
  mkdirSync(join(css, ".."), { recursive: true });
  writeFileSync(css, ":root { --color-brand: #3b82f6; }");
  writeFileSync(join(root, "Button.tsx"), 'export const s = { color: "#3b82f6" };\n');
  if (withConfig) {
    writeFileSync(join(root, ".lyse.yaml"), 'designSystem:\n  tokenPackages:\n    - "@acme/tokens"\n');
  }
  return root;
}

describe("external-package tokens score impact (disclosure, not a gate)", () => {
  it("shifts the finding from novel/info to exact/high (documented, reproducible)", async () => {
    const off = await auditDirectory(repo(false));
    const on = await auditDirectory(repo(true));
    const pick = (r: Awaited<ReturnType<typeof auditDirectory>>) =>
      r.result.findings.find((f) => f.ruleId === "tokens/no-hardcoded-color");
    // The intentional re-classification this feature exists to produce:
    expect([pick(off)?.severity, pick(off)?.confidence]).toEqual(["info", "low"]);
    expect([pick(on)?.severity, pick(on)?.confidence]).toEqual(["warning", "high"]);
  });

  it("records the observed tokens-axis score delta (single-finding tmpdir sample is below v3 min-N, so both report N/A)", async () => {
    const off = await auditDirectory(repo(false));
    const on = await auditDirectory(repo(true));
    const axisScore = (r: Awaited<ReturnType<typeof auditDirectory>>) =>
      r.result.axes.find((a) => a.axis === "tokens")?.score;
    // Disclosure, not a gate: on a fixture this small the tokens axis abstains
    // (below MIN_SAMPLE_SIZE) both with and without the feature — the
    // re-classification is real (see the finding-level assertions above) but
    // doesn't clear the axis's own sample-size floor in this tiny repro.
    expect(axisScore(off)).toBe("N/A");
    expect(axisScore(on)).toBe("N/A");
    expect(off.result.finalScore).toBe("N/A");
    expect(on.result.finalScore).toBe("N/A");
  });
});

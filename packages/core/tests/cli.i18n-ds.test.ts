import { describe, it, expect } from "vitest";
import { cpSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import { runAuditTest } from "./_helpers/cli.js";
import type { AuditResult } from "../src/types.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const FR_DS = join(__dirname, "../fixtures/i18n-fr-ds");
const DE_DS = join(__dirname, "../fixtures/i18n-de-ds");

function audit(path: string): AuditResult {
  const r = runAuditTest({ path, format: "json" });
  expect(r.status).toBe(0);
  return JSON.parse(r.stdout) as AuditResult;
}

function aiGovernanceAxis(result: AuditResult) {
  const entry = result.axes.find((a) => a.axis === "ai-governance");
  expect(entry).toBeDefined();
  return entry!;
}

const GATED_GOVERNANCE_RULES = [
  "ai-governance/ai-marker-component-present",
  "ai-governance/disclaimer-present",
  "ai-governance/human-control-affordances",
  "ai-governance/value-gate-doc-present",
];

describe("cli audit i18n end-to-end (Track 9.1)", () => {
  it("French DS is seen by Face B — ai-governance axis is active, not N/A", () => {
    const result = audit(FR_DS);

    expect(aiGovernanceAxis(result).score).not.toBe("N/A");

    const markerFindings = result.findings.filter(
      (f) => f.ruleId === "ai-governance/ai-marker-component-present",
    );
    expect(markerFindings).toHaveLength(1);
    expect(markerFindings[0]?.severity).toBe("info");
    expect(markerFindings[0]?.message).toContain("BadgeIA");
  });

  it("FR disclaimer + control affordances register as info, not warning", () => {
    const result = audit(FR_DS);

    const disclaimer = result.findings.filter(
      (f) => f.ruleId === "ai-governance/disclaimer-present",
    );
    expect(disclaimer).toHaveLength(1);
    expect(disclaimer[0]?.severity).toBe("info");

    const controls = result.findings.filter(
      (f) => f.ruleId === "ai-governance/human-control-affordances",
    );
    expect(controls).toHaveLength(1);
    expect(controls[0]?.severity).toBe("info");
    expect(controls[0]?.message.toLowerCase()).toContain("régénérer");

    const valueGate = result.findings.filter(
      (f) => f.ruleId === "ai-governance/value-gate-doc-present",
    );
    expect(valueGate).toHaveLength(1);
    expect(valueGate[0]?.severity).toBe("info");
  });

  it("ai-marker-anti-patterns emits no false positive on the FR DS", () => {
    const result = audit(FR_DS);
    expect(
      result.findings.filter(
        (f) => f.ruleId === "ai-governance/ai-marker-anti-patterns",
      ),
    ).toHaveLength(0);
  });

  it("CONTROL: narrowing i18n.locales to ['en'] drops all FR detection", () => {
    const tmp = mkdtempSync(join(tmpdir(), "lyse-i18n-en-only-"));
    try {
      cpSync(FR_DS, tmp, { recursive: true });
      writeFileSync(join(tmp, ".lyse.yaml"), 'i18n:\n  locales: ["en"]\n');

      const frRun = audit(FR_DS);
      const enOnlyRun = audit(tmp);

      // ai-marker-anti-patterns counts every component file as an opportunity
      // regardless of AI surface (pre-existing main behavior), so the axis
      // never reports N/A on a repo with .tsx files. Face B visibility is
      // therefore asserted on the gated governance rules instead.
      expect(
        enOnlyRun.findings.filter((f) => f.axis === "ai-governance"),
      ).toHaveLength(0);
      for (const ruleId of GATED_GOVERNANCE_RULES) {
        expect(enOnlyRun.findings.some((f) => f.ruleId === ruleId)).toBe(false);
      }
      expect(aiGovernanceAxis(enOnlyRun).opportunities).toBeLessThan(
        aiGovernanceAxis(frRun).opportunities,
      );
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("German DS is seen by Face B with DE disclaimer and control label", () => {
    const result = audit(DE_DS);

    expect(aiGovernanceAxis(result).score).not.toBe("N/A");

    const disclaimer = result.findings.filter(
      (f) => f.ruleId === "ai-governance/disclaimer-present",
    );
    expect(disclaimer).toHaveLength(1);
    expect(disclaimer[0]?.severity).toBe("info");

    const controls = result.findings.filter(
      (f) => f.ruleId === "ai-governance/human-control-affordances",
    );
    expect(controls).toHaveLength(1);
    expect(controls[0]?.severity).toBe("info");
  });
});

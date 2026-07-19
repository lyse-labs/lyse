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
  // Pin v2: these probes assert the ai-governance axis is ACTIVE (not N/A) once
  // Face B recognises the localized AI marker. Under the default v3 model the
  // axis is below min-N=30 on these tiny i18n fixtures → N/A, which is a
  // sample-size artifact, not a detection failure. The marker findings asserted
  // below are model-independent; scoring v2 keeps the "axis active" claim valid.
  const r = runAuditTest({ path, format: "json", extraArgs: ["--score-model", "v2"] });
  expect(r.status).toBe(0);
  return JSON.parse(r.stdout) as AuditResult;
}

function aiGovernanceAxis(result: AuditResult) {
  const entry = result.axes.find((a) => a.axis === "ai-governance");
  expect(entry).toBeDefined();
  return entry!;
}

// After sub-project D the localized governance affordance rules were retired;
// `ai-marker-component-present` (kept, deterministic) recognises localized AI
// marker components (FR BadgeIA / DE KIBadge) and is the surviving i18n probe.
const GATED_GOVERNANCE_RULES = ["ai-governance/ai-marker-component-present"];

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

  it("CONTROL: narrowing i18n.locales to ['en'] drops FR marker detection", () => {
    const tmp = mkdtempSync(join(tmpdir(), "lyse-i18n-en-only-"));
    try {
      cpSync(FR_DS, tmp, { recursive: true });
      writeFileSync(join(tmp, ".lyse.yaml"), 'i18n:\n  locales: ["en"]\n');

      const enOnlyRun = audit(tmp);

      for (const ruleId of GATED_GOVERNANCE_RULES) {
        expect(enOnlyRun.findings.some((f) => f.ruleId === ruleId)).toBe(false);
      }
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("German DS is seen by Face B via a localized AI marker component", () => {
    const result = audit(DE_DS);

    expect(aiGovernanceAxis(result).score).not.toBe("N/A");

    const markerFindings = result.findings.filter(
      (f) => f.ruleId === "ai-governance/ai-marker-component-present",
    );
    expect(markerFindings).toHaveLength(1);
    expect(markerFindings[0]?.severity).toBe("info");
    expect(markerFindings[0]?.message).toContain("KIBadge");
  });
});

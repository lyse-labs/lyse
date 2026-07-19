import { describe, expect, it } from "vitest";
import { join } from "node:path";
import { explainScore } from "../src/commands/explain-score.js";
import { auditDirectory } from "../src/commands/audit-pipeline.js";

// fixtures/* is under packages/core/ → up 1 (tests → core), then fixtures/.
const FULL_DS = join(import.meta.dirname, "..", "fixtures", "full-ds");
const I18N_FR_DS = join(import.meta.dirname, "..", "fixtures", "i18n-fr-ds");

describe("H4 invariant: audit.finalScore === explain --score", () => {
  it("matches byte-for-byte on fixtures/full-ds", async () => {
    const { result } = await auditDirectory(FULL_DS, { staticOnly: true });
    const ex = await explainScore({ cwd: FULL_DS, staticOnly: true });
    expect(ex.score).toBe(result.finalScore);
    expect(ex.version).toBe(result.scoringVersion);
  });

  it("matches byte-for-byte on fixtures/i18n-fr-ds (non-trivial score)", async () => {
    const { result } = await auditDirectory(I18N_FR_DS, { staticOnly: true });
    const ex = await explainScore({ cwd: I18N_FR_DS, staticOnly: true });
    expect(ex.score).toBe(result.finalScore);
    expect(ex.version).toBe(result.scoringVersion);
  });
});

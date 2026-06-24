import { describe, it, expect } from "vitest";
import { join } from "node:path";
import { auditDirectory } from "../../src/commands/audit-pipeline.js";

describe("auditDirectory — meta.coverage population (Phase 1 of #156)", () => {
  const fixture = join(__dirname, "..", "..", "fixtures", "full-ds");

  it("populates meta.coverage with scannedFiles, durationMs, and configPath", async () => {
    const { result } = await auditDirectory(fixture, { staticOnly: true });

    expect(result.meta).toBeDefined();
    expect(result.meta!.coverage).toBeDefined();

    const cov = result.meta!.coverage!;
    expect(typeof cov.scannedFiles).toBe("number");
    expect(cov.scannedFiles).toBeGreaterThan(0);
    expect(Number.isFinite(cov.durationMs)).toBe(true);
    expect(cov.durationMs).toBeGreaterThanOrEqual(0);
    // The full-ds fixture ships a .lyse.yaml; configPath should resolve to it.
    expect(cov.configPath).toMatch(/fixtures\/full-ds\/\.lyse\.yaml$/);
  });

  it("scannedFiles matches the fileCount returned by the pipeline", async () => {
    const out = await auditDirectory(fixture, { staticOnly: true });
    expect(out.result.meta!.coverage!.scannedFiles).toBe(out.fileCount);
  });
});

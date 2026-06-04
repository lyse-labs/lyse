import { describe, it, expectTypeOf } from "vitest";
import type { AuditResult } from "../src/types.js";

describe("AuditResult.meta.coverage type", () => {
  it("accepts a CoverageMeta object with the Phase 1 fields", () => {
    const ok: AuditResult["meta"] = {
      coverage: {
        scannedFiles: 1234,
        durationMs: 29623,
        configPath: ".lyse.yaml",
      },
    };
    expectTypeOf(ok!.coverage!.scannedFiles).toBeNumber();
    expectTypeOf(ok!.coverage!.durationMs).toBeNumber();
    expectTypeOf(ok!.coverage!.configPath).toEqualTypeOf<string | null>();
  });

  it("allows configPath to be null when no .lyse.yaml is present", () => {
    const ok: AuditResult["meta"] = {
      coverage: {
        scannedFiles: 0,
        durationMs: 12,
        configPath: null,
      },
    };
    expectTypeOf(ok!.coverage!.configPath).toEqualTypeOf<string | null>();
  });

  it("allows meta.coverage to coexist with meta.layer4", () => {
    const ok: AuditResult["meta"] = {
      coverage: { scannedFiles: 1, durationMs: 1, configPath: null },
      layer4: { ranAt: "2026-05-24T00:00:00Z", augmented: 0, dropped: 0 },
    };
    expectTypeOf(ok!.coverage!.scannedFiles).toBeNumber();
  });
});

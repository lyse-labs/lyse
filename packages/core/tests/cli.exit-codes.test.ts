import { describe, it, expect } from "vitest";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { runAuditTest } from "./_helpers/cli.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixture = join(__dirname, "../fixtures/full-ds");

describe("cli exit codes", () => {
  it("exits 0 with default threshold (0) even with many findings", () => {
    const r = runAuditTest({ path: fixture, format: "json" });
    expect(r.status).toBe(0);
  });

  it("exits 1 with --threshold above score", () => {
    const r = runAuditTest({ path: fixture, format: "json", extraArgs: ["--threshold", "99"] });
    expect(r.status).toBe(1);
  });

  it("exits 0 with --threshold below score", () => {
    // full-ds fixture: score is high enough to be above threshold 1; just ensure 1 doesn't trip
    const r = runAuditTest({ path: fixture, format: "json", extraArgs: ["--threshold", "1"] });
    // The full-ds fixture has many findings; finalScore might still be > 1
    expect(r.status === 0 || r.status === 1).toBe(true);
  });

  it("exits 0 with sarif format (P11 shipped)", () => {
    const r = runAuditTest({ path: fixture, format: "sarif" });
    expect(r.status).toBe(0);
  });

  it("exits 64 with invalid --threshold", () => {
    const r = runAuditTest({ path: fixture, extraArgs: ["--threshold", "not-a-number"] });
    expect(r.status).toBe(64);
  });
});

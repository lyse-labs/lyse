/**
 * JSON determinism integration tests.
 *
 * The README + architecture/reliability.md promise that `lyse audit . --format=json` is
 * byte-identical across runs (after warm cache). These tests pin that promise.
 * Both runs disable Layer 4 (`--static-only`) so we exercise the deterministic
 * static path without needing an LLM connector.
 */
import { describe, it, expect } from "vitest";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { runAuditTest } from "./_helpers/cli.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixture = join(__dirname, "../fixtures/full-ds");

describe("cli json determinism", () => {
  it("two static-only audits of the same repo produce byte-identical JSON", () => {
    const r1 = runAuditTest({ path: fixture, format: "json" });
    const r2 = runAuditTest({ path: fixture, format: "json" });

    expect(r1.status).toBe(0);
    expect(r2.status).toBe(0);
    expect(r1.stdout).toBe(r2.stdout);
  });

  it("--include-timestamps surfaces meta.layer4.staticOnly (negative control)", () => {
    const r = runAuditTest({
      path: fixture,
      format: "json",
      extraArgs: ["--include-timestamps"],
    });

    expect(r.status).toBe(0);
    const parsed = JSON.parse(r.stdout) as {
      meta?: { layer4?: { staticOnly?: boolean } };
    };
    expect(parsed.meta?.layer4?.staticOnly).toBe(true);
  });
});

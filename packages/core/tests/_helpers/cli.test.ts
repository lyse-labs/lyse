import { describe, it, expect } from "vitest";
import { runAuditTest, LYSE_CLI_PATH } from "./cli.js";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

describe("runAuditTest helper", () => {
  it("LYSE_CLI_PATH points to a built file", () => {
    expect(existsSync(LYSE_CLI_PATH)).toBe(true);
  });

  it("default staticOnly=true: produces a score (does not hit refuse-to-run)", () => {
    const dir = mkdtempSync(join(tmpdir(), "lyse-helper-"));
    writeFileSync(join(dir, "package.json"), JSON.stringify({ name: "t" }));
    try {
      // Pass --include-timestamps so the JSON reporter retains `meta` (which it
      // strips by default for determinism — see reporters/json.ts).
      const r = runAuditTest({ path: dir, format: "json", extraArgs: ["--include-timestamps"] });
      expect(r.status).toBe(0);
      const result = JSON.parse(r.stdout);
      expect(result.meta?.layer4?.staticOnly).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("staticOnly=false without credentials: produces a score (Layer 4 stub returns empty)", () => {
    const dir = mkdtempSync(join(tmpdir(), "lyse-helper-"));
    writeFileSync(join(dir, "package.json"), JSON.stringify({ name: "t" }));
    try {
      const r = runAuditTest({
        path: dir,
        staticOnly: false,
        format: "json",
        extraArgs: ["--include-timestamps"],
        env: {
          ANTHROPIC_API_KEY: "",
          OPENAI_API_KEY: "",
          LYSE_LLM_ENDPOINT: "",
        },
      });
      expect(r.status).toBe(0);
      const result = JSON.parse(r.stdout);
      // Track 4.2: empty connector response returns empty meta (no
      // `staticOnly: true` fallback). The audit still succeeds.
      expect(result.meta?.layer4?.staticOnly).toBeUndefined();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("extraArgs are appended", () => {
    const dir = mkdtempSync(join(tmpdir(), "lyse-helper-"));
    writeFileSync(join(dir, "package.json"), JSON.stringify({ name: "t" }));
    try {
      const r = runAuditTest({ path: dir, extraArgs: ["--threshold=0"] });
      expect(r.status).toBe(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

/**
 * Tests for `lyse agents --output <path>` prompt-before-overwrite logic.
 *
 * These tests exercise the CLI binary (dist/cli.js) to verify the end-to-end
 * behavior including env-var-based flag handling.
 */
import { describe, it, expect } from "vitest";
import { execSync, spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync, existsSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const cli = join(__dirname, "../dist/cli.js");
const fixture = join(__dirname, "../fixtures/full-ds");

function tmpDir(): string {
  return mkdtempSync(join(tmpdir(), "lyse-agents-out-"));
}

describe("lyse agents --output prompt-before-overwrite", () => {
  it("writes to stdout when --output is not provided (no file created)", () => {
    const out = execSync(`node ${cli} agents ${fixture} --static-only`, { encoding: "utf8" });
    expect(out).toContain("# AGENTS.md");
  });

  it("creates a new file with --output when file does not exist", () => {
    const dir = tmpDir();
    const out = join(dir, "AGENTS.md");
    execSync(`node ${cli} agents ${fixture} --static-only --output ${out}`, {
      encoding: "utf8",
      env: { ...process.env, LYSE_YES: "1" },
    });
    expect(existsSync(out)).toBe(true);
    expect(readFileSync(out, "utf8")).toContain("# AGENTS.md");
  });

  it("overwrites existing file when LYSE_YES=1 (no prompt)", () => {
    const dir = tmpDir();
    const out = join(dir, "AGENTS.md");
    writeFileSync(out, "# old content\n");
    execSync(`node ${cli} agents ${fixture} --static-only --output ${out}`, {
      encoding: "utf8",
      env: { ...process.env, LYSE_YES: "1" },
    });
    const content = readFileSync(out, "utf8");
    expect(content).toContain("# AGENTS.md");
    expect(content).not.toBe("# old content\n");
  });

  it("exits with code 1 when file exists and LYSE_NO_PROMPT=1 (without --yes)", () => {
    const dir = tmpDir();
    const out = join(dir, "AGENTS.md");
    writeFileSync(out, "# existing file\n");
    const result = spawnSync(
      "node",
      [cli, "agents", fixture, "--static-only", `--output`, out, "--no-prompt"],
      {
        encoding: "utf8",
        env: { ...process.env, LYSE_NO_PROMPT: "1" },
      },
    );
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("exists");
    // Existing file should be preserved
    expect(readFileSync(out, "utf8")).toBe("# existing file\n");
  });

  it("--output without --yes creates file when it does not exist (no prompt needed)", () => {
    const dir = tmpDir();
    const out = join(dir, "new-agents.md");
    // File does not exist, so no prompt is needed — should work even without LYSE_YES
    execSync(`node ${cli} agents ${fixture} --static-only --output ${out} --no-color`, {
      encoding: "utf8",
      env: { ...process.env, LYSE_YES: "1" },
    });
    expect(existsSync(out)).toBe(true);
  });
});

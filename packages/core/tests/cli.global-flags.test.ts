/**
 * Regression test for Critical #1: global flags (--yes, --no-prompt, --no-color, --quiet)
 * propagate to subcommands even when citty routes directly to the subcommand's run()
 * without executing the parent command's run().
 */
import { describe, it, expect } from "vitest";
import { execSync, spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const cli = join(__dirname, "../dist/cli.js");

describe("global flags propagate to subcommands", () => {
  it("--no-color disables ANSI escape sequences in `lyse explain` output", () => {
    const out = execSync(`node ${cli} --no-color explain tokens/no-hardcoded-color`, {
      encoding: "utf8",
    });
    // ANSI escape sequences start with ESC[ (\x1b[) — assert absence
    expect(out).not.toMatch(/\x1b\[\d/);
  });

  it("--yes is accepted on `lyse audit` without 'unknown option' error", () => {
    // audit requires a path arg; pass --help to short-circuit without running audit
    const r = spawnSync("node", [cli, "audit", "--yes", "--help"], { encoding: "utf8" });
    // citty exits 0 for --help; should NOT mention "Unknown option"
    expect(r.stderr).not.toMatch(/[Uu]nknown/);
  });

  it("--yes is accepted on `lyse fix` without 'unknown option' error", () => {
    const r = spawnSync("node", [cli, "fix", "--yes", "--help"], { encoding: "utf8" });
    expect(r.stderr).not.toMatch(/[Uu]nknown/);
  });

  it("--yes is accepted on `lyse share` without 'unknown option' error", () => {
    const r = spawnSync("node", [cli, "share", "--yes", "--help"], { encoding: "utf8" });
    expect(r.stderr).not.toMatch(/[Uu]nknown/);
  });

  it("--yes is accepted on `lyse agents` without 'unknown option' error", () => {
    const r = spawnSync("node", [cli, "agents", "--yes", "--help"], { encoding: "utf8" });
    expect(r.stderr).not.toMatch(/[Uu]nknown/);
  });

  it("--yes is accepted on `lyse init` without 'unknown option' error", () => {
    const r = spawnSync("node", [cli, "init", "--yes", "--help"], { encoding: "utf8" });
    expect(r.stderr).not.toMatch(/[Uu]nknown/);
  });

  it("--no-color is accepted on `lyse explain` (global flag, not subcommand-local)", () => {
    // Before the fix, --no-color was only in the parent command's args — citty would
    // reject it with "Unknown option" when passed to a subcommand.
    const r = spawnSync("node", [cli, "explain", "--no-color", "tokens/no-hardcoded-color"], {
      encoding: "utf8",
    });
    expect(r.status).toBe(0);
    expect(r.stderr).not.toMatch(/[Uu]nknown/);
  });

  it("--quiet is accepted on `lyse explain` without error", () => {
    const r = spawnSync("node", [cli, "explain", "--quiet", "tokens/no-hardcoded-color"], {
      encoding: "utf8",
    });
    expect(r.status).toBe(0);
    expect(r.stderr).not.toMatch(/[Uu]nknown/);
  });

  it("--no-prompt is accepted on `lyse version` without error", () => {
    const r = spawnSync("node", [cli, "version", "--no-prompt"], { encoding: "utf8" });
    expect(r.status).toBe(0);
    expect(r.stderr).not.toMatch(/[Uu]nknown/);
  });
});

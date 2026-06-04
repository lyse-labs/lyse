import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("../../src/util/git.js", () => ({
  gitHeadSha: vi.fn().mockResolvedValue("no-git"),
  modifiedFilesWithHashes: vi.fn().mockResolvedValue([]),
}));

import { execSync } from "node:child_process";
import { mkdtempSync, writeFileSync, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { runInit } from "../../src/commands/init.js";

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "lyse-init-"));
  execSync("git init && git config user.email t@t.com && git config user.name t", {
    cwd: dir,
    shell: "/bin/sh",
  });
  writeFileSync(
    join(dir, "package.json"),
    JSON.stringify({
      name: "test",
      version: "1.0.0",
      dependencies: { react: "^18.0.0" },
    }),
  );
  writeFileSync(join(dir, "Sample.tsx"), 'export const S = () => <div>x</div>;');
  execSync("git add . && git commit -m init", { cwd: dir });
});


describe("runInit with --yes", () => {
  it("creates .lyse.yaml", async () => {
    await runInit({ cwd: dir, yes: true, skipNodeCheck: true });
    expect(existsSync(join(dir, ".lyse.yaml"))).toBe(true);
  });

  it("adds .lyse/ to .gitignore", async () => {
    await runInit({ cwd: dir, yes: true, skipNodeCheck: true });
    const gitignore = readFileSync(join(dir, ".gitignore"), "utf8");
    expect(gitignore).toContain(".lyse/");
  });

  it("appends audit event to history", async () => {
    await runInit({ cwd: dir, yes: true, skipNodeCheck: true });
    expect(existsSync(join(dir, ".lyse/history.ndjson"))).toBe(true);
  });

  it("respects existing .lyse.yaml (does not overwrite)", async () => {
    writeFileSync(
      join(dir, ".lyse.yaml"),
      '# Custom config\ndesignSystem:\n  componentsModule: "@org/custom"\n',
    );
    await runInit({ cwd: dir, yes: true, skipNodeCheck: true });
    const yaml = readFileSync(join(dir, ".lyse.yaml"), "utf8");
    expect(yaml).toContain("@org/custom");
  });
});

// ---------------------------------------------------------------------------
// Regression: Critical #3 — runFix must not be silently skipped due to
// the dirty tree that init itself created (.lyse.yaml, .gitignore, history).
//
// Before the fix: runFix threw on dirty tree; the try/catch swallowed it as
// "⚠ Auto-fix skipped" — no branch was ever created on first-run repos WITH
// findings. This test uses a file with a real hardcoded-color finding to
// exercise the auto-fix path, and asserts the lyse/auto-fix-* branch exists.
// ---------------------------------------------------------------------------

describe("runInit auto-fix with findings doesn't silently skip on dirty tree (Critical #3 regression)", () => {
  let fixDir: string;

  beforeEach(() => {
    fixDir = mkdtempSync(join(tmpdir(), "lyse-init-fix-"));
    execSync("git init && git config user.email t@t.com && git config user.name t", {
      cwd: fixDir,
      shell: "/bin/sh",
    });
    writeFileSync(
      join(fixDir, "package.json"),
      JSON.stringify({
        name: "test",
        version: "1.0.0",
        dependencies: { react: "^18.0.0" },
      }),
    );
    // A file with a hardcoded color — triggers the auto-fix branch in runInit
    writeFileSync(
      join(fixDir, "Sample.tsx"),
      'export const S = () => <div style={{background:"#3B82F6"}}>x</div>;',
    );
    execSync("git add . && git commit -m init", { cwd: fixDir });
  });

  it("creates a lyse/auto-fix-* branch even though init wrote .lyse.yaml + .gitignore first", async () => {
    await runInit({ cwd: fixDir, yes: true, skipNodeCheck: true });

    // The branch should exist (fix actually ran, not silently skipped)
    const branches = execSync("git branch", { cwd: fixDir, encoding: "utf8" });
    expect(branches).toMatch(/lyse\/auto-fix-/);
  });
});

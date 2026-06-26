import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { getStagedFiles, getChangedFiles } from "../../src/codemods/git-helpers.js";

function git(args: string[], cwd: string): string {
  return execFileSync("git", args, { cwd, stdio: ["ignore", "pipe", "ignore"] }).toString().trim();
}

describe("getStagedFiles / getChangedFiles", () => {
  let repo: string;
  let baseSha: string;

  beforeEach(() => {
    // realpath so the test's resolve() matches git's `--show-toplevel`
    // (macOS /var → /private/var symlink would otherwise mismatch).
    repo = realpathSync(mkdtempSync(join(tmpdir(), "lyse-scope-")));
    git(["init", "-q"], repo);
    git(["config", "user.email", "t@example.com"], repo);
    git(["config", "user.name", "Test"], repo);
    git(["config", "commit.gpgsign", "false"], repo);
    writeFileSync(join(repo, "base.ts"), "export const a = 1;\n");
    git(["add", "."], repo);
    git(["commit", "-qm", "base"], repo);
    baseSha = git(["rev-parse", "HEAD"], repo);
  });

  afterEach(() => {
    rmSync(repo, { recursive: true, force: true });
  });

  it("getStagedFiles returns repo-relative posix paths of staged files and excludes unstaged", async () => {
    writeFileSync(join(repo, "staged.ts"), "export const b = 2;\n");
    writeFileSync(join(repo, "unstaged.ts"), "export const c = 3;\n");
    git(["add", "staged.ts"], repo);

    const staged = await getStagedFiles(repo);
    expect(staged).toContain("staged.ts");
    expect(staged).not.toContain("unstaged.ts");
  });

  it("getStagedFiles returns [] when nothing is staged", async () => {
    expect(await getStagedFiles(repo)).toEqual([]);
  });

  it("getChangedFiles returns files changed since the base ref, excluding unchanged", async () => {
    writeFileSync(join(repo, "changed.ts"), "export const d = 4;\n");
    git(["add", "."], repo);
    git(["commit", "-qm", "change"], repo);

    const changed = await getChangedFiles(repo, baseSha);
    expect(changed).toContain("changed.ts");
    expect(changed).not.toContain("base.ts");
  });

  it("getChangedFiles returns [] when nothing changed since HEAD", async () => {
    const head = git(["rev-parse", "HEAD"], repo);
    expect(await getChangedFiles(repo, head)).toEqual([]);
  });
});

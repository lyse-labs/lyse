import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { execFileSync } from "node:child_process";
import {
  mkdtempSync,
  readFileSync,
  writeFileSync,
  rmSync,
  existsSync,
  statSync,
  realpathSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { runAddGitHook, AddGitHookError } from "../add-git-hook.js";

function git(args: string[], cwd: string): void {
  execFileSync("git", args, { cwd, stdio: ["ignore", "ignore", "ignore"] });
}

let repo: string;

beforeEach(() => {
  repo = realpathSync(mkdtempSync(join(tmpdir(), "lyse-hook-")));
  git(["init", "-q"], repo);
});

afterEach(() => {
  rmSync(repo, { recursive: true, force: true });
});

describe("runAddGitHook", () => {
  it("writes an executable pre-commit hook that runs lyse audit --staged", async () => {
    const r = await runAddGitHook({ cwd: repo });
    expect(r.written).toContain(".git/hooks/pre-commit");
    const p = join(repo, ".git/hooks/pre-commit");
    expect(existsSync(p)).toBe(true);
    const body = readFileSync(p, "utf8");
    expect(body).toContain("audit --staged");
    expect(body).toContain("lyse pre-commit (managed)");
    // Unix exec bits don't exist on Windows (chmod is a no-op there).
    if (process.platform !== "win32") {
      expect(statSync(p).mode & 0o111).toBeGreaterThan(0); // executable
    }
  });

  it("embeds the requested lyse version in the npx pin", async () => {
    await runAddGitHook({ cwd: repo, lyseVersion: "9.9.9-test" });
    const body = readFileSync(join(repo, ".git/hooks/pre-commit"), "utf8");
    expect(body).toContain("@lyse-labs/lyse@9.9.9-test");
  });

  it("is idempotent: skips when the managed hook already exists", async () => {
    await runAddGitHook({ cwd: repo });
    const r = await runAddGitHook({ cwd: repo });
    expect(r.written).toEqual([]);
    expect(r.skipped[0]?.path).toContain("pre-commit");
  });

  it("refuses to clobber a pre-existing unmanaged hook without --force", async () => {
    const p = join(repo, ".git/hooks/pre-commit");
    writeFileSync(p, "#!/bin/sh\necho custom\n");
    const r = await runAddGitHook({ cwd: repo });
    expect(r.written).toEqual([]);
    expect(r.skipped[0]?.reason).toMatch(/already exists/i);
    expect(readFileSync(p, "utf8")).toContain("echo custom"); // untouched
  });

  it("replaces an unmanaged hook with --force", async () => {
    const p = join(repo, ".git/hooks/pre-commit");
    writeFileSync(p, "#!/bin/sh\necho custom\n");
    const r = await runAddGitHook({ cwd: repo, force: true });
    expect(r.written).toContain(".git/hooks/pre-commit");
    expect(readFileSync(p, "utf8")).toContain("lyse pre-commit (managed)");
  });

  it("throws AddGitHookError outside a git repository", async () => {
    const notRepo = realpathSync(mkdtempSync(join(tmpdir(), "lyse-norepo-")));
    try {
      await expect(runAddGitHook({ cwd: notRepo })).rejects.toBeInstanceOf(AddGitHookError);
    } finally {
      rmSync(notRepo, { recursive: true, force: true });
    }
  });
});

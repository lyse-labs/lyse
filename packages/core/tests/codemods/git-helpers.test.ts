import { describe, it, expect, beforeEach } from "vitest";
import { execSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { ensureClean, ensureSafeBranch, createBranch, commitAll, hasTestScript } from "../../src/codemods/git-helpers.js";

let dir: string;

function initRepo() {
  dir = mkdtempSync(join(tmpdir(), "lyse-gh-"));
  execSync("git init && git config user.email t@t.com && git config user.name t && git commit --allow-empty -m init", { cwd: dir, shell: "/bin/sh" });
}

beforeEach(() => { initRepo(); });

describe("ensureClean", () => {
  it("resolves when clean", async () => {
    await expect(ensureClean(dir, false)).resolves.toBeUndefined();
  });
  it("throws when dirty", async () => {
    writeFileSync(join(dir, "f.txt"), "x");
    await expect(ensureClean(dir, false)).rejects.toThrow(/uncommitted/i);
  });
  it("allows dirty with allowDirty=true", async () => {
    writeFileSync(join(dir, "f.txt"), "x");
    await expect(ensureClean(dir, true)).resolves.toBeUndefined();
  });
});

describe("createBranch", () => {
  it("creates a new branch", async () => {
    const name = await createBranch(dir, "lyse/test");
    expect(name).toBe("lyse/test");
    const current = execSync("git rev-parse --abbrev-ref HEAD", { cwd: dir }).toString().trim();
    expect(current).toBe("lyse/test");
  });
  it("suffixes on collision", async () => {
    await createBranch(dir, "lyse/dup");
    // checkout back to original branch (could be main or master)
    const original = execSync("git for-each-ref --format='%(refname:short)' refs/heads/ | head -1", { cwd: dir, shell: "/bin/sh" }).toString().trim().replace(/'/g, "");
    execSync(`git checkout ${original.replace("'", "")}`, { cwd: dir, shell: "/bin/sh" }).toString();
    const name = await createBranch(dir, "lyse/dup");
    expect(name).toBe("lyse/dup-2");
  });
});

describe("commitAll", () => {
  it("commits staged changes and returns SHA", async () => {
    writeFileSync(join(dir, "f.txt"), "hello");
    const sha = await commitAll(dir, "test commit");
    expect(sha).toMatch(/^[a-f0-9]{40}$/);
  });
});

describe("hasTestScript", () => {
  it("returns true when scripts.test exists", async () => {
    writeFileSync(join(dir, "package.json"), JSON.stringify({ scripts: { test: "echo ok" } }));
    expect(await hasTestScript(dir)).toBe(true);
  });
  it("returns false when no test script", async () => {
    writeFileSync(join(dir, "package.json"), JSON.stringify({}));
    expect(await hasTestScript(dir)).toBe(false);
  });
  it("returns false when no package.json", async () => {
    expect(await hasTestScript(dir)).toBe(false);
  });
});

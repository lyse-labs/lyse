import { describe, it, expect, beforeEach } from "vitest";
import { git, gitInitWithCommit } from "../_helpers/git.js";
import { mkdtempSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { ensureClean, createBranch, commitAll, hasTestScript } from "../../src/codemods/git-helpers.js";

let dir: string;

function initRepo() {
  dir = mkdtempSync(join(tmpdir(), "lyse-gh-"));
  gitInitWithCommit(dir);
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
    const current = git(dir, ["rev-parse", "--abbrev-ref", "HEAD"]);
    expect(current).toBe("lyse/test");
  });
  it("suffixes on collision", async () => {
    await createBranch(dir, "lyse/dup");
    // checkout back to original branch (could be main or master)
    const original = git(dir, ["for-each-ref", "--format=%(refname:short)", "--count=1", "refs/heads/"]);
    git(dir, ["checkout", original]);
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

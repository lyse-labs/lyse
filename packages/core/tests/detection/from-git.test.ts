import { describe, it, expect, beforeEach } from "vitest";
import { execSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { detectFromGit } from "../../src/detection/from-git.js";

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "lyse-git-"));
  execSync("git init && git config user.email t@t.com && git config user.name t", { cwd: dir, shell: "/bin/sh" });
});

describe("detectFromGit", () => {
  it("detects initialized git", async () => {
    expect((await detectFromGit(dir)).git.value?.initialized).toBe(true);
  });

  it("detects clean tree after commit", async () => {
    writeFileSync(join(dir, "f.txt"), "x");
    execSync("git add . && git commit -m init", { cwd: dir, shell: "/bin/sh" });
    expect((await detectFromGit(dir)).git.value?.isClean).toBe(true);
  });

  it("detects dirty tree", async () => {
    writeFileSync(join(dir, "f.txt"), "x");
    expect((await detectFromGit(dir)).git.value?.isClean).toBe(false);
  });

  it("detects no git in fresh dir", async () => {
    const fresh = mkdtempSync(join(tmpdir(), "no-git-"));
    expect((await detectFromGit(fresh)).git.value?.initialized).toBe(false);
  });

  it("parses GitHub HTTPS remote URL", async () => {
    execSync("git remote add origin https://github.com/acme/web.git", { cwd: dir });
    const r = await detectFromGit(dir);
    expect(r.github.value).toEqual({ owner: "acme", repo: "web" });
  });

  it("parses GitHub SSH remote URL", async () => {
    execSync("git remote add origin git@github.com:acme/web.git", { cwd: dir });
    const r = await detectFromGit(dir);
    expect(r.github.value).toEqual({ owner: "acme", repo: "web" });
  });

  it("returns null github for non-GitHub remote", async () => {
    execSync("git remote add origin https://gitlab.com/acme/web.git", { cwd: dir });
    const r = await detectFromGit(dir);
    expect(r.github.value).toBe(null);
  });
});

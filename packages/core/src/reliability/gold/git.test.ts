import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { git, gitShowFile } from "./git.js";

describe("gold/git", () => {
  let repo: string;
  beforeAll(() => {
    repo = mkdtempSync(join(tmpdir(), "gold-git-"));
    const run = (args: string[]) => execFileSync("git", args, { cwd: repo });
    run(["init", "-q"]); run(["config", "user.email", "t@t"]); run(["config", "user.name", "t"]);
    writeFileSync(join(repo, "a.css"), ".x{color:#fff}\n");
    run(["add", "."]); run(["commit", "-qm", "one"]);
  });
  afterAll(() => rmSync(repo, { recursive: true, force: true }));
  it("git() runs and trims", async () => { expect(await git(["rev-parse", "--abbrev-ref", "HEAD"], repo)).toMatch(/\w/); });
  it("gitShowFile returns file at ref, '' when absent", async () => {
    expect(await gitShowFile(repo, "HEAD", "a.css")).toContain("#fff");
    expect(await gitShowFile(repo, "HEAD", "missing.css")).toBe("");
  });
});

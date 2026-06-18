import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, writeFileSync, existsSync, readFileSync } from "node:fs";
import { git, gitInit, gitCommitAll } from "../_helpers/git.js";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runFix } from "../../src/commands/fix.js";

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "lyse-fix-scaffold-"));
  gitInit(dir);
  writeFileSync(join(dir, "package.json"), JSON.stringify({ name: "@acme/ui", version: "1.0.0" }));
  gitCommitAll(dir, "init");
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe("runFix --scaffold", () => {
  it("generates the missing AI-readiness files and commits them", async () => {
    const r = await runFix({ cwd: dir, scaffold: true, autoApprove: true });
    expect(r.scaffolds.sort()).toContain("llms.txt");
    expect(r.scaffolds).toContain("AGENTS.md");
    expect(existsSync(join(dir, "llms.txt"))).toBe(true);
    expect(existsSync(join(dir, "AGENTS.md"))).toBe(true);
    // committed → working tree clean
    const status = git(dir, ["status", "--porcelain"]);
    expect(status).toBe("");
    const log = git(dir, ["log", "--oneline"]);
    expect(log).toMatch(/scaffold \d+ AI-readiness file/);
  });

  it("dry-run reports paths but writes nothing", async () => {
    const r = await runFix({ cwd: dir, scaffold: true, dryRun: true, autoApprove: true });
    expect(r.scaffolds.length).toBeGreaterThan(0);
    expect(existsSync(join(dir, "llms.txt"))).toBe(false);
    expect(existsSync(join(dir, "AGENTS.md"))).toBe(false);
  });

  it("is idempotent — a second run scaffolds nothing", async () => {
    await runFix({ cwd: dir, scaffold: true, autoApprove: true });
    const r2 = await runFix({ cwd: dir, scaffold: true, autoApprove: true });
    expect(r2.scaffolds).toHaveLength(0);
  });

  it("does not scaffold when --scaffold is absent", async () => {
    const r = await runFix({ cwd: dir, autoApprove: true });
    expect(r.scaffolds).toHaveLength(0);
    expect(existsSync(join(dir, "llms.txt"))).toBe(false);
  });

  it("the generated llms.txt names the package", async () => {
    await runFix({ cwd: dir, scaffold: true, autoApprove: true });
    expect(readFileSync(join(dir, "llms.txt"), "utf8")).toContain("# ui");
  });
});

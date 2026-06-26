import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { auditDirectory, ScopeError } from "../../src/commands/audit-pipeline.js";

function git(args: string[], cwd: string): void {
  execFileSync("git", args, { cwd, stdio: ["ignore", "ignore", "ignore"] });
}

const DIRTY_A = 'export const a = { color: "#ff0000", padding: "13px" };\n';
const DIRTY_B = 'export const b = { color: "#00ff00", margin: "7px" };\n';

describe("auditDirectory — scope filtering", () => {
  let repo: string;

  beforeEach(() => {
    repo = realpathSync(mkdtempSync(join(tmpdir(), "lyse-scopepipe-")));
    git(["init", "-q"], repo);
    git(["config", "user.email", "t@example.com"], repo);
    git(["config", "user.name", "Test"], repo);
    git(["config", "commit.gpgsign", "false"], repo);
    writeFileSync(join(repo, "package.json"), '{"name":"x","version":"0.0.0"}\n');
    writeFileSync(join(repo, "a.tsx"), "export const a = 1;\n");
    writeFileSync(join(repo, "b.tsx"), "export const b = 1;\n");
    git(["add", "."], repo);
    git(["commit", "-qm", "base"], repo);
    // Introduce drift in BOTH files; stage only a.tsx.
    writeFileSync(join(repo, "a.tsx"), DIRTY_A);
    writeFileSync(join(repo, "b.tsx"), DIRTY_B);
    git(["add", "a.tsx"], repo);
  });

  afterEach(() => {
    rmSync(repo, { recursive: true, force: true });
  });

  it("a full audit covers both files (baseline)", async () => {
    const { result } = await auditDirectory(repo, { staticOnly: true });
    const files = new Set(result.findings.map((f) => f.location.file));
    expect(files.has("a.tsx")).toBe(true);
    expect(files.has("b.tsx")).toBe(true);
  });

  it("--scope staged limits findings to staged files", async () => {
    const { result } = await auditDirectory(repo, { staticOnly: true, scope: "staged" });
    const files = new Set(result.findings.map((f) => f.location.file));
    expect(files.has("a.tsx")).toBe(true);
    expect(files.has("b.tsx")).toBe(false);
  });

  it("--scope changed (base = first commit) limits findings to changed files", async () => {
    // Commit a.tsx so it is 'changed' vs the base; b.tsx stays uncommitted.
    git(["commit", "-qm", "drift a"], repo);
    const base = execFileSync("git", ["rev-parse", "HEAD~1"], { cwd: repo }).toString().trim();
    const { result } = await auditDirectory(repo, { staticOnly: true, scope: "changed", base });
    const files = new Set(result.findings.map((f) => f.location.file));
    expect(files.has("a.tsx")).toBe(true);
    expect(files.has("b.tsx")).toBe(false);
  });

  it("--scope uncommitted covers all working-tree changes (staged + unstaged)", async () => {
    // a.tsx is staged-dirty, b.tsx is unstaged-dirty (both uncommitted vs HEAD).
    const { result } = await auditDirectory(repo, { staticOnly: true, scope: "uncommitted" });
    const files = new Set(result.findings.map((f) => f.location.file));
    expect(files.has("a.tsx")).toBe(true);
    expect(files.has("b.tsx")).toBe(true);
  });

  it("throws ScopeError when --scope changed base is unresolvable", async () => {
    await expect(
      auditDirectory(repo, { staticOnly: true, scope: "changed", base: "does-not-exist-ref" }),
    ).rejects.toBeInstanceOf(ScopeError);
  });
});

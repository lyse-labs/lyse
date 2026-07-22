import { describe, it, expect } from "vitest";
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { auditDirectory } from "../src/commands/audit-pipeline.js";
import { buildBaseline } from "../src/diff/baseline.js";
import { selectNew } from "../src/diff/delta.js";

function repoWith(src: string): string {
  const dir = mkdtempSync(join(tmpdir(), "lyse-df-"));
  mkdirSync(join(dir, "src"), { recursive: true });
  writeFileSync(join(dir, "src", "Button.tsx"), src);
  writeFileSync(join(dir, "package.json"), JSON.stringify({ name: "fx", version: "0.0.0" }));
  return dir;
}

describe("diff-first end-to-end", () => {
  it("reformat-only re-audit produces zero new findings [MISSION ACCEPTANCE §7 P4]", async () => {
    const before = `export const S = {\n  a: "#3b82f6",\n  b: "#ffffff",\n};\n`;
    const dir = repoWith(before);
    try {
      const first = await auditDirectory(dir);
      const baseline = buildBaseline(first.result, first.graph);

      // reformat only: same literals, extra blank lines + reindentation
      writeFileSync(join(dir, "src", "Button.tsx"),
        `\n\nexport const S = {\n\n      a: "#3b82f6",\n\n      b: "#ffffff",\n\n};\n`);

      const second = await auditDirectory(dir);
      const { newFindings } = selectNew(second.result.findings, baseline, second.graph);
      // sanity: the audit still finds the drift (baseline non-empty), but nothing is NEW
      expect(baseline.findings["src/Button.tsx"]).toBeTruthy();
      expect(newFindings).toEqual([]);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  }, 40_000);

  it("adding one hardcoded color surfaces exactly one new finding", async () => {
    const dir = repoWith(`export const S = { a: "#3b82f6" };\n`);
    try {
      const first = await auditDirectory(dir);
      const baseline = buildBaseline(first.result, first.graph);
      writeFileSync(join(dir, "src", "Button.tsx"), `export const S = { a: "#3b82f6", b: "#123456" };\n`);
      const second = await auditDirectory(dir);
      const { newFindings } = selectNew(second.result.findings, baseline, second.graph);
      expect(newFindings.map((f) => f.fixGroup?.from)).toContain("#123456");
      expect(newFindings.length).toBe(1);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  }, 40_000);
});

const CLI = join(__dirname, "..", "dist", "cli.js"); // built entrypoint

describe("--scope new exit codes (CLI)", () => {
  it("exits 64 when no baseline exists", () => {
    const dir = repoWith(`export const S = { a: "#3b82f6" };\n`);
    try {
      let code = 0;
      try { execFileSync("node", [CLI, "audit", ".", "--scope", "new", "--quiet"], { cwd: dir, stdio: "pipe" }); }
      catch (e: unknown) { code = (e as { status?: number }).status ?? -1; }
      expect(code).toBe(64);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  }, 40_000);
});

import { describe, it, expect } from "vitest";
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { runBaselineWrite } from "./baseline.js";

function fixtureRepo(): string {
  const dir = mkdtempSync(join(tmpdir(), "lyse-blw-"));
  execFileSync("git", ["init", "-q"], { cwd: dir });
  mkdirSync(join(dir, "src"), { recursive: true });
  writeFileSync(join(dir, "src", "Button.tsx"),
    `export const S = { a: "#3b82f6", b: "#3b82f6", c: "#ffffff" };\n`);
  writeFileSync(join(dir, "package.json"), JSON.stringify({ name: "fx", version: "0.0.0" }));
  return dir;
}

describe("runBaselineWrite", () => {
  it("writes a deterministic .lyse/baseline.json and keeps it trackable", async () => {
    const dir = fixtureRepo();
    try {
      const out = await runBaselineWrite({ root: dir, quiet: true });
      expect(existsSync(out.path)).toBe(true);
      const a = readFileSync(out.path, "utf8");

      // deterministic re-write: byte-identical
      await runBaselineWrite({ root: dir, quiet: true });
      expect(readFileSync(out.path, "utf8")).toBe(a);

      // trackable: not ignored
      let ignored = true;
      try { execFileSync("git", ["check-ignore", "-q", ".lyse/baseline.json"], { cwd: dir }); }
      catch { ignored = false; }
      expect(ignored).toBe(false);

      // sane content: no timestamp, has findings + graphHash
      expect(a).not.toMatch(/timestamp|createdAt/);
      const parsed = JSON.parse(a);
      expect(parsed.graphHash).toMatch(/^sha256:/);
      expect(parsed.schemaVersion).toBe(1);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  }, 30_000);
});

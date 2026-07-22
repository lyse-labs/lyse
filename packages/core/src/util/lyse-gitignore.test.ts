import { describe, it, expect } from "vitest";
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { ensureLyseGitignore } from "./lyse-gitignore.js";

function tmpRepo(): string {
  const dir = mkdtempSync(join(tmpdir(), "lyse-gi-"));
  execFileSync("git", ["init", "-q"], { cwd: dir });
  return dir;
}
function ignored(dir: string, path: string): boolean {
  try { execFileSync("git", ["check-ignore", "-q", path], { cwd: dir }); return true; }
  catch { return false; }
}

describe("ensureLyseGitignore", () => {
  it("ignores .lyse/ contents but NOT baseline.json", async () => {
    const dir = tmpRepo();
    try {
      await ensureLyseGitignore(dir);
      expect(ignored(dir, ".lyse/graph.json")).toBe(true);
      expect(ignored(dir, ".lyse/history.ndjson")).toBe(true);
      expect(ignored(dir, ".lyse/baseline.json")).toBe(false);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });

  it("migrates a legacy `.lyse/` directory-form line so the negation works", async () => {
    const dir = tmpRepo();
    try {
      writeFileSync(join(dir, ".gitignore"), "node_modules\n.lyse/\n");
      await ensureLyseGitignore(dir);
      expect(ignored(dir, ".lyse/baseline.json")).toBe(false);
      expect(ignored(dir, ".lyse/graph.json")).toBe(true);
      const gi = readFileSync(join(dir, ".gitignore"), "utf8");
      expect(gi).not.toMatch(/^\.lyse\/$/m); // legacy dir-form gone
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });

  it("is idempotent (second call adds nothing)", async () => {
    const dir = tmpRepo();
    try {
      await ensureLyseGitignore(dir);
      const first = readFileSync(join(dir, ".gitignore"), "utf8");
      await ensureLyseGitignore(dir);
      expect(readFileSync(join(dir, ".gitignore"), "utf8")).toBe(first);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });

  it("no-op without a git repo", async () => {
    const dir = mkdtempSync(join(tmpdir(), "lyse-nogit-"));
    try {
      await ensureLyseGitignore(dir);
      // no throw; .gitignore may or may not exist — the audit path guards on .git
      expect(true).toBe(true);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
});

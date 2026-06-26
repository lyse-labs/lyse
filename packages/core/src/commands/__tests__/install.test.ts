import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, existsSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { runInstall } from "../install.js";
import { AGENTS } from "../../agent/registry.js";

const cursor = AGENTS.find((a) => a.id === "cursor")!;
const detectCursor = async () => [cursor];
const detectNone = async () => [];

function git(args: string[], cwd: string): void {
  execFileSync("git", args, { cwd, stdio: ["ignore", "ignore", "ignore"] });
}

let repo: string;

beforeEach(() => {
  repo = realpathSync(mkdtempSync(join(tmpdir(), "lyse-install-")));
  git(["init", "-q"], repo);
});

afterEach(() => {
  rmSync(repo, { recursive: true, force: true });
});

describe("runInstall", () => {
  it("installs the skill to each detected agent and writes the pre-commit hook", async () => {
    const r = await runInstall({ cwd: repo }, { detect: detectCursor });
    expect(r.skills.map((s) => s.agent)).toContain("cursor");
    expect(r.skills.every((s) => s.installed)).toBe(true);
    expect(existsSync(join(repo, cursor.skillRelPath))).toBe(true);
    expect(r.hook.written).toContain(".git/hooks/pre-commit");
    expect(existsSync(join(repo, ".git/hooks/pre-commit"))).toBe(true);
  });

  it("installs skills even with no detected agents (empty), still writes the hook", async () => {
    const r = await runInstall({ cwd: repo }, { detect: detectNone });
    expect(r.skills).toEqual([]);
    expect(r.hook.written).toContain(".git/hooks/pre-commit");
  });

  it("is resilient outside a git repo: installs the skill, records the hook as skipped", async () => {
    const notRepo = realpathSync(mkdtempSync(join(tmpdir(), "lyse-install-norepo-")));
    try {
      const r = await runInstall({ cwd: notRepo }, { detect: detectCursor });
      expect(existsSync(join(notRepo, cursor.skillRelPath))).toBe(true);
      expect(r.hook.written).toEqual([]);
      expect(r.hook.skipped[0]?.reason).toMatch(/git/i);
    } finally {
      rmSync(notRepo, { recursive: true, force: true });
    }
  });
});

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runAddCiGate, AddCiGateError, CI_GATE_DEFAULTS } from "../add-ci-gate.js";
import { VERSION } from "../../index.js";

let tmp: string;

function markAsRepo(dir: string): void {
  writeFileSync(join(dir, "package.json"), '{"name": "test"}\n');
}

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), "lyse-add-ci-gate-"));
  markAsRepo(tmp);
});

afterEach(() => {
  rmSync(tmp, { recursive: true, force: true });
});

describe("runAddCiGate", () => {
  it("writes both files on a fresh repo", () => {
    const r = runAddCiGate({ cwd: tmp });
    expect(r.written.sort()).toEqual([
      ".github/scripts/lyse-gate.mjs",
      ".github/workflows/lyse.yml",
    ].sort());
    expect(r.skipped).toEqual([]);
    expect(existsSync(join(tmp, ".github/workflows/lyse.yml"))).toBe(true);
    expect(existsSync(join(tmp, ".github/scripts/lyse-gate.mjs"))).toBe(true);
  });

  it("workflow embeds the requested lyseVersion and threshold", () => {
    runAddCiGate({ cwd: tmp, lyseVersion: "0.2.0-alpha.1", threshold: 5 });
    const wf = readFileSync(join(tmp, ".github/workflows/lyse.yml"), "utf8");
    expect(wf).toContain('LYSE_VERSION: "0.2.0-alpha.1"');
    expect(wf).toContain('GATE_THRESHOLD: "5"');
  });

  it("workflow uses defaults when no options passed", () => {
    runAddCiGate({ cwd: tmp });
    const wf = readFileSync(join(tmp, ".github/workflows/lyse.yml"), "utf8");
    expect(wf).toContain(`LYSE_VERSION: "${CI_GATE_DEFAULTS.lyseVersion}"`);
    expect(wf).toContain(`GATE_THRESHOLD: "${CI_GATE_DEFAULTS.threshold}"`);
  });

  it("default lyseVersion is the running CLI version (not a moving tag like `alpha`)", () => {
    expect(CI_GATE_DEFAULTS.lyseVersion).toBe(VERSION);
    runAddCiGate({ cwd: tmp });
    const wf = readFileSync(join(tmp, ".github/workflows/lyse.yml"), "utf8");
    expect(wf).toContain(`LYSE_VERSION: "${VERSION}"`);
  });

  it("rejects empty --lyse-version", () => {
    expect(() => runAddCiGate({ cwd: tmp, lyseVersion: "" })).toThrow(AddCiGateError);
    expect(() => runAddCiGate({ cwd: tmp, lyseVersion: "" })).toThrow(/non-empty string/);
  });

  it("rejects --lyse-version containing shell metacharacters", () => {
    expect(() => runAddCiGate({ cwd: tmp, lyseVersion: "1.0.0; rm -rf /" })).toThrow(AddCiGateError);
    expect(() => runAddCiGate({ cwd: tmp, lyseVersion: "1.0.0 $(id)" })).toThrow(/invalid format/);
    expect(() => runAddCiGate({ cwd: tmp, lyseVersion: "v1`whoami`" })).toThrow(/invalid format/);
  });

  it("accepts well-formed --lyse-version values (semver, dist-tag)", () => {
    expect(() => runAddCiGate({ cwd: tmp, lyseVersion: "0.1.0-alpha.2", force: true })).not.toThrow();
    expect(() => runAddCiGate({ cwd: tmp, lyseVersion: "latest", force: true })).not.toThrow();
    expect(() => runAddCiGate({ cwd: tmp, lyseVersion: "alpha", force: true })).not.toThrow();
  });

  it("throws when target dir has neither .git/ nor package.json", () => {
    const bare = mkdtempSync(join(tmpdir(), "lyse-add-ci-gate-bare-"));
    try {
      expect(() => runAddCiGate({ cwd: bare })).toThrow(AddCiGateError);
      expect(() => runAddCiGate({ cwd: bare })).toThrow(/not a project root/);
      expect(() => runAddCiGate({ cwd: bare })).toThrow(/--force-not-a-repo/);
    } finally {
      rmSync(bare, { recursive: true, force: true });
    }
  });

  it("accepts a git-only project root (no package.json)", () => {
    const gitOnly = mkdtempSync(join(tmpdir(), "lyse-add-ci-gate-git-"));
    try {
      mkdirSync(join(gitOnly, ".git"));
      expect(() => runAddCiGate({ cwd: gitOnly })).not.toThrow();
      expect(existsSync(join(gitOnly, ".github/workflows/lyse.yml"))).toBe(true);
    } finally {
      rmSync(gitOnly, { recursive: true, force: true });
    }
  });

  it("accepts a package.json-only project root (no .git/)", () => {
    // `tmp` itself is package.json-only thanks to the beforeEach marker.
    expect(() => runAddCiGate({ cwd: tmp })).not.toThrow();
    expect(existsSync(join(tmp, ".github/workflows/lyse.yml"))).toBe(true);
  });

  it("forceNotARepo bypasses the project-root check", () => {
    const bare = mkdtempSync(join(tmpdir(), "lyse-add-ci-gate-bare-"));
    try {
      expect(() => runAddCiGate({ cwd: bare, forceNotARepo: true })).not.toThrow();
      expect(existsSync(join(bare, ".github/workflows/lyse.yml"))).toBe(true);
    } finally {
      rmSync(bare, { recursive: true, force: true });
    }
  });

  it("refuses to overwrite existing files without --force", () => {
    mkdirSync(join(tmp, ".github/workflows"), { recursive: true });
    writeFileSync(join(tmp, ".github/workflows/lyse.yml"), "preexisting\n");
    const r = runAddCiGate({ cwd: tmp });
    expect(r.written).toContain(".github/scripts/lyse-gate.mjs");
    expect(r.written).not.toContain(".github/workflows/lyse.yml");
    expect(r.skipped).toEqual([
      { path: ".github/workflows/lyse.yml", reason: "already exists (pass --force to overwrite)" },
    ]);
    // Original file is preserved
    expect(readFileSync(join(tmp, ".github/workflows/lyse.yml"), "utf8")).toBe("preexisting\n");
  });

  it("overwrites with --force", () => {
    mkdirSync(join(tmp, ".github/workflows"), { recursive: true });
    writeFileSync(join(tmp, ".github/workflows/lyse.yml"), "old\n");
    const r = runAddCiGate({ cwd: tmp, force: true });
    expect(r.written).toContain(".github/workflows/lyse.yml");
    expect(r.skipped).toEqual([]);
    expect(readFileSync(join(tmp, ".github/workflows/lyse.yml"), "utf8")).not.toBe("old\n");
  });

  it("throws on non-existent target directory", () => {
    expect(() => runAddCiGate({ cwd: join(tmp, "nope") })).toThrow(AddCiGateError);
  });

  it("rejects negative threshold", () => {
    expect(() => runAddCiGate({ cwd: tmp, threshold: -1 })).toThrow(/non-negative/);
  });

  it("rejects NaN threshold", () => {
    expect(() => runAddCiGate({ cwd: tmp, threshold: Number.NaN })).toThrow(/non-negative/);
  });

  it("generated script starts with shebang and has the expected top-level shape", () => {
    runAddCiGate({ cwd: tmp });
    const script = readFileSync(join(tmp, ".github/scripts/lyse-gate.mjs"), "utf8");
    expect(script.startsWith("#!/usr/bin/env node")).toBe(true);
    expect(script).toContain('import { readFileSync } from "node:fs"');
    expect(script).toContain("function loadReport(");
    expect(script).toContain("function diffFindings(");
    expect(script).toContain("function buildComment(");
    expect(script).toContain("main(process.argv)");
  });

  it("generated workflow has all the gate steps", () => {
    runAddCiGate({ cwd: tmp });
    const wf = readFileSync(join(tmp, ".github/workflows/lyse.yml"), "utf8");
    // Spot-check the critical steps
    expect(wf).toContain("Audit PR");
    expect(wf).toContain("Audit main (best-effort baseline)");
    expect(wf).toContain("Run gate");
    expect(wf).toContain("Post PR comment");
    expect(wf).toContain("Fail on regression");
    expect(wf).toContain("Detect fork PR");
  });
});

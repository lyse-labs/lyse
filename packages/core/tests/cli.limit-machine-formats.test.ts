import { describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { LYSE_CLI_PATH } from "./_helpers/cli.js";

const cli = LYSE_CLI_PATH;

function fixtureRepo(): string {
  const dir = mkdtempSync(join(tmpdir(), "lyse-limit-machine-"));
  writeFileSync(join(dir, "package.json"), JSON.stringify({ name: "t" }));
  writeFileSync(
    join(dir, "Page.tsx"),
    [
      'export const A = () => <div style={{ background: "#fff" }} />;',
      'export const B = () => <div style={{ background: "#eee" }} />;',
      'export const C = () => <div style={{ background: "#ddd" }} />;',
      'export const D = () => <div style={{ background: "#ccc" }} />;',
      'export const E = () => <div style={{ background: "#bbb" }} />;',
    ].join("\n"),
  );
  return dir;
}

function runAudit(repo: string, extraArgs: string[]): ReturnType<typeof spawnSync> {
  const env: NodeJS.ProcessEnv = { ...process.env };
  delete env.CI;
  return spawnSync(
    "node",
    [cli, "audit", repo, "--static-only", "--include-timestamps", ...extraArgs],
    { encoding: "utf8", timeout: 30_000, env },
  );
}

describe("--format=json ignores --limit", () => {
  if (!existsSync(cli)) {
    it.skip("CLI not built — skip", () => {});
    return;
  }

  it("returns the full findings list regardless of --limit=1", () => {
    const repo = fixtureRepo();
    try {
      const unbounded = runAudit(repo, ["--format=json"]);
      const limited = runAudit(repo, ["--format=json", "--limit=1"]);
      expect(unbounded.status).toBe(0);
      expect(limited.status).toBe(0);
      const a = JSON.parse(unbounded.stdout) as { findings: unknown[] };
      const b = JSON.parse(limited.stdout) as { findings: unknown[] };
      expect(b.findings.length).toBe(a.findings.length);
      expect(b.findings.length).toBeGreaterThan(1);
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });

  it("returns the full findings list regardless of --limit=0", () => {
    const repo = fixtureRepo();
    try {
      const limited = runAudit(repo, ["--format=json", "--limit=0"]);
      expect(limited.status).toBe(0);
      const b = JSON.parse(limited.stdout) as { findings: unknown[] };
      expect(b.findings.length).toBeGreaterThan(1);
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });
});

describe("--format=sarif ignores --limit", () => {
  if (!existsSync(cli)) {
    it.skip("CLI not built — skip", () => {});
    return;
  }

  it("returns every result regardless of --limit=1", () => {
    const repo = fixtureRepo();
    try {
      const unbounded = runAudit(repo, ["--format=sarif"]);
      const limited = runAudit(repo, ["--format=sarif", "--limit=1"]);
      expect(unbounded.status).toBe(0);
      expect(limited.status).toBe(0);
      const a = JSON.parse(unbounded.stdout) as { runs: { results: unknown[] }[] };
      const b = JSON.parse(limited.stdout) as { runs: { results: unknown[] }[] };
      const aLen = a.runs[0]?.results.length ?? 0;
      const bLen = b.runs[0]?.results.length ?? 0;
      expect(bLen).toBe(aLen);
      expect(bLen).toBeGreaterThan(1);
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });
});

import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import { readFileSync, existsSync, writeFileSync, mkdtempSync, mkdirSync, rmSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import { LYSE_CLI_PATH } from "./_helpers/cli.js";
import { gitInit, gitCommitAll, git } from "./_helpers/git.js";

function makeConsentHome(accepted: boolean): string {
  const tmpHome = mkdtempSync(join(tmpdir(), "lyse-cli-home-"));
  mkdirSync(join(tmpHome, ".lyse"), { recursive: true });
  writeFileSync(
    join(tmpHome, ".lyse", "consent.json"),
    JSON.stringify({
      accepted,
      attempt: 2,
      decided_at: new Date().toISOString(),
      version: "1.0.0",
    }),
  );
  return tmpHome;
}

/** Run `node <cli> <args…>` with no shell, so it works on Windows too. */
function runCli(cli: string, args: string[], opts: { env?: NodeJS.ProcessEnv } = {}): void {
  execFileSync("node", [cli, ...args], { stdio: "ignore", ...(opts.env ? { env: opts.env } : {}) });
}

/** os.homedir() reads USERPROFILE on Windows and HOME on posix — set both. */
function homeEnv(home: string): NodeJS.ProcessEnv {
  return { ...process.env, HOME: home, USERPROFILE: home };
}

const __dirname = dirname(fileURLToPath(import.meta.url));

describe("cli audit integration (full-ds fixture)", () => {
  it("runs end-to-end and produces a non-empty lyse.json", () => {
    const root = join(__dirname, "../fixtures/full-ds");
    const out = join(root, "report");
    const cli = LYSE_CLI_PATH;
    if (!existsSync(cli)) {
      throw new Error(`CLI not built — run \`pnpm --filter lyse build\` first. Looked at: ${cli}`);
    }
    // Pin v2 for the numeric finalScore assertion: under the default v3 model
    // every full-ds axis is below min-N=30 → finalScore "N/A". This test checks
    // the end-to-end lyse.json carries a real score + findings; the numeric
    // score comes from the v2 formula. (The determinism test below stays on the
    // default v3 model.)
    runCli(cli, ["audit", root, "--static-only", "--score-model", "v2", "--output", out]);
    const json = JSON.parse(readFileSync(join(out, "lyse.json"), "utf8"));
    expect(json.finalScore).not.toBe("N/A");
    expect(json.findings.length).toBeGreaterThan(0);
    expect(
      json.findings.some((f: { ruleId: string }) => f.ruleId === "tokens/no-hardcoded-color"),
    ).toBe(true);
  });

  it("produces byte-identical JSON output across successive runs (determinism)", () => {
    const root = join(__dirname, "../fixtures/full-ds");
    const out1 = join(root, "report-det-1");
    const out2 = join(root, "report-det-2");
    const cli = LYSE_CLI_PATH;
    if (!existsSync(cli)) {
      throw new Error(`CLI not built — run \`pnpm --filter lyse build\` first. Looked at: ${cli}`);
    }
    runCli(cli, ["audit", root, "--static-only", "--output", out1]);
    runCli(cli, ["audit", root, "--static-only", "--output", out2]);
    const json1 = readFileSync(join(out1, "lyse.json"), "utf8");
    const json2 = readFileSync(join(out2, "lyse.json"), "utf8");
    expect(json1).toBe(json2);
  });

  it("audit no longer auto-writes AGENTS.md when --output is given", () => {
    const root = join(__dirname, "../fixtures/full-ds");
    const out = join(root, "report-no-agents-md");
    const cli = LYSE_CLI_PATH;
    if (!existsSync(cli)) {
      throw new Error(`CLI not built — run \`pnpm --filter lyse build\` first. Looked at: ${cli}`);
    }
    runCli(cli, ["audit", root, "--static-only", "--output", out]);
    // lyse.json present
    expect(existsSync(join(out, "lyse.json"))).toBe(true);
    // AGENTS.md ABSENT (moved to agents-md subcommand)
    expect(existsSync(join(out, "AGENTS.md"))).toBe(false);
  });
});

describe("cli telemetry (consent.accepted=true)", () => {
  const cli = LYSE_CLI_PATH;

  it("writes events.ndjson when telemetry enabled", () => {
    if (!existsSync(cli)) {
      throw new Error(`CLI not built — run \`pnpm --filter lyse build\` first. Looked at: ${cli}`);
    }
    const tmp = mkdtempSync(join(tmpdir(), "lyse-cli-tel-"));
    const tmpHome = makeConsentHome(true);
    gitInit(tmp);
    git(tmp, ["remote", "add", "origin", "https://github.com/t/t.git"]);
    writeFileSync(
      join(tmp, "Page.tsx"),
      'export default () => <div style={{ background: "#fff" }} />',
    );
    gitCommitAll(tmp, "init");
    try {
      runCli(cli, ["audit", tmp, "--static-only", "--format", "json"], { env: homeEnv(tmpHome) });
      const ndjsonPath = join(tmp, ".lyse/events.ndjson");
      expect(existsSync(ndjsonPath)).toBe(true);
      const lines = readFileSync(ndjsonPath, "utf8").trim().split("\n").filter(Boolean);
      expect(lines.length).toBeGreaterThan(0);
      const events = lines.map((l) => JSON.parse(l) as { event_type: string });
      const types = events.map((e) => e.event_type);
      expect(types).toContain("audit.started");
      expect(types).toContain("audit.completed");
    } finally {
      rmSync(tmpHome, { recursive: true, force: true });
    }
  });

  it("does NOT write events when consent is absent (non-TTY default)", () => {
    if (!existsSync(cli)) {
      throw new Error(`CLI not built — run \`pnpm --filter lyse build\` first. Looked at: ${cli}`);
    }
    const tmp = mkdtempSync(join(tmpdir(), "lyse-cli-no-tel-"));
    const tmpHome = mkdtempSync(join(tmpdir(), "lyse-cli-home-no-"));
    gitInit(tmp);
    writeFileSync(join(tmp, "Page.tsx"), "export default () => null;");
    try {
      runCli(cli, ["audit", tmp, "--static-only", "--format", "json"], { env: homeEnv(tmpHome) });
      expect(existsSync(join(tmp, ".lyse/events.ndjson"))).toBe(false);
      // Non-TTY path must NOT persist a consent file (per ADR 0012).
      expect(existsSync(join(tmpHome, ".lyse/consent.json"))).toBe(false);
    } finally {
      rmSync(tmpHome, { recursive: true, force: true });
    }
  });

  it("--no-telemetry overrides consent for a single run without persisting", () => {
    if (!existsSync(cli)) {
      throw new Error(`CLI not built — run \`pnpm --filter lyse build\` first. Looked at: ${cli}`);
    }
    const tmp = mkdtempSync(join(tmpdir(), "lyse-cli-noflag-"));
    const tmpHome = makeConsentHome(true);
    gitInit(tmp);
    writeFileSync(join(tmp, "Page.tsx"), "export default () => null;");
    try {
      runCli(cli, ["audit", tmp, "--static-only", "--no-telemetry", "--format", "json"], {
        env: homeEnv(tmpHome),
      });
      expect(existsSync(join(tmp, ".lyse/events.ndjson"))).toBe(false);
      // Persisted consent must remain accepted=true (single-run override).
      const persisted = JSON.parse(
        readFileSync(join(tmpHome, ".lyse", "consent.json"), "utf8"),
      ) as { accepted: boolean; attempt: number };
      expect(persisted.accepted).toBe(true);
      expect(persisted.attempt).toBe(2);
    } finally {
      rmSync(tmpHome, { recursive: true, force: true });
    }
  });
});

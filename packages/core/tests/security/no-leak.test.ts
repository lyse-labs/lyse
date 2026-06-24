import { describe, it, expect } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { execSync, spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

function makeConsentHome(accepted: boolean): string {
  const tmpHome = mkdtempSync(join(tmpdir(), "lyse-noleak-home-"));
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

const __dirname = dirname(fileURLToPath(import.meta.url));
const cli = join(__dirname, "../../dist/cli.js");
const recorderScript = join(__dirname, "_recorder.mjs");

// Leak detection is performed by the `--import=_recorder.mjs` hook, which wraps
// fetch / http.request / https.request in the spawned CLI process and emits any
// outbound URL as `__OUTBOUND__:` on stderr (parsed into `outboundCalls` below).

function setupTinyRepo(): string {
  const dir = mkdtempSync(join(tmpdir(), "lyse-noleak-"));
  execSync("git init -q", { cwd: dir });
  execSync('git config user.email "t@t"', { cwd: dir });
  execSync('git config user.name "t"', { cwd: dir });
  writeFileSync(join(dir, "Page.tsx"), 'export default () => <div style={{ background: "#fff" }} />;');
  execSync("git add . && git commit -q -m init", { cwd: dir });
  return dir;
}

/**
 * Run the CLI as a subprocess with a Node --import hook that wraps
 * fetch / http.request / https.request to record any outbound connection
 * attempts. Any outbound URL is emitted to stderr with __OUTBOUND__: prefix,
 * which we parse back here.
 */
function runCliWithNetworkRecorder(
  args: string[],
  env: Record<string, string>,
): { stdout: string; stderr: string; status: number; outboundCalls: string[] } {
  const result = spawnSync(
    "node",
    [`--import=${recorderScript}`, cli, ...args],
    {
      encoding: "utf8",
      env: { ...process.env, ...env },
    },
  );
  const outboundCalls = (result.stderr?.match(/__OUTBOUND__:.*$/gm) ?? []).map(
    (l) => l.replace("__OUTBOUND__:", "").trim(),
  );
  return {
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
    status: result.status ?? -1,
    outboundCalls,
  };
}

describe("no-leak verification (engine)", () => {
  it("zero outbound non-loopback hosts when consent is absent", () => {
    const dir = setupTinyRepo();
    const tmpHome = mkdtempSync(join(tmpdir(), "lyse-noleak-noconsent-"));
    try {
      const r = runCliWithNetworkRecorder(["audit", dir, "--format", "json"], {
        HOME: tmpHome,
      });
      const externalCalls = r.outboundCalls.filter(
        (c) => !/127\.0\.0\.1|localhost|::1/.test(c),
      );
      expect(externalCalls).toHaveLength(0);
    } finally {
      rmSync(tmpHome, { recursive: true, force: true });
    }
  });

  it("zero outbound non-loopback hosts when consent is accepted (local-only logging, no remote POST at MVP)", () => {
    // P10's remote POST is not yet wired in the CLI — it's W3-6's Worker that RECEIVES.
    // The CLI today only writes locally to .lyse/events.ndjson.
    // We assert: consent=accepted still produces no outbound (because no remote-mirror is implemented in cli.ts).
    const dir = setupTinyRepo();
    const tmpHome = makeConsentHome(true);
    try {
      const r = runCliWithNetworkRecorder(
        ["audit", dir, "--format", "json"],
        { HOME: tmpHome },
      );
      const externalCalls = r.outboundCalls.filter(
        (c) => !/127\.0\.0\.1|localhost|::1/.test(c),
      );
      expect(externalCalls).toHaveLength(0);
    } finally {
      rmSync(tmpHome, { recursive: true, force: true });
    }
  });
});

#!/usr/bin/env tsx
/**
 * Pre-flight checklist for `npm publish lyse@0.1.0`.
 *
 * Runs a fixed list of checks against the working tree, the build outputs,
 * and a handful of documents. Exits 0 if every check passes; exits 1 with a
 * detailed report otherwise. Pass `--json` for machine-readable output for
 * CI consumption. Pass `--no-color` to disable ANSI escape codes.
 *
 * Usage:
 *   pnpm tsx scripts/release-check.ts
 *   pnpm tsx scripts/release-check.ts --json
 *   pnpm tsx scripts/release-check.ts --no-color
 */
import { existsSync, readFileSync, statSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { resolve, join } from "node:path";

interface CheckResult {
  id: number;
  name: string;
  status: "pass" | "fail";
  detail?: string;
}

const ROOT = resolve(import.meta.dirname, "..");

const args = process.argv.slice(2);
const JSON_MODE = args.includes("--json");
// NO_COLOR spec (no-color.org): respect the env var ONLY when non-empty. Also
// auto-disable color when stdout is piped (non-TTY) so JSON/grep consumers
// don't get escape sequences.
const NO_COLOR =
  args.includes("--no-color") ||
  (process.env["NO_COLOR"] ?? "") !== "" ||
  !process.stdout.isTTY;

// Per-command default timeout: 10 minutes. test:recall + pnpm test are the
// slowest individual checks; anything beyond that is wedged and should fail
// rather than block the operator.
const COMMAND_TIMEOUT_MS = 10 * 60_000;

const RED = NO_COLOR ? "" : "\x1b[31m";
const GREEN = NO_COLOR ? "" : "\x1b[32m";
const BOLD = NO_COLOR ? "" : "\x1b[1m";
const RESET = NO_COLOR ? "" : "\x1b[0m";

function pass(id: number, name: string): CheckResult {
  return { id, name, status: "pass" };
}
function fail(id: number, name: string, detail: string): CheckResult {
  return { id, name, status: "fail", detail };
}

function readMaybe(path: string): string | null {
  try {
    return readFileSync(path, "utf8");
  } catch {
    return null;
  }
}

function run(cmd: string, args: string[], cwd: string = ROOT): { code: number; stdout: string; stderr: string; timedOut: boolean } {
  const r = spawnSync(cmd, args, { cwd, encoding: "utf8", timeout: COMMAND_TIMEOUT_MS, killSignal: "SIGKILL" });
  const timedOut = r.signal === "SIGKILL" || r.error?.message?.includes("ETIMEDOUT") === true;
  return {
    code: r.status ?? -1,
    stdout: r.stdout ?? "",
    stderr: r.stderr ?? "",
    timedOut,
  };
}

// Clean working tree.
function checkCleanWorkingTree(): CheckResult {
  const r = run("git", ["status", "--porcelain"]);
  if (r.code !== 0) return fail(2, "git working tree is clean", `git failed (exit ${r.code}): ${r.stderr.trim()}`);
  if (r.stdout.trim() === "") return pass(2, "git working tree is clean");
  const sample = r.stdout.split("\n").slice(0, 5).join("\n  ");
  return fail(2, "git working tree is clean", `uncommitted changes detected:\n  ${sample}`);
}

// 3 — Current branch is `main` AND up-to-date with origin/main.
function checkOnMainAndUpToDate(): CheckResult {
  const branch = run("git", ["rev-parse", "--abbrev-ref", "HEAD"]);
  const current = branch.stdout.trim();
  if (current !== "main") return fail(3, "on `main` branch", `current branch is \`${current}\``);
  const fetch = run("git", ["fetch", "origin", "main"]);
  if (fetch.code !== 0) return fail(3, "on `main`, up-to-date with origin/main", `git fetch failed: ${fetch.stderr.trim()}`);
  const local = run("git", ["rev-parse", "HEAD"]).stdout.trim();
  const remote = run("git", ["rev-parse", "origin/main"]).stdout.trim();
  if (local === remote) return pass(3, "on `main` and up-to-date with origin/main");
  return fail(3, "on `main` and up-to-date with origin/main", `HEAD=${local.slice(0, 7)} origin/main=${remote.slice(0, 7)}`);
}

// pnpm -F lyse test.
function checkTestsPass(): CheckResult {
  const lyse = run("pnpm", ["-F", "@lyse-labs/lyse", "test"]);
  if (lyse.code !== 0) return fail(4, "all tests pass", `pnpm -F lyse test failed (exit ${lyse.code})`);
  return pass(4, "all tests pass");
}

// typecheck.
function checkTypecheckPass(): CheckResult {
  const lyse = run("pnpm", ["-F", "@lyse-labs/lyse", "typecheck"]);
  if (lyse.code !== 0) return fail(5, "typecheck clean", `pnpm -F lyse typecheck failed (exit ${lyse.code}):\n${lyse.stdout}${lyse.stderr}`);
  return pass(5, "typecheck clean");
}

// 6 — pnpm -F lyse build + dist/cli.js exists.
function checkBuildProducesCli(): CheckResult {
  const r = run("pnpm", ["-F", "@lyse-labs/lyse", "build"]);
  if (r.code !== 0) return fail(6, "build produces dist/cli.js", `pnpm -F lyse build failed (exit ${r.code})`);
  const cliPath = join(ROOT, "packages/core/dist/cli.js");
  if (!existsSync(cliPath)) return fail(6, "build produces dist/cli.js", `${cliPath} not found after build`);
  const size = statSync(cliPath).size;
  if (size === 0) return fail(6, "build produces dist/cli.js", `${cliPath} is empty`);
  return pass(6, "build produces dist/cli.js");
}

// 7 — CHANGELOG.md has [Unreleased] non-empty OR [0.1.0] with today's date.
function checkChangelog(): CheckResult {
  const cl = readMaybe(join(ROOT, "CHANGELOG.md"));
  if (cl === null) return fail(7, "CHANGELOG.md has [Unreleased] or [0.1.0]", "CHANGELOG.md not found");
  const todayUtc = new Date().toISOString().slice(0, 10);
  const release010 = new RegExp(`##\\s*\\[0\\.1\\.0\\][^\\n]*${todayUtc}`, "m").test(cl);
  if (release010) return pass(7, "CHANGELOG.md has [0.1.0] section with today's date");
  // Match the [Unreleased] block: from its header up to the next `## [` header
  // or end-of-file. JS regex has no `\Z` anchor (Ruby/Python only) so we use
  // an alternation: lookahead for the next section header OR for end-of-string
  // (via a sentinel that always exists at content end).
  const unreleasedMatch = cl.match(/## \[Unreleased\]([\s\S]*?)(?=^## \[|$(?![\s\S]))/m);
  if (!unreleasedMatch) return fail(7, "CHANGELOG.md has [Unreleased] or [0.1.0]", "neither [Unreleased] nor [0.1.0] section found");
  const body = (unreleasedMatch[1] ?? "").trim();
  if (body.length === 0) return fail(7, "CHANGELOG.md has [Unreleased] or [0.1.0]", "[Unreleased] section exists but is empty");
  return pass(7, "CHANGELOG.md [Unreleased] section is non-empty");
}

// 8 — packages/core/package.json version is `0.1.0` (no alpha/beta suffix).
function checkPackageVersion(): CheckResult {
  const raw = readMaybe(join(ROOT, "packages/core/package.json"));
  if (raw === null) return fail(8, "packages/core/package.json version is 0.1.0", "file not found");
  const pkg = JSON.parse(raw) as { version?: string };
  const v = pkg.version ?? "";
  if (v === "0.1.0") return pass(8, "packages/core version is 0.1.0");
  return fail(8, "packages/core version is 0.1.0", `current version is \`${v}\``);
}

// README.md must not contain standalone "95 %" / "95%" marketing claims.
// Lines carrying the inline marker `<!-- release-check-allow:95% -->` are
// exempt — used for statistical terms (e.g. "Wilson 95 % lower bound") and the
// anti-marketing sentence itself, both of which are the point of the guardrail.
function checkNo95PercentInReadme(): CheckResult {
  const readme = readMaybe(join(ROOT, "README.md"));
  if (readme === null) return fail(10, "README.md has no standalone `95 %` / `95%`", "README.md not found");
  const scanned = readme
    .split("\n")
    .filter((line) => !line.includes("<!-- release-check-allow:95% -->"))
    .join("\n");
  const matches = scanned.match(/95\s?%/g) ?? [];
  if (matches.length === 0) return pass(10, "README.md has no `95 %` / `95%` claims");
  return fail(10, "README.md has no `95 %` / `95%` claims", `found ${matches.length} occurrence(s) of the forbidden marketing string (spec §10)`);
}

// 11 — no committed `.env`-style files.
function checkNoEnvFiles(): CheckResult {
  const r = run("git", ["ls-files"]);
  if (r.code !== 0) return fail(11, "no committed .env files", `git ls-files failed: ${r.stderr.trim()}`);
  const offenders = r.stdout
    .split("\n")
    .filter((line) => /(^|\/)\.env(\..+|$)/.test(line));
  if (offenders.length === 0) return pass(11, "no committed .env files");
  return fail(11, "no committed .env files", `committed: ${offenders.slice(0, 5).join(", ")}`);
}

// 12 — sub-axes.ts has exactly EXPECTED_SUB_AXES entries (16 after shadcn-registry-valid, 1 per rule);
//      rules-manifest.json is non-empty. Per v2 spec §9, the 87 dormant sub-axes
//      that don't bind to a v0.1 rule are preserved as experimental.
const EXPECTED_SUB_AXES = 16;

function checkSubAxesAndRulesCount(): CheckResult {
  const subAxesSrc = readMaybe(join(ROOT, "packages/core/src/reliability/catalogue/sub-axes.ts"));
  if (subAxesSrc === null) return fail(12, `sub-axes.ts has ${EXPECTED_SUB_AXES} entries`, "sub-axes.ts not found");
  const subAxisCount = (subAxesSrc.match(/^\s*\{ id:/gm) ?? []).length;
  if (subAxisCount !== EXPECTED_SUB_AXES) {
    return fail(12, `sub-axes.ts has ${EXPECTED_SUB_AXES} entries`, `found ${subAxisCount} entries`);
  }

  const manifestRaw = readMaybe(join(ROOT, "packages/core/rules-manifest.json"));
  if (manifestRaw === null) return fail(12, "sub-axes / rules-manifest consistent", "rules-manifest.json not found");
  const manifest = JSON.parse(manifestRaw) as { rules?: unknown[] };
  const manifestRuleCount = manifest.rules?.length ?? 0;
  if (manifestRuleCount === 0) return fail(12, "sub-axes / rules-manifest consistent", "rules-manifest.json has 0 rules");

  return pass(12, `sub-axes.ts has ${EXPECTED_SUB_AXES} entries; rules-manifest.json has ${manifestRuleCount} rules`);
}

// ----------------------------------------------------------------------------

const CHECKS: Array<() => CheckResult> = [
  checkWranglerPlaceholders,
  checkCleanWorkingTree,
  checkOnMainAndUpToDate,
  checkTestsPass,
  checkTypecheckPass,
  checkBuildProducesCli,
  checkChangelog,
  checkPackageVersion,
  checkDeployRunbookMentionsApiKey,
  checkNo95PercentInReadme,
  checkNoEnvFiles,
  checkSubAxesAndRulesCount,
];

function main(): void {
  const results: CheckResult[] = [];
  for (const c of CHECKS) {
    try {
      results.push(c());
    } catch (err) {
      results.push({ id: -1, name: c.name, status: "fail", detail: String(err) });
    }
  }

  const passed = results.filter((r) => r.status === "pass").length;
  const total = results.length;

  if (JSON_MODE) {
    process.stdout.write(JSON.stringify({ passed, total, results }, null, 2) + "\n");
  } else {
    process.stdout.write(`${BOLD}Lyse release-check — ${total} pre-flight checks${RESET}\n\n`);
    for (const r of results) {
      const mark = r.status === "pass" ? `${GREEN}✓${RESET}` : `${RED}✗${RESET}`;
      const idStr = String(r.id).padStart(2, " ");
      process.stdout.write(`  ${mark} [${idStr}] ${r.name}\n`);
      if (r.status === "fail" && r.detail) {
        const indented = r.detail.split("\n").map((l) => `       ${l}`).join("\n");
        process.stdout.write(`${RED}${indented}${RESET}\n`);
      }
    }
    process.stdout.write("\n");
    if (passed === total) {
      process.stdout.write(`${GREEN}${BOLD}All ${total} checks passed.${RESET}\n`);
    } else {
      const failed = total - passed;
      process.stdout.write(`${RED}${BOLD}${failed} / ${total} checks failed.${RESET}\n`);
    }
  }

  process.exit(passed === total ? 0 : 1);
}

main();

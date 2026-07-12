import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import prompts from "prompts";

export interface ConsentRecord {
  accepted: boolean;
  attempt: 1 | 2;
  decided_at: string;
  version: "1.0.0";
}

/**
 * Optional dependencies for consent I/O.
 *
 * Production callers pass nothing — `homeDir` defaults to `os.homedir()`.
 * Tests pass `{ homeDir: () => tmpHome }` to redirect file I/O into a
 * per-test tmpdir without mutating `process.env.HOME` (which races across
 * concurrent vitest workers — see issue #134).
 */
export interface ConsentDeps {
  homeDir?: () => string;
}

const CONSENT_DIR = ".lyse";
const CONSENT_FILE = "consent.json";
const SCHEMA_VERSION = "1.0.0";

function resolveHome(deps: ConsentDeps): string {
  return (deps.homeDir ?? homedir)();
}

export function consentFilePath(deps: ConsentDeps = {}): string {
  return join(resolveHome(deps), CONSENT_DIR, CONSENT_FILE);
}

function isValidRecord(value: unknown): value is ConsentRecord {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v["accepted"] === "boolean" &&
    (v["attempt"] === 1 || v["attempt"] === 2) &&
    typeof v["decided_at"] === "string" &&
    v["version"] === SCHEMA_VERSION
  );
}

export function readConsent(deps: ConsentDeps = {}): ConsentRecord | null {
  const path = consentFilePath(deps);
  if (!existsSync(path)) return null;
  try {
    const parsed = JSON.parse(readFileSync(path, "utf8"));
    return isValidRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function writeConsent(record: ConsentRecord, deps: ConsentDeps = {}): void {
  const path = consentFilePath(deps);
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  const tmpPath = `${path}.tmp.${process.pid}`;
  writeFileSync(tmpPath, JSON.stringify(record, null, 2) + "\n", { mode: 0o600 });
  renameSync(tmpPath, path);
}

export type PromptOutcome = "yes" | "no" | "skip";

const CONSENT_MESSAGE = `Lyse can send anonymous benchmark data to help improve the tool and
power the public Health Score bench. Data sent (only on audit completion):
  - Your Health Score (0-100)
  - Per-axis scores
  - Audit duration
  - Hashed repo identifier (irreversible)
What is never sent: source code, file paths, file content, IP, User-Agent.
Full notice: https://github.com/lyse-labs/lyse/blob/main/PRIVACY.md`;

export async function promptForConsent(): Promise<PromptOutcome> {
  if (!process.stdout.isTTY) return "skip";

  process.stdout.write(CONSENT_MESSAGE + "\n");

  const result = await prompts({
    type: "confirm",
    name: "accepted",
    message: "Enable anonymous bench?",
    initial: false,
  });

  if (typeof result["accepted"] !== "boolean") return "skip";
  return result["accepted"] ? "yes" : "no";
}

export interface ConsentDecision {
  accepted: boolean;
  justAsked: boolean;
}

let _cachedConsent: boolean = false;
let _cacheInitialised: boolean = false;

export function resetConsentCache(): void {
  _cachedConsent = false;
  _cacheInitialised = false;
}

/**
 * Test-only: seed the per-process consent cache directly, bypassing disk
 * I/O. Used by consumer-side tests (ndjson-store, sender, local-log) that
 * need to assert behavior under "consent accepted" or "consent declined"
 * without writing a consent.json to disk.
 *
 * CONCURRENCY: writes module-level mutable state. Safe under vitest's
 * default per-file isolation, but UNSAFE inside `describe.concurrent` /
 * `test.concurrent` (multiple tests in the same worker would race on the
 * cache). For new tests that need concurrent execution, use the
 * `{ homeDir: () => tmpHome }` deps-injection path instead.
 *
 * PRODUCTION GUARD: throws if called outside a test runner — privacy-
 * sensitive code must never bypass disk-resident consent silently.
 */
export function __setCacheForTest(state: { accepted: boolean; initialised: boolean }): void {
  if (process.env["VITEST"] !== "true" && process.env["NODE_ENV"] !== "test") {
    throw new Error(
      "__setCacheForTest may only be called from a test runner (VITEST or NODE_ENV=test). " +
        "Production code must use writeConsent / readConsent / ensureConsentDecision.",
    );
  }
  _cachedConsent = state.accepted;
  _cacheInitialised = state.initialised;
}

export function getCachedConsent(deps: ConsentDeps = {}): boolean {
  if (_cacheInitialised) return _cachedConsent;
  const existing = readConsent(deps);
  if (existing) {
    _cachedConsent = existing.accepted;
    _cacheInitialised = true;
  }
  return _cachedConsent;
}

/**
 * Resolve the consent decision WITHOUT ever prompting: env override and
 * persisted record only. The audit path calls this before running so the
 * first score renders prompt-free; the interactive prompt (if still
 * undecided) runs after the report via {@link ensureConsentDecision}.
 */
export function resolveConsentNonInteractive(deps: ConsentDeps = {}): ConsentDecision {
  const existing = readConsent(deps);

  if (!existing && process.env["LYSE_TELEMETRY"] === "1") {
    writeConsent({
      accepted: true,
      attempt: 1,
      decided_at: new Date().toISOString(),
      version: "1.0.0",
    }, deps);
    _cachedConsent = true;
    _cacheInitialised = true;
    return { accepted: true, justAsked: false };
  }

  _cachedConsent = existing?.accepted ?? false;
  _cacheInitialised = true;
  return { accepted: _cachedConsent, justAsked: false };
}

export async function ensureConsentDecision(deps: ConsentDeps = {}): Promise<ConsentDecision> {
  const existing = readConsent(deps);

  if (!existing && process.env["LYSE_TELEMETRY"] === "1") {
    writeConsent({
      accepted: true,
      attempt: 1,
      decided_at: new Date().toISOString(),
      version: "1.0.0",
    }, deps);
    _cachedConsent = true;
    _cacheInitialised = true;
    return { accepted: true, justAsked: false };
  }

  if (existing && (existing.accepted || existing.attempt === 2)) {
    _cachedConsent = existing.accepted;
    _cacheInitialised = true;
    return { accepted: existing.accepted, justAsked: false };
  }

  if (!process.stdout.isTTY) {
    _cachedConsent = false;
    _cacheInitialised = true;
    return { accepted: false, justAsked: false };
  }

  const outcome = await promptForConsent();
  const accepted = outcome === "yes";
  const nextAttempt: 1 | 2 = existing ? 2 : 1;

  writeConsent({
    accepted,
    attempt: nextAttempt,
    decided_at: new Date().toISOString(),
    version: "1.0.0",
  }, deps);

  _cachedConsent = accepted;
  _cacheInitialised = true;
  return { accepted, justAsked: true };
}

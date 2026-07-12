import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

export interface LlmConsentRecord {
  accepted: boolean;
  attempt: 1 | 2;
  decided_at: string;
  version: "1.0.0";
}

/**
 * Optional dependencies for consent I/O. Tests pass `{ homeDir: () => tmpHome }`
 * to redirect file I/O without mutating `process.env.HOME` (races across
 * concurrent vitest workers). Mirrors telemetry/consent.ts.
 */
export interface LlmConsentDeps {
  homeDir?: () => string;
}

const CONSENT_DIR = ".lyse";
const CONSENT_FILE = "llm-consent.json";
const SCHEMA_VERSION = "1.0.0";

function resolveHome(deps: LlmConsentDeps): string {
  return (deps.homeDir ?? homedir)();
}

export function llmConsentFilePath(deps: LlmConsentDeps = {}): string {
  return join(resolveHome(deps), CONSENT_DIR, CONSENT_FILE);
}

function isValidRecord(value: unknown): value is LlmConsentRecord {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v["accepted"] === "boolean" &&
    (v["attempt"] === 1 || v["attempt"] === 2) &&
    typeof v["decided_at"] === "string" &&
    v["version"] === SCHEMA_VERSION
  );
}

export function readLlmConsent(deps: LlmConsentDeps = {}): LlmConsentRecord | null {
  const path = llmConsentFilePath(deps);
  if (!existsSync(path)) return null;
  try {
    const parsed = JSON.parse(readFileSync(path, "utf8"));
    return isValidRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function writeLlmConsent(record: LlmConsentRecord, deps: LlmConsentDeps = {}): void {
  const path = llmConsentFilePath(deps);
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  const tmpPath = `${path}.tmp.${process.pid}`;
  writeFileSync(tmpPath, JSON.stringify(record, null, 2) + "\n", { mode: 0o600 });
  renameSync(tmpPath, path);
}

/**
 * Final per-run LLM-filter consent, resolved WITHOUT prompting: `--no-llm`
 * (flags.llm===false) and `--llm` (flags.llm===true) win; then the `LYSE_LLM`
 * env override (1 = opt-in persisted, 0 = hard runtime opt-out that never
 * writes a record); then the persisted record. The default audit path never
 * prompts for the LLM filter — a first-run user should meet the Health Score
 * before any consent question, and this one only when they reach for the
 * feature. A record persisted by a previously accepted prompt stays honored.
 */
export function resolveLlmConsentNonInteractive(
  flags: { llm?: boolean } | undefined,
  deps: LlmConsentDeps = {},
): boolean {
  if (flags?.llm === false) return false;
  if (flags?.llm === true) return true;
  if (process.env["LYSE_LLM"] === "0") return false;

  const existing = readLlmConsent(deps);
  if (!existing && process.env["LYSE_LLM"] === "1") {
    writeLlmConsent(
      { accepted: true, attempt: 1, decided_at: new Date().toISOString(), version: "1.0.0" },
      deps,
    );
    return true;
  }
  return existing?.accepted ?? false;
}

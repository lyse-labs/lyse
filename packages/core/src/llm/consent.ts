import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import prompts from "prompts";

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

const CONSENT_MESSAGE = `Lyse can use an LLM to refine findings (drop false positives on hardcoded
color/spacing). This sends ~8-15 representative source files (≤200 KB total,
secrets and .gitignore matches excluded) to the LLM provider you configure
(your own API key / local model — BYOK). Nothing goes to Lyse Labs.
It is OFF by default. Full notice: https://github.com/lyse-labs/lyse/blob/main/PRIVACY.md`;

export async function promptForLlmConsent(): Promise<"yes" | "no" | "skip"> {
  if (!process.stdout.isTTY) return "skip";
  process.stdout.write(CONSENT_MESSAGE + "\n");
  const result = await prompts({
    type: "confirm",
    name: "accepted",
    message: "Enable the LLM precision filter?",
    initial: false,
  });
  if (typeof result["accepted"] !== "boolean") return "skip";
  return result["accepted"] ? "yes" : "no";
}

export interface LlmConsentDecision {
  accepted: boolean;
  justAsked: boolean;
}

/**
 * Resolve the persisted/prompted LLM consent decision. Mirrors telemetry's
 * ensureConsentDecision, with a `LYSE_LLM` env override (1 = opt-in, 0 = hard
 * runtime opt-out that never writes a record). Non-TTY → off (no surprise
 * cloud calls in CI). Max two interactive prompts in a lifetime.
 */
export async function ensureLlmConsentDecision(
  deps: LlmConsentDeps = {},
): Promise<LlmConsentDecision> {
  if (process.env["LYSE_LLM"] === "0") return { accepted: false, justAsked: false };

  const existing = readLlmConsent(deps);

  if (!existing && process.env["LYSE_LLM"] === "1") {
    writeLlmConsent(
      { accepted: true, attempt: 1, decided_at: new Date().toISOString(), version: "1.0.0" },
      deps,
    );
    return { accepted: true, justAsked: false };
  }

  if (existing && (existing.accepted || existing.attempt === 2)) {
    return { accepted: existing.accepted, justAsked: false };
  }

  if (!process.stdout.isTTY) {
    return { accepted: false, justAsked: false };
  }

  const outcome = await promptForLlmConsent();
  const accepted = outcome === "yes";
  const nextAttempt: 1 | 2 = existing ? 2 : 1;
  writeLlmConsent(
    { accepted, attempt: nextAttempt, decided_at: new Date().toISOString(), version: "1.0.0" },
    deps,
  );
  return { accepted, justAsked: true };
}

/**
 * Final per-run consent boolean. `--no-llm` (flags.llm===false) and `--llm`
 * (flags.llm===true) win; otherwise defer to env/persisted/prompt. The CLI
 * audit entry calls this and threads the result into AuditFlags.llmConsented.
 */
export async function resolveLlmConsent(
  flags: { llm?: boolean } | undefined,
  deps: LlmConsentDeps = {},
): Promise<boolean> {
  if (flags?.llm === false) return false;
  if (flags?.llm === true) return true;
  return (await ensureLlmConsentDecision(deps)).accepted;
}

/**
 * Non-interactive variant for the default audit path: flags and env and
 * persisted record only — NEVER prompts. The LLM filter is a power feature;
 * a first-run user should meet the Health Score before any consent
 * question, and this one only when they reach for `--llm` / `LYSE_LLM=1`.
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

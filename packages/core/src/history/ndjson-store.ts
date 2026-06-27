import { mkdir, appendFile, readFile } from "node:fs/promises";
import { join } from "node:path";
import { VERSION } from "../index.js";
import { getCachedConsent } from "../telemetry/consent.js";

const HISTORY_FILE = ".lyse/history.ndjson";
const SCHEMA_VERSION = 1;

export interface AuditEventInput {
  score: number;
  axes: { tokens: number | null; a11y: number | null; components: number | null; stories: number | null };
  findings_count: number;
}

export interface AuditEvent extends AuditEventInput {
  schema_version: number;
  event_type: "audit";
  timestamp: string;
  commit_sha: string | null;
  lyse_version: string;
}

export interface CommandInvokedEvent {
  schema_version: number;
  event_type: "command_invoked";
  timestamp: string;
  command: string;
  outcome: "success" | "user_cancelled" | "error";
  duration_ms: number;
}

export interface McpSetupCompletedEvent {
  schema_version: number;
  event_type: "mcp_setup_completed";
  timestamp: string;
  ide: "cursor" | "claude-code" | "copilot" | "both" | "all";
}

export interface InitStepCompletedEvent {
  schema_version: number;
  event_type: "init_step_completed";
  timestamp: string;
  step: string;
}

export type HistoryEvent =
  | AuditEvent
  | CommandInvokedEvent
  | McpSetupCompletedEvent
  | InitStepCompletedEvent;

async function ensureDir(cwd: string): Promise<void> {
  await mkdir(join(cwd, ".lyse"), { recursive: true });
}

async function appendLine(cwd: string, event: HistoryEvent): Promise<void> {
  await ensureDir(cwd);
  await appendFile(join(cwd, HISTORY_FILE), JSON.stringify(event) + "\n");
}

export async function appendAuditEvent(cwd: string, input: AuditEventInput, commitSha: string | null): Promise<void> {
  await appendLine(cwd, {
    schema_version: SCHEMA_VERSION,
    event_type: "audit",
    timestamp: new Date().toISOString(),
    ...input,
    commit_sha: commitSha,
    lyse_version: process.env.LYSE_VERSION ?? VERSION,
  });
}

/** Opt-in guard: only emit when consent has been accepted. */
function telemetryEnabled(): boolean {
  return getCachedConsent();
}

/**
 * Append a CommandInvokedEvent to history.
 * Only emitted when consent has been accepted. Pass `suppress: true` on the run
 * that just requested consent — per ADR 0012, no telemetry is recorded for the
 * run during which consent is first granted, even though the cache now reads as
 * accepted.
 */
export async function appendCommandInvokedEvent(
  cwd: string,
  command: string,
  outcome: "success" | "user_cancelled" | "error",
  durationMs: number,
  opts: { suppress?: boolean } = {},
): Promise<void> {
  if (opts.suppress) return;
  if (!telemetryEnabled()) return;
  await appendLine(cwd, {
    schema_version: SCHEMA_VERSION,
    event_type: "command_invoked",
    timestamp: new Date().toISOString(),
    command,
    outcome,
    duration_ms: durationMs,
  });
}

/**
 * Append a McpSetupCompletedEvent to history.
 * Only emitted when consent has been accepted.
 */
export async function appendMcpSetupCompletedEvent(
  cwd: string,
  ide: "cursor" | "claude-code" | "copilot" | "both" | "all",
): Promise<void> {
  if (!telemetryEnabled()) return;
  await appendLine(cwd, {
    schema_version: SCHEMA_VERSION,
    event_type: "mcp_setup_completed",
    timestamp: new Date().toISOString(),
    ide,
  });
}

/**
 * Append an InitStepCompletedEvent to history.
 * Only emitted when consent has been accepted.
 */
export async function appendInitStepCompletedEvent(
  cwd: string,
  step: string,
): Promise<void> {
  if (!telemetryEnabled()) return;
  await appendLine(cwd, {
    schema_version: SCHEMA_VERSION,
    event_type: "init_step_completed",
    timestamp: new Date().toISOString(),
    step,
  });
}

export async function readRecent(cwd: string, n: number = 10): Promise<HistoryEvent[]> {
  try {
    const raw = await readFile(join(cwd, HISTORY_FILE), "utf8");
    return raw.trim().split("\n").filter(Boolean).slice(-n).map(l => JSON.parse(l) as HistoryEvent);
  } catch {
    return [];
  }
}

export function computeDelta(current: AuditEventInput, previous: AuditEvent): { score: number; days: number } {
  return {
    score: current.score - previous.score,
    days: Math.floor((Date.now() - new Date(previous.timestamp).getTime()) / (1000 * 60 * 60 * 24)),
  };
}

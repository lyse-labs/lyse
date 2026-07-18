import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { createHash, randomUUID } from "node:crypto";
import type { AuditResult, Finding } from "../types.js";
import { getCachedConsent } from "./consent.js";

export const EVENT_SCHEMA_VERSION = "1.0.0";

const EVENTS_DIR = ".lyse";
const EVENTS_FILE = "events.ndjson";

export function telemetryEnabled(): boolean {
  return getCachedConsent();
}

/**
 * Compact ID: strip dashes from UUID v4 and take first 26 chars.
 * Fits the schema's event_id / session_id constraint (minLength: 16, maxLength: 32).
 */
export function generateId(): string {
  return randomUUID().replace(/-/g, "").slice(0, 26);
}

interface BaseEvent {
  schema_version: string;
  source: "user";
  event_id: string;
  event_type: "audit.started" | "audit.completed" | "finding.discovered";
  ts: string;
  session_id: string;
  repo_bucket: string;
  sdk_version: string;
}

export interface AuditStartedEvent extends BaseEvent {
  event_type: "audit.started";
  rules_version: string;
  stack: { framework?: string; ds_detected?: string };
}

interface AuditCompletedEvent extends BaseEvent {
  event_type: "audit.completed";
  audit: {
    duration_ms: number;
    score: number | null;
    axes: Record<string, number | "N/A">;
    violations: { error: number; warning: number; info: number };
  };
}

interface FindingDiscoveredEvent extends BaseEvent {
  event_type: "finding.discovered";
  finding: {
    rule_id: string;
    severity: "error" | "warning" | "info";
    /** sha256(filepath + "|" + salt)[:8] — no path leakage */
    file_hash: string;
  };
}

export type TelemetryEvent = AuditStartedEvent | AuditCompletedEvent | FindingDiscoveredEvent;

function fileHash(filepath: string, salt: string): string {
  return createHash("sha256")
    .update(filepath)
    .update("|")
    .update(salt)
    .digest("hex")
    .slice(0, 8);
}

function eventsFilePath(repoRoot: string): string {
  return join(repoRoot, EVENTS_DIR, EVENTS_FILE);
}

function ensureGitignored(repoRoot: string): void {
  const gitignorePath = join(repoRoot, ".gitignore");
  const entry = ".lyse/";
  if (!existsSync(gitignorePath)) {
    writeFileSync(gitignorePath, `# Lyse local telemetry\n${entry}\n`);
    return;
  }
  const current = readFileSync(gitignorePath, "utf8");
  if (current.includes(entry) || current.includes(".lyse")) return;
  appendFileSync(gitignorePath, `\n# Lyse local telemetry\n${entry}\n`);
}

export interface LogContext {
  repoRoot: string;
  sessionId: string;
  repoBucket: string;
  sdkVersion: string;
  rulesVersion: string;
  /** Salt used for file_hash. Pass BUCKET_SALT from identity module for consistency. */
  salt: string;
}

function writeEvent(repoRoot: string, event: TelemetryEvent): void {
  const filepath = eventsFilePath(repoRoot);
  mkdirSync(dirname(filepath), { recursive: true });
  appendFileSync(filepath, JSON.stringify(event) + "\n");
}

export function logAuditStarted(ctx: LogContext, stack: AuditStartedEvent["stack"]): void {
  if (!telemetryEnabled()) return;
  ensureGitignored(ctx.repoRoot);
  const event: AuditStartedEvent = {
    schema_version: EVENT_SCHEMA_VERSION,
    source: "user",
    event_id: generateId(),
    event_type: "audit.started",
    ts: new Date().toISOString(),
    session_id: ctx.sessionId,
    repo_bucket: ctx.repoBucket,
    sdk_version: ctx.sdkVersion,
    rules_version: ctx.rulesVersion,
    stack,
  };
  writeEvent(ctx.repoRoot, event);
}

export function logAuditCompleted(ctx: LogContext, durationMs: number, result: AuditResult): void {
  if (!telemetryEnabled()) return;
  const violations = { error: 0, warning: 0, info: 0 };
  for (const f of result.findings) violations[f.severity]++;
  const axes: Record<string, number | "N/A"> = {};
  for (const a of result.axes) axes[a.axis] = a.score;
  const event: AuditCompletedEvent = {
    schema_version: EVENT_SCHEMA_VERSION,
    source: "user",
    event_id: generateId(),
    event_type: "audit.completed",
    ts: new Date().toISOString(),
    session_id: ctx.sessionId,
    repo_bucket: ctx.repoBucket,
    sdk_version: ctx.sdkVersion,
    audit: {
      duration_ms: durationMs,
      score: typeof result.finalScore === "number" ? result.finalScore : null,
      axes,
      violations,
    },
  };
  writeEvent(ctx.repoRoot, event);
}

export function logFindingDiscovered(ctx: LogContext, finding: Finding): void {
  if (!telemetryEnabled()) return;
  const event: FindingDiscoveredEvent = {
    schema_version: EVENT_SCHEMA_VERSION,
    source: "user",
    event_id: generateId(),
    event_type: "finding.discovered",
    ts: new Date().toISOString(),
    session_id: ctx.sessionId,
    repo_bucket: ctx.repoBucket,
    sdk_version: ctx.sdkVersion,
    finding: {
      rule_id: finding.ruleId,
      severity: finding.severity,
      file_hash: fileHash(finding.location.file, ctx.salt),
    },
  };
  writeEvent(ctx.repoRoot, event);
}

/** Test helper: read all events back from the NDJSON log. */
export function readEvents(repoRoot: string): TelemetryEvent[] {
  const filepath = eventsFilePath(repoRoot);
  if (!existsSync(filepath)) return [];
  const content = readFileSync(filepath, "utf8");
  return content
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line) as TelemetryEvent);
}

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { execSync } from "node:child_process";
import { mkdtempSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  telemetryEnabled,
  generateId,
  logAuditStarted,
  logAuditCompleted,
  logFindingDiscovered,
  readEvents,
  type LogContext,
} from "../../src/telemetry/local-log.js";
import { __setCacheForTest, resetConsentCache } from "../../src/telemetry/consent.js";
import type { AuditResult } from "../../src/types.js";

function setupTmpRepo(): string {
  const dir = mkdtempSync(join(tmpdir(), "lyse-tel-"));
  execSync("git init -q", { cwd: dir });
  return dir;
}

function enableConsent(): void {
  __setCacheForTest({ accepted: true, initialised: true });
}

const baseResult: AuditResult = {
  schemaVersion: 2,
  rulesVersion: "0.1.0",
  toolVersion: "0.0.1",
  repoRoot: "/r",
  timestamp: "",
  stack: ["react", "tailwind"],
  finalScore: 50,
  axes: [
    { axis: "tokens", score: 50, findings: 1, opportunities: 2 },
    { axis: "stories", score: "N/A", findings: 0, opportunities: 0 },
  ],
  findings: [
    {
      ruleId: "tokens/no-hardcoded-color",
      axis: "tokens",
      severity: "warning",
      location: { file: "Page.tsx", line: 1, column: 1 },
      message: "x",
    },
  ],
};

describe("telemetry local-log", () => {
  beforeEach(() => {
    __setCacheForTest({ accepted: false, initialised: true });
  });

  afterEach(() => {
    resetConsentCache();
  });

  it("telemetryEnabled is false when consent is absent", () => {
    expect(telemetryEnabled()).toBe(false);
  });

  it("telemetryEnabled is true when consent.accepted=true", () => {
    enableConsent();
    expect(telemetryEnabled()).toBe(true);
  });

  it("generateId returns 26-char hex string", () => {
    const id = generateId();
    expect(id).toMatch(/^[a-f0-9]{26}$/);
  });

  it("does nothing when telemetry disabled", () => {
    const dir = setupTmpRepo();
    const ctx: LogContext = {
      repoRoot: dir,
      sessionId: "a1b2c3d4e5f6a7b8c9d0e1f2a3",
      repoBucket: "a3f9c1e8b2d04567",
      sdkVersion: "0.0.1",
      rulesVersion: "0.1.0",
      salt: "salt",
    };
    logAuditCompleted(ctx, 100, baseResult);
    expect(existsSync(join(dir, ".lyse/events.ndjson"))).toBe(false);
  });

  it("writes audit.started with stack when consent is accepted", () => {
    enableConsent();
    const dir = setupTmpRepo();
    const ctx: LogContext = {
      repoRoot: dir,
      sessionId: generateId(),
      repoBucket: "a3f9c1e8b2d04567",
      sdkVersion: "0.0.1",
      rulesVersion: "0.1.0",
      salt: "salt",
    };
    logAuditStarted(ctx, { framework: "react" });
    const events = readEvents(dir);
    expect(events).toHaveLength(1);
    expect(events[0]!.event_type).toBe("audit.started");
    expect((events[0] as { stack: { framework?: string } }).stack.framework).toBe("react");
  });

  it("writes audit.completed with score, axes, violations", () => {
    enableConsent();
    const dir = setupTmpRepo();
    const ctx: LogContext = {
      repoRoot: dir,
      sessionId: generateId(),
      repoBucket: "a3f9c1e8b2d04567",
      sdkVersion: "0.0.1",
      rulesVersion: "0.1.0",
      salt: "salt",
    };
    logAuditCompleted(ctx, 1234, baseResult);
    const events = readEvents(dir);
    expect(events).toHaveLength(1);
    const e = events[0] as { event_type: string; audit: { duration_ms: number; score: number; axes: Record<string, number | "N/A">; violations: { warning: number } } };
    expect(e.event_type).toBe("audit.completed");
    expect(e.audit.duration_ms).toBe(1234);
    expect(e.audit.score).toBe(50);
    expect(e.audit.axes["tokens"]).toBe(50);
    expect(e.audit.axes["stories"]).toBe("N/A");
    expect(e.audit.violations.warning).toBe(1);
  });

  it("writes finding.discovered with file_hash NOT file path", () => {
    enableConsent();
    const dir = setupTmpRepo();
    const ctx: LogContext = {
      repoRoot: dir,
      sessionId: generateId(),
      repoBucket: "a3f9c1e8b2d04567",
      sdkVersion: "0.0.1",
      rulesVersion: "0.1.0",
      salt: "salt",
    };
    logFindingDiscovered(ctx, baseResult.findings[0]!);
    const events = readEvents(dir);
    const e = events[0] as { event_type: string; finding: { rule_id: string; file_hash: string } };
    expect(e.event_type).toBe("finding.discovered");
    expect(e.finding.rule_id).toBe("tokens/no-hardcoded-color");
    expect(e.finding.file_hash).toMatch(/^[a-f0-9]{8}$/);
    expect(JSON.stringify(e)).not.toContain("Page.tsx");
  });

  it("auto-adds .lyse/ to .gitignore when first writing", () => {
    enableConsent();
    const dir = setupTmpRepo();
    const ctx: LogContext = {
      repoRoot: dir,
      sessionId: generateId(),
      repoBucket: "a3f9c1e8b2d04567",
      sdkVersion: "0.0.1",
      rulesVersion: "0.1.0",
      salt: "salt",
    };
    logAuditStarted(ctx, { framework: "react" });
    const gi = readFileSync(join(dir, ".gitignore"), "utf8");
    expect(gi).toContain(".lyse");
  });

  it("does not duplicate .gitignore entry on subsequent runs", () => {
    enableConsent();
    const dir = setupTmpRepo();
    const ctx: LogContext = {
      repoRoot: dir,
      sessionId: generateId(),
      repoBucket: "a3f9c1e8b2d04567",
      sdkVersion: "0.0.1",
      rulesVersion: "0.1.0",
      salt: "salt",
    };
    logAuditStarted(ctx, { framework: "react" });
    logAuditStarted(ctx, { framework: "react" });
    const gi = readFileSync(join(dir, ".gitignore"), "utf8");
    const matches = gi.match(/\.lyse/g);
    expect(matches?.length).toBe(1);
  });

  it("appends to existing .gitignore without duplicating entry", () => {
    enableConsent();
    const dir = setupTmpRepo();
    writeFileSync(join(dir, ".gitignore"), "node_modules/\n.env\n");
    const ctx: LogContext = {
      repoRoot: dir,
      sessionId: generateId(),
      repoBucket: "a3f9c1e8b2d04567",
      sdkVersion: "0.0.1",
      rulesVersion: "0.1.0",
      salt: "salt",
    };
    logAuditStarted(ctx, { framework: "react" });
    const gi = readFileSync(join(dir, ".gitignore"), "utf8");
    expect(gi).toContain("node_modules/");
    expect(gi).toContain(".lyse/");
  });

  it("validates against the published JSON Schema for events", async () => {
    enableConsent();
    const dir = setupTmpRepo();
    const ctx: LogContext = {
      repoRoot: dir,
      sessionId: generateId(),
      repoBucket: "a3f9c1e8b2d04567",
      sdkVersion: "0.1.0",
      rulesVersion: "0.1.0",
      salt: "salt",
    };
    logAuditCompleted(ctx, 1234, baseResult);
    const event = readEvents(dir)[0];
    expect(event).toBeDefined();

    const { default: Ajv2020 } = await import("ajv/dist/2020.js");
    const addFormats = (await import("ajv-formats")).default;
    const ajv = new Ajv2020({ strict: false });
    addFormats(ajv);
    const schemaPath = new URL("../../schemas/v1/lyse-event.json", import.meta.url);
    const schema = JSON.parse(readFileSync(schemaPath, "utf8")) as object;
    const validate = ajv.compile(schema);
    const valid = validate(event);
    if (!valid) console.error(validate.errors);
    expect(valid).toBe(true);
  });
});

describe("local-log — source field", () => {
  it("emits source: 'user' on every event type", () => {
    enableConsent();
    const dir = setupTmpRepo();
    const ctx: LogContext = {
      repoRoot: dir,
      sessionId: generateId(),
      repoBucket: "a3f9c1e8b2d04567",
      sdkVersion: "0.1.0",
      rulesVersion: "0.1.0",
      salt: "salt",
    };
    logAuditStarted(ctx, { framework: "vue" });
    logAuditCompleted(ctx, 100, baseResult);
    logFindingDiscovered(ctx, baseResult.findings[0]!);

    const events = readEvents(dir);
    expect(events).toHaveLength(3);
    for (const evt of events) {
      expect((evt as unknown as { source: string }).source).toBe("user");
    }
  });
});

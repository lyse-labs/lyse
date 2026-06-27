import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  appendAuditEvent,
  appendCommandInvokedEvent,
  appendMcpSetupCompletedEvent,
  appendInitStepCompletedEvent,
  readRecent,
  computeDelta,
} from "../../src/history/ndjson-store.js";
import type { AuditEvent } from "../../src/history/ndjson-store.js";
import { __setCacheForTest, resetConsentCache } from "../../src/telemetry/consent.js";
import { VERSION } from "../../src/index.js";

let dir: string;

function enableConsent(): void {
  __setCacheForTest({ accepted: true, initialised: true });
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "lyse-hist-"));
  __setCacheForTest({ accepted: false, initialised: true });
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
  resetConsentCache();
});

describe("appendAuditEvent", () => {
  it("appends a single audit event as NDJSON", async () => {
    await appendAuditEvent(dir, {
      score: 67,
      axes: { tokens: 58, a11y: 71, components: 74, stories: 65 },
      findings_count: 127,
    }, "abc123");
    const raw = readFileSync(join(dir, ".lyse/history.ndjson"), "utf8");
    const lines = raw.trim().split("\n");
    expect(lines).toHaveLength(1);
    const parsed = JSON.parse(lines[0]);
    expect(parsed.event_type).toBe("audit");
    expect(parsed.score).toBe(67);
    expect(parsed.schema_version).toBe(1);
    expect(parsed.commit_sha).toBe("abc123");
    expect(parsed.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it("creates .lyse/ directory if missing", async () => {
    await appendAuditEvent(dir, { score: 50, axes: {} as never, findings_count: 0 }, null);
    expect(existsSync(join(dir, ".lyse/history.ndjson"))).toBe(true);
  });
});

describe("readRecent", () => {
  it("returns empty array when no history exists", async () => {
    expect(await readRecent(dir)).toEqual([]);
  });

  it("returns last N events", async () => {
    await appendAuditEvent(dir, { score: 50, axes: {} as never, findings_count: 0 }, null);
    await appendAuditEvent(dir, { score: 60, axes: {} as never, findings_count: 0 }, null);
    await appendAuditEvent(dir, { score: 70, axes: {} as never, findings_count: 0 }, null);
    const recent = await readRecent(dir, 2);
    expect(recent).toHaveLength(2);
    expect((recent[1] as AuditEvent).score).toBe(70);
  });
});

describe("computeDelta", () => {
  it("computes score delta and days", () => {
    const previous = {
      schema_version: 1,
      event_type: "audit" as const,
      timestamp: new Date(Date.now() - 1000 * 60 * 60 * 24 * 3).toISOString(),
      score: 60,
      axes: {} as never,
      findings_count: 0,
      commit_sha: null,
      lyse_version: VERSION,
    };
    const current = { score: 72, axes: {} as never, findings_count: 0 };
    const delta = computeDelta(current, previous);
    expect(delta.score).toBe(12);
    expect(delta.days).toBeGreaterThanOrEqual(2); // ~3 days but floor
  });
});

// ---------------------------------------------------------------------------
// New event type helpers (Spec § 13 — 4 missing event types)
// ---------------------------------------------------------------------------

describe("appendCommandInvokedEvent", () => {
  it("does NOT write when consent is absent (opt-in guard)", async () => {
    await appendCommandInvokedEvent(dir, "audit", "success", 1234);
    expect(existsSync(join(dir, ".lyse/history.ndjson"))).toBe(false);
  });

  it("writes event with correct schema when consent is accepted", async () => {
    enableConsent();
    await appendCommandInvokedEvent(dir, "audit", "success", 999);
    const raw = readFileSync(join(dir, ".lyse/history.ndjson"), "utf8").trim();
    const event = JSON.parse(raw);
    expect(event.event_type).toBe("command_invoked");
    expect(event.command).toBe("audit");
    expect(event.outcome).toBe("success");
    expect(event.duration_ms).toBe(999);
    expect(event.schema_version).toBe(1);
    expect(event.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it("accepts outcome 'user_cancelled' and 'error'", async () => {
    enableConsent();
    await appendCommandInvokedEvent(dir, "fix", "user_cancelled", 100);
    await appendCommandInvokedEvent(dir, "agents", "error", 200);
    const events = await readRecent(dir, 10);
    expect(events).toHaveLength(2);
    expect(events[0].event_type).toBe("command_invoked");
    expect(events[1].event_type).toBe("command_invoked");
  });

  it("does NOT write on the run that just requested consent (suppress)", async () => {
    enableConsent();
    await appendCommandInvokedEvent(dir, "audit", "success", 1234, { suppress: true });
    expect(existsSync(join(dir, ".lyse/history.ndjson"))).toBe(false);
  });
});

describe("appendMcpSetupCompletedEvent", () => {
  it("does NOT write when consent is absent", async () => {
    await appendMcpSetupCompletedEvent(dir, "cursor");
    expect(existsSync(join(dir, ".lyse/history.ndjson"))).toBe(false);
  });

  it("writes mcp_setup_completed event with ide when consent is accepted", async () => {
    enableConsent();
    await appendMcpSetupCompletedEvent(dir, "both");
    const raw = readFileSync(join(dir, ".lyse/history.ndjson"), "utf8").trim();
    const event = JSON.parse(raw);
    expect(event.event_type).toBe("mcp_setup_completed");
    expect(event.ide).toBe("both");
    expect(event.schema_version).toBe(1);
  });
});

describe("appendInitStepCompletedEvent", () => {
  it("does NOT write when consent is absent", async () => {
    await appendInitStepCompletedEvent(dir, "audit");
    expect(existsSync(join(dir, ".lyse/history.ndjson"))).toBe(false);
  });

  it("writes init_step_completed event with step name when consent is accepted", async () => {
    enableConsent();
    await appendInitStepCompletedEvent(dir, "audit");
    const raw = readFileSync(join(dir, ".lyse/history.ndjson"), "utf8").trim();
    const event = JSON.parse(raw);
    expect(event.event_type).toBe("init_step_completed");
    expect(event.step).toBe("audit");
    expect(event.schema_version).toBe(1);
  });

  it("emits all init steps in order when consent is accepted", async () => {
    enableConsent();
    const steps = ["detection", "audit", "fix", "mcp-setup"];
    for (const step of steps) {
      await appendInitStepCompletedEvent(dir, step);
    }
    const events = await readRecent(dir, 10);
    expect(events).toHaveLength(steps.length);
    for (let i = 0; i < steps.length; i++) {
      expect(events[i].event_type).toBe("init_step_completed");
      expect((events[i] as { step: string }).step).toBe(steps[i]);
    }
  });
});

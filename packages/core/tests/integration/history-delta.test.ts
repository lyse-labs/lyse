/**
 * Integration test: history NDJSON store + delta computation.
 *
 * Writes crafted NDJSON event lines directly to the history file (bypassing
 * the Date.now() issue), then uses appendAuditEvent + computeDelta to
 * verify correct delta calculations.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  appendAuditEvent,
  readRecent,
  computeDelta,
} from "../../src/history/ndjson-store.js";
import type { AuditEvent, AuditEventInput } from "../../src/history/ndjson-store.js";

let dir: string;

/** Helper: build a synthetic AuditEvent with an explicit timestamp. */
function makeAuditEvent(score: number, daysAgo: number): AuditEvent {
  return {
    schema_version: 1,
    event_type: "audit",
    timestamp: new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000).toISOString(),
    score,
    axes: { tokens: score, a11y: score, components: score, stories: score },
    findings_count: 10,
    commit_sha: null,
    lyse_version: "0.1.0",
  };
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "lyse-int-hist-"));
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe("history-delta integration", () => {
  it("appends an audit event and reads it back correctly", async () => {
    const input: AuditEventInput = {
      score: 72,
      axes: { tokens: 65, a11y: 80, components: 72, stories: 71 },
      findings_count: 8,
    };
    await appendAuditEvent(dir, input, null);
    const events = await readRecent(dir, 5);
    expect(events).toHaveLength(1);
    expect(events[0].event_type).toBe("audit");
    expect(events[0].score).toBe(72);
    expect(events[0].findings_count).toBe(8);
  });

  it("computes positive score delta + days correctly from crafted NDJSON", () => {
    const previous = makeAuditEvent(60, 3);
    const current: AuditEventInput = {
      score: 80,
      axes: { tokens: 80, a11y: 80, components: 80, stories: 80 },
      findings_count: 4,
    };
    const delta = computeDelta(current, previous);
    expect(delta.score).toBe(20);
    expect(delta.days).toBeGreaterThanOrEqual(2); // at least 2 full days
    expect(delta.days).toBeLessThanOrEqual(4);   // not more than 4 days
  });

  it("computes negative score delta when score regressed", () => {
    const previous = makeAuditEvent(85, 1);
    const current: AuditEventInput = {
      score: 70,
      axes: { tokens: 70, a11y: 70, components: 70, stories: 70 },
      findings_count: 15,
    };
    const delta = computeDelta(current, previous);
    expect(delta.score).toBe(-15);
  });

  it("readRecent returns only the last N events when multiple events exist", async () => {
    // Write 3 events directly as NDJSON with different scores
    mkdirSync(join(dir, ".lyse"), { recursive: true });
    const events = [
      makeAuditEvent(50, 5),
      makeAuditEvent(60, 4),
      makeAuditEvent(70, 3),
    ];
    const ndjson = events.map((e) => JSON.stringify(e)).join("\n") + "\n";
    writeFileSync(join(dir, ".lyse/history.ndjson"), ndjson);

    const recent2 = await readRecent(dir, 2);
    expect(recent2).toHaveLength(2);
    // Should be the last 2 events: score 60 and score 70
    expect(recent2[0].score).toBe(60);
    expect(recent2[1].score).toBe(70);
  });

  it("zero delta when scores are equal", () => {
    const previous = makeAuditEvent(75, 2);
    const current: AuditEventInput = {
      score: 75,
      axes: { tokens: 75, a11y: 75, components: 75, stories: 75 },
      findings_count: 7,
    };
    const delta = computeDelta(current, previous);
    expect(delta.score).toBe(0);
  });
});

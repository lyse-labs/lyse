import { describe, it, expect, beforeEach } from "vitest";
import { mkdtempSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { appendAuditEvent, readRecent, computeDelta } from "../../src/history/ndjson-store.js";
import type { AuditEventInput, AuditEvent } from "../../src/history/ndjson-store.js";

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "lyse-audit-hist-"));
});

describe("history + delta integration", () => {
  it("appends an audit event to history.ndjson", async () => {
    const input: AuditEventInput = {
      score: 75,
      axes: { tokens: 80, a11y: 70, components: 75, stories: 75 },
      findings_count: 10,
    };
    await appendAuditEvent(dir, input, null);

    const events = await readRecent(dir, 10);
    expect(events).toHaveLength(1);
    expect(events[0].event_type).toBe("audit");
    expect(events[0].score).toBe(75);
    expect(events[0].findings_count).toBe(10);
  });

  it("computes delta correctly with 2 audits 3 days apart", async () => {
    const now = Date.now();
    const threeDaysAgo = new Date(now - 1000 * 60 * 60 * 24 * 3).toISOString();

    const oldEvent: AuditEvent = {
      schema_version: 1,
      event_type: "audit",
      timestamp: threeDaysAgo,
      score: 60,
      axes: { tokens: 50, a11y: 70, components: 60, stories: 60 },
      findings_count: 20,
      commit_sha: null,
      lyse_version: "0.1.0",
    };

    const delta = computeDelta(
      {
        score: 80,
        axes: { tokens: 80, a11y: 75, components: 80, stories: 75 },
        findings_count: 5,
      },
      oldEvent
    );

    expect(delta.score).toBe(20); // 80 - 60
    expect(delta.days).toBeGreaterThanOrEqual(2); // at least 2 days (3d - some ms)
  });

  it("returns empty array when no history exists", async () => {
    const events = await readRecent(dir, 10);
    expect(events).toEqual([]);
  });

  it("returns only the last N events when asked", async () => {
    for (let i = 0; i < 5; i++) {
      await appendAuditEvent(
        dir,
        { score: 60 + i * 5, axes: { tokens: 50, a11y: 70, components: 60, stories: 60 }, findings_count: 10 },
        null
      );
    }

    const recent2 = await readRecent(dir, 2);
    expect(recent2).toHaveLength(2);
    expect(recent2[0].score).toBe(75); // 4th audit (60 + 3*5)
    expect(recent2[1].score).toBe(80); // 5th audit (60 + 4*5) (latest)
  });

  it("negative delta shows downward arrow", async () => {
    const oldEvent: AuditEvent = {
      schema_version: 1,
      event_type: "audit",
      timestamp: new Date(Date.now() - 1000 * 60 * 60 * 24).toISOString(),
      score: 80,
      axes: { tokens: 80, a11y: 75, components: 80, stories: 75 },
      findings_count: 5,
      commit_sha: null,
      lyse_version: "0.1.0",
    };

    const delta = computeDelta(
      {
        score: 60,
        axes: { tokens: 50, a11y: 70, components: 60, stories: 60 },
        findings_count: 20,
      },
      oldEvent
    );

    expect(delta.score).toBe(-20); // 60 - 80
  });
});

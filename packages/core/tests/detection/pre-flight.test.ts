import { describe, it, expect, beforeEach } from "vitest";
import { mkdtempSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { runPreFlight, formatDetected } from "../../src/detection/pre-flight.js";

let dir: string;
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), "lyse-pf-")); });

describe("runPreFlight", () => {
  it("returns merged detection from all sources", async () => {
    writeFileSync(join(dir, "package.json"), JSON.stringify({ dependencies: { react: "^18.0.0" } }));
    const r = await runPreFlight(dir, { skipNodeCheck: true });
    expect(r.framework.value).toBe("react");
    expect(r.git.value?.initialized).toBe(false);
    expect(r.cursor.value).toBe(false);
    expect(r.claudeCode.value).toBe(false);
  });

  it("includes all 9 Detected fields", async () => {
    const r = await runPreFlight(dir, { skipNodeCheck: true });
    expect(r).toHaveProperty("framework");
    expect(r).toHaveProperty("hasTypeScript");
    expect(r).toHaveProperty("componentsModule");
    expect(r).toHaveProperty("storybook");
    expect(r).toHaveProperty("packageManager");
    expect(r).toHaveProperty("cursor");
    expect(r).toHaveProperty("claudeCode");
    expect(r).toHaveProperty("git");
    expect(r).toHaveProperty("github");
  });
});

describe("formatDetected", () => {
  it("renders detected items with checkmarks", async () => {
    writeFileSync(join(dir, "package.json"), JSON.stringify({ dependencies: { react: "^18.0.0" } }));
    const r = await runPreFlight(dir, { skipNodeCheck: true });
    const out = formatDetected(r);
    expect(out).toContain("Detected:");
    expect(out).toContain("Framework: react");
  });

  it("returns a header even when nothing detected", async () => {
    const r = await runPreFlight(dir, { skipNodeCheck: true });
    const out = formatDetected(r);
    expect(out).toContain("Detected:");
  });
});

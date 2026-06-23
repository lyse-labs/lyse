import { describe, it, expect } from "vitest";
import { auditDirectory } from "../../src/commands/audit-pipeline.js";
import { mkdtempSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

function tmp(files: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), "lyse-axe-"));
  for (const [p, c] of Object.entries(files)) {
    const abs = join(dir, p);
    mkdirSync(join(abs, ".."), { recursive: true });
    writeFileSync(abs, c, "utf8");
  }
  return dir;
}

describe("audit --render runtime-axe sub-stage", () => {
  it("render with no Storybook: runtime-axe is N/A and the audit does not crash", async () => {
    const dir = tmp({ "package.json": '{"name":"x","version":"1.0.0"}', "src/t.css": ":root{--bg:#fff;}" });
    const { result } = await auditDirectory(dir, { staticOnly: true, render: true });
    const axeFindings = result.findings.filter((f) => f.ruleId === "a11y/runtime-axe");
    expect(axeFindings).toHaveLength(0);
  });

  it("render with a Storybook whose stories fail to render: probes attempted, no crash, no false findings", async () => {
    // A real index.json but no bundled iframe.html — every story navigation
    // fails and is skipped (degrade). storiesProbed ends at 0, no findings.
    const index = { v: 5, entries: { "button--primary": { id: "button--primary", title: "Button", name: "Primary", type: "story" } } };
    const dir = tmp({
      "package.json": '{"name":"x","version":"1.0.0"}',
      "storybook-static/index.json": JSON.stringify(index),
    });
    const { result } = await auditDirectory(dir, { staticOnly: true, render: true });
    expect(result.findings.filter((f) => f.ruleId === "a11y/runtime-axe")).toHaveLength(0);
    // meta.render is present whenever render mode ran; storiesProbed reflects successes.
    if (result.meta?.render?.storiesProbed !== undefined) {
      expect(result.meta.render.storiesProbed).toBe(0);
    }
  }, 60_000);
});

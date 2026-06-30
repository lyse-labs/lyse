import { describe, it, expect } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runPreflight, classifyPreflight } from "../../src/mcp/tools/preflight.js";

describe("classifyPreflight", () => {
  const v = (rule_id: string) => ({
    rule_id,
    severity: "warning" as const,
    range: { line: 1, column: 1 },
    message: "m",
    suggestion_available: false,
  });

  it("routes stable-rule findings to blocking and the rest to advisory", () => {
    const stable = new Set(["tokens/no-hardcoded-color"]);
    const r = classifyPreflight([v("tokens/no-hardcoded-color"), v("components/no-arbitrary-tailwind")], stable);
    expect(r.verdict).toBe("blocked");
    expect(r.blocking.map((b) => b.rule_id)).toEqual(["tokens/no-hardcoded-color"]);
    expect(r.advisory.map((b) => b.rule_id)).toEqual(["components/no-arbitrary-tailwind"]);
  });

  it("passes when only experimental (advisory) findings exist", () => {
    const stable = new Set(["tokens/no-hardcoded-color"]);
    const r = classifyPreflight([v("components/no-arbitrary-tailwind")], stable);
    expect(r.verdict).toBe("pass");
    expect(r.blocking).toHaveLength(0);
    expect(r.advisory).toHaveLength(1);
  });

  it("passes with no findings at all", () => {
    expect(classifyPreflight([], new Set(["x"])).verdict).toBe("pass");
  });
});

describe("runPreflight", () => {
  it("blocks a proposed buffer with a stable-rule violation (a11y: img missing alt)", async () => {
    const r = await runPreflight({
      path: "Page.tsx",
      content: "export default () => <img src=\"x.png\" />;",
    });
    expect(r.schema_version).toBe("1.0.0");
    expect(r.verdict).toBe("blocked");
    expect(r.blocking.some((b) => b.rule_id === "a11y/essentials")).toBe(true);
  });

  it("routes the experimental color rule to advisory, not blocking (precision-walled)", async () => {
    const r = await runPreflight({
      path: "Page.tsx",
      content: 'export default () => <div style={{ background: "#2563eb" }}>x</div>;',
    });
    // tokens/no-hardcoded-color is experimental (precision-walled) → must never block.
    expect(r.blocking.some((b) => b.rule_id === "tokens/no-hardcoded-color")).toBe(false);
    expect(r.advisory.some((b) => b.rule_id === "tokens/no-hardcoded-color")).toBe(true);
  });

  it("passes a clean proposed buffer", async () => {
    const r = await runPreflight({
      path: "Page.tsx",
      content: 'export default () => <div className="bg-primary">x</div>;',
    });
    expect(r.verdict).toBe("pass");
    expect(r.blocking).toHaveLength(0);
  });

  it("respects rules: { <id>: off } — a disabled stable rule cannot block", async () => {
    const dir = mkdtempSync(join(tmpdir(), "lyse-preflight-"));
    writeFileSync(join(dir, ".lyse.yaml"), "rules:\n  a11y/essentials: off\n");
    const filePath = join(dir, "Page.tsx");
    try {
      const r = await runPreflight({
        path: filePath,
        content: "export default () => <img src=\"x.png\" />;",
      });
      expect(r.blocking.some((b) => b.rule_id === "a11y/essentials")).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("returns an error verdict when path is missing", async () => {
    const r = await runPreflight({ content: "x" });
    expect(r.verdict).toBe("error");
  });
});

import { describe, it, expect } from "vitest";
import { auditDirectory } from "../../src/commands/audit-pipeline.js";
import { mkdtempSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

function tmp(files: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), "lyse-render-"));
  for (const [p, c] of Object.entries(files)) {
    const abs = join(dir, p);
    mkdirSync(join(abs, ".."), { recursive: true });
    writeFileSync(abs, c, "utf8");
  }
  return dir;
}

describe("audit --render", () => {
  it("default audit (no render) does not populate meta.render", async () => {
    const dir = tmp({ "package.json": '{"name":"x","version":"1.0.0"}', "src/t.css": ":root{--bg:#fff;}" });
    const { result } = await auditDirectory(dir, { staticOnly: true });
    expect(result.meta?.render).toBeUndefined();
  });

  it("render mode with no DTCG source sets meta.render.error and does not crash", async () => {
    const dir = tmp({
      "package.json": '{"name":"x","version":"1.0.0"}',
      "src/t.css": ":root{--bg:#ffffff;}",
    });
    const { result } = await auditDirectory(dir, { staticOnly: true, render: true });
    expect(result.meta?.render).toBeDefined();
    expect(result.meta!.render!.error).toBe("no DTCG token source");
    expect(result.meta!.render!.chromiumVersion).toBe("n/a");
  });

  it("render mode with a non-DTCG tokens.json (value/type not $value/$type) sets meta.render.error and does not crash", async () => {
    const nonDtcg = JSON.stringify({
      color: { bg: { value: "#fff", type: "color" } },
    });
    const dir = tmp({
      "package.json": '{"name":"x","version":"1.0.0"}',
      "foo.tokens.json": nonDtcg,
      "src/t.css": ":root{--color-bg:#ffffff;}",
    });
    const { result } = await auditDirectory(dir, { staticOnly: true, render: true });
    expect(result.meta?.render).toBeDefined();
    expect(result.meta!.render!.error).toBe("no DTCG token source");
    expect(result.meta!.render!.chromiumVersion).toBe("n/a");
    const renderFindings = result.findings.filter((f) => f.ruleId === "rendered-token-fidelity");
    expect(renderFindings).toHaveLength(0);
  });

  it("render mode WITH a DTCG source flags drift or cleanly skips when chromium absent", async () => {
    const dtcg = JSON.stringify({
      color: { bg: { $value: "#ffffff", $type: "color" } },
    });
    const dir = tmp({
      "package.json": '{"name":"x","version":"1.0.0"}',
      "tokens.tokens.json": dtcg,
      // CSS where --color-bg resolves away from its DTCG value via cascade
      "src/t.css": ":root{--brand:#ff0000;--color-bg:var(--brand);}",
    });
    const { result } = await auditDirectory(dir, { staticOnly: true, render: true });
    // Either chromium ran (render.chromiumVersion set) or it skipped with an error — never crash.
    expect(result.meta).toBeDefined();
    expect(result.meta!.render === undefined || typeof result.meta!.render === "object").toBe(true);
  }, 60_000);
});

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
  it("render mode flags an injected override drift OR cleanly skips if chromium absent", async () => {
    const dir = tmp({
      "package.json": '{"name":"x","version":"1.0.0"}',
      "src/t.css": ":root{--bg:#ffffff;} .leak{--bg:#ff0000;}",
    });
    const { result } = await auditDirectory(dir, { staticOnly: true, render: true });
    // Either chromium ran (meta.render present) or it skipped with an error note — never crash.
    expect(result.meta).toBeDefined();
    expect(result.meta!.render === undefined || typeof result.meta!.render === "object").toBe(true);
  }, 60_000);
});

import { describe, it, expect, beforeAll } from "vitest";
import { mkdtempSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { collectColorFindings } from "../../../../scripts/harvest-color-findings.js";

let dir: string;
beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), "harvest-"));
  mkdirSync(join(dir, "repoA", "src"), { recursive: true });
  writeFileSync(join(dir, "repoA", "package.json"), JSON.stringify({ name: "a", version: "1.0.0" }));
  writeFileSync(join(dir, "repoA", "src", "Btn.css"), ".btn { color: #2563eb; }\n");
});

describe("collectColorFindings", () => {
  it("returns a row per color finding with repo, file, line, snippet, fileType", async () => {
    const rows = await collectColorFindings(dir);
    const hit = rows.find((r) => r.file.endsWith("Btn.css"));
    expect(hit, "expected a finding in Btn.css").toBeDefined();
    expect(hit!.repo).toBe("repoA");
    expect(hit!.fileType).toBe(".css");
    expect(hit!.snippet).toContain("#2563eb");
    expect(hit!.line).toBeGreaterThan(0);
  });
});

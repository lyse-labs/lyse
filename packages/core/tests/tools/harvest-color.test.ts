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

  // A .yarn/releases file — isVendoredOrResetFile suppresses it
  mkdirSync(join(dir, "repoA", ".yarn", "releases"), { recursive: true });
  writeFileSync(join(dir, "repoA", ".yarn", "releases", "yarn.cjs"), "color: #ff0000;\n");

  // A multi-color JS palette array — isDataPaletteContext suppresses it
  mkdirSync(join(dir, "repoA", "src", "palette"), { recursive: true });
  writeFileSync(
    join(dir, "repoA", "src", "palette", "palette.ts"),
    "export const chartColors = ['#ff0000', '#00ff00', '#0000ff', '#ffff00', '#ff00ff'];\n",
  );
});

describe("collectColorFindings", () => {
  it("returns a row per color finding with repo, file, line, snippet, fileType, confidence", async () => {
    const rows = await collectColorFindings(dir);
    const hit = rows.find((r) => r.file.endsWith("Btn.css"));
    expect(hit, "expected a finding in Btn.css").toBeDefined();
    expect(hit!.repo).toBe("repoA");
    expect(hit!.fileType).toBe(".css");
    expect(hit!.snippet).toContain("#2563eb");
    expect(hit!.line).toBeGreaterThan(0);
    expect(["high", "medium", "low"]).toContain(hit!.confidence);
  });

  it("suppresses findings in vendored paths (.yarn/releases)", async () => {
    const rows = await collectColorFindings(dir);
    const yarnHit = rows.find((r) => r.file.includes(".yarn"));
    expect(yarnHit, "expected no finding from .yarn/releases path").toBeUndefined();
  });

  it("suppresses findings in multi-color JS palette arrays (isDataPaletteContext)", async () => {
    const rows = await collectColorFindings(dir);
    const paletteHit = rows.find((r) => r.file.includes("palette.ts"));
    expect(paletteHit, "expected no finding from multi-color palette array").toBeUndefined();
  });
});

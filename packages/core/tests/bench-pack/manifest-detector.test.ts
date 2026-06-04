import { describe, it, expect, beforeAll } from "vitest";
import { mkdir, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { detectManifests } from "../../src/bench/evidence-pack/manifest-detector.js";

const FIXTURE = join(__dirname, "..", "..", ".tmp", "manifest-fixture");

describe("detectManifests", () => {
  beforeAll(async () => {
    await rm(FIXTURE, { recursive: true, force: true });
    await mkdir(FIXTURE, { recursive: true });
    await writeFile(join(FIXTURE, "AGENTS.md"), "# Agents\nThese are the rules.\n".repeat(5));
    await writeFile(join(FIXTURE, "DESIGN.md"), "---\ntitle: Foo\n---\nBody");
    await mkdir(join(FIXTURE, ".cursor", "rules"), { recursive: true });
    await writeFile(join(FIXTURE, ".cursor", "rules", "a.mdc"), "rule A content");
  });

  it("detects AGENTS.md presence + records size, lineCount, sha256, path", async () => {
    const m = await detectManifests(FIXTURE);
    expect(m.agentsMd.present).toBe(true);
    expect(m.agentsMd.path).toBe("AGENTS.md");
    expect(m.agentsMd.size).toBeGreaterThan(0);
    expect(m.agentsMd.lineCount).toBeGreaterThanOrEqual(5);
    expect(m.agentsMd.sha256).toMatch(/^[a-f0-9]{64}$/);
  });

  it("detects DESIGN.md presence", async () => {
    const m = await detectManifests(FIXTURE);
    expect(m.designMd.present).toBe(true);
    expect(m.designMd.path).toBe("DESIGN.md");
  });

  it("detects .cursor/rules/ directory with file count", async () => {
    const m = await detectManifests(FIXTURE);
    expect(m.cursorRules.present).toBe(true);
    expect(m.cursorRules.directory).toBe(".cursor/rules");
    expect(m.cursorRules.fileCount).toBe(1);
    expect(m.cursorRules.files?.[0]?.path).toBe(".cursor/rules/a.mdc");
  });

  it("returns present:false for missing manifests", async () => {
    const m = await detectManifests(FIXTURE);
    expect(m.claudeMd.present).toBe(false);
    expect(m.skillMd.present).toBe(false);
    expect(m.componentsJson.present).toBe(false);
    expect(m.llmsTxt.present).toBe(false);
  });
});

import { describe, it, expect, beforeEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { detectFromFilesystem } from "../../src/detection/from-filesystem.js";

let dir: string;
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), "lyse-fs-")); });

describe("detectFromFilesystem", () => {
  it("detects Cursor when .cursor/ exists", async () => {
    mkdirSync(join(dir, ".cursor"));
    expect((await detectFromFilesystem(dir)).cursor.value).toBe(true);
  });

  it("detects Claude Code when .mcp.json exists", async () => {
    writeFileSync(join(dir, ".mcp.json"), "{}");
    expect((await detectFromFilesystem(dir)).claudeCode.value).toBe(true);
  });

  it("returns false when neither exists", async () => {
    const r = await detectFromFilesystem(dir);
    expect(r.cursor.value).toBe(false);
    expect(r.claudeCode.value).toBe(false);
  });

  it("detects both when both exist", async () => {
    mkdirSync(join(dir, ".cursor"));
    writeFileSync(join(dir, ".mcp.json"), "{}");
    const r = await detectFromFilesystem(dir);
    expect(r.cursor.value).toBe(true);
    expect(r.claudeCode.value).toBe(true);
  });
});

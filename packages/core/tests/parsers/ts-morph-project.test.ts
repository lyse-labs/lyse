import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getTsMorphProject } from "../../src/parsers/ts-morph-project.js";

describe("getTsMorphProject", () => {
  let tmpRoot: string;

  beforeEach(() => {
    tmpRoot = mkdtempSync(join(tmpdir(), "lyse-tsm-"));
    // Ensure the cache is fresh for each test (no leakage between tests).
    getTsMorphProject(tmpRoot).clear();
  });

  afterEach(() => {
    getTsMorphProject(tmpRoot).clear();
    rmSync(tmpRoot, { recursive: true, force: true });
  });

  it("caches the wrapper's underlying Project across calls", () => {
    const a = getTsMorphProject(tmpRoot);
    const filePath = join(tmpRoot, "a.ts");
    writeFileSync(filePath, "export const x = 1;\n");
    const sfFromA = a.getSourceFile(filePath);
    expect(sfFromA).toBeDefined();

    // Second call returns a wrapper around the SAME cached Project,
    // so the previously-added source file is still accessible.
    const b = getTsMorphProject(tmpRoot);
    const sfFromB = b.getSourceFile(filePath);
    expect(sfFromB).toBeDefined();
    // Same underlying SourceFile means same Project.
    expect(sfFromB).toBe(sfFromA);
  });

  it("returns a SourceFile for a real path", () => {
    const filePath = join(tmpRoot, "real.ts");
    writeFileSync(filePath, "export const foo = 'bar';\n");
    const tsm = getTsMorphProject(tmpRoot);
    const sf = tsm.getSourceFile(filePath);
    expect(sf).toBeDefined();
    expect(sf?.getFilePath()).toBe(filePath.replace(/\\/g, "/"));
  });

  it("returns undefined for a missing path (no throw)", () => {
    const tsm = getTsMorphProject(tmpRoot);
    const sf = tsm.getSourceFile(join(tmpRoot, "does-not-exist.ts"));
    expect(sf).toBeUndefined();
  });

  it("clear() resets the cache so a fresh Project is built next call", () => {
    const filePath = join(tmpRoot, "c.ts");
    writeFileSync(filePath, "export const c = 1;\n");

    const first = getTsMorphProject(tmpRoot);
    const sfFirst = first.getSourceFile(filePath);
    expect(sfFirst).toBeDefined();

    first.clear();

    const second = getTsMorphProject(tmpRoot);
    const sfSecond = second.getSourceFile(filePath);
    expect(sfSecond).toBeDefined();
    // Fresh Project => fresh SourceFile node (not the same reference).
    expect(sfSecond).not.toBe(sfFirst);
  });
});

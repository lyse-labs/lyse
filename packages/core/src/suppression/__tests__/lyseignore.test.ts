import { describe, expect, it } from "vitest";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { isExcluded, loadLyseIgnore } from "../lyseignore.js";
import { DEFAULT_EXCLUDED_GLOBS } from "../defaults.js";

describe("default exclusions", () => {
  it("excludes node_modules by default", () => {
    expect(isExcluded("node_modules/foo/bar.ts", DEFAULT_EXCLUDED_GLOBS, [])).toBe(true);
  });
  it("excludes .stories files by default", () => {
    expect(isExcluded("src/Button.stories.tsx", DEFAULT_EXCLUDED_GLOBS, [])).toBe(true);
  });
  it("does not exclude source files by default", () => {
    expect(isExcluded("src/Button.tsx", DEFAULT_EXCLUDED_GLOBS, [])).toBe(false);
  });
});

describe(".lyseignore", () => {
  it("respects custom patterns", () => {
    const dir = mkdtempSync(join(tmpdir(), "lyse-"));
    writeFileSync(join(dir, ".lyseignore"), "src/legacy/**\n");
    try {
      const patterns = loadLyseIgnore(dir);
      expect(isExcluded("src/legacy/old.tsx", [], patterns)).toBe(true);
      expect(isExcluded("src/Button.tsx", [], patterns)).toBe(false);
    } finally {
      rmSync(dir, { recursive: true });
    }
  });
});

import { describe, expect, it } from "vitest";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadLyseIgnore } from "../lyseignore.js";

describe(".lyseignore", () => {
  it("returns custom patterns from the file", () => {
    const dir = mkdtempSync(join(tmpdir(), "lyse-"));
    writeFileSync(join(dir, ".lyseignore"), "src/legacy/**\n# comment\n\n");
    try {
      expect(loadLyseIgnore(dir)).toEqual(["src/legacy/**"]);
    } finally {
      rmSync(dir, { recursive: true });
    }
  });

  it("returns an empty array when no file exists", () => {
    const dir = mkdtempSync(join(tmpdir(), "lyse-"));
    try {
      expect(loadLyseIgnore(dir)).toEqual([]);
    } finally {
      rmSync(dir, { recursive: true });
    }
  });
});

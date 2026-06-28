import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { collectAllFindings } from "../../scripts/harvest-findings.js";

let corpusDir: string;

beforeAll(() => {
  corpusDir = join(tmpdir(), `harvest-findings-test-${process.pid}`);

  // repo-a: seed a hardcoded color finding (Button.css avoids the colors.css skip-guard)
  const repoA = join(corpusDir, "repo-a");
  mkdirSync(join(repoA, "src"), { recursive: true });
  writeFileSync(
    join(repoA, "src", "Button.css"),
    `.btn { color: #ff0000; }\n`,
    "utf8",
  );

  // repo-b: seed a hardcoded z-index finding (different rule from color)
  const repoB = join(corpusDir, "repo-b");
  mkdirSync(join(repoB, "src"), { recursive: true });
  writeFileSync(
    join(repoB, "src", "overlay.css"),
    `.modal { z-index: 9999; }\n`,
    "utf8",
  );
});

afterAll(() => {
  rmSync(corpusDir, { recursive: true, force: true });
});

describe("collectAllFindings", () => {
  it("rows carry ruleId", async () => {
    const rows = await collectAllFindings(corpusDir);
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      expect(typeof row.ruleId).toBe("string");
      expect(row.ruleId.length).toBeGreaterThan(0);
    }
  });

  it("emits findings from multiple distinct ruleIds", async () => {
    const rows = await collectAllFindings(corpusDir);
    const ruleIds = new Set(rows.map((r) => r.ruleId));
    expect(ruleIds.size).toBeGreaterThanOrEqual(2);
  });

  it("rows are sorted by (ruleId, repo, file, line)", async () => {
    const rows = await collectAllFindings(corpusDir);
    for (let i = 1; i < rows.length; i++) {
      const prev = rows[i - 1]!;
      const curr = rows[i]!;
      const rComp = prev.ruleId.localeCompare(curr.ruleId);
      if (rComp > 0) {
        throw new Error(
          `rows not sorted by ruleId at index ${i}: ${prev.ruleId} > ${curr.ruleId}`,
        );
      }
      if (rComp === 0) {
        const repoComp = prev.repo.localeCompare(curr.repo);
        if (repoComp > 0) {
          throw new Error(
            `rows not sorted by repo at index ${i}: ${prev.repo} > ${curr.repo}`,
          );
        }
        if (repoComp === 0) {
          const fileComp = prev.file.localeCompare(curr.file);
          if (fileComp > 0) {
            throw new Error(
              `rows not sorted by file at index ${i}: ${prev.file} > ${curr.file}`,
            );
          }
          if (fileComp === 0) {
            expect(prev.line).toBeLessThanOrEqual(curr.line);
          }
        }
      }
    }
  });

  it("each row has the expected shape", async () => {
    const rows = await collectAllFindings(corpusDir);
    expect(rows.length).toBeGreaterThan(0);
    const row = rows[0]!;
    expect(typeof row.repo).toBe("string");
    expect(typeof row.file).toBe("string");
    expect(typeof row.line).toBe("number");
    expect(typeof row.snippet).toBe("string");
    expect(typeof row.fileType).toBe("string");
    expect(["high", "medium", "low"]).toContain(row.confidence);
  });

  it("returns empty array for an empty corpus dir", async () => {
    const emptyDir = join(tmpdir(), `harvest-findings-empty-${process.pid}`);
    mkdirSync(emptyDir, { recursive: true });
    try {
      const rows = await collectAllFindings(emptyDir);
      expect(rows).toEqual([]);
    } finally {
      rmSync(emptyDir, { recursive: true, force: true });
    }
  });
});

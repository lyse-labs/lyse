/**
 * MCP `audit_file` P95 budget (Track 13.4 / #97).
 *
 * Exit gate: P95 < 300 ms on a Carbon-scale repo (~500 components). We generate
 * a synthetic repo of that size at test time (not committed) — WITH a real token
 * registry and stories so the repo-level loaders do genuine work — then warm the
 * per-project context cache and time many single-file audits. This guards the
 * MCP hot path against a regression that re-scans the tree on every call.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { performance } from "node:perf_hooks";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runAuditFile } from "../../src/mcp/tools/audit-file.js";
import { clearProjectContextCache } from "../../src/mcp/context-cache.js";

const COMPONENT_COUNT = 500;
let repo: string;
let targetFile: string;

function p95(samples: number[]): number {
  const s = [...samples].sort((a, b) => a - b);
  return s[Math.floor(s.length * 0.95)] ?? s[s.length - 1]!;
}
function median(samples: number[]): number {
  const s = [...samples].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)] ?? 0;
}

beforeAll(() => {
  repo = mkdtempSync(join(tmpdir(), "lyse-carbon-scale-"));
  writeFileSync(join(repo, "package.json"), JSON.stringify({ name: "@acme/carbon-scale", version: "1.0.0" }));
  const src = join(repo, "src");
  mkdirSync(src, { recursive: true });
  // A real token registry (DTCG) + per-component stories so the repo-level
  // loaders (loadTokens / loadStories) do genuine work — that tree scan is the
  // cost the per-project context cache eliminates on the hot path.
  const tokens: Record<string, Record<string, { $value: string; $type: string }>> = { color: {}, space: {} };
  for (let i = 0; i < 120; i++) {
    tokens.color![`c${i}`] = { $value: `#${((i * 7) % 256).toString(16).padStart(2, "0").repeat(3)}`, $type: "color" };
    tokens.space![`s${i}`] = { $value: `${i}px`, $type: "dimension" };
  }
  writeFileSync(join(repo, "tokens.json"), JSON.stringify(tokens));
  for (let i = 0; i < COMPONENT_COUNT; i++) {
    const body = `import React from "react";\n\nexport function Component${i}() {\n  return <button className="bg-primary px-4">Item ${i}</button>;\n}\n`;
    writeFileSync(join(src, `Component${i}.tsx`), body);
    if (i % 3 === 0) {
      writeFileSync(
        join(src, `Component${i}.stories.tsx`),
        `import { Component${i} } from "./Component${i}";\nexport default { component: Component${i} };\nexport const Primary = {};\n`,
      );
    }
  }
  targetFile = join(src, "Component0.tsx");
});

afterAll(() => {
  rmSync(repo, { recursive: true, force: true });
  clearProjectContextCache();
});

describe("audit_file P95 on a Carbon-scale repo", () => {
  it(
    "keeps warm P95 < 300ms over 50 single-file audits",
    async () => {
      // Warm the per-project context cache (first call pays the tree scan).
      await runAuditFile({ path: targetFile, project_root: repo });

      const warm: number[] = [];
      for (let i = 0; i < 50; i++) {
        const file = join(repo, "src", `Component${i % COMPONENT_COUNT}.tsx`);
        const start = performance.now();
        await runAuditFile({ path: file, project_root: repo });
        warm.push(performance.now() - start);
      }
      const warmP95 = p95(warm);
      // eslint-disable-next-line no-console
      console.log(`[perf] audit_file warm P95 (${COMPONENT_COUNT} components): ${warmP95.toFixed(1)}ms`);
      expect(warmP95).toBeLessThan(300);
    },
    30_000,
  );

  it(
    "the context cache materially cuts per-call cost (warm median < cold median)",
    async () => {
      // Cold: clear the cache before each call so every audit re-scans the tree.
      const cold: number[] = [];
      for (let i = 0; i < 15; i++) {
        clearProjectContextCache();
        const start = performance.now();
        await runAuditFile({ path: targetFile, project_root: repo });
        cold.push(performance.now() - start);
      }
      // Warm: keep the cache.
      await runAuditFile({ path: targetFile, project_root: repo });
      const warm: number[] = [];
      for (let i = 0; i < 15; i++) {
        const start = performance.now();
        await runAuditFile({ path: targetFile, project_root: repo });
        warm.push(performance.now() - start);
      }
      const coldMed = median(cold);
      const warmMed = median(warm);
      // eslint-disable-next-line no-console
      console.log(`[perf] cold median=${coldMed.toFixed(1)}ms  warm median=${warmMed.toFixed(1)}ms`);
      expect(warmMed).toBeLessThan(coldMed);
    },
    30_000,
  );
});

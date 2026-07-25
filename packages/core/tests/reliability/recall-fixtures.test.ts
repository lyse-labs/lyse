import { describe, it, expect, afterAll } from "vitest";
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { auditDirectory } from "../../src/commands/audit-pipeline.js";
import { zoneOf } from "../../src/graph/query.js";
import { RECALL_FIXTURES } from "../../src/reliability/recall/fixtures.js";
import type { RecallFixture } from "../../src/reliability/recall/fixtures.js";

const dirs: string[] = [];

function materialize(fx: RecallFixture): string {
  const root = mkdtempSync(join(tmpdir(), "lyse-recall-"));
  dirs.push(root);
  for (const f of [...fx.files, { path: ".lyse.yaml", content: fx.lyseYaml }]) {
    const p = join(root, f.path);
    mkdirSync(dirname(p), { recursive: true });
    writeFileSync(p, f.content, "utf8");
  }
  return root;
}

afterAll(() => {
  for (const d of dirs) rmSync(d, { recursive: true, force: true });
});

describe("recall fixtures — clean baseline", () => {
  for (const fx of RECALL_FIXTURES) {
    it(`${fx.id}: app-zoned, ≥35 ${fx.axis} tokens loaded, 0 findings for ${fx.ruleId}`, async () => {
      const root = materialize(fx);
      const { result, graph } = await auditDirectory(root, { staticOnly: true });

      expect(zoneOf(graph, fx.componentPath)).toBe("app");
      expect(graph.tokens.filter((t) => t.axis === fx.axis).length).toBeGreaterThanOrEqual(35);
      expect(result.findings.filter((f) => f.ruleId === fx.ruleId)).toHaveLength(0);
    });
  }
});

import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { auditDirectory } from "../../commands/audit-pipeline.js";
import { createResolver } from "../../graph/resolve/index.js";
import { zoneOf } from "../../graph/query.js";
import { ruleMap } from "../../rules/registry.js";
import { wilsonLowerBound } from "../catalogue/promotion.js";
import { injectDrift } from "./inject.js";
import { generateLiterals } from "./literals.js";
import { RECALL_FIXTURES } from "./fixtures.js";
import type { RecallFixture } from "./fixtures.js";
import type { RecallBucket } from "./types.js";
import type { RuleContext, ParsedFiles } from "../../types.js";

const LITERALS_PER_CLASS = 60;

type SeededClass = "exact" | "near" | "novel";

function classesForAxis(axis: RecallFixture["axis"]): SeededClass[] {
  return axis === "colors" ? ["exact", "near", "novel"] : ["near", "novel"];
}

function materialize(fx: RecallFixture): string {
  const root = mkdtempSync(join(tmpdir(), "lyse-recall-measure-"));
  for (const f of [...fx.files, { path: ".lyse.yaml", content: fx.lyseYaml }]) {
    const p = join(root, f.path);
    mkdirSync(dirname(p), { recursive: true });
    writeFileSync(p, f.content, "utf8");
  }
  return root;
}

function parsedFilesFor(path: string, source: string): ParsedFiles {
  return { ts: [], css: [{ path, source }], cssInJs: [] };
}

export async function measureRecall(fixtures: RecallFixture[] = RECALL_FIXTURES): Promise<RecallBucket[]> {
  const buckets: RecallBucket[] = [];
  const dirs: string[] = [];
  try {
    for (const fx of fixtures) {
      const root = materialize(fx);
      dirs.push(root);

      const pipeline = await auditDirectory(root, { staticOnly: true });
      const resolver = createResolver(pipeline.graph);
      const rule = ruleMap.get(fx.ruleId);
      if (rule === undefined) throw new Error(`measureRecall: unknown rule ${fx.ruleId}`);
      const componentFile = fx.files.find((f) => f.path === fx.componentPath);
      if (componentFile === undefined) {
        throw new Error(`measureRecall: component not in fixture files: ${fx.componentPath}`);
      }
      const componentSource = componentFile.content;
      const zone = zoneOf(pipeline.graph, fx.componentPath);

      const ctx: RuleContext = {
        repoRoot: root,
        tokens: pipeline.tokens,
        componentsModule: pipeline.config.designSystem?.componentsModule ?? null,
        componentInventory: pipeline.componentInventory,
        storyIndex: null,
        excludePaths: [],
        dsSelfMode: false,
        graph: pipeline.graph,
        resolver,
      };

      for (const cls of classesForAxis(fx.axis)) {
        const literals = generateLiterals(resolver, pipeline.graph.tokens, fx.axis, cls, LITERALS_PER_CLASS);
        let caught = 0;
        for (const literal of literals) {
          const { source, line } = injectDrift(componentSource, fx.marker, literal);
          const files = parsedFilesFor(fx.componentPath, source);
          const res = await rule.evaluate(ctx, files);
          if (res.findings.some((f) => f.ruleId === fx.ruleId && f.location.line === line)) caught++;
        }
        const seeded = literals.length;
        buckets.push({
          ruleId: fx.ruleId,
          class: cls,
          zone,
          seeded,
          caught,
          recall: seeded > 0 ? caught / seeded : null,
          recallWilsonLB: wilsonLowerBound(caught, seeded),
          recallSource: "seeded",
        });
      }
    }
  } finally {
    for (const d of dirs) rmSync(d, { recursive: true, force: true });
  }
  return buckets;
}

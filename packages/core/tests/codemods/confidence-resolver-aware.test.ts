import { describe, it, expect } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { auditDirectory } from "../../src/commands/audit-pipeline.js";
import { buildClassifyContext, populateConfidence } from "../../src/codemods/safety.js";

/**
 * REGRESSION — `classifyConfidence` was not resolver-aware.
 *
 * The colour and spacing hooks look candidates up in the flat `TokenMap`
 * (`loaders/tokens.ts`: Tailwind v3/v4, `*.tokens.json`, value-type tokens).
 * CSS custom properties are NOT one of those loaders — they only reach the
 * DESIGN SYSTEM GRAPH, which is what the resolver reads. So on a repo whose
 * only token source is `:root { --… }`, the resolver answers `exact` and the
 * rule emits `high`, while the hook finds nothing in the empty flat map,
 * answers `low`, and `populateConfidence`'s most-conservative-wins composition
 * demotes the finding to `low`.
 *
 * Severity and score were always correct; only `confidence` was understated —
 * which is what drives the CLI's `EXP` tag and its experimental counter.
 */
function makeRepo(): string {
  const root = mkdtempSync(join(tmpdir(), "lyse-conf-"));
  mkdirSync(join(root, "src"), { recursive: true });
  writeFileSync(join(root, "package.json"), JSON.stringify({ name: "fx-conf", version: "1.0.0" }));
  // Token source is CSS custom properties ONLY — no tailwind config, no
  // *.tokens.json — so `loadTokens` finds nothing and the graph finds both.
  writeFileSync(
    join(root, "src", "tokens.css"),
    ":root { --color-brand: #3b82f6; --space-sm: 8px; --space-lg: 32px; }\n",
  );
  writeFileSync(join(root, "src", "x.css"), ".a { color: #3b82f6; }\n.b { margin: 17px; }\n");
  return root;
}

async function confidences(root: string): Promise<Map<string, string | undefined>> {
  const pipeline = await auditDirectory(root);
  const ctx = buildClassifyContext(
    pipeline.result.findings,
    pipeline.tokens,
    pipeline.config,
    root,
    pipeline.resolver,
  );
  const result = populateConfidence(pipeline.result, ctx);
  const out = new Map<string, string | undefined>();
  for (const f of result.findings) out.set(f.ruleId, f.confidence);
  return out;
}

describe("classifyConfidence is resolver-aware", () => {
  it("keeps a resolver `exact` colour at high when the flat TokenMap is empty", async () => {
    const root = makeRepo();
    try {
      const byRule = await confidences(root);
      expect(byRule.get("tokens/no-hardcoded-color")).toBe("high");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("keeps a resolver `near` spacing at medium when the flat TokenMap is empty", async () => {
    const root = makeRepo();
    try {
      const byRule = await confidences(root);
      expect(byRule.get("tokens/no-hardcoded-spacing")).toBe("medium");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

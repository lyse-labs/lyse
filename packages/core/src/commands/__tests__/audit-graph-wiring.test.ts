import { describe, it, expect, afterEach, vi } from "vitest";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { auditDirectory } from "../audit-pipeline.js";
import { renderJson } from "../../reporters/json.js";
import { ruleMap } from "../../rules/registry.js";
import type { RuleContext } from "../../types.js";

// fixtures/full-ds is at packages/core/fixtures/full-ds; this file lives at
// packages/core/src/commands/__tests__/, three levels down.
const FULL_DS = join(import.meta.dirname, "..", "..", "..", "fixtures", "full-ds");

describe("audit pipeline graph wiring", () => {
  it("attaches meta.extraction and returns a graph", async () => {
    const root = mkdtempSync(join(tmpdir(), "lyse-wire-"));
    writeFileSync(join(root, "a.tokens.json"), JSON.stringify({ color: { p: { $value: "#3b82f6", $type: "color" } } }));
    const { result, graph } = await auditDirectory(root, { staticOnly: true });
    expect(graph.schemaVersion).toBe(1);
    expect(result.meta?.extraction?.entries.some((e) => e.extractor === "tokens")).toBe(true);
    expect(graph.tokens.some((t) => t.rawValue === "#3b82f6")).toBe(true);
  });

  it("seeds inventory from story titles when no module is configured (Appendix-A flip)", async () => {
    const root = mkdtempSync(join(tmpdir(), "lyse-wire2-"));
    writeFileSync(join(root, "Button.stories.tsx"),
      `export default { title: "Button" };\nexport const Primary = { args: { variant: "primary" } };`);
    // Pin v2: this asserts the stories axis ACTIVATES once inventory is seeded
    // from story titles. Under the default v3 model a single-story fixture is
    // below min-N=30 → N/A (a sample-size artifact, not a wiring failure). The
    // inventory assertion is model-independent; v2 keeps "axis active" valid.
    const { result, componentInventory } = await auditDirectory(root, {
      staticOnly: true,
      scoreModel: "v2",
    });
    expect(componentInventory.some((c) => c.name === "Button")).toBe(true);
    const stories = result.axes.find((a) => a.axis === "stories");
    expect(stories?.score).not.toBe("N/A");
  });
});

// Task 4 closed a review gap: the only prior tests for the resolver
// (src/graph/resolve/wiring.test.ts) called createResolver() directly on a
// hand-built graph and never exercised auditDirectory. These tests run the
// REAL pipeline against fixtures/full-ds so a future edit that silently drops
// `resolver,` or `abstentions:` from audit-pipeline.ts fails the suite.
describe("audit pipeline resolver wiring (Task 4)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("populates result.meta.abstentions with a number from a real audit", async () => {
    const { result } = await auditDirectory(FULL_DS, { staticOnly: true });
    expect(typeof result.meta?.abstentions).toBe("number");
  });

  it("hands a working ctx.resolver to rules during the real pipeline run", async () => {
    // Spy on an always-active, built-in rule's `evaluate` to observe the exact
    // RuleContext the pipeline constructs — without exporting any new
    // internals from audit-pipeline.ts. The spy delegates to the original
    // implementation so the rest of the pipeline behaves exactly as it would
    // in production.
    const rule = ruleMap.get("tokens/no-hardcoded-color");
    if (!rule) {
      throw new Error("expected tokens/no-hardcoded-color to be registered — pick another always-active rule id if this fails");
    }
    const original = rule.evaluate.bind(rule);
    let capturedResolver: RuleContext["resolver"];
    const spy = vi.spyOn(rule, "evaluate").mockImplementation(async (ctx, parsedFiles) => {
      capturedResolver = ctx.resolver;
      return original(ctx, parsedFiles);
    });

    await auditDirectory(FULL_DS, { staticOnly: true });

    expect(spy).toHaveBeenCalled();
    expect(capturedResolver).toBeDefined();
    expect(typeof capturedResolver?.resolve).toBe("function");
    expect(typeof capturedResolver?.abstentions).toBe("function");
  });

  it("survives renderJson on the default (non --include-timestamps) render path", async () => {
    // json.ts:24 unconditionally `delete cloned.meta.layer4` on this path —
    // exactly why abstentions lives on top-level meta, not under Layer4Meta.
    // A future refactor that nests it under layer4 must fail here, not
    // silently ship a stripped field.
    const { result } = await auditDirectory(FULL_DS, { staticOnly: true });
    const rendered = JSON.parse(renderJson(result)) as {
      meta?: { abstentions?: number; layer4?: unknown };
    };
    expect(typeof rendered.meta?.abstentions).toBe("number");
    expect(rendered.meta?.layer4).toBeUndefined();
  });
});

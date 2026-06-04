import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { rule, _internal } from "../../src/rules/ai-surface-component-manifest-json.js";
import type { RuleContext, ParsedFiles } from "../../src/types.js";

const emptyParsed: ParsedFiles = { ts: [], css: [], cssInJs: [] };

function makeCtx(repoRoot: string): RuleContext {
  return {
    repoRoot,
    tokens: null,
    componentsModule: null,
    componentInventory: [],
    storyIndex: null,
    excludePaths: [],
  };
}

let tmp: string;

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), "lyse-manifest-"));
});

afterEach(() => {
  rmSync(tmp, { recursive: true, force: true });
});

describe("rule ai-surface/component-manifest-json", () => {
  it("emits a single info finding when no manifest is found", async () => {
    const result = await rule.evaluate(makeCtx(tmp), emptyParsed);
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]?.severity).toBe("info");
    expect(result.findings[0]?.axis).toBe("ai-surface");
    expect(result.findings[0]?.message).toContain("No component manifest");
    expect(result.opportunities).toBe(1);
  });

  it("emits 0 findings on a well-formed lyse.components.json (array form)", async () => {
    writeFileSync(
      join(tmp, "lyse.components.json"),
      JSON.stringify({
        components: [
          { name: "Button", sourceFile: "packages/ui/src/button.tsx" },
          { name: "Card", sourceFile: "packages/ui/src/card.tsx" },
        ],
      }),
    );
    const result = await rule.evaluate(makeCtx(tmp), emptyParsed);
    expect(result.findings).toHaveLength(0);
    expect(result.opportunities).toBe(1);
  });

  it("emits 0 findings on a well-formed components.json (object form)", async () => {
    writeFileSync(
      join(tmp, "components.json"),
      JSON.stringify({
        components: {
          Button: { sourceFile: "packages/ui/src/button.tsx" },
          Card: { import: "@acme/ui" },
        },
      }),
    );
    const result = await rule.evaluate(makeCtx(tmp), emptyParsed);
    expect(result.findings).toHaveLength(0);
  });

  it("treats shadcn/ui-style components.json as not a lyse manifest and emits info", async () => {
    writeFileSync(
      join(tmp, "components.json"),
      JSON.stringify({
        $schema: "https://ui.shadcn.com/schema.json",
        style: "default",
        tailwind: { config: "tailwind.config.ts" },
        aliases: { components: "@/components" },
      }),
    );
    const result = await rule.evaluate(makeCtx(tmp), emptyParsed);
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]?.severity).toBe("info");
    expect(result.findings[0]?.suggestion).toContain("shadcn");
  });

  it("emits a warning for malformed JSON", async () => {
    writeFileSync(join(tmp, "components.json"), "{ not json");
    const result = await rule.evaluate(makeCtx(tmp), emptyParsed);
    const warnings = result.findings.filter((f) => f.severity === "warning");
    expect(warnings.length).toBeGreaterThanOrEqual(1);
    expect(warnings[0]?.message).toContain("not valid JSON");
  });

  it("emits a warning for missing `components` field", async () => {
    writeFileSync(join(tmp, "components.json"), JSON.stringify({ stuff: [] }));
    const result = await rule.evaluate(makeCtx(tmp), emptyParsed);
    expect(result.findings.some((f) => f.message.includes("`components`"))).toBe(true);
  });

  it("emits a warning for entries missing name or sourceFile", async () => {
    writeFileSync(
      join(tmp, "lyse.components.json"),
      JSON.stringify({
        components: [
          { name: "Button" },
          { sourceFile: "x.tsx" },
        ],
      }),
    );
    const result = await rule.evaluate(makeCtx(tmp), emptyParsed);
    const warnings = result.findings.filter((f) => f.severity === "warning");
    expect(warnings.length).toBeGreaterThanOrEqual(2);
  });

  it("discovers monorepo manifests in apps/*/components.json", async () => {
    mkdirSync(join(tmp, "apps", "web"), { recursive: true });
    writeFileSync(
      join(tmp, "apps/web/components.json"),
      JSON.stringify({
        components: [{ name: "Hero", sourceFile: "./hero.tsx" }],
      }),
    );
    const result = await rule.evaluate(makeCtx(tmp), emptyParsed);
    expect(result.findings).toHaveLength(0);
    expect(result.opportunities).toBe(1);
  });

  it("does not emit when repoRoot is missing", async () => {
    const ctx: RuleContext = { ...makeCtx(tmp), repoRoot: "" };
    const result = await rule.evaluate(ctx, emptyParsed);
    expect(result.findings).toHaveLength(0);
    expect(result.opportunities).toBe(0);
  });
});

describe("_internal helpers", () => {
  it("isShadcnComponentsJson detects shadcn config", () => {
    expect(_internal.isShadcnComponentsJson({ $schema: "https://ui.shadcn.com/schema.json" })).toBe(true);
    expect(_internal.isShadcnComponentsJson({ aliases: { components: "@/x" } })).toBe(true);
    expect(_internal.isShadcnComponentsJson({ components: [] })).toBe(false);
    expect(_internal.isShadcnComponentsJson(null)).toBe(false);
  });

  it("validateEntry returns ok for { name, sourceFile }", () => {
    expect(_internal.validateEntry({ name: "Button", sourceFile: "x.tsx" }).ok).toBe(true);
    expect(_internal.validateEntry({ name: "Button", import: "@acme/ui" }).ok).toBe(true);
    expect(_internal.validateEntry({ name: "Button" }).ok).toBe(false);
    expect(_internal.validateEntry({ sourceFile: "x.tsx" }).ok).toBe(false);
    expect(_internal.validateEntry("string-entry").ok).toBe(true);
  });
});

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { rule } from "../../src/rules/ai-surface-component-manifest-completeness.js";
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
  tmp = mkdtempSync(join(tmpdir(), "lyse-manifest-completeness-"));
});

afterEach(() => {
  rmSync(tmp, { recursive: true, force: true });
});

describe("ai-surface/component-manifest-completeness", () => {
  it("flags a component entry missing props", async () => {
    const manifest = JSON.stringify({
      components: [{ name: "Button", sourceFile: "Button.tsx" }],
    });
    writeFileSync(join(tmp, "components.json"), manifest);
    const res = await rule.evaluate(makeCtx(tmp), emptyParsed);
    expect(res.findings.some((f) => f.message.includes("Button") && /props/i.test(f.message))).toBe(true);
    expect(res.findings.every((f) => f.ruleId === "ai-surface/component-manifest-completeness")).toBe(true);
    expect(res.findings.every((f) => f.axis === "ai-surface")).toBe(true);
  });

  it("flags a component entry with empty props array", async () => {
    const manifest = JSON.stringify({
      components: [{ name: "Card", sourceFile: "Card.tsx", props: [] }],
    });
    writeFileSync(join(tmp, "components.json"), manifest);
    const res = await rule.evaluate(makeCtx(tmp), emptyParsed);
    expect(res.findings.some((f) => f.message.includes("Card") && /props/i.test(f.message))).toBe(true);
  });

  it("flags a component entry with empty variants array (present-but-empty)", async () => {
    const manifest = JSON.stringify({
      components: [{
        name: "Tag",
        sourceFile: "Tag.tsx",
        props: [{ name: "label" }],
        variants: [],
        examples: ["<Tag label=\"x\" />"],
      }],
    });
    writeFileSync(join(tmp, "components.json"), manifest);
    const res = await rule.evaluate(makeCtx(tmp), emptyParsed);
    expect(res.findings.some((f) => f.message.includes("Tag") && /variants/i.test(f.message))).toBe(true);
    // props and examples are present — should not flag those
    expect(res.findings.some((f) => f.message.includes("Tag") && /props/i.test(f.message))).toBe(false);
    expect(res.findings.some((f) => f.message.includes("Tag") && /examples/i.test(f.message))).toBe(false);
  });

  it("does not flag a complete entry", async () => {
    const manifest = JSON.stringify({
      components: [{
        name: "Button",
        sourceFile: "Button.tsx",
        props: [{ name: "variant" }],
        variants: ["primary"],
        examples: ["<Button/>"],
      }],
    });
    writeFileSync(join(tmp, "components.json"), manifest);
    const res = await rule.evaluate(makeCtx(tmp), emptyParsed);
    expect(res.findings).toHaveLength(0);
    expect(res.opportunities).toBe(1);
  });

  it("does not flag an entry without variants key (absent variants is fine)", async () => {
    const manifest = JSON.stringify({
      components: [{
        name: "Link",
        sourceFile: "Link.tsx",
        props: [{ name: "href" }],
        examples: ["<Link href=\"/\">Home</Link>"],
      }],
    });
    writeFileSync(join(tmp, "components.json"), manifest);
    const res = await rule.evaluate(makeCtx(tmp), emptyParsed);
    expect(res.findings).toHaveLength(0);
  });

  it("is silent when no manifest exists (manifest-json owns absence)", async () => {
    const res = await rule.evaluate(makeCtx(tmp), emptyParsed);
    expect(res.findings).toHaveLength(0);
    expect(res.opportunities).toBe(0);
  });

  it("is silent when repoRoot is empty", async () => {
    const ctx: RuleContext = { ...makeCtx(tmp), repoRoot: "" };
    const res = await rule.evaluate(ctx, emptyParsed);
    expect(res.findings).toHaveLength(0);
    expect(res.opportunities).toBe(0);
  });

  it("reports opportunities = number of entries inspected", async () => {
    const manifest = JSON.stringify({
      components: [
        { name: "A", sourceFile: "a.tsx", props: [{ name: "x" }], examples: ["<A/>"] },
        { name: "B", sourceFile: "b.tsx" }, // missing props + examples
      ],
    });
    writeFileSync(join(tmp, "lyse.components.json"), manifest);
    const res = await rule.evaluate(makeCtx(tmp), emptyParsed);
    expect(res.opportunities).toBe(2);
  });

  it("skips shadcn-style components.json (no findings, 0 opportunities)", async () => {
    const shadcn = JSON.stringify({
      $schema: "https://ui.shadcn.com/schema.json",
      aliases: { components: "@/components" },
    });
    writeFileSync(join(tmp, "components.json"), shadcn);
    const res = await rule.evaluate(makeCtx(tmp), emptyParsed);
    expect(res.findings).toHaveLength(0);
    expect(res.opportunities).toBe(0);
  });
});

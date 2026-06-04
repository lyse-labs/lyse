import { describe, it, expect } from "vitest";
import { rule } from "../../src/rules/components-shadow-native.js";
import type { RuleContext, ParsedFiles } from "../../src/types.js";

const ctx: RuleContext = {
  repoRoot: "/r",
  tokens: null,
  componentsModule: "@acme/ui",
  componentInventory: [{ name: "Button", module: "@acme/ui", usageCount: 47 }],
  storyIndex: null,
  excludePaths: ["packages/design-system/**"],
};

describe("rule components/no-native-shadows", () => {
  it("flags <button> when file imports from componentsModule", async () => {
    const parsed: ParsedFiles = {
      ts: [{
        path: "src/Page.tsx",
        source: 'import { Card } from "@acme/ui";\nexport default () => (<button>x</button>);',
        imports: [{ module: "@acme/ui", named: ["Card"], default: null, line: 1 }],
        ast: null,
      }],
      css: [], cssInJs: [],
    };
    const result = await rule.evaluate(ctx, parsed);
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0].message).toContain("Button");
  });

  it("does NOT flag <button> when file does not import from DS module", async () => {
    const parsed: ParsedFiles = {
      ts: [{ path: "x.tsx", source: "<button>x</button>", imports: [], ast: null }],
      css: [], cssInJs: [],
    };
    const result = await rule.evaluate(ctx, parsed);
    expect(result.findings).toHaveLength(0);
  });

  it("does NOT flag polymorphic <Box as=\"button\">", async () => {
    const parsed: ParsedFiles = {
      ts: [{
        path: "x.tsx",
        source: 'import { Box } from "@acme/ui";\n<Box as="button">x</Box>',
        imports: [{ module: "@acme/ui", named: ["Box"], default: null, line: 1 }],
        ast: null,
      }],
      css: [], cssInJs: [],
    };
    const result = await rule.evaluate(ctx, parsed);
    expect(result.findings).toHaveLength(0);
  });

  it("respects excludePaths", async () => {
    const parsed: ParsedFiles = {
      ts: [{
        path: "packages/design-system/Button/internal.tsx",
        source: 'import { x } from "@acme/ui";\n<button />',
        imports: [{ module: "@acme/ui", named: ["x"], default: null, line: 1 }],
        ast: null,
      }],
      css: [], cssInJs: [],
    };
    const result = await rule.evaluate(ctx, parsed);
    expect(result.findings).toHaveLength(0);
  });
});

describe("components/no-native-shadows in DS-self mode", () => {
  it("returns 0 opportunities and no findings when dsSelfMode is true", async () => {
    // A DS repo's own Button implementation uses <button> natively — that's its job.
    // The rule must skip entirely to avoid false positives.
    const dsSelfCtx: RuleContext = { ...ctx, dsSelfMode: true };
    const parsed: ParsedFiles = {
      ts: [{
        path: "packages/react/src/Button/Button.tsx",
        source: 'import { x } from "@acme/ui";\nexport const Button = () => <button>click</button>;',
        imports: [{ module: "@acme/ui", named: ["x"], default: null, line: 1 }],
        ast: null,
      }],
      css: [], cssInJs: [],
    };
    const result = await rule.evaluate(dsSelfCtx, parsed);
    expect(result.opportunities).toBe(0);
    expect(result.findings).toEqual([]);
  });

  it("non-dsSelfMode still flags <button> as normal", async () => {
    const parsed: ParsedFiles = {
      ts: [{
        path: "src/Page.tsx",
        source: 'import { Card } from "@acme/ui";\nexport default () => <button>x</button>;',
        imports: [{ module: "@acme/ui", named: ["Card"], default: null, line: 1 }],
        ast: null,
      }],
      css: [], cssInJs: [],
    };
    const result = await rule.evaluate({ ...ctx, dsSelfMode: false }, parsed);
    expect(result.findings).toHaveLength(1);
  });
});

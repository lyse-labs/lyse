import { describe, it, expect } from "vitest";
import { rule, countCompliantSpacingUses } from "../../src/rules/tokens-no-hardcoded-spacing.js";
import { isSchemaOrDataFile, isLowSignalValueFile, isInExampleOrSchemaValuePosition } from "../../src/rules/_skip-context.js";
import type { RuleContext, ParsedFiles, TokenMap } from "../../src/types.js";

const tokens: TokenMap = {
  colors: new Map(),
  spacing: new Map([
    ["4", ["spacing/1"]], ["8", ["spacing/2"]], ["16", ["spacing/4"]], ["24", ["spacing/6"]],
  ]),
  typography: new Map(),
  radii: new Map(),
  shadows: new Map(),
  motion: new Map(),
  breakpoints: new Map(),
  zIndex: new Map(),
  opacity: new Map(),
  borderWidth: new Map(),
  source: "tailwind-v3",
};
const ctx: RuleContext = {
  repoRoot: "/r", tokens, componentsModule: null, componentInventory: [], storyIndex: null, excludePaths: [],
};

describe("rule tokens/no-hardcoded-spacing", () => {
  it("flags off-scale px values in CSS", async () => {
    const parsed: ParsedFiles = {
      ts: [], css: [{ path: "a.css", source: ".x { padding: 7px; margin: 8px; }", root: null }], cssInJs: [],
    };
    const result = await rule.evaluate(ctx, parsed);
    // 7px is off-scale (we only have 4/8/16/24), 8px is on-scale
    expect(result.findings.map((f) => f.message)).toContain("Off-scale spacing: 7px");
    expect(result.findings.find((f) => f.message.includes("8px"))).toBeUndefined();
  });

  it("allowlists 0, auto, 100%, 1px (border)", async () => {
    const parsed: ParsedFiles = {
      ts: [], css: [{ path: "a.css", source: ".x { padding: 0; width: 100%; border: 1px solid; height: auto; }", root: null }], cssInJs: [],
    };
    const result = await rule.evaluate(ctx, parsed);
    expect(result.findings).toHaveLength(0);
  });
});

describe("FP triage W4-1 — JSX sizes/srcSet skip", () => {
  it("does NOT flag px values inside sizes= attribute", async () => {
    const parsed: ParsedFiles = {
      ts: [{
        path: "Img.tsx",
        source: 'export default () => <img sizes="(min-width: 1024px) 25vw, 100vw" src="x.jpg" />;',
        imports: [], ast: null,
      }],
      css: [], cssInJs: [],
    };
    const result = await rule.evaluate(ctx, parsed);
    expect(result.findings).toHaveLength(0);
  });

  it("does NOT flag values inside srcSet= attribute", async () => {
    const parsed: ParsedFiles = {
      ts: [{
        path: "Img.tsx",
        source: 'export default () => <img srcSet="x-1x.jpg 1x, x-300px.jpg 300px" src="x.jpg" />;',
        imports: [], ast: null,
      }],
      css: [], cssInJs: [],
    };
    const result = await rule.evaluate(ctx, parsed);
    expect(result.findings).toHaveLength(0);
  });

  it("does NOT flag values inside srcset= attribute (lowercase)", async () => {
    const parsed: ParsedFiles = {
      ts: [{
        path: "Img.tsx",
        source: 'export default () => <img srcset="x-768px.jpg 768w" src="x.jpg" />;',
        imports: [], ast: null,
      }],
      css: [], cssInJs: [],
    };
    const result = await rule.evaluate(ctx, parsed);
    expect(result.findings).toHaveLength(0);
  });

  it("STILL flags px values outside sizes=/srcSet=", async () => {
    const parsed: ParsedFiles = {
      ts: [{
        path: "Box.tsx",
        source: 'export default () => <div style={{ padding: "13px" }} sizes="100vw" />;',
        imports: [], ast: null,
      }],
      css: [], cssInJs: [],
    };
    const result = await rule.evaluate(ctx, parsed);
    // 13px in padding should fire; sizes content is skipped
    expect(result.findings.some((f) => f.message.includes("13px"))).toBe(true);
  });

  it("does NOT flag spacing values inside <code>...</code> on the same line", async () => {
    const parsed: ParsedFiles = {
      ts: [{
        path: "Doc.tsx",
        source: 'export default () => <p>Set: <code>padding: 13px;</code></p>;',
        imports: [], ast: null,
      }],
      css: [], cssInJs: [],
    };
    const result = await rule.evaluate(ctx, parsed);
    expect(result.findings).toHaveLength(0);
  });
});

describe("tokens/no-hardcoded-spacing respects excludePaths", () => {
  it("skips files matched by ctx.excludePaths", async () => {
    const ctxWithExclude: RuleContext = {
      repoRoot: "/r",
      tokens,
      componentsModule: null,
      componentInventory: [],
      storyIndex: null,
      excludePaths: ["examples/**"],
    };
    const parsed: ParsedFiles = {
      ts: [],
      css: [
        { path: "examples/demo.css", source: ".x { padding: 7px; }", root: null },
        { path: "src/comp.css", source: ".x { padding: 7px; }", root: null },
      ],
      cssInJs: [],
    };
    const result = await rule.evaluate(ctxWithExclude, parsed);
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0].location.file).toBe("src/comp.css");
  });
});

describe("Tailwind spacing class compliance", () => {
  it("counts p-4 as compliant spacing usage in tsx", () => {
    const code = `<div className="p-4 m-2 gap-8" />`;
    expect(countCompliantSpacingUses(code, ".tsx")).toBe(3);
  });

  it("counts various spacing utilities in jsx", () => {
    const code = `<div className="px-4 py-2 mt-6 mb-8 w-full h-screen gap-4" />`;
    // px-4, py-2, mt-6, mb-8, w-full, h-screen, gap-4
    expect(countCompliantSpacingUses(code, ".jsx")).toBe(7);
  });

  it("does NOT count spacing utilities in .css files", () => {
    const code = `<div className="p-4 m-2" />`;
    expect(countCompliantSpacingUses(code, ".css")).toBe(0);
  });

  it("does NOT count arbitrary spacing values like p-[13px]", () => {
    const code = `<div className="p-[13px]" />`;
    expect(countCompliantSpacingUses(code, ".tsx")).toBe(0);
  });

  it("counts space-x and space-y utilities", () => {
    const code = `<div className="space-x-4 space-y-2" />`;
    expect(countCompliantSpacingUses(code, ".tsx")).toBe(2);
  });

  it("counts inset and positional utilities", () => {
    const code = `<div className="inset-0 top-4 right-2 bottom-0 left-4" />`;
    expect(countCompliantSpacingUses(code, ".tsx")).toBe(5);
  });

  it("counts Tailwind spacing as opportunities in rule evaluate", async () => {
    const parsed: ParsedFiles = {
      ts: [{
        path: "src/Card.tsx",
        source: `<div className="p-4 m-2 gap-8" />`,
        imports: [],
        ast: null,
      }],
      css: [],
      cssInJs: [],
    };
    const result = await rule.evaluate(ctx, parsed);
    // p-4, m-2, gap-8 = 3 compliant spacing usages, 0 findings
    expect(result.opportunities).toBeGreaterThanOrEqual(3);
    expect(result.findings).toHaveLength(0);
  });

  it("does not flag a px value on the RHS of a CSS custom-property declaration", async () => {
    const parsed: ParsedFiles = {
      ts: [],
      css: [{
        path: "src/tokens.css",
        source: ":root { --space-md: 16px; }",
        root: null,
      }],
      cssInJs: [],
    };
    const result = await rule.evaluate(ctx, parsed);
    expect(result.findings).toHaveLength(0);
  });

  it("does not flag values inside Tailwind @theme {} spacing block", async () => {
    const parsed: ParsedFiles = {
      ts: [],
      css: [{
        path: "src/globals.css",
        source: "@theme { --space-md: 16px; --space-lg: 24px; }",
        root: null,
      }],
      cssInJs: [],
    };
    const result = await rule.evaluate(ctx, parsed);
    expect(result.findings).toHaveLength(0);
  });

  it("flags a plain px in a regular declaration but not the sibling custom-property definition", async () => {
    const parsed: ParsedFiles = {
      ts: [],
      css: [{
        path: "src/mixed.css",
        source: ":root { --space-md: 13px; } .card { padding: 13px; }",
        root: null,
      }],
      cssInJs: [],
    };
    const result = await rule.evaluate(ctx, parsed);
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0].message).toContain("13px");
  });
});

// ---------------------------------------------------------------------------
// Guard A — spacing: Low-signal value files (test/spec/stories/fixtures)
// ---------------------------------------------------------------------------
describe("Guard A (spacing) — isLowSignalValueFile path helper", () => {
  it("identifies .test.tsx as low-signal", () => {
    expect(isLowSignalValueFile("src/Button.test.tsx")).toBe(true);
  });
  it("identifies .spec.ts as low-signal", () => {
    expect(isLowSignalValueFile("src/utils.spec.ts")).toBe(true);
  });
  it("identifies .stories.tsx as low-signal", () => {
    expect(isLowSignalValueFile("src/Button.stories.tsx")).toBe(true);
  });
  it("identifies __tests__/ path as low-signal", () => {
    expect(isLowSignalValueFile("src/__tests__/Button.ts")).toBe(true);
  });
  it("does NOT mark a regular component as low-signal", () => {
    expect(isLowSignalValueFile("src/Button.tsx")).toBe(false);
  });
});

describe("Guard A (spacing) — rule: does NOT flag hardcoded spacing in test/story/fixture files", () => {
  it("does NOT flag off-scale px in a .test.tsx file", async () => {
    const parsed: ParsedFiles = {
      ts: [{
        path: "src/Button.test.tsx",
        source: 'expect(el.style.padding).toBe("13px");',
        imports: [], ast: null,
      }],
      css: [], cssInJs: [],
    };
    const result = await rule.evaluate(ctx, parsed);
    expect(result.findings).toHaveLength(0);
  });

  it("does NOT flag off-scale px in a .stories.tsx file", async () => {
    const parsed: ParsedFiles = {
      ts: [{
        path: "src/Button.stories.tsx",
        source: 'export const Primary = () => <Button style={{ padding: "13px" }} />;',
        imports: [], ast: null,
      }],
      css: [], cssInJs: [],
    };
    const result = await rule.evaluate(ctx, parsed);
    expect(result.findings).toHaveLength(0);
  });

  it("does NOT flag off-scale px in a fixtures/ file", async () => {
    const parsed: ParsedFiles = {
      ts: [{
        path: "tests/fixtures/comp.tsx",
        source: '<div style={{ padding: "13px" }} />',
        imports: [], ast: null,
      }],
      css: [], cssInJs: [],
    };
    const result = await rule.evaluate(ctx, parsed);
    expect(result.findings).toHaveLength(0);
  });

  it("STILL flags off-scale spacing in a real component (recall guard)", async () => {
    const parsed: ParsedFiles = {
      ts: [{
        path: "src/Button.tsx",
        source: 'export const Button = () => <div style={{ padding: "13px" }} />;',
        imports: [], ast: null,
      }],
      css: [], cssInJs: [],
    };
    const result = await rule.evaluate(ctx, parsed);
    expect(result.findings.some((f) => f.message.includes("13px"))).toBe(true);
  });

  it("STILL flags off-scale spacing in a .css file (recall guard)", async () => {
    const parsed: ParsedFiles = {
      ts: [], css: [{ path: "src/comp.css", source: ".x { padding: 13px; }", root: null }], cssInJs: [],
    };
    const result = await rule.evaluate(ctx, parsed);
    expect(result.findings).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// Guard B (spacing): Schema/data/config/type-decl file roles
// ---------------------------------------------------------------------------
describe("Guard B (spacing) — isSchemaOrDataFile path helper", () => {
  it("identifies .dto.ts suffix", () => {
    expect(isSchemaOrDataFile("src/create-user.dto.ts")).toBe(true);
  });
  it("identifies .config.ts suffix", () => {
    expect(isSchemaOrDataFile("theme.config.ts")).toBe(true);
  });
  it("does NOT mark a real component as schema/data", () => {
    expect(isSchemaOrDataFile("src/Button.tsx")).toBe(false);
  });
});

describe("Guard B (spacing) — rule: does NOT flag hardcoded spacing in schema/data/config files", () => {
  it("does NOT flag off-scale px in a .dto.ts file", async () => {
    const parsed: ParsedFiles = {
      ts: [{
        path: "src/dto/layout.dto.ts",
        source: 'const schema = { example: "13px", type: "string" };',
        imports: [], ast: null,
      }],
      css: [], cssInJs: [],
    };
    const result = await rule.evaluate(ctx, parsed);
    expect(result.findings).toHaveLength(0);
  });

  it("does NOT flag off-scale px in a .config.ts file", async () => {
    const parsed: ParsedFiles = {
      ts: [{
        path: "tailwind.config.ts",
        source: 'const config = { spacing: { custom: "13px" } };',
        imports: [], ast: null,
      }],
      css: [], cssInJs: [],
    };
    const result = await rule.evaluate(ctx, parsed);
    expect(result.findings).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Guard C (spacing): example:/default: key values and JSDoc @example blocks
// ---------------------------------------------------------------------------
describe("Guard C (spacing) — isInExampleOrSchemaValuePosition helper (shared with color)", () => {
  it("returns true for value of `example:` key", () => {
    const src = '{ example: "13px" }';
    const idx = src.indexOf("13px");
    expect(isInExampleOrSchemaValuePosition(src, idx)).toBe(true);
  });
  it("returns false for a real style property value", () => {
    const src = '{ padding: "13px" }';
    const idx = src.indexOf("13px");
    expect(isInExampleOrSchemaValuePosition(src, idx)).toBe(false);
  });
  it("returns true for spacing value inside a JSDoc @example block", () => {
    const src = `/**\n * @example\n * padding: 13px\n */`;
    const idx = src.indexOf("13px");
    expect(isInExampleOrSchemaValuePosition(src, idx)).toBe(true);
  });
});

describe("Guard C (spacing) — rule: does NOT flag example/default key values or JSDoc @example", () => {
  it("does NOT flag `{ example: '13px' }` in TS source", async () => {
    const parsed: ParsedFiles = {
      ts: [{
        path: "src/api.ts",
        source: 'const schema = { example: "13px", required: true };',
        imports: [], ast: null,
      }],
      css: [], cssInJs: [],
    };
    const result = await rule.evaluate(ctx, parsed);
    expect(result.findings).toHaveLength(0);
  });

  it("does NOT flag spacing inside a JSDoc @example block", async () => {
    const parsed: ParsedFiles = {
      ts: [{
        path: "src/Spacer.tsx",
        source: "/**\n * @example\n * <Spacer size=\"13px\" />\n */\nexport function Spacer() {}",
        imports: [], ast: null,
      }],
      css: [], cssInJs: [],
    };
    const result = await rule.evaluate(ctx, parsed);
    expect(result.findings).toHaveLength(0);
  });

  it("STILL flags off-scale spacing in real component JSX (recall guard)", async () => {
    const parsed: ParsedFiles = {
      ts: [{
        path: "src/Button.tsx",
        source: 'export const Button = () => <div style={{ padding: "13px" }} />;',
        imports: [], ast: null,
      }],
      css: [], cssInJs: [],
    };
    const result = await rule.evaluate(ctx, parsed);
    expect(result.findings.some((f) => f.message.includes("13px"))).toBe(true);
  });
});

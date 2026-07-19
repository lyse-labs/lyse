import { describe, it, expect } from "vitest";
import { rule, countCompliantSpacingUses } from "../../src/rules/tokens-no-hardcoded-spacing.js";
import { isSchemaOrDataFile, isLowSignalValueFile, isInExampleOrSchemaValuePosition, isNotSpacingPropertyContext } from "../../src/rules/_skip-context.js";
import type { RuleContext, ParsedFiles, TokenMap } from "../../src/types.js";
import type { DesignSystemGraph, ZoneKind } from "../../src/graph/types.js";

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

describe("FP triage Phase B — zero with explicit units", () => {
  it("does NOT flag 0rem / 0em / 0.0rem (zero is zero regardless of unit)", async () => {
    const parsed: ParsedFiles = {
      ts: [],
      css: [{ path: "a.css", source: ".x { margin-top: 0rem; padding: 0em; gap: 0.0rem; }", root: null }],
      cssInJs: [],
    };
    const result = await rule.evaluate(ctx, parsed);
    expect(result.findings).toHaveLength(0);
  });

  it("does NOT flag a 0rem fallback inside var()", async () => {
    const parsed: ParsedFiles = {
      ts: [],
      css: [{ path: "a.css", source: ".x { top: var(--app-shell-header-offset, 0rem); }", root: null }],
      cssInJs: [],
    };
    const result = await rule.evaluate(ctx, parsed);
    expect(result.findings).toHaveLength(0);
  });
});

describe("FP triage Phase B — var() fallback is tokenized usage, not drift", () => {
  it("does NOT flag a hardcoded value in the var() fallback position", async () => {
    const parsed: ParsedFiles = {
      ts: [],
      css: [{ path: "a.css", source: ".x { padding: var(--base-size-16, 7px); gap: var(--base-size-8, 13px); }", root: null }],
      cssInJs: [],
    };
    const result = await rule.evaluate(ctx, parsed);
    expect(result.findings).toHaveLength(0);
  });

  it("still flags a hardcoded value OUTSIDE the var() (real drift alongside a token)", async () => {
    const parsed: ParsedFiles = {
      ts: [],
      css: [{ path: "a.css", source: ".x { padding: 7px var(--gap, 4px); }", root: null }],
      cssInJs: [],
    };
    const result = await rule.evaluate(ctx, parsed);
    expect(result.findings.map((f) => f.message)).toContain("Off-scale spacing: 7px");
    expect(result.findings.find((f) => f.message.includes("4px"))).toBeUndefined();
  });

  it("handles nested var() fallbacks", async () => {
    const parsed: ParsedFiles = {
      ts: [],
      css: [{ path: "a.css", source: ".x { margin: var(--a, var(--b, 7px)); }", root: null }],
      cssInJs: [],
    };
    const result = await rule.evaluate(ctx, parsed);
    expect(result.findings).toHaveLength(0);
  });
});

describe("FP triage Phase B — @container breakpoints and multi-line comments", () => {
  it("does NOT flag a dimension in an @container query prelude (breakpoint, not spacing)", async () => {
    const parsed: ParsedFiles = {
      ts: [],
      css: [{ path: "a.css", source: "@container (width <= 400px) {\n  .x { color: red; }\n}", root: null }],
      cssInJs: [],
    };
    const result = await rule.evaluate(ctx, parsed);
    expect(result.findings.find((f) => f.message.includes("400px"))).toBeUndefined();
  });

  it("does NOT flag a value inside a multi-line block comment", async () => {
    const parsed: ParsedFiles = {
      ts: [],
      css: [{ path: "a.css", source: ".x {\n  /* nudge\n     (-0.5px) to align with the border line. */\n  color: red;\n}", root: null }],
      cssInJs: [],
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

// ---------------------------------------------------------------------------
// Property-awareness: isNotSpacingPropertyContext helper
// ---------------------------------------------------------------------------
describe("isNotSpacingPropertyContext — unit tests", () => {
  it("returns false (do not skip) for padding: 13px", () => {
    const src = ".x { padding: 13px; }";
    const idx = src.indexOf("13px");
    expect(isNotSpacingPropertyContext(src, idx)).toBe(false);
  });

  it("returns false (do not skip) for margin-top: 30px", () => {
    const src = ".x { margin-top: 30px; }";
    const idx = src.indexOf("30px");
    expect(isNotSpacingPropertyContext(src, idx)).toBe(false);
  });

  it("returns false (do not skip) for gap: 7px", () => {
    const src = ".x { gap: 7px; }";
    const idx = src.indexOf("7px");
    expect(isNotSpacingPropertyContext(src, idx)).toBe(false);
  });

  it("returns true (skip) for font-size: 28px", () => {
    const src = ".x { font-size: 28px; }";
    const idx = src.indexOf("28px");
    expect(isNotSpacingPropertyContext(src, idx)).toBe(true);
  });

  it("returns true (skip) for line-height: 1rem", () => {
    const src = ".x { line-height: 1rem; }";
    const idx = src.indexOf("1rem");
    expect(isNotSpacingPropertyContext(src, idx)).toBe(true);
  });

  it("returns true (skip) for border-radius: 10px", () => {
    const src = ".x { border-radius: 10px; }";
    const idx = src.indexOf("10px");
    expect(isNotSpacingPropertyContext(src, idx)).toBe(true);
  });

  it("returns true (skip) for @media (max-width: 768px)", () => {
    const src = "@media (max-width: 768px) { .x {} }";
    const idx = src.indexOf("768px");
    expect(isNotSpacingPropertyContext(src, idx)).toBe(true);
  });

  it("returns true (skip) for translateX(40px)", () => {
    const src = ".x { transform: translateX(40px); }";
    const idx = src.indexOf("40px");
    expect(isNotSpacingPropertyContext(src, idx)).toBe(true);
  });

  it("returns true (skip) for translateY(8px)", () => {
    const src = ".x { transform: translateY(8px); }";
    const idx = src.indexOf("8px");
    expect(isNotSpacingPropertyContext(src, idx)).toBe(true);
  });

  it("returns true (skip) for Tailwind text-[28px]", () => {
    const src = 'className="text-[28px]"';
    const idx = src.indexOf("28px");
    expect(isNotSpacingPropertyContext(src, idx)).toBe(true);
  });

  it("returns true (skip) for Tailwind leading-[1.5rem]", () => {
    const src = 'className="leading-[1.5rem]"';
    const idx = src.indexOf("1.5rem");
    expect(isNotSpacingPropertyContext(src, idx)).toBe(true);
  });

  it("returns true (skip) for Tailwind rounded-[10px]", () => {
    const src = 'className="rounded-[10px]"';
    const idx = src.indexOf("10px");
    expect(isNotSpacingPropertyContext(src, idx)).toBe(true);
  });

  it("returns false (do not skip) for Tailwind p-[7px] (spacing prefix)", () => {
    const src = 'className="p-[7px]"';
    const idx = src.indexOf("7px");
    expect(isNotSpacingPropertyContext(src, idx)).toBe(false);
  });

  it("returns false (do not skip) for Tailwind gap-[7px] (spacing prefix)", () => {
    const src = 'className="gap-[7px]"';
    const idx = src.indexOf("7px");
    expect(isNotSpacingPropertyContext(src, idx)).toBe(false);
  });

  it("returns false (do not skip) for Tailwind mt-[30px] (spacing prefix)", () => {
    const src = 'className="mt-[30px]"';
    const idx = src.indexOf("30px");
    expect(isNotSpacingPropertyContext(src, idx)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Property-awareness: rule-level integration tests
// ---------------------------------------------------------------------------
describe("Property-awareness (spacing) — FP classes that must NOT fire", () => {
  it("does NOT flag font-size px in CSS (font-size is not spacing)", async () => {
    const parsed: ParsedFiles = {
      ts: [], css: [{ path: "a.css", source: ".x { font-size: 28px; }", root: null }], cssInJs: [],
    };
    const result = await rule.evaluate(ctx, parsed);
    expect(result.findings).toHaveLength(0);
  });

  it("does NOT flag line-height rem in CSS", async () => {
    const parsed: ParsedFiles = {
      ts: [], css: [{ path: "a.css", source: ".x { line-height: 1.5rem; }", root: null }], cssInJs: [],
    };
    const result = await rule.evaluate(ctx, parsed);
    expect(result.findings).toHaveLength(0);
  });

  it("does NOT flag border-radius px in CSS", async () => {
    const parsed: ParsedFiles = {
      ts: [], css: [{ path: "a.css", source: ".x { border-radius: 10px; }", root: null }], cssInJs: [],
    };
    const result = await rule.evaluate(ctx, parsed);
    expect(result.findings).toHaveLength(0);
  });

  it("does NOT flag @media (max-width: 768px) query value", async () => {
    const parsed: ParsedFiles = {
      ts: [], css: [{ path: "a.css", source: "@media (max-width: 768px) { .x { display: none; } }", root: null }], cssInJs: [],
    };
    const result = await rule.evaluate(ctx, parsed);
    expect(result.findings).toHaveLength(0);
  });

  it("does NOT flag matchMedia max-width in TSX", async () => {
    const parsed: ParsedFiles = {
      ts: [{
        path: "a.tsx",
        source: 'const isMobile = window.matchMedia("(max-width: 640px)").matches;',
        imports: [], ast: null,
      }],
      css: [], cssInJs: [],
    };
    const result = await rule.evaluate(ctx, parsed);
    expect(result.findings).toHaveLength(0);
  });

  it("does NOT flag translateX(40px) transform", async () => {
    const parsed: ParsedFiles = {
      ts: [], css: [{ path: "a.css", source: ".x { transform: translateX(40px); }", root: null }], cssInJs: [],
    };
    const result = await rule.evaluate(ctx, parsed);
    expect(result.findings).toHaveLength(0);
  });

  it("does NOT flag Tailwind text-[28px] (font-size prefix)", async () => {
    const parsed: ParsedFiles = {
      ts: [{
        path: "a.tsx",
        source: '<div className="text-[28px]" />',
        imports: [], ast: null,
      }],
      css: [], cssInJs: [],
    };
    const result = await rule.evaluate(ctx, parsed);
    expect(result.findings).toHaveLength(0);
  });

  it("does NOT flag Tailwind text-[11px]", async () => {
    const parsed: ParsedFiles = {
      ts: [{
        path: "a.tsx",
        source: '<div className="text-[11px]" />',
        imports: [], ast: null,
      }],
      css: [], cssInJs: [],
    };
    const result = await rule.evaluate(ctx, parsed);
    expect(result.findings).toHaveLength(0);
  });

  it("does NOT flag Tailwind leading-[1.5rem] (line-height prefix)", async () => {
    const parsed: ParsedFiles = {
      ts: [{
        path: "a.tsx",
        source: '<div className="leading-[1.5rem]" />',
        imports: [], ast: null,
      }],
      css: [], cssInJs: [],
    };
    const result = await rule.evaluate(ctx, parsed);
    expect(result.findings).toHaveLength(0);
  });

  it("does NOT flag Tailwind rounded-[10px] (border-radius prefix)", async () => {
    const parsed: ParsedFiles = {
      ts: [{
        path: "a.tsx",
        source: '<div className="rounded-[10px]" />',
        imports: [], ast: null,
      }],
      css: [], cssInJs: [],
    };
    const result = await rule.evaluate(ctx, parsed);
    expect(result.findings).toHaveLength(0);
  });

  it("does NOT flag font-size: 1rem in CSS (font-size is not spacing)", async () => {
    const parsed: ParsedFiles = {
      ts: [], css: [{ path: "a.css", source: "p { font-size: 1rem; }", root: null }], cssInJs: [],
    };
    const result = await rule.evaluate(ctx, parsed);
    expect(result.findings).toHaveLength(0);
  });
});

describe("Property-awareness (spacing) — real spacing violations that MUST still fire", () => {
  it("STILL flags padding: 13px in CSS", async () => {
    const parsed: ParsedFiles = {
      ts: [], css: [{ path: "a.css", source: ".x { padding: 13px; }", root: null }], cssInJs: [],
    };
    const result = await rule.evaluate(ctx, parsed);
    expect(result.findings.some((f) => f.message.includes("13px"))).toBe(true);
  });

  it("STILL flags gap: 7px in CSS", async () => {
    const parsed: ParsedFiles = {
      ts: [], css: [{ path: "a.css", source: ".x { gap: 7px; }", root: null }], cssInJs: [],
    };
    const result = await rule.evaluate(ctx, parsed);
    expect(result.findings.some((f) => f.message.includes("7px"))).toBe(true);
  });

  it("STILL flags margin-top: 30px in CSS", async () => {
    const parsed: ParsedFiles = {
      ts: [], css: [{ path: "a.css", source: ".x { margin-top: 30px; }", root: null }], cssInJs: [],
    };
    const result = await rule.evaluate(ctx, parsed);
    expect(result.findings.some((f) => f.message.includes("30px"))).toBe(true);
  });

  it("STILL flags Tailwind gap-[7px] (spacing prefix)", async () => {
    const parsed: ParsedFiles = {
      ts: [{
        path: "a.tsx",
        source: '<div className="gap-[7px]" />',
        imports: [], ast: null,
      }],
      css: [], cssInJs: [],
    };
    const result = await rule.evaluate(ctx, parsed);
    expect(result.findings.some((f) => f.message.includes("7px"))).toBe(true);
  });

  it("STILL flags Tailwind p-[13px] (padding prefix)", async () => {
    const parsed: ParsedFiles = {
      ts: [{
        path: "a.tsx",
        source: '<div className="p-[13px]" />',
        imports: [], ast: null,
      }],
      css: [], cssInJs: [],
    };
    const result = await rule.evaluate(ctx, parsed);
    expect(result.findings.some((f) => f.message.includes("13px"))).toBe(true);
  });

  it("STILL flags inline style padding: 13px in TSX", async () => {
    const parsed: ParsedFiles = {
      ts: [{
        path: "a.tsx",
        source: '<div style={{ padding: "13px" }} />',
        imports: [], ast: null,
      }],
      css: [], cssInJs: [],
    };
    const result = await rule.evaluate(ctx, parsed);
    expect(result.findings.some((f) => f.message.includes("13px"))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 1px recall regression — must fire in spacing context
// ---------------------------------------------------------------------------
describe("1px recall regression — spacing context fires, border context does not", () => {
  it("DOES flag p-[1px] in Tailwind (padding is spacing context)", async () => {
    const parsed: ParsedFiles = {
      ts: [{
        path: "a.tsx",
        source: '<div className="p-[1px]" />',
        imports: [], ast: null,
      }],
      css: [], cssInJs: [],
    };
    const result = await rule.evaluate(ctx, parsed);
    expect(result.findings.some((f) => f.message.includes("1px"))).toBe(true);
  });

  it("DOES flag padding: 1px in CSS (spacing context)", async () => {
    const parsed: ParsedFiles = {
      ts: [], css: [{ path: "a.css", source: ".x { padding: 1px; }", root: null }], cssInJs: [],
    };
    const result = await rule.evaluate(ctx, parsed);
    expect(result.findings.some((f) => f.message.includes("1px"))).toBe(true);
  });

  it("does NOT flag border: 1px solid in CSS (border is not spacing)", async () => {
    const parsed: ParsedFiles = {
      ts: [], css: [{ path: "a.css", source: ".x { border: 1px solid #ccc; }", root: null }], cssInJs: [],
    };
    const result = await rule.evaluate(ctx, parsed);
    expect(result.findings.filter((f) => f.message.includes("1px"))).toHaveLength(0);
  });

  // #120 precision: values inside comments are not declaration values.
  it("does NOT flag a px value inside a block comment", async () => {
    const parsed: ParsedFiles = {
      ts: [], css: [{ path: "a.css", source: "/* breakpoint at 13px */\n.x { color: red; }", root: null }], cssInJs: [],
    };
    const result = await rule.evaluate(ctx, parsed);
    expect(result.findings.filter((f) => f.message.includes("13px"))).toHaveLength(0);
  });

  it("does NOT flag a px value on a doc-comment continuation line", async () => {
    const parsed: ParsedFiles = {
      ts: [], css: [{ path: "a.css", source: "/*\n * note: 13px base\n */\n.x { color: red; }", root: null }], cssInJs: [],
    };
    const result = await rule.evaluate(ctx, parsed);
    expect(result.findings.filter((f) => f.message.includes("13px"))).toHaveLength(0);
  });

  // #120 precision: multi-line declaration continuations keep their property
  // context — a box-shadow offset on a continuation line is not spacing.
  it("does NOT flag a px offset on a box-shadow continuation line", async () => {
    const parsed: ParsedFiles = {
      ts: [], css: [{ path: "a.css", source: ".x {\n  box-shadow: 0 0 0 1px,\n    13px -13px 0 red;\n}", root: null }], cssInJs: [],
    };
    const result = await rule.evaluate(ctx, parsed);
    expect(result.findings.filter((f) => f.message.includes("13px"))).toHaveLength(0);
  });

  it("STILL flags a multi-line margin continuation (real spacing)", async () => {
    const parsed: ParsedFiles = {
      ts: [], css: [{ path: "a.css", source: ".x {\n  margin: 0\n    13px;\n}", root: null }], cssInJs: [],
    };
    const result = await rule.evaluate(ctx, parsed);
    expect(result.findings.some((f) => f.message.includes("13px"))).toBe(true);
  });
});

it("attaches a fixGroup resolving the spacing value to its single token", async () => {
  const tmap = { source: "dtcg", colors: new Map(),
    spacing: new Map([["16px", ["space.4"]]]),
    typography: new Map(), radii: new Map(), shadows: new Map(), motion: new Map(),
    breakpoints: new Map(), zIndex: new Map(), opacity: new Map(), borderWidth: new Map(),
  } as unknown as import("../../src/types.js").TokenMap;
  const tctx = { repoRoot: "/x", tokens: tmap, componentsModule: null, componentInventory: [], storyIndex: null, excludePaths: [] };
  const files: import("../../src/types.js").ParsedFiles = { ts: [], css: [{ path: "a.css", source: ".x { padding: 16px; }", root: null }], cssInJs: [] };
  const { findings } = await rule.evaluate(tctx as any, files);
  expect(findings.find((f) => f.fixGroup)?.fixGroup).toMatchObject({ from: "16px", to: "space.4" });
});

it("two findings for the same spacing value share one fixGroup key", async () => {
  const tmap = { source: "dtcg", colors: new Map(),
    spacing: new Map([["16px", ["space.4"]]]),
    typography: new Map(), radii: new Map(), shadows: new Map(), motion: new Map(),
    breakpoints: new Map(), zIndex: new Map(), opacity: new Map(), borderWidth: new Map(),
  } as unknown as import("../../src/types.js").TokenMap;
  const tctx = { repoRoot: "/x", tokens: tmap, componentsModule: null, componentInventory: [], storyIndex: null, excludePaths: [] };
  const files: import("../../src/types.js").ParsedFiles = {
    ts: [], css: [{ path: "a.css", source: ".x { padding: 16px; margin: 16px; }", root: null }], cssInJs: [],
  };
  const { findings } = await rule.evaluate(tctx as any, files);
  const keys = findings.filter((f) => f.fixGroup).map((f) => f.fixGroup!.key);
  expect(keys).toHaveLength(2);
  expect(new Set(keys).size).toBe(1);
});

// ---------------------------------------------------------------------------
// P2 — graph-aware zone gating (Task 4 reference migration)
// ---------------------------------------------------------------------------
function graphWith(zones: Record<string, string>, spacing: string[] = []): DesignSystemGraph {
  return {
    schemaVersion: 1,
    tokens: spacing.map((v, i) => ({ id: `spacing.${i}`, axis: "spacing" as const, rawValue: v, source: "dtcg" as const })),
    components: [], stories: [], usage: [],
    zones: { byFile: zones as Record<string, ZoneKind> },
    extraction: { entries: [], conflicts: [] },
  };
}
function ctxWith(graph: DesignSystemGraph): RuleContext {
  return { repoRoot: "/r", tokens: null, componentsModule: null, componentInventory: [], storyIndex: null, excludePaths: [], graph };
}

describe("graph-aware zone gating (P2 migration)", () => {
  it("does NOT flag off-scale spacing in a story-zoned file", async () => {
    const files: ParsedFiles = { ts: [], css: [{ path: "a/ailabel-story.scss", source: ".x{padding:13px}", root: null }], cssInJs: [] };
    const graph = graphWith({ "a/ailabel-story.scss": "story" });
    const res = await rule.evaluate(ctxWith(graph), files);
    expect(res.findings).toHaveLength(0);
  });

  it("flags off-scale spacing in an app-zoned file", async () => {
    const files: ParsedFiles = { ts: [], css: [{ path: "a/Real.css", source: ".x{padding:13px}", root: null }], cssInJs: [] };
    const graph = graphWith({ "a/Real.css": "app" });
    const res = await rule.evaluate(ctxWith(graph), files);
    expect(res.findings).toHaveLength(1);
  });

  it("treats a value present in the fused graph tokens as on-scale (no finding)", async () => {
    const files: ParsedFiles = { ts: [], css: [{ path: "a/Real.css", source: ".x{padding:13px}", root: null }], cssInJs: [] };
    const graph = graphWith({ "a/Real.css": "app" }, ["13"]);
    const res = await rule.evaluate(ctxWith(graph), files);
    expect(res.findings).toHaveLength(0);
  });
});

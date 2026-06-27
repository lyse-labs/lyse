import { describe, it, expect } from "vitest";
import { rule, detectInText, countCompliantColorUses } from "../../src/rules/tokens-no-hardcoded-color.js";
import { isSchemaOrDataFile, isLowSignalValueFile, isInExampleOrSchemaValuePosition, isColorTokenDefFile } from "../../src/rules/_skip-context.js";
import type { RuleContext, ParsedFiles, TokenMap } from "../../src/types.js";

const emptyTokens: TokenMap = {
  colors: new Map([["#2563eb", ["color/action/primary"]]]),
  spacing: new Map(),
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
  repoRoot: "/repo",
  tokens: emptyTokens,
  componentsModule: null,
  componentInventory: [],
  storyIndex: null,
  excludePaths: [],
};

describe("rule tokens/no-hardcoded-color", () => {
  it("flags a hex in a CSS file and suggests the mapped token", async () => {
    const parsed: ParsedFiles = {
      ts: [],
      css: [
        {
          path: "src/x.css",
          source: ".a { color: #2563eb; }",
          root: null,
        },
      ],
      cssInJs: [],
    };
    const result = await rule.evaluate(ctx, parsed);
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0].ruleId).toBe("tokens/no-hardcoded-color");
    expect(result.findings[0].suggestion).toContain("color/action/primary");
    expect(result.opportunities).toBeGreaterThan(0);
  });

  it("flags a styled-components hex", async () => {
    const parsed: ParsedFiles = {
      ts: [],
      css: [],
      cssInJs: [
        { path: "src/Box.tsx", line: 3, content: "background: #ff0000;" },
      ],
    };
    const result = await rule.evaluate(ctx, parsed);
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0].location.file).toBe("src/Box.tsx");
  });

  it("flags Tailwind arbitrary value bg-[#fff]", async () => {
    const parsed: ParsedFiles = {
      ts: [
        {
          path: "src/X.tsx",
          source: '<div className="bg-[#ffffff]" />',
          imports: [],
          ast: null,
        },
      ],
      css: [],
      cssInJs: [],
    };
    const result = await rule.evaluate(ctx, parsed);
    expect(result.findings.length).toBeGreaterThanOrEqual(1);
  });

  it("does not flag currentColor / transparent / inherit", async () => {
    const parsed: ParsedFiles = {
      ts: [],
      css: [{ path: "x.css", source: ".a { color: currentColor; background: transparent; }", root: null }],
      cssInJs: [],
    };
    const result = await rule.evaluate(ctx, parsed);
    expect(result.findings).toHaveLength(0);
  });
});

describe("FP triage W4-1 — hsl(var(--token)) allowlist", () => {
  it("does NOT flag hsl(var(--background)) — shadcn pattern", async () => {
    const parsed: ParsedFiles = {
      ts: [], css: [{ path: "a.css", source: ".bg { background: hsl(var(--background)); }", root: null }], cssInJs: [],
    };
    const result = await rule.evaluate(ctx, parsed);
    expect(result.findings).toHaveLength(0);
  });

  it("does NOT flag rgba(var(--brand), 0.5) — shadcn alpha pattern", async () => {
    const parsed: ParsedFiles = {
      ts: [], css: [{ path: "a.css", source: ".bg { background: rgba(var(--brand), 0.5); }", root: null }], cssInJs: [],
    };
    const result = await rule.evaluate(ctx, parsed);
    expect(result.findings).toHaveLength(0);
  });

  it("does NOT flag oklch(var(--c)) — oklch css var pattern", async () => {
    const parsed: ParsedFiles = {
      ts: [], css: [{ path: "a.css", source: ".bg { color: oklch(var(--primary)); }", root: null }], cssInJs: [],
    };
    const result = await rule.evaluate(ctx, parsed);
    expect(result.findings).toHaveLength(0);
  });

  it("does NOT flag hsla(var(--muted), 0.8) — hsla css var pattern", async () => {
    const parsed: ParsedFiles = {
      ts: [], css: [{ path: "a.css", source: ".bg { border-color: hsla(var(--muted), 0.8); }", root: null }], cssInJs: [],
    };
    const result = await rule.evaluate(ctx, parsed);
    expect(result.findings).toHaveLength(0);
  });

  it("STILL flags hsl(214, 86%, 53%) — raw hsl is real drift", async () => {
    const parsed: ParsedFiles = {
      ts: [], css: [{ path: "a.css", source: ".bg { background: hsl(214, 86%, 53%); }", root: null }], cssInJs: [],
    };
    const result = await rule.evaluate(ctx, parsed);
    expect(result.findings.length).toBeGreaterThan(0);
  });

  it("does NOT flag color values inside <code>...</code> on the same line", async () => {
    const parsed: ParsedFiles = {
      ts: [{
        path: "Doc.tsx",
        source: 'export default () => <p>Try: <code>color: #2563eb;</code></p>;',
        imports: [], ast: null,
      }],
      css: [], cssInJs: [],
    };
    const result = await rule.evaluate(ctx, parsed);
    expect(result.findings).toHaveLength(0);
  });

  it("does NOT flag color values inside <pre>...</pre> on the same line", async () => {
    const parsed: ParsedFiles = {
      ts: [{
        path: "Doc.tsx",
        source: 'export default () => <pre>background: hsl(210, 100%, 56%);</pre>;',
        imports: [], ast: null,
      }],
      css: [], cssInJs: [],
    };
    const result = await rule.evaluate(ctx, parsed);
    expect(result.findings).toHaveLength(0);
  });

  it("STILL flags color values OUTSIDE code blocks even when same line has code blocks", async () => {
    const parsed: ParsedFiles = {
      ts: [{
        path: "Doc.tsx",
        source: 'export default () => <div style={{ background: "#ff0000" }}><code>see #2563eb</code></div>;',
        imports: [], ast: null,
      }],
      css: [], cssInJs: [],
    };
    const result = await rule.evaluate(ctx, parsed);
    // #ff0000 is outside code; #2563eb is inside — only #ff0000 should fire
    expect(result.findings.map((f) => f.message)).toEqual(
      expect.arrayContaining([expect.stringContaining("#ff0000")]),
    );
    const messages = result.findings.map((f) => f.message);
    expect(messages.some((msg) => msg.includes("#2563eb"))).toBe(false);
  });
});

describe("tokens/no-hardcoded-color respects excludePaths", () => {
  it("skips TS files matched by ctx.excludePaths", async () => {
    const ctxWithExclude: RuleContext = {
      repoRoot: "/repo",
      tokens: emptyTokens,
      componentsModule: null,
      componentInventory: [],
      storyIndex: null,
      excludePaths: ["examples/**"],
    };
    const parsed: ParsedFiles = {
      ts: [
        {
          path: "examples/Demo.tsx",
          source: '<div style={{ color: "#ff0000" }} />',
          imports: [],
          ast: null,
        },
        {
          path: "src/Button.tsx",
          source: '<div style={{ color: "#ff0000" }} />',
          imports: [],
          ast: null,
        },
      ],
      css: [],
      cssInJs: [],
    };
    const result = await rule.evaluate(ctxWithExclude, parsed);
    // Only src/Button.tsx finding should appear — examples/ is excluded
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0].location.file).toBe("src/Button.tsx");
  });

  it("skips CSS files matched by ctx.excludePaths", async () => {
    const ctxWithExclude: RuleContext = {
      repoRoot: "/repo",
      tokens: emptyTokens,
      componentsModule: null,
      componentInventory: [],
      storyIndex: null,
      excludePaths: ["apps/docs/**"],
    };
    const parsed: ParsedFiles = {
      ts: [],
      css: [
        {
          path: "apps/docs/theme.css",
          source: ".a { color: #2563eb; }",
          root: null,
        },
        {
          path: "src/tokens.css",
          source: ".a { color: #2563eb; }",
          root: null,
        },
      ],
      cssInJs: [],
    };
    const result = await rule.evaluate(ctxWithExclude, parsed);
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0].location.file).toBe("src/tokens.css");
  });

  it("skips cssInJs blocks matched by ctx.excludePaths", async () => {
    const ctxWithExclude: RuleContext = {
      repoRoot: "/repo",
      tokens: emptyTokens,
      componentsModule: null,
      componentInventory: [],
      storyIndex: null,
      excludePaths: ["**/fixtures/**"],
    };
    const parsed: ParsedFiles = {
      ts: [],
      css: [],
      cssInJs: [
        { path: "packages/core/fixtures/Comp.tsx", line: 3, content: "background: #ff0000;" },
        { path: "src/Comp.tsx", line: 3, content: "background: #ff0000;" },
      ],
    };
    const result = await rule.evaluate(ctxWithExclude, parsed);
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0].location.file).toBe("src/Comp.tsx");
  });
});

describe("tokens/no-hardcoded-color paren-nesting filter", () => {
  it("does NOT flag hex inside var() fallback", () => {
    const code = `.x { color: var(--token, #8c959f); }`;
    const hits = detectInText(code, "test.css");
    expect(hits.length).toBe(0);
  });

  it("does NOT flag hex inside nested var() fallback", () => {
    const code = `.x { color: var(--a, var(--b, #ff0000)); }`;
    const hits = detectInText(code, "test.css");
    expect(hits.length).toBe(0);
  });

  it("STILL flags hex inside linear-gradient (not a var fallback)", () => {
    const code = `.x { background: linear-gradient(red, #ff0000, blue); }`;
    const hits = detectInText(code, "test.css");
    expect(hits.length).toBe(1);
  });

  it("does NOT flag hex inside linear-gradient with var fallback", () => {
    const code = `.x { background: linear-gradient(red, var(--via, #ff0000), blue); }`;
    const hits = detectInText(code, "test.css");
    expect(hits.length).toBe(0);
  });

  it("STILL flags top-level hex literals", () => {
    const code = `.x { color: #ff0000; }`;
    const hits = detectInText(code, "test.css");
    expect(hits.length).toBe(1);
  });

  it("does NOT flag short hex inside var() fallback", () => {
    const code = `.x { color: var(--token, #fff); }`;
    const hits = detectInText(code, "test.css");
    expect(hits.length).toBe(0);
  });

  it("STILL flags hex outside var() in same rule", () => {
    const code = `.x { color: var(--a, #fff); background: #ff0000; }`;
    const hits = detectInText(code, "test.css");
    expect(hits.length).toBe(1);
    expect(hits[0].match).toBe("#ff0000");
  });
});

describe("tokens/no-hardcoded-color comment/URL filter", () => {
  it("does NOT flag hex in // line comment", () => {
    const code = `// fixed in #7801\nconst x = "ok";`;
    const hits = detectInText(code, "test.ts");
    expect(hits.length).toBe(0);
  });

  it("does NOT flag hex in URL fragment", () => {
    const code = `// see https://example.com/docs#add-custom-matchers\nconst x = "ok";`;
    const hits = detectInText(code, "test.ts");
    expect(hits.length).toBe(0);
  });

  it("does NOT flag hex in /* block comment */", () => {
    const code = `/* color #ff0000 used for errors */\n.a { color: red; }`;
    const hits = detectInText(code, "test.css");
    expect(hits.length).toBe(0);
  });

  it("does NOT flag hex in * doc comment line", () => {
    const code = ` * @see #7801 for background\n.a { color: red; }`;
    const hits = detectInText(code, "test.css");
    expect(hits.length).toBe(0);
  });

  it("STILL flags hex in real source", () => {
    const code = `const color = "#ff0000";`;
    const hits = detectInText(code, "test.ts");
    expect(hits.length).toBe(1);
  });
});

describe("tokens/no-hardcoded-color counts compliant usages", () => {
  it("counts hsl(var()) as opportunity but not finding (CSS)", async () => {
    const code = `.x { color: hsl(var(--primary)); }`;
    const parsed: ParsedFiles = {
      ts: [],
      css: [{ path: "x.css", source: code, root: null }],
      cssInJs: [],
    };
    const result = await rule.evaluate(ctx, parsed);
    expect(result.opportunities).toBe(1);
    expect(result.findings.length).toBe(0);
  });

  it("counts rgba(var()) as opportunity but not finding", async () => {
    const code = `.x { background: rgba(var(--brand), 0.5); }`;
    const parsed: ParsedFiles = {
      ts: [],
      css: [{ path: "x.css", source: code, root: null }],
      cssInJs: [],
    };
    const result = await rule.evaluate(ctx, parsed);
    expect(result.opportunities).toBe(1);
    expect(result.findings.length).toBe(0);
  });

  it("counts standalone var(--token) in CSS declaration as opportunity", async () => {
    const code = `.x { color: var(--primary); }`;
    const parsed: ParsedFiles = {
      ts: [],
      css: [{ path: "x.css", source: code, root: null }],
      cssInJs: [],
    };
    const result = await rule.evaluate(ctx, parsed);
    expect(result.opportunities).toBe(1);
    expect(result.findings.length).toBe(0);
  });

  it("counts theme.colors.X in TSX as opportunity", async () => {
    const code = `const c = theme.colors.primary;`;
    const parsed: ParsedFiles = {
      ts: [{ path: "x.tsx", source: code, imports: [], ast: null }],
      css: [],
      cssInJs: [],
    };
    const result = await rule.evaluate(ctx, parsed);
    expect(result.opportunities).toBe(1);
    expect(result.findings.length).toBe(0);
  });

  it("counts tokens.color.X in TSX as opportunity", async () => {
    const code = `const c = tokens.color.brand;`;
    const parsed: ParsedFiles = {
      ts: [{ path: "x.tsx", source: code, imports: [], ast: null }],
      css: [],
      cssInJs: [],
    };
    const result = await rule.evaluate(ctx, parsed);
    expect(result.opportunities).toBe(1);
    expect(result.findings.length).toBe(0);
  });

  it("counts palette.X.Y in TSX as opportunity", async () => {
    const code = `const c = palette.blue.500;`;
    const parsed: ParsedFiles = {
      ts: [{ path: "x.tsx", source: code, imports: [], ast: null }],
      css: [],
      cssInJs: [],
    };
    const result = await rule.evaluate(ctx, parsed);
    expect(result.opportunities).toBe(1);
    expect(result.findings.length).toBe(0);
  });

  it("produces a proper ratio with mixed compliant and hardcoded CSS", async () => {
    const code = `
      .x { color: hsl(var(--primary)); }
      .y { color: hsl(var(--secondary)); }
      .z { color: #ff0000; }
    `;
    const parsed: ParsedFiles = {
      ts: [],
      css: [{ path: "x.css", source: code, root: null }],
      cssInJs: [],
    };
    const result = await rule.evaluate(ctx, parsed);
    expect(result.opportunities).toBe(3);
    expect(result.findings.length).toBe(1);
  });

  it("countCompliantColorUses — hsl(var()) matches", () => {
    const code = `.x { color: hsl(var(--primary)); background: rgba(var(--bg), 0.5); }`;
    expect(countCompliantColorUses(code, ".css")).toBe(2);
  });

  it("countCompliantColorUses — standalone var() in CSS declaration position", () => {
    const code = `.x { color: var(--primary); border-color: var(--border); }`;
    expect(countCompliantColorUses(code, ".css")).toBe(2);
  });

  it("countCompliantColorUses — theme and palette refs in TS/TSX", () => {
    const code = `
      const fg = theme.colors.foreground;
      const bg = palette.neutral.100;
      const tok = tokens.color.brand;
    `;
    expect(countCompliantColorUses(code, ".tsx")).toBe(3);
  });

  it("countCompliantColorUses — returns 0 for plain CSS with no token usages", () => {
    const code = `.x { color: #ff0000; }`;
    expect(countCompliantColorUses(code, ".css")).toBe(0);
  });
});

describe("Tailwind color class compliance", () => {
  it("counts bg-slate-900 and text-white as compliant color usages in tsx", () => {
    const code = `<div className="bg-slate-900 text-white p-4" />`;
    expect(countCompliantColorUses(code, ".tsx")).toBe(2); // bg-slate-900 + text-white
  });

  it("counts various color utility prefixes", () => {
    const code = `<div className="bg-slate-900 text-red-500 border-blue-200 ring-green-700 fill-pink-300" />`;
    expect(countCompliantColorUses(code, ".tsx")).toBe(5);
  });

  it("does NOT count bg-[#ff0000] arbitrary value as compliant", () => {
    const code = `<div className="bg-[#ff0000]" />`;
    expect(countCompliantColorUses(code, ".tsx")).toBe(0);
  });

  it("does NOT count Tailwind color classes in .css files", () => {
    const code = `<div className="bg-slate-900" />`;
    expect(countCompliantColorUses(code, ".css")).toBe(0);
  });

  it("counts transparent, current, inherit special values", () => {
    const code = `<div className="bg-transparent text-current border-inherit" />`;
    expect(countCompliantColorUses(code, ".tsx")).toBe(3);
  });

  it("counts bg-white and bg-black", () => {
    const code = `<div className="bg-white text-black" />`;
    expect(countCompliantColorUses(code, ".tsx")).toBe(2);
  });

  it("does NOT flag bg-slate-900 as a hardcoded color violation", async () => {
    const parsed: ParsedFiles = {
      ts: [{
        path: "src/Card.tsx",
        source: `<div className="bg-slate-900 text-white" />`,
        imports: [],
        ast: null,
      }],
      css: [],
      cssInJs: [],
    };
    const result = await rule.evaluate(ctx, parsed);
    // bg-slate-900 and text-white should be compliant usages — zero findings
    expect(result.findings).toHaveLength(0);
    expect(result.opportunities).toBeGreaterThanOrEqual(2);
  });

  it("correctly separates Tailwind compliant and hardcoded violations in mixed JSX", async () => {
    const parsed: ParsedFiles = {
      ts: [{
        path: "src/Mixed.tsx",
        source: `<div className="bg-slate-900" style={{ color: "#ff0000" }} />`,
        imports: [],
        ast: null,
      }],
      css: [],
      cssInJs: [],
    };
    const result = await rule.evaluate(ctx, parsed);
    // #ff0000 is a violation; bg-slate-900 is compliant
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0].message).toContain("#ff0000");
    expect(result.opportunities).toBeGreaterThanOrEqual(2); // 1 violation + 1 compliant
  });

  it("does not flag a hex on the RHS of a CSS custom-property declaration (token definition)", async () => {
    const parsed: ParsedFiles = {
      ts: [],
      css: [{
        path: "src/tokens.css",
        source: ":root { --brand-primary: #ff0000; }",
        root: null,
      }],
      cssInJs: [],
    };
    const result = await rule.evaluate(ctx, parsed);
    expect(result.findings).toHaveLength(0);
  });

  it("flags a plain hex in a regular declaration but not the sibling custom-property definition", async () => {
    const parsed: ParsedFiles = {
      ts: [],
      css: [{
        path: "src/mixed.css",
        source: ":root { --brand-primary: #ff0000; } .btn { color: #ff0000; }",
        root: null,
      }],
      cssInJs: [],
    };
    const result = await rule.evaluate(ctx, parsed);
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0].location.file).toBe("src/mixed.css");
  });

  it("does not flag a hex inside a var() fallback (existing guard) regardless of custom-property guard", async () => {
    const parsed: ParsedFiles = {
      ts: [],
      css: [{
        path: "src/fallback.css",
        source: ".btn { color: var(--missing, #ff0000); }",
        root: null,
      }],
      cssInJs: [],
    };
    const result = await rule.evaluate(ctx, parsed);
    expect(result.findings).toHaveLength(0);
  });

  it("does not flag values inside Tailwind @theme {} token block", async () => {
    const parsed: ParsedFiles = {
      ts: [],
      css: [{
        path: "src/globals.css",
        source: "@theme { --color-red-50: oklch(0.971 0.013 17.38); --color-red-500: #ef4444; }",
        root: null,
      }],
      cssInJs: [],
    };
    const result = await rule.evaluate(ctx, parsed);
    expect(result.findings).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Guard A: Low-signal value files (test/spec/stories/fixtures)
// ---------------------------------------------------------------------------
describe("Guard A — isLowSignalValueFile path helper", () => {
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
  it("identifies __mocks__/ path as low-signal", () => {
    expect(isLowSignalValueFile("src/__mocks__/api.ts")).toBe(true);
  });
  it("identifies fixtures/ path as low-signal", () => {
    expect(isLowSignalValueFile("packages/core/fixtures/comp.tsx")).toBe(true);
  });
  it("identifies .fixture.ts as low-signal", () => {
    expect(isLowSignalValueFile("src/comp.fixture.ts")).toBe(true);
  });
  it("does NOT mark a regular component as low-signal", () => {
    expect(isLowSignalValueFile("src/Button.tsx")).toBe(false);
  });
  it("does NOT mark a regular CSS file as low-signal", () => {
    expect(isLowSignalValueFile("src/tokens.css")).toBe(false);
  });
});

describe("Guard A — rule: does NOT flag hardcoded color in test/story/fixture files", () => {
  it("does NOT flag hex in a .test.tsx file", async () => {
    const parsed: ParsedFiles = {
      ts: [{
        path: "src/Button.test.tsx",
        source: 'it("renders", () => { expect(el.style.color).toBe("#FF0000"); });',
        imports: [], ast: null,
      }],
      css: [], cssInJs: [],
    };
    const result = await rule.evaluate(ctx, parsed);
    expect(result.findings).toHaveLength(0);
  });

  it("does NOT flag hex in a .stories.tsx file", async () => {
    const parsed: ParsedFiles = {
      ts: [{
        path: "src/Button.stories.tsx",
        source: 'export const Primary = () => <Button style={{ color: "#2563eb" }} />;',
        imports: [], ast: null,
      }],
      css: [], cssInJs: [],
    };
    const result = await rule.evaluate(ctx, parsed);
    expect(result.findings).toHaveLength(0);
  });

  it("does NOT flag hex in a fixtures/ file", async () => {
    const parsed: ParsedFiles = {
      ts: [{
        path: "tests/fixtures/Button.tsx",
        source: 'export const comp = <div style={{ color: "#ff0000" }} />;',
        imports: [], ast: null,
      }],
      css: [], cssInJs: [],
    };
    const result = await rule.evaluate(ctx, parsed);
    expect(result.findings).toHaveLength(0);
  });

  it("STILL flags hex in a real component Button.tsx (recall guard)", async () => {
    const parsed: ParsedFiles = {
      ts: [{
        path: "src/Button.tsx",
        source: 'export const Button = () => <div style={{ color: "#FF0000" }} />;',
        imports: [], ast: null,
      }],
      css: [], cssInJs: [],
    };
    const result = await rule.evaluate(ctx, parsed);
    expect(result.findings).toHaveLength(1);
  });

  it("STILL flags hex in a .css file (recall guard)", async () => {
    const parsed: ParsedFiles = {
      ts: [], css: [{ path: "src/theme.css", source: ".x { color: #fff; }", root: null }], cssInJs: [],
    };
    const result = await rule.evaluate(ctx, parsed);
    expect(result.findings).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// Guard B: Schema/data/config/type-decl file roles
// ---------------------------------------------------------------------------
describe("Guard B — isSchemaOrDataFile path helper", () => {
  it("identifies dto/ path", () => {
    expect(isSchemaOrDataFile("src/dto/create-user.dto.ts")).toBe(true);
  });
  it("identifies schemas/ path", () => {
    expect(isSchemaOrDataFile("src/schemas/user.schema.ts")).toBe(true);
  });
  it("identifies .input.ts suffix", () => {
    expect(isSchemaOrDataFile("src/create-user.input.ts")).toBe(true);
  });
  it("identifies .dto.ts suffix", () => {
    expect(isSchemaOrDataFile("src/create-user.dto.ts")).toBe(true);
  });
  it("identifies .schema.ts suffix", () => {
    expect(isSchemaOrDataFile("src/user.schema.ts")).toBe(true);
  });
  it("identifies .entity.ts suffix", () => {
    expect(isSchemaOrDataFile("src/user.entity.ts")).toBe(true);
  });
  it("identifies .config.ts suffix", () => {
    expect(isSchemaOrDataFile("theme.config.ts")).toBe(true);
  });
  it("identifies .config.mjs suffix", () => {
    expect(isSchemaOrDataFile("tailwind.config.mjs")).toBe(true);
  });
  it("identifies .d.ts suffix", () => {
    expect(isSchemaOrDataFile("src/types.d.ts")).toBe(true);
  });
  it("does NOT mark a real component as schema/data", () => {
    expect(isSchemaOrDataFile("src/Button.tsx")).toBe(false);
  });
  it("does NOT mark a .css file as schema/data", () => {
    expect(isSchemaOrDataFile("src/tokens.css")).toBe(false);
  });
});

describe("Guard B — rule: does NOT flag hardcoded color in schema/data/config files", () => {
  it("does NOT flag hex in a NestJS @ApiProperty example DTO", async () => {
    const parsed: ParsedFiles = {
      ts: [{
        path: "src/dto/create-user.input.ts",
        source: '@ApiProperty({ example: "#FFFFFF", description: "hex color" })\ncolor: string;',
        imports: [], ast: null,
      }],
      css: [], cssInJs: [],
    };
    const result = await rule.evaluate(ctx, parsed);
    expect(result.findings).toHaveLength(0);
  });

  it("does NOT flag hex in a .config.ts file", async () => {
    const parsed: ParsedFiles = {
      ts: [{
        path: "theme.config.ts",
        source: 'export const config = { primary: "#2563eb" };',
        imports: [], ast: null,
      }],
      css: [], cssInJs: [],
    };
    const result = await rule.evaluate(ctx, parsed);
    expect(result.findings).toHaveLength(0);
  });

  it("does NOT flag hex in a .d.ts declaration file", async () => {
    const parsed: ParsedFiles = {
      ts: [{
        path: "src/types.d.ts",
        source: 'declare const primary = "#2563eb";',
        imports: [], ast: null,
      }],
      css: [], cssInJs: [],
    };
    const result = await rule.evaluate(ctx, parsed);
    expect(result.findings).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Guard C: example:/default: key values and JSDoc @example blocks
// ---------------------------------------------------------------------------
describe("Guard C — isInExampleOrSchemaValuePosition helper", () => {
  it("returns true for value of `example:` key", () => {
    const src = '{ example: "#FF0000" }';
    const idx = src.indexOf("#FF0000");
    expect(isInExampleOrSchemaValuePosition(src, idx)).toBe(true);
  });
  it("returns true for value of `default:` key", () => {
    const src = '{ default: "#aabbcc" }';
    const idx = src.indexOf("#aabbcc");
    expect(isInExampleOrSchemaValuePosition(src, idx)).toBe(true);
  });
  it("returns true for value of `placeholder:` key", () => {
    const src = '{ placeholder: "#ffffff" }';
    const idx = src.indexOf("#ffffff");
    expect(isInExampleOrSchemaValuePosition(src, idx)).toBe(true);
  });
  it("returns true for value of `sample:` key", () => {
    const src = '{ sample: "#000000" }';
    const idx = src.indexOf("#000000");
    expect(isInExampleOrSchemaValuePosition(src, idx)).toBe(true);
  });
  it("returns true for value of `mock:` key", () => {
    const src = '{ mock: "#ff00ff" }';
    const idx = src.indexOf("#ff00ff");
    expect(isInExampleOrSchemaValuePosition(src, idx)).toBe(true);
  });
  it("returns false for a real style property value", () => {
    const src = '{ color: "#ff0000" }';
    const idx = src.indexOf("#ff0000");
    expect(isInExampleOrSchemaValuePosition(src, idx)).toBe(false);
  });
  it("returns true for hex inside a JSDoc @example block", () => {
    const src = `/**\n * @example\n * color: #fff\n */`;
    const idx = src.indexOf("#fff");
    expect(isInExampleOrSchemaValuePosition(src, idx)).toBe(true);
  });
  it("returns false for hex in normal code (not JSDoc)", () => {
    const src = `const x = "#ff0000";`;
    const idx = src.indexOf("#ff0000");
    expect(isInExampleOrSchemaValuePosition(src, idx)).toBe(false);
  });
});

describe("Guard C — rule: does NOT flag example/default key values or JSDoc @example", () => {
  it("does NOT flag `{ example: '#FF0000' }` in TS source", async () => {
    const parsed: ParsedFiles = {
      ts: [{
        path: "src/api.ts",
        source: 'const schema = { example: "#FF0000", required: true };',
        imports: [], ast: null,
      }],
      css: [], cssInJs: [],
    };
    const result = await rule.evaluate(ctx, parsed);
    expect(result.findings).toHaveLength(0);
  });

  it("does NOT flag `{ default: '#aabbcc' }` in TS source", async () => {
    const parsed: ParsedFiles = {
      ts: [{
        path: "src/schema.ts",
        source: 'const field = { default: "#aabbcc", type: "string" };',
        imports: [], ast: null,
      }],
      css: [], cssInJs: [],
    };
    const result = await rule.evaluate(ctx, parsed);
    expect(result.findings).toHaveLength(0);
  });

  it("does NOT flag hex inside a JSDoc @example block", async () => {
    const parsed: ParsedFiles = {
      ts: [{
        path: "src/ColorPicker.tsx",
        source: "/**\n * @example\n * <ColorPicker color=\"#fff\" />\n */\nexport function ColorPicker() {}",
        imports: [], ast: null,
      }],
      css: [], cssInJs: [],
    };
    const result = await rule.evaluate(ctx, parsed);
    expect(result.findings).toHaveLength(0);
  });

  it("STILL flags hardcoded color in real component JSX (recall guard)", async () => {
    const parsed: ParsedFiles = {
      ts: [{
        path: "src/Button.tsx",
        source: 'export const Button = () => <div style={{ color: "#FF0000" }} />;',
        imports: [], ast: null,
      }],
      css: [], cssInJs: [],
    };
    const result = await rule.evaluate(ctx, parsed);
    expect(result.findings).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// Color token-definition file path guards
// ---------------------------------------------------------------------------
describe("isColorTokenDefFile — path helper unit tests", () => {
  it("identifies colors.ts as a token-def file", () => {
    expect(isColorTokenDefFile("src/colors.ts")).toBe(true);
  });
  it("identifies colors.css as a token-def file", () => {
    expect(isColorTokenDefFile("src/colors.css")).toBe(true);
  });
  it("identifies palette.ts as a token-def file", () => {
    expect(isColorTokenDefFile("src/palette.ts")).toBe(true);
  });
  it("identifies brand-colors.ts as a token-def file", () => {
    expect(isColorTokenDefFile("src/brand-colors.ts")).toBe(true);
  });
  it("identifies _legacy-colors.ts as a token-def file", () => {
    expect(isColorTokenDefFile("src/_legacy-colors.ts")).toBe(true);
  });
  it("identifies button.colors.ts as a token-def file", () => {
    expect(isColorTokenDefFile("src/tokens/button.colors.ts")).toBe(true);
  });
  it("identifies button.colors.css as a token-def file", () => {
    expect(isColorTokenDefFile("src/tokens/button.colors.css")).toBe(true);
  });
  it("identifies files under demos/ directory", () => {
    expect(isColorTokenDefFile("src/demos/ColorSwatch.tsx")).toBe(true);
  });
  it("identifies *.demo.tsx files", () => {
    expect(isColorTokenDefFile("src/Button.demo.tsx")).toBe(true);
  });
  it("identifies CSS files under stories/ directory", () => {
    expect(isColorTokenDefFile("src/stories/button.module.css")).toBe(true);
  });
  it("does NOT identify a regular component", () => {
    expect(isColorTokenDefFile("src/Button.tsx")).toBe(false);
  });
  it("does NOT identify theme.css (borderline — may be a stylesheet)", () => {
    expect(isColorTokenDefFile("src/theme.css")).toBe(false);
  });
  it("does NOT identify constants.ts (too broad)", () => {
    expect(isColorTokenDefFile("src/constants.ts")).toBe(false);
  });
  it("does NOT identify a regular CSS file", () => {
    expect(isColorTokenDefFile("src/button.module.css")).toBe(false);
  });
});

describe("Color token-def file path guards — rule integration", () => {
  it("does NOT flag colors.ts (token definition source-of-truth)", async () => {
    const parsed: ParsedFiles = {
      ts: [{
        path: "src/colors.ts",
        source: 'export const colors = { primary: "#2563eb", secondary: "#7c3aed" };',
        imports: [], ast: null,
      }],
      css: [], cssInJs: [],
    };
    const result = await rule.evaluate(ctx, parsed);
    expect(result.findings).toHaveLength(0);
  });

  it("does NOT flag palette.css (token definition source-of-truth)", async () => {
    const parsed: ParsedFiles = {
      ts: [],
      css: [{ path: "src/palette.css", source: ".palette { color: #2563eb; }", root: null }],
      cssInJs: [],
    };
    const result = await rule.evaluate(ctx, parsed);
    expect(result.findings).toHaveLength(0);
  });

  it("does NOT flag brand-colors.ts", async () => {
    const parsed: ParsedFiles = {
      ts: [{
        path: "src/brand-colors.ts",
        source: 'export const brandColors = { blue: "#2563eb" };',
        imports: [], ast: null,
      }],
      css: [], cssInJs: [],
    };
    const result = await rule.evaluate(ctx, parsed);
    expect(result.findings).toHaveLength(0);
  });

  it("does NOT flag *.demo.tsx files", async () => {
    const parsed: ParsedFiles = {
      ts: [{
        path: "src/ColorDemo.demo.tsx",
        source: '<div style={{ color: "#ff0000" }} />',
        imports: [], ast: null,
      }],
      css: [], cssInJs: [],
    };
    const result = await rule.evaluate(ctx, parsed);
    expect(result.findings).toHaveLength(0);
  });

  it("does NOT flag CSS files under stories/ directory", async () => {
    const parsed: ParsedFiles = {
      ts: [],
      css: [{ path: "src/stories/button.module.css", source: ".story { color: #ff0000; }", root: null }],
      cssInJs: [],
    };
    const result = await rule.evaluate(ctx, parsed);
    expect(result.findings).toHaveLength(0);
  });

  it("STILL flags regular components (recall guard)", async () => {
    const parsed: ParsedFiles = {
      ts: [{
        path: "src/Button.tsx",
        source: '<div style={{ color: "#ff0000" }} />',
        imports: [], ast: null,
      }],
      css: [], cssInJs: [],
    };
    const result = await rule.evaluate(ctx, parsed);
    expect(result.findings).toHaveLength(1);
  });

  it("STILL flags regular CSS files", async () => {
    const parsed: ParsedFiles = {
      ts: [],
      css: [{ path: "src/button.module.css", source: ".btn { color: #ff0000; }", root: null }],
      cssInJs: [],
    };
    const result = await rule.evaluate(ctx, parsed);
    expect(result.findings).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// CSS custom-property scope narrowing — recall regression fixes
// ---------------------------------------------------------------------------
// A value on the RHS of a `--x:` custom-property declaration is a token
// definition in ANY selector scope, not drift. The earlier Track 9.11
// selector-scoped narrowing was reversed after the #120 cross-tool calibration
// showed it produced hundreds of false positives on real design systems (the
// dominant disagreement with stylelint). The "should this --x reference an
// existing token" case is semantic → LLM filter, not this static guard.
describe("isCssCustomPropertyDeclaration — custom-property definitions are not drift (#120)", () => {
  it("does NOT flag --local-color in :root", async () => {
    const parsed: ParsedFiles = {
      ts: [],
      css: [{ path: "src/tokens.css", source: ":root { --local-color: #ff0000; }", root: null }],
      cssInJs: [],
    };
    const result = await rule.evaluate(ctx, parsed);
    expect(result.findings).toHaveLength(0);
  });

  it("does NOT flag --local-color in a component selector (definition, not drift)", async () => {
    const parsed: ParsedFiles = {
      ts: [],
      css: [{ path: "src/widget.css", source: ".widget { --local-color: #ff0000; }", root: null }],
      cssInJs: [],
    };
    const result = await rule.evaluate(ctx, parsed);
    expect(result.findings).toHaveLength(0);
  });

  it("does NOT flag --color in html selector", async () => {
    const parsed: ParsedFiles = {
      ts: [],
      css: [{ path: "src/globals.css", source: "html { --color-primary: #2563eb; }", root: null }],
      cssInJs: [],
    };
    const result = await rule.evaluate(ctx, parsed);
    expect(result.findings).toHaveLength(0);
  });

  it("does NOT flag --color in [data-theme] selector", async () => {
    const parsed: ParsedFiles = {
      ts: [],
      css: [{ path: "src/globals.css", source: '[data-theme="dark"] { --color-primary: #1d4ed8; }', root: null }],
      cssInJs: [],
    };
    const result = await rule.evaluate(ctx, parsed);
    expect(result.findings).toHaveLength(0);
  });

  it("does NOT flag --accent definition in a .card component selector", async () => {
    const parsed: ParsedFiles = {
      ts: [],
      css: [{ path: "src/card.css", source: ".card { --accent: #ff0000; color: var(--accent); }", root: null }],
      cssInJs: [],
    };
    const result = await rule.evaluate(ctx, parsed);
    expect(result.findings).toHaveLength(0);
  });

  it("STILL flags a hardcoded value in a real property (drift), not a custom prop", async () => {
    const parsed: ParsedFiles = {
      ts: [],
      css: [{ path: "src/card.css", source: ".card { color: #ff0000; }", root: null }],
      cssInJs: [],
    };
    const result = await rule.evaluate(ctx, parsed);
    expect(result.findings.some((f) => f.message.includes("#ff0000"))).toBe(true);
  });
});

describe("tokens/no-hardcoded-color fixGroup support", () => {
  it("attaches a fixGroup resolving the hex to its single token", async () => {
    const tokens = { source: "dtcg",
      colors: new Map([["#3b82f6", ["color.brand.primary"]]]),
      spacing: new Map(), typography: new Map(), radii: new Map(), shadows: new Map(),
      motion: new Map(), breakpoints: new Map(), zIndex: new Map(), opacity: new Map(), borderWidth: new Map(),
    } as unknown as TokenMap;
    const ctxWithTokens = { repoRoot: "/x", tokens, componentsModule: null, componentInventory: [], storyIndex: null, excludePaths: [] };
    const parsed: ParsedFiles = {
      ts: [{ path: "src/A.tsx", source: 'const s = { color: "#3B82F6" };', imports: [], ast: null }],
      css: [],
      cssInJs: [],
    };
    const result = await rule.evaluate(ctxWithTokens as any, parsed);
    expect(result.findings[0]!.fixGroup).toEqual({
      key: "tokens/no-hardcoded-color::#3b82f6", from: "#3b82f6", to: "color.brand.primary",
    });
  });
});

// ---------------------------------------------------------------------------
// Data-palette guard — CSS recall regression (commit 1109dc1 regression fix)
// ---------------------------------------------------------------------------
// The data-palette guard must ONLY fire on JS/TS array/object literal contexts.
// CSS/SCSS multi-color contexts (gradient functions, rule blocks with several
// color stops) are STYLING = real drift, never palette data structures.
// These tests are the regression guards for the 7 real-drift findings that were
// wrongly suppressed after the guard was introduced without a CSS exclusion.
describe("data-palette guard — CSS multi-color contexts must still flag (recall regression)", () => {
  // Case 1: CSS linear-gradient with a repeated rgba() stop (≥3 color literals
  // in the same { } block) — must flag, not be suppressed as a "palette".
  it("MUST flag rgba() in a CSS linear-gradient even when ≥3 color literals exist in the block", async () => {
    const source = `.progress {
  background: linear-gradient(
    to right,
    rgba(255, 255, 255, 0.15) 0%,
    rgba(255, 255, 255, 0.15) 50%,
    rgba(255, 255, 255, 0.15) 100%
  );
}`;
    const parsed: ParsedFiles = {
      ts: [],
      css: [{ path: "src/Progress.module.css", source, root: null }],
      cssInJs: [],
    };
    const result = await rule.evaluate(ctx, parsed);
    // All three rgba() stops are real CSS drift — palette guard must not suppress them
    expect(result.findings.length).toBeGreaterThanOrEqual(1);
    expect(result.findings.some((f) => f.message.includes("rgba(255, 255, 255, 0.15)"))).toBe(true);
  });

  // Case 2: SCSS rule block with #fff + multiple rgb() color stops — the block
  // has ≥3 color literals but it is a CSS rule block, not a JS palette object.
  it("MUST flag #fff and rgb() stops in a SCSS rule block with ≥5 color literals", async () => {
    const source = `.btn-signup-mktg {
  color: #fff;
  background: linear-gradient(
    to bottom,
    rgb(40, 167, 69),
    rgb(30, 130, 54),
    rgb(24, 105, 43),
    rgb(18, 80, 32)
  );
  border-color: #fff;
}`;
    const parsed: ParsedFiles = {
      ts: [],
      css: [{ path: "src/primer-css/button.scss", source, root: null }],
      cssInJs: [],
    };
    const result = await rule.evaluate(ctx, parsed);
    // #fff and the rgb() stops are all real brand-color drift — must not be suppressed
    expect(result.findings.length).toBeGreaterThanOrEqual(3);
    expect(result.findings.some((f) => f.message.includes("#fff"))).toBe(true);
  });

  // Case 3: detectInText with isCssSource=true never suppresses multi-color CSS blocks
  it("detectInText(css, true) — does NOT suppress ≥3 rgba() in a CSS gradient block", () => {
    const source = `.x { background: linear-gradient(rgba(255,255,255,0.1), rgba(255,255,255,0.15), rgba(255,255,255,0.2)); }`;
    const hits = detectInText(source, "x.css", true);
    expect(hits.length).toBe(3);
  });

  // Case 4: detectInText with isCssSource=false STILL suppresses JS palette arrays
  it("detectInText(ts, false) — still suppresses a JS array with ≥3 hex literals (palette guard intact)", () => {
    const source = `const palette = ['#fff', '#000', '#abc', '#def'];`;
    const hits = detectInText(source, "palette.ts", false);
    expect(hits.length).toBe(0);
  });

  // Case 5: JS object with ≥5 color literals still suppressed (cssInJs/TS path)
  it("detectInText(ts, false) — still suppresses a JS object with ≥5 hex literals", () => {
    const source = `const theme = { a: '#111', b: '#222', c: '#333', d: '#444', e: '#555' };`;
    const hits = detectInText(source, "theme.ts", false);
    expect(hits.length).toBe(0);
  });

  // Case 6: rule.evaluate — CSS file with ≥3 rgba() still flagged end-to-end
  it("rule.evaluate — CSS file with 3 rgba() in gradient is flagged (end-to-end)", async () => {
    const source = `.card { background: linear-gradient(rgba(0,0,0,0.1), rgba(0,0,0,0.2), rgba(0,0,0,0.3)); }`;
    const parsed: ParsedFiles = {
      ts: [],
      css: [{ path: "src/Card.module.css", source, root: null }],
      cssInJs: [],
    };
    const result = await rule.evaluate(ctx, parsed);
    expect(result.findings.length).toBe(3);
  });

  // Case 7: rule.evaluate — TS file with a 4-item hex array is NOT flagged (palette guard intact)
  it("rule.evaluate — TS file with a 4-item hex array is NOT flagged (JS palette guard intact)", async () => {
    const source = `const chartColors = ['#e74c3c', '#2ecc71', '#3498db', '#9b59b6'];`;
    const parsed: ParsedFiles = {
      ts: [{ path: "src/chart-colors.ts", source, imports: [], ast: null }],
      css: [],
      cssInJs: [],
    };
    const result = await rule.evaluate(ctx, parsed);
    expect(result.findings.length).toBe(0);
  });
});


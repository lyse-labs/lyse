import { describe, it, expect } from "vitest";
import { rule, detectInText, countCompliantColorUses } from "../../src/rules/tokens-no-hardcoded-color.js";
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

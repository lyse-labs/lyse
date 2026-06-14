import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { rule, _internal } from "../../src/rules/tokens-theme-modes-present.js";
import type { RuleContext, ParsedFiles } from "../../src/types.js";

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

function makeParsed(cssFiles: { path: string; source: string }[] = []): ParsedFiles {
  return { ts: [], css: cssFiles, cssInJs: [] };
}

let tmp: string;

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), "lyse-theme-modes-"));
});

afterEach(() => {
  rmSync(tmp, { recursive: true, force: true });
});

describe("rule tokens/theme-modes-present", () => {
  describe("(a) data-theme attribute selector — no finding", () => {
    it("emits no findings when CSS contains [data-theme='dark']", async () => {
      const css = makeParsed([
        {
          path: "src/tokens.css",
          source: ':root { --bg: #fff; }\n[data-theme="dark"] { --bg: #111; }',
        },
      ]);
      const result = await rule.evaluate(makeCtx(tmp), css);
      expect(result.findings).toHaveLength(0);
      expect(result.opportunities).toBe(1);
    });

    it("emits no findings when CSS contains [data-mode]", async () => {
      const css = makeParsed([
        { path: "styles.css", source: '[data-mode="light"] { color: black; }' },
      ]);
      const result = await rule.evaluate(makeCtx(tmp), css);
      expect(result.findings).toHaveLength(0);
    });

    it("emits no findings when CSS contains [data-color-mode]", async () => {
      const css = makeParsed([
        { path: "styles.css", source: "[data-color-mode] { --bg: transparent; }" },
      ]);
      const result = await rule.evaluate(makeCtx(tmp), css);
      expect(result.findings).toHaveLength(0);
    });
  });

  describe("(b) prefers-color-scheme — no finding", () => {
    it("emits no findings when CSS contains @media (prefers-color-scheme: dark)", async () => {
      const css = makeParsed([
        {
          path: "src/theme.css",
          source: "@media (prefers-color-scheme: dark) { :root { --bg: #111; } }",
        },
      ]);
      const result = await rule.evaluate(makeCtx(tmp), css);
      expect(result.findings).toHaveLength(0);
      expect(result.opportunities).toBe(1);
    });

    it("emits no findings for prefers-color-scheme: light", async () => {
      const css = makeParsed([
        {
          path: "styles.scss",
          source: "@media (prefers-color-scheme: light) { body { background: white; } }",
        },
      ]);
      const result = await rule.evaluate(makeCtx(tmp), css);
      expect(result.findings).toHaveLength(0);
    });
  });

  describe("(c) DTCG token file with dark group — no finding", () => {
    it("emits no findings when a *.tokens.json file has a 'dark' key", async () => {
      const tokensDir = join(tmp, "tokens");
      mkdirSync(tokensDir, { recursive: true });
      writeFileSync(
        join(tokensDir, "colors.tokens.json"),
        JSON.stringify({
          dark: { bg: { $value: "#111", $type: "color" } },
          light: { bg: { $value: "#fff", $type: "color" } },
        }),
      );
      const result = await rule.evaluate(makeCtx(tmp), makeParsed());
      expect(result.findings).toHaveLength(0);
      expect(result.opportunities).toBe(1);
    });

    it("emits no findings when a token file has $extensions with 'mode' key", async () => {
      const tokensDir = join(tmp, "tokens");
      mkdirSync(tokensDir, { recursive: true });
      writeFileSync(
        join(tokensDir, "theme.tokens.json"),
        JSON.stringify({
          $extensions: { mode: { dark: "dark-theme", light: "light-theme" } },
          bg: { $value: "#fff", $type: "color" },
        }),
      );
      const result = await rule.evaluate(makeCtx(tmp), makeParsed());
      expect(result.findings).toHaveLength(0);
    });
  });

  describe("(d) no theme-mode signal — exactly one warning finding", () => {
    it("emits exactly one warning when no theme-mode signal is present", async () => {
      const result = await rule.evaluate(makeCtx(tmp), makeParsed());
      expect(result.findings).toHaveLength(1);
      expect(result.findings[0]?.ruleId).toBe("tokens/theme-modes-present");
      expect(result.findings[0]?.severity).toBe("warning");
      expect(result.findings[0]?.axis).toBe("tokens");
      expect(result.opportunities).toBe(1);
    });

    it("emits a warning when CSS has no mode signal and no token files exist", async () => {
      const css = makeParsed([
        { path: "styles.css", source: ":root { --color-bg: #fff; --color-fg: #111; }" },
      ]);
      const result = await rule.evaluate(makeCtx(tmp), css);
      expect(result.findings).toHaveLength(1);
      expect(result.findings[0]?.severity).toBe("warning");
    });

    it("finding message mentions light/dark", async () => {
      const result = await rule.evaluate(makeCtx(tmp), makeParsed());
      expect(result.findings[0]?.message).toMatch(/light|dark/i);
    });
  });

  describe("(e) suppression via lyse-disable directive", () => {
    it("emits no findings when README.md contains the disable directive", async () => {
      writeFileSync(
        join(tmp, "README.md"),
        `# My DS\n\n<!-- lyse-disable tokens/theme-modes-present -->\n\nNo theming yet.\n`,
      );
      const result = await rule.evaluate(makeCtx(tmp), makeParsed());
      expect(result.findings).toHaveLength(0);
      expect(result.opportunities).toBe(0);
    });

    it("does NOT suppress when directive is in a non-README file", async () => {
      writeFileSync(join(tmp, "NOTES.md"), "lyse-disable tokens/theme-modes-present");
      const result = await rule.evaluate(makeCtx(tmp), makeParsed());
      expect(result.findings).toHaveLength(1);
    });
  });

  describe("edge cases", () => {
    it("emits no findings when repoRoot is empty string", async () => {
      const ctx: RuleContext = { ...makeCtx(tmp), repoRoot: "" };
      const result = await rule.evaluate(ctx, makeParsed());
      expect(result.findings).toHaveLength(0);
      expect(result.opportunities).toBe(0);
    });

    it("emits no findings for .dark class convention in CSS", async () => {
      const css = makeParsed([
        { path: "vars.css", source: ".dark { --bg: #111; --fg: #fff; }" },
      ]);
      const result = await rule.evaluate(makeCtx(tmp), css);
      expect(result.findings).toHaveLength(0);
    });

    it("emits no findings for :root.dark selector", async () => {
      const css = makeParsed([
        { path: "vars.css", source: ":root.dark { --color-bg: #000; }" },
      ]);
      const result = await rule.evaluate(makeCtx(tmp), css);
      expect(result.findings).toHaveLength(0);
    });

    it("emits no findings for body.dark compound element selector", async () => {
      const css = makeParsed([
        { path: "theme.css", source: ":root { --bg: #fff; }\nbody.dark { --bg: #111; }" },
      ]);
      const result = await rule.evaluate(makeCtx(tmp), css);
      expect(result.findings).toHaveLength(0);
    });

    it("emits no findings for html.light compound element selector", async () => {
      const css = makeParsed([
        { path: "theme.css", source: "html.light { --bg: #fafafa; }" },
      ]);
      const result = await rule.evaluate(makeCtx(tmp), css);
      expect(result.findings).toHaveLength(0);
    });

    it("still emits a warning for a .darker utility class (not a mode signal)", async () => {
      const css = makeParsed([
        { path: "vars.css", source: ":root { --bg: #fff; }\n.darker { filter: brightness(0.8); }" },
      ]);
      const result = await rule.evaluate(makeCtx(tmp), css);
      expect(result.findings).toHaveLength(1);
    });

    it("emits no findings for Tailwind v4 @variant dark", async () => {
      const css = makeParsed([
        { path: "tailwind.css", source: "@variant dark (&:where(.dark, .dark *)) {}" },
      ]);
      const result = await rule.evaluate(makeCtx(tmp), css);
      expect(result.findings).toHaveLength(0);
    });

    it("skips CSS files with skipped: true", async () => {
      const css: ParsedFiles = {
        ts: [],
        css: [{ path: "broken.sass", source: ".dark { color: black }", skipped: true }],
        cssInJs: [],
      };
      const result = await rule.evaluate(makeCtx(tmp), css);
      expect(result.findings).toHaveLength(1);
    });
  });
});

describe("_internal helpers", () => {
  it("hasDtcgModeGroup returns true for { dark: {...} }", () => {
    expect(_internal.hasDtcgModeGroup({ dark: { bg: { $value: "#111" } } })).toBe(true);
  });

  it("hasDtcgModeGroup returns true for { light: {...} }", () => {
    expect(_internal.hasDtcgModeGroup({ light: { bg: { $value: "#fff" } } })).toBe(true);
  });

  it("hasDtcgModeGroup returns true for nested dark key", () => {
    expect(_internal.hasDtcgModeGroup({ palette: { dark: { bg: "#111" } } })).toBe(true);
  });

  it("hasDtcgModeGroup returns false when no dark/light keys", () => {
    expect(_internal.hasDtcgModeGroup({ primary: { bg: "#fff" } })).toBe(false);
  });

  it("hasDtcgModeGroup returns true for $extensions.mode", () => {
    expect(
      _internal.hasDtcgModeGroup({
        $extensions: { mode: { dark: "dark-theme", light: "light-theme" } },
      }),
    ).toBe(true);
  });

  it("hasDtcgModeGroup does not blow up on primitives", () => {
    expect(_internal.hasDtcgModeGroup(null)).toBe(false);
    expect(_internal.hasDtcgModeGroup("string")).toBe(false);
    expect(_internal.hasDtcgModeGroup(42)).toBe(false);
  });

  it("hasModeInCssSources detects prefers-color-scheme", () => {
    const files = [
      { path: "a.css", source: "@media (prefers-color-scheme: dark) { :root {} }" },
    ];
    expect(_internal.hasModeInCssSources(files)).toBe(true);
  });

  it("hasModeInCssSources ignores skipped files", () => {
    const files = [
      { path: "a.sass", source: "@media (prefers-color-scheme: dark) {}", skipped: true as const },
    ];
    expect(_internal.hasModeInCssSources(files)).toBe(false);
  });

  it("hasModeInCssSources detects compound element class selectors", () => {
    expect(_internal.hasModeInCssSources([{ path: "a.css", source: "body.dark {}" }])).toBe(true);
    expect(_internal.hasModeInCssSources([{ path: "a.css", source: "html.light {}" }])).toBe(true);
  });

  it("hasModeInCssSources does not treat .darker / .lightbox as a mode signal", () => {
    expect(_internal.hasModeInCssSources([{ path: "a.css", source: ".darker {}" }])).toBe(false);
    expect(_internal.hasModeInCssSources([{ path: "a.css", source: ".lightbox {}" }])).toBe(false);
  });
});

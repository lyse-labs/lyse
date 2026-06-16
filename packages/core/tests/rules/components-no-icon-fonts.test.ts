import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { rule, _internal } from "../../src/rules/components-no-icon-fonts.js";
import type { RuleContext, ParsedFiles, ParsedTsFile, ExtractedCssInJsBlock } from "../../src/types.js";

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

function makeParsed(opts: {
  css?: { path: string; source: string }[];
  ts?: { path: string; source: string }[];
  cssInJs?: ExtractedCssInJsBlock[];
} = {}): ParsedFiles {
  const ts: ParsedTsFile[] = (opts.ts ?? []).map((f) => ({ path: f.path, ast: null, source: f.source, imports: [] }));
  return { ts, css: opts.css ?? [], cssInJs: opts.cssInJs ?? [] };
}

let tmp: string;
beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), "lyse-icon-fonts-"));
});
afterEach(() => {
  rmSync(tmp, { recursive: true, force: true });
});

describe("rule components/no-icon-fonts", () => {
  it("flags an icon-font dependency in package.json", async () => {
    writeFileSync(join(tmp, "package.json"), JSON.stringify({ dependencies: { "font-awesome": "^4.7.0" } }));
    const result = await rule.evaluate(makeCtx(tmp), makeParsed());
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]!.ruleId).toBe("components/no-icon-fonts");
    expect(result.findings[0]!.axis).toBe("components");
    expect(result.opportunities).toBe(1);
  });

  it("flags an @font-face declaring an icon font", async () => {
    const parsed = makeParsed({
      css: [{ path: "src/icons.css", source: "@font-face { font-family: 'FontAwesome'; src: url(fa.woff2); }" }],
    });
    const result = await rule.evaluate(makeCtx(tmp), parsed);
    expect(result.findings).toHaveLength(1);
  });

  it("flags a font-family referencing Material Icons", async () => {
    const parsed = makeParsed({
      css: [{ path: "src/x.css", source: ".icon { font-family: 'Material Icons'; }" }],
    });
    const result = await rule.evaluate(makeCtx(tmp), parsed);
    expect(result.findings).toHaveLength(1);
  });

  it("flags a material-icons class in TS/JSX source", async () => {
    const parsed = makeParsed({
      ts: [{ path: "src/Icon.tsx", source: 'export const I = () => <span className="material-icons">home</span>;' }],
    });
    const result = await rule.evaluate(makeCtx(tmp), parsed);
    expect(result.findings).toHaveLength(1);
  });

  it("does not flag a repo that uses SVG icon libraries", async () => {
    writeFileSync(join(tmp, "package.json"), JSON.stringify({ dependencies: { "lucide-react": "^0.4.0" } }));
    const parsed = makeParsed({
      ts: [{ path: "src/Icon.tsx", source: 'import { Home } from "lucide-react";' }],
    });
    const result = await rule.evaluate(makeCtx(tmp), parsed);
    expect(result.findings).toHaveLength(0);
    expect(result.opportunities).toBe(1);
  });

  it("is allowlisted by a README lyse-disable directive", async () => {
    writeFileSync(join(tmp, "README.md"), "# DS\n\nlyse-disable components/no-icon-fonts\n");
    writeFileSync(join(tmp, "package.json"), JSON.stringify({ dependencies: { "font-awesome": "^4.7.0" } }));
    const result = await rule.evaluate(makeCtx(tmp), makeParsed());
    expect(result.findings).toHaveLength(0);
    expect(result.opportunities).toBe(0);
  });

  describe("_internal helpers", () => {
    it("hasIconFontFamily matches known icon-font family names", () => {
      expect(_internal.hasIconFontFamily("font-family: 'FontAwesome';")).toBe(true);
      expect(_internal.hasIconFontFamily("font-family: \"Material Icons\";")).toBe(true);
      expect(_internal.hasIconFontFamily("font-family: 'Inter', sans-serif;")).toBe(false);
    });

    it("hasIconFontPackage matches icon-font deps, not SVG libs", () => {
      expect(_internal.hasIconFontPackage({ "@mdi/font": "1" })).toBe(true);
      expect(_internal.hasIconFontPackage({ "lucide-react": "1" })).toBe(false);
    });
  });
});

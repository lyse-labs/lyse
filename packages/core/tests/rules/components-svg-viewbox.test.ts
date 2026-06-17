import { describe, it, expect } from "vitest";
import {
  rule,
  scanSvgElements,
} from "../../src/rules/components-svg-viewbox.js";
import type { RuleContext, ParsedFiles, ParsedTsFile } from "../../src/types.js";

function makeCtx(repoRoot = "/repo"): RuleContext {
  return { repoRoot, tokens: null, componentsModule: null, componentInventory: [], storyIndex: null, excludePaths: [] };
}
function tsFile(path: string, source: string): ParsedTsFile {
  return { path, ast: null, source, imports: [] };
}
function parsed(...files: ParsedTsFile[]): ParsedFiles {
  return { ts: files, css: [], cssInJs: [] };
}

describe("scanSvgElements", () => {
  it("flags an <svg> with width/height but no viewBox", () => {
    const els = scanSvgElements('<svg width="24" height="24"><path /></svg>');
    expect(els).toHaveLength(1);
    expect(els[0]!.hasViewBox).toBe(false);
  });

  it("treats an <svg> with a viewBox as compliant", () => {
    const els = scanSvgElements('<svg viewBox="0 0 24 24" width="24"><path /></svg>');
    expect(els).toHaveLength(1);
    expect(els[0]!.hasViewBox).toBe(true);
  });

  it("handles multiline opening tags", () => {
    const els = scanSvgElements('<svg\n  width="24"\n  height="24"\n>\n<path />\n</svg>');
    expect(els).toHaveLength(1);
    expect(els[0]!.hasViewBox).toBe(false);
  });

  it("skips an <svg> with a {...spread} (viewBox may arrive at runtime)", () => {
    const els = scanSvgElements("<svg {...props} width={24} />");
    expect(els).toHaveLength(0);
  });

  it("does not match <svgFoo> or substrings", () => {
    const els = scanSvgElements("<svgWrapper>x</svgWrapper>");
    expect(els).toHaveLength(0);
  });

  it("counts each <svg> separately", () => {
    const els = scanSvgElements('<svg viewBox="0 0 1 1" /><svg width="8" height="8" />');
    expect(els).toHaveLength(2);
    expect(els.filter((e) => e.hasViewBox)).toHaveLength(1);
  });

  it("reports a 1-based line for the tag", () => {
    const els = scanSvgElements('const x = 1;\n\n<svg width="2" />');
    expect(els[0]!.line).toBe(3);
  });
});

describe("rule components/svg-viewbox", () => {
  it("emits a warning for an inline <svg> lacking viewBox", async () => {
    const result = await rule.evaluate(
      makeCtx(),
      parsed(tsFile("/repo/src/Icon.tsx", 'export const Icon = () => <svg width="24" height="24"><path /></svg>;')),
    );
    expect(result.findings).toHaveLength(1);
    const f = result.findings[0]!;
    expect(f.severity).toBe("warning");
    expect(f.axis).toBe("components");
    expect(f.ruleId).toBe("components/svg-viewbox");
    expect(result.opportunities).toBe(1);
  });

  it("emits no finding when every inline <svg> has a viewBox", async () => {
    const result = await rule.evaluate(
      makeCtx(),
      parsed(tsFile("/repo/src/Icon.tsx", 'export const Icon = () => <svg viewBox="0 0 24 24"><path /></svg>;')),
    );
    expect(result.findings).toHaveLength(0);
    expect(result.opportunities).toBe(1);
  });

  it("is N/A (opportunities 0) when the repo has no inline <svg>", async () => {
    const result = await rule.evaluate(
      makeCtx(),
      parsed(tsFile("/repo/src/Button.tsx", "export const Button = () => null;")),
    );
    expect(result.findings).toHaveLength(0);
    expect(result.opportunities).toBe(0);
  });

  it("skips an <svg> with a spread (no finding, no opportunity)", async () => {
    const result = await rule.evaluate(
      makeCtx(),
      parsed(tsFile("/repo/src/Icon.tsx", "export const Icon = (props) => <svg {...props} width={24} />;")),
    );
    expect(result.findings).toHaveLength(0);
    expect(result.opportunities).toBe(0);
  });
});

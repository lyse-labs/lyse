import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { rule, _internal } from "../../src/rules/a11y-forced-colors.js";
import type { RuleContext, ParsedFiles, ParsedTsFile, ExtractedCssInJsBlock } from "../../src/types.js";

function makeCtx(repoRoot: string): RuleContext {
  return { repoRoot, tokens: null, componentsModule: null, componentInventory: [], storyIndex: null, excludePaths: [] };
}
function makeParsed(opts: { css?: { path: string; source: string }[]; ts?: { path: string; source: string }[]; cssInJs?: ExtractedCssInJsBlock[] } = {}): ParsedFiles {
  const ts: ParsedTsFile[] = (opts.ts ?? []).map((f) => ({ path: f.path, ast: null, source: f.source, imports: [] }));
  return { ts, css: opts.css ?? [], cssInJs: opts.cssInJs ?? [] };
}

let tmp: string;
beforeEach(() => { tmp = mkdtempSync(join(tmpdir(), "lyse-forced-colors-")); });
afterEach(() => { rmSync(tmp, { recursive: true, force: true }); });

describe("rule a11y/forced-colors", () => {
  it("warns when the DS styles colors but ships no forced-colors handling", async () => {
    const r = await rule.evaluate(makeCtx(tmp), makeParsed({ css: [{ path: "a.css", source: ".btn { color: #fff; background: #333; }" }] }));
    expect(r.findings).toHaveLength(1);
    expect(r.findings[0]!.ruleId).toBe("a11y/forced-colors");
    expect(r.opportunities).toBe(1);
  });

  it("clears with a @media (forced-colors: active) block", async () => {
    const r = await rule.evaluate(makeCtx(tmp), makeParsed({ css: [{ path: "a.css", source: ".btn { color: #fff; }\n@media (forced-colors: active) { .btn { border: 1px solid; } }" }] }));
    expect(r.findings).toHaveLength(0);
    expect(r.opportunities).toBe(1);
  });

  it("clears with forced-color-adjust", async () => {
    const r = await rule.evaluate(makeCtx(tmp), makeParsed({ css: [{ path: "a.css", source: ".icon { background: red; forced-color-adjust: auto; }" }] }));
    expect(r.findings).toHaveLength(0);
  });

  it("clears with @media (prefers-contrast: more)", async () => {
    const r = await rule.evaluate(makeCtx(tmp), makeParsed({ css: [{ path: "a.css", source: ".btn { color: #fff; }\n@media (prefers-contrast: more) { .btn { color: #000; } }" }] }));
    expect(r.findings).toHaveLength(0);
  });

  it("clears with legacy -ms-high-contrast", async () => {
    const r = await rule.evaluate(makeCtx(tmp), makeParsed({ css: [{ path: "a.css", source: ".btn { color: #fff; }\n@media screen and (-ms-high-contrast: active) { .btn { color: #000; } }" }] }));
    expect(r.findings).toHaveLength(0);
  });

  it("clears with a high-contrast theme class", async () => {
    const r = await rule.evaluate(makeCtx(tmp), makeParsed({ css: [{ path: "a.css", source: ".btn { color: #fff; }\n.high-contrast .btn { color: #000; }" }] }));
    expect(r.findings).toHaveLength(0);
  });

  it("reports N/A when the DS sets no colors", async () => {
    const r = await rule.evaluate(makeCtx(tmp), makeParsed({ css: [{ path: "a.css", source: ".grid { display: grid; gap: 8px; }" }] }));
    expect(r.findings).toHaveLength(0);
    expect(r.opportunities).toBe(0);
  });

  it("honors a matchMedia('(forced-colors')') guard in JS/TS", async () => {
    const r = await rule.evaluate(makeCtx(tmp), makeParsed({
      css: [{ path: "a.css", source: ".btn { background: #333; }" }],
      ts: [{ path: "theme.ts", source: "const hc = window.matchMedia('(forced-colors: active)');" }],
    }));
    expect(r.findings).toHaveLength(0);
  });

  it("honors a guard inside a CSS-in-JS block", async () => {
    const r = await rule.evaluate(makeCtx(tmp), makeParsed({
      cssInJs: [{ path: "Btn.tsx", line: 3, content: "color: #fff; @media (forced-colors: active) { border: 1px solid; }" }],
    }));
    expect(r.findings).toHaveLength(0);
  });

  it("does not count noop color values (transparent/inherit) as color styling", async () => {
    const r = await rule.evaluate(makeCtx(tmp), makeParsed({ css: [{ path: "a.css", source: ".x { background: transparent; color: inherit; }" }] }));
    expect(r.findings).toHaveLength(0);
    expect(r.opportunities).toBe(0);
  });

  it("is allowlisted via README", async () => {
    writeFileSync(join(tmp, "README.md"), "lyse-disable a11y/forced-colors\n");
    const r = await rule.evaluate(makeCtx(tmp), makeParsed({ css: [{ path: "a.css", source: ".btn { color: #fff; background: #000; }" }] }));
    expect(r.findings).toHaveLength(0);
    expect(r.opportunities).toBe(0);
  });

  it("exposes internals for testing", () => {
    expect(typeof _internal.isAllowlisted).toBe("function");
    expect(typeof _internal.usesColorInText).toBe("function");
    expect(typeof _internal.hasGuardInText).toBe("function");
  });
});

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { rule, _internal } from "../../src/rules/tokens-css-custom-property-export.js";
import type { RuleContext, ParsedFiles, ExtractedCssInJsBlock } from "../../src/types.js";

function makeCtx(repoRoot: string): RuleContext {
  return { repoRoot, tokens: null, componentsModule: null, componentInventory: [], storyIndex: null, excludePaths: [] };
}
function makeParsed(opts: { css?: { path: string; source: string }[]; cssInJs?: ExtractedCssInJsBlock[] } = {}): ParsedFiles {
  return { ts: [], css: opts.css ?? [], cssInJs: opts.cssInJs ?? [] };
}

let tmp: string;
beforeEach(() => { tmp = mkdtempSync(join(tmpdir(), "lyse-cssvar-")); });
afterEach(() => { rmSync(tmp, { recursive: true, force: true }); });

describe("rule tokens/css-custom-property-export", () => {
  it("warns when the DS paints CSS but defines no custom property", async () => {
    const r = await rule.evaluate(makeCtx(tmp), makeParsed({ css: [{ path: "a.css", source: ".btn { color: #fff; background: #333; padding: 8px; }" }] }));
    expect(r.findings).toHaveLength(1);
    expect(r.findings[0]!.ruleId).toBe("tokens/css-custom-property-export");
    expect(r.opportunities).toBe(1);
  });

  it("clears when a custom property is defined in :root", async () => {
    const r = await rule.evaluate(makeCtx(tmp), makeParsed({ css: [{ path: "a.css", source: ":root { --color-primary: #3b82f6; }\n.btn { color: var(--color-primary); }" }] }));
    expect(r.findings).toHaveLength(0);
    expect(r.opportunities).toBe(1);
  });

  it("clears when a custom property is defined under a [data-theme] selector", async () => {
    const r = await rule.evaluate(makeCtx(tmp), makeParsed({ css: [{ path: "a.css", source: "[data-theme='dark'] { --bg: #000; }\n.x { background: var(--bg); }" }] }));
    expect(r.findings).toHaveLength(0);
  });

  it("clears with a Tailwind v4 @theme block", async () => {
    const r = await rule.evaluate(makeCtx(tmp), makeParsed({ css: [{ path: "theme.css", source: "@theme { --color-brand: #f00; }" }] }));
    expect(r.findings).toHaveLength(0);
  });

  it("clears when the custom property is defined in a CSS-in-JS block", async () => {
    const r = await rule.evaluate(makeCtx(tmp), makeParsed({
      css: [{ path: "a.css", source: ".btn { color: #fff; }" }],
      cssInJs: [{ path: "Theme.tsx", line: 2, content: ":root { --accent: #f00; }" }],
    }));
    expect(r.findings).toHaveLength(0);
  });

  it("reports N/A when there is no CSS styling at all", async () => {
    const r = await rule.evaluate(makeCtx(tmp), makeParsed({ css: [] }));
    expect(r.findings).toHaveLength(0);
    expect(r.opportunities).toBe(0);
  });

  it("does not count a var() usage as a definition (consuming != exporting)", async () => {
    const r = await rule.evaluate(makeCtx(tmp), makeParsed({ css: [{ path: "a.css", source: ".btn { color: var(--from-host); background: #333; }" }] }));
    expect(r.findings).toHaveLength(1);
  });

  it("does not count a custom property mentioned only in a comment", async () => {
    const r = await rule.evaluate(makeCtx(tmp), makeParsed({ css: [{ path: "a.css", source: "/* --color-primary: #fff; (planned) */\n.btn { color: #333; }" }] }));
    expect(r.findings).toHaveLength(1);
  });

  it("is allowlisted via README", async () => {
    writeFileSync(join(tmp, "README.md"), "lyse-disable tokens/css-custom-property-export\n");
    const r = await rule.evaluate(makeCtx(tmp), makeParsed({ css: [{ path: "a.css", source: ".btn { color: #333; }" }] }));
    expect(r.findings).toHaveLength(0);
    expect(r.opportunities).toBe(0);
  });

  it("exposes internals for testing", () => {
    expect(typeof _internal.isAllowlisted).toBe("function");
    expect(typeof _internal.definesCustomProperty).toBe("function");
  });
});

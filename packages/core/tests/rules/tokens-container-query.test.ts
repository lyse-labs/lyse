import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { rule, _internal } from "../../src/rules/tokens-container-query.js";
import type { RuleContext, ParsedFiles, ExtractedCssInJsBlock } from "../../src/types.js";

function makeCtx(repoRoot: string): RuleContext {
  return { repoRoot, tokens: null, componentsModule: null, componentInventory: [], storyIndex: null, excludePaths: [] };
}
function makeParsed(opts: { css?: { path: string; source: string }[]; cssInJs?: ExtractedCssInJsBlock[] } = {}): ParsedFiles {
  return { ts: [], css: opts.css ?? [], cssInJs: opts.cssInJs ?? [] };
}

let tmp: string;
beforeEach(() => { tmp = mkdtempSync(join(tmpdir(), "lyse-cq-")); });
afterEach(() => { rmSync(tmp, { recursive: true, force: true }); });

describe("rule tokens/container-query", () => {
  it("warns when @container is used but no container-type context is declared", async () => {
    const r = await rule.evaluate(makeCtx(tmp), makeParsed({ css: [{ path: "a.css", source: "@container (min-width: 400px) { .card { display: grid; } }" }] }));
    expect(r.findings).toHaveLength(1);
    expect(r.findings[0]!.ruleId).toBe("tokens/container-query");
    expect(r.opportunities).toBe(1);
  });

  it("clears when container-type is declared", async () => {
    const r = await rule.evaluate(makeCtx(tmp), makeParsed({ css: [{ path: "a.css", source: ".wrap { container-type: inline-size; }\n@container (min-width: 400px) { .card { display: grid; } }" }] }));
    expect(r.findings).toHaveLength(0);
    expect(r.opportunities).toBe(1);
  });

  it("clears when the container shorthand is declared", async () => {
    const r = await rule.evaluate(makeCtx(tmp), makeParsed({ css: [{ path: "a.css", source: ".wrap { container: layout / inline-size; }\n@container layout (min-width: 400px) { .card { display: grid; } }" }] }));
    expect(r.findings).toHaveLength(0);
  });

  it("clears when container-name is declared", async () => {
    const r = await rule.evaluate(makeCtx(tmp), makeParsed({ css: [{ path: "a.css", source: ".wrap { container-name: sidebar; container-type: inline-size; }\n@container sidebar (min-width: 400px) { .card { display: grid; } }" }] }));
    expect(r.findings).toHaveLength(0);
  });

  it("clears when the context is in a different file (repo-level)", async () => {
    const r = await rule.evaluate(makeCtx(tmp), makeParsed({ css: [
      { path: "ctx.css", source: ".wrap { container-type: size; }" },
      { path: "card.css", source: "@container (min-width: 400px) { .card { display: grid; } }" },
    ] }));
    expect(r.findings).toHaveLength(0);
  });

  it("clears when the context lives in a CSS-in-JS block", async () => {
    const r = await rule.evaluate(makeCtx(tmp), makeParsed({
      css: [{ path: "card.css", source: "@container (min-width: 400px) { .card { display: grid; } }" }],
      cssInJs: [{ path: "Wrap.tsx", line: 3, content: ".wrap { container-type: inline-size; }" }],
    }));
    expect(r.findings).toHaveLength(0);
  });

  it("reports N/A when there is no @container query", async () => {
    const r = await rule.evaluate(makeCtx(tmp), makeParsed({ css: [{ path: "a.css", source: "@media (min-width: 400px) { .card { display: grid; } }" }] }));
    expect(r.findings).toHaveLength(0);
    expect(r.opportunities).toBe(0);
  });

  it("does not treat container-type only in a comment as a real context", async () => {
    const r = await rule.evaluate(makeCtx(tmp), makeParsed({ css: [{ path: "a.css", source: "/* container-type: inline-size; (todo) */\n@container (min-width: 400px) { .card { color: red; } }" }] }));
    expect(r.findings).toHaveLength(1);
  });

  it("still warns when only a .container:hover selector exists (pseudo-class is not a containment context)", async () => {
    const r = await rule.evaluate(makeCtx(tmp), makeParsed({ css: [{ path: "a.css", source: ".container:hover { opacity: 0.8; }\n@container (min-width: 400px) { .card { display: grid; } }" }] }));
    expect(r.findings).toHaveLength(1);
  });

  it("still warns when only a .container class rule exists (selector, not container-type)", async () => {
    const r = await rule.evaluate(makeCtx(tmp), makeParsed({ css: [{ path: "a.css", source: ".container { max-width: 80rem; }\n@container (min-width: 400px) { .card { display: grid; } }" }] }));
    expect(r.findings).toHaveLength(1);
  });

  it("is allowlisted via README", async () => {
    writeFileSync(join(tmp, "README.md"), "lyse-disable tokens/container-query\n");
    const r = await rule.evaluate(makeCtx(tmp), makeParsed({ css: [{ path: "a.css", source: "@container (min-width: 400px) { .card { color: red; } }" }] }));
    expect(r.findings).toHaveLength(0);
    expect(r.opportunities).toBe(0);
  });

  it("exposes internals for testing", () => {
    expect(typeof _internal.isAllowlisted).toBe("function");
    expect(typeof _internal.usesContainerQuery).toBe("function");
    expect(typeof _internal.declaresContainerContext).toBe("function");
  });
});

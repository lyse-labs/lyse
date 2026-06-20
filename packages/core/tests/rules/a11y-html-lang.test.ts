import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { rule, _internal } from "../../src/rules/a11y-html-lang.js";
import type { RuleContext, ParsedFiles, ParsedTsFile } from "../../src/types.js";

function makeCtx(repoRoot: string): RuleContext {
  return { repoRoot, tokens: null, componentsModule: null, componentInventory: [], storyIndex: null, excludePaths: [] };
}
function tsFile(path: string, source: string): ParsedTsFile {
  return { path, ast: null, source, imports: [] };
}
function makeParsed(ts: { path: string; source: string }[] = []): ParsedFiles {
  return { ts: ts.map((f) => tsFile(f.path, f.source)), css: [], cssInJs: [] };
}

let tmp: string;
beforeEach(() => { tmp = mkdtempSync(join(tmpdir(), "lyse-lang-")); });
afterEach(() => { rmSync(tmp, { recursive: true, force: true }); });

describe("rule a11y/html-lang", () => {
  it("warns when a JSX <html> root has no lang attribute", async () => {
    const r = await rule.evaluate(makeCtx(tmp), makeParsed([{ path: "app/layout.tsx", source: "export default function Root({children}) { return <html><body>{children}</body></html>; }" }]));
    expect(r.findings).toHaveLength(1);
    expect(r.findings[0]!.ruleId).toBe("a11y/html-lang");
    expect(r.opportunities).toBe(1);
  });

  it("clears when <html lang=\"en\"> is static", async () => {
    const r = await rule.evaluate(makeCtx(tmp), makeParsed([{ path: "app/layout.tsx", source: "export default function Root({children}) { return <html lang=\"en\"><body>{children}</body></html>; }" }]));
    expect(r.findings).toHaveLength(0);
    expect(r.opportunities).toBe(1);
  });

  it("clears when lang is a dynamic JSX expression", async () => {
    const r = await rule.evaluate(makeCtx(tmp), makeParsed([{ path: "root.tsx", source: "export function Root({locale}) { return <html lang={locale}><body/></html>; }" }]));
    expect(r.findings).toHaveLength(0);
  });

  it("clears when an index.html declares lang", async () => {
    writeFileSync(join(tmp, "index.html"), "<!doctype html>\n<html lang=\"en\"><head></head><body></body></html>");
    const r = await rule.evaluate(makeCtx(tmp), makeParsed());
    expect(r.findings).toHaveLength(0);
  });

  it("warns when an index.html <html> has no lang", async () => {
    writeFileSync(join(tmp, "index.html"), "<!doctype html>\n<html><head></head><body></body></html>");
    const r = await rule.evaluate(makeCtx(tmp), makeParsed());
    expect(r.findings).toHaveLength(1);
  });

  it("reports N/A when there is no <html> element anywhere (pure component lib)", async () => {
    const r = await rule.evaluate(makeCtx(tmp), makeParsed([{ path: "Button.tsx", source: "export function Button() { return <button />; }" }]));
    expect(r.findings).toHaveLength(0);
    expect(r.opportunities).toBe(0);
  });

  it("does not treat a documentation mention of <html> in markdown as a root", async () => {
    writeFileSync(join(tmp, "README.md"), "Set `<html>` in your app shell.\n");
    const r = await rule.evaluate(makeCtx(tmp), makeParsed([{ path: "Button.tsx", source: "export function Button() { return <button />; }" }]));
    expect(r.findings).toHaveLength(0);
    expect(r.opportunities).toBe(0);
  });

  it("does not flag <html> appearing inside a JS string literal (not a real root)", async () => {
    const r = await rule.evaluate(makeCtx(tmp), makeParsed([{ path: "ssr.tsx", source: "export const TEMPLATE = `<html><body>hello</body></html>`;\nexport const Button = () => <button>x</button>;" }]));
    expect(r.findings).toHaveLength(0);
    expect(r.opportunities).toBe(0);
  });

  it("does not flag <html> inside a comment", async () => {
    const r = await rule.evaluate(makeCtx(tmp), makeParsed([{ path: "note.tsx", source: "// renders <html> at the root\nexport const X = () => <div>x</div>;" }]));
    expect(r.findings).toHaveLength(0);
    expect(r.opportunities).toBe(0);
  });

  it("still flags a real JSX <html> root with no lang", async () => {
    const r = await rule.evaluate(makeCtx(tmp), makeParsed([{ path: "layout.tsx", source: "export default function Root({children}) { return <html><body>{children}</body></html>; }" }]));
    expect(r.findings).toHaveLength(1);
  });

  it("is allowlisted via README directive", async () => {
    writeFileSync(join(tmp, "README.md"), "lyse-disable a11y/html-lang\n");
    const r = await rule.evaluate(makeCtx(tmp), makeParsed([{ path: "app/layout.tsx", source: "export default function Root() { return <html><body/></html>; }" }]));
    expect(r.findings).toHaveLength(0);
    expect(r.opportunities).toBe(0);
  });

  it("exposes internals for testing", () => {
    expect(typeof _internal.isAllowlisted).toBe("function");
    expect(typeof _internal.htmlTagsWithoutLang).toBe("function");
  });
});
